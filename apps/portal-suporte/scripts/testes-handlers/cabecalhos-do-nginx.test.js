// Os cabeçalhos de segurança dos fronts servidos por nginx (deploy/nginx).
//
// O portal em produção é export estático: `deploy/Dockerfile.next-export` move `middleware.ts`
// para fora antes do build, então quem põe cabeçalho na resposta é o nginx, e só ele.
//
// DUAS ARMADILHAS, as duas provadas em contêiner com o template e o entrypoint DO PROJETO
// (nginx:1.27-alpine, `apk add gettext`, mesma raiz de `/etc/nginx`):
//   1. `add_header` sem `always` só sai em 2xx/3xx. Sem ele, o 404 de arquivo de programa e o
//      502 da API saíram com ZERO dos quatro cabeçalhos — e é nessas respostas que `nosniff`
//      mais importa, porque o corpo pode não ser do tipo que a URL promete.
//   2. `add_header` dentro de um `location` SUBSTITUI os herdados do `server`. Sem o `include`
//      repetido dentro de `/_next/static/`, aquela location saiu com zero cabeçalho enquanto
//      `/` saía com os quatro.
//
// Este arquivo trava o texto da configuração, que é o que a suíte consegue ver. A regra é
// ESTRUTURAL e não uma lista de locations: toda location que tem `add_header` próprio precisa
// do `include`, então uma location nova cai aqui sozinha.
//
// Roda com: node cabecalhos-do-nginx.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const RAIZ = path.resolve(__dirname, '../../../..')
const p = (...x) => path.join(RAIZ, ...x)

const CABECALHOS = fs.readFileSync(p('deploy/nginx/security-headers.conf'), 'utf8')
const TEMPLATE = fs.readFileSync(p('deploy/nginx/spa.conf.template'), 'utf8')
const ENTRYPOINT = fs.readFileSync(p('deploy/nginx/docker-entrypoint.sh'), 'utf8')
const DOCKER_NEXT = fs.readFileSync(p('deploy/Dockerfile.next-export'), 'utf8')
const DOCKER_VITE = fs.readFileSync(p('deploy/Dockerfile.vite-spa'), 'utf8')

const INCLUDE = 'include /etc/nginx/security-headers.conf;'
const ESPERADOS = [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
]

// Comentários fora ANTES de qualquer busca estrutural: a palavra "location"
// aparece nos comentários que explicam a regra, e com eles no texto a primeira
// "location" encontrada era a do comentário — a checagem de posição do `include`
// reprovava a configuração certa.
const semComentarios = (t) => t.replace(/^[ \t]*#.*$/gm, '')

/** Corta o template nos blocos `location`, pela contagem de chaves. */
function locations(texto) {
  const out = []
  const re = /location\s+([^{]+)\{/g
  let m
  while ((m = re.exec(texto))) {
    let i = m.index + m[0].length - 1
    let nivel = 0
    const ini = i
    while (i < texto.length) {
      if (texto[i] === '{') nivel++
      else if (texto[i] === '}') {
        nivel--
        if (nivel === 0) break
      }
      i++
    }
    out.push({ nome: m[1].trim(), corpo: texto.slice(ini, i + 1) })
  }
  return out
}

function bateria(cabecalhos, template, entrypoint, dockerNext, dockerVite) {
  const f = []

  // ── O arquivo de cabeçalhos ───────────────────────────────────────────────
  for (const h of ESPERADOS) {
    const re = new RegExp('add_header\\s+' + h + '\\s+"[^"]+"\\s+always;')
    if (!re.test(cabecalhos)) f.push('falta-ou-sem-always:' + h)
  }
  const semAlways = (cabecalhos.match(/add_header[^;]*;/g) || []).filter((l) => !/\balways\s*;/.test(l))
  if (semAlways.length) f.push('add_header-sem-always:' + semAlways.length)
  // A CSP tem decisão própria e prova própria: se aparecer aqui de carona, este
  // teste não a cobre, e o teste tem de dizer isso em vez de deixar passar.
  if (/content-security-policy/i.test(cabecalhos)) f.push('csp-entrou-de-carona')

  // ── O template ────────────────────────────────────────────────────────────
  // No nível do `server`, antes de qualquer location.
  const tpl = semComentarios(template)
  const primeiraLocation = tpl.indexOf('location ')
  const iInclude = tpl.indexOf(INCLUDE)
  if (iInclude < 0) f.push('template-sem-include')
  else if (primeiraLocation >= 0 && !(iInclude < primeiraLocation)) f.push('include-nao-esta-no-nivel-do-server')

  // REGRA ESTRUTURAL: location com `add_header` próprio perde os herdados.
  for (const loc of locations(tpl)) {
    if (!/add_header/.test(loc.corpo)) continue
    if (!loc.corpo.includes(INCLUDE)) f.push('location-com-add_header-sem-include:' + loc.nome)
  }

  // ── O entrypoint e as duas imagens ────────────────────────────────────────
  if (!/cp\s+\/etc\/nginx\/templates\/security-headers\.conf\s+\/etc\/nginx\/security-headers\.conf/.test(entrypoint)) {
    f.push('entrypoint-nao-copia')
  }
  // Dentro de conf.d o nginx carregaria o arquivo sozinho, também no nível
  // `http`, e quem lê a configuração não saberia de onde os cabeçalhos vêm.
  if (/\/etc\/nginx\/conf\.d\/security-headers\.conf/.test(entrypoint)) f.push('entrypoint-copia-para-conf.d')
  for (const [nome, dockerfile] of [['next-export', dockerNext], ['vite-spa', dockerVite]]) {
    if (!/COPY\s+deploy\/nginx\/security-headers\.conf\s+\/etc\/nginx\/templates\/security-headers\.conf/.test(dockerfile)) {
      // Sem o COPY, o `include` não resolve e o nginx NÃO SOBE: o front morre no deploy.
      f.push('dockerfile-sem-copy:' + nome)
    }
  }
  return f
}

const MUTACOES = [
  // As duas armadilhas provadas no contêiner.
  ['tira o include de /_next/static/', 'template',
    [['        add_header Cache-Control "public, max-age=31536000, immutable";\n        include /etc/nginx/security-headers.conf;\n    }\n\n    location /',
      '        add_header Cache-Control "public, max-age=31536000, immutable";\n    }\n\n    location /']]],
  ['tira o always do nosniff', 'cabecalhos',
    [['add_header X-Content-Type-Options "nosniff" always;', 'add_header X-Content-Type-Options "nosniff";']]],
  // Location nova com add_header próprio e sem o include: a regra estrutural pega.
  ['location nova com add_header e sem include', 'template',
    [['    location / {\n', '    location /favicon.ico {\n        add_header Cache-Control "public, max-age=86400";\n    }\n\n    location / {\n']]],
  ['include fora do nível do server', 'template',
    [['    include /etc/nginx/security-headers.conf;\n\n    # ── Compressão', '    # ── Compressão']]],
  ['entrypoint deixa de copiar', 'entrypoint',
    [['cp /etc/nginx/templates/security-headers.conf /etc/nginx/security-headers.conf', ':']]],
  ['entrypoint copia para dentro do conf.d', 'entrypoint',
    [['cp /etc/nginx/templates/security-headers.conf /etc/nginx/security-headers.conf',
      'cp /etc/nginx/templates/security-headers.conf /etc/nginx/conf.d/security-headers.conf']]],
  ['imagem Vite sem o COPY', 'dockerVite',
    [['COPY deploy/nginx/security-headers.conf /etc/nginx/templates/security-headers.conf\n', '']]],
  ['imagem Next sem o COPY', 'dockerNext',
    [['COPY deploy/nginx/security-headers.conf /etc/nginx/templates/security-headers.conf\n', '']]],
  ['a CSP entra sem prova', 'cabecalhos',
    [['add_header X-Content-Type-Options "nosniff" always;',
      'add_header Content-Security-Policy "default-src \'self\'" always;\nadd_header X-Content-Type-Options "nosniff" always;']]],
]

const BASE = {
  cabecalhos: CABECALHOS,
  template: TEMPLATE,
  entrypoint: ENTRYPOINT,
  dockerNext: DOCKER_NEXT,
  dockerVite: DOCKER_VITE,
}
const rodar = (o) => bateria(o.cabecalhos, o.template, o.entrypoint, o.dockerNext, o.dockerVite)

const f = rodar(BASE)
ok('os quatro cabeçalhos saem com always, o include está no server e em toda location com add_header, e as duas imagens o levam', f.length === 0, f)

for (const [nome, qual, pares] of MUTACOES) {
  let texto = BASE[qual]
  let aplicou = true
  for (const [de, para] of pares) {
    if (texto.split(de).length - 1 !== 1) { aplicou = false; break }
    texto = texto.replace(de, () => para)
  }
  if (!aplicou || texto === BASE[qual]) {
    ok(`mutação "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora')
    continue
  }
  const fm = rodar(Object.assign({}, BASE, { [qual]: texto }))
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
