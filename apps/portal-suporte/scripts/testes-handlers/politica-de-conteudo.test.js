// A política de conteúdo (CSP) dos fronts servidos por nginx (deploy/nginx).
//
// Por que ela é POR FRONT e não uma só compartilhada: `apps/portal-horas/index.html` e
// `apps/portal-cursos/index.html` buscam folha de estilo em `fonts.googleapis.com` e arquivos de
// fonte em `fonts.gstatic.com`; os três fronts de Next export não buscam nada de fora. Uma
// política compartilhada com `style-src 'self'` derrubaria a tipografia daqueles dois.
//
// A REGRA PRINCIPAL AQUI É ESTRUTURAL, e é o que faz este arquivo valer mais do que uma lista:
// para cada front declarado em `deploy/frontends.compose.yml`, descobre-se o slug e a pasta, lê-se
// o DOCUMENTO DE ENTRADA daquele front (`index.html` no Vite, `app/layout.tsx` no Next) e exige-se
// que toda origem externa citada ali seja permitida pela política que AQUELE front vai receber —
// o `csp-<slug>.conf` se existir, senão o `csp-default.conf`. Front novo, ou fonte nova vinda de
// fora, cai aqui sozinho, sem ninguém se lembrar de atualizar lista.
//
// O QUE ESTE ARQUIVO NÃO PROVA: ele lê o documento de entrada, não o que o programa pede depois de
// carregado. `connect-src` com a API, `'unsafe-inline'` no script e a ausência de `'unsafe-eval'`
// foram provados no navegador contra a IMAGEM DE PRODUÇÃO do portal-suporte, lendo as queixas do
// console — está no PR, não aqui.
//
// Roda com: node politica-de-conteudo.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const RAIZ = path.resolve(__dirname, '../../../..')
const p = (...x) => path.join(RAIZ, ...x)

const COMPOSE = fs.readFileSync(p('deploy/frontends.compose.yml'), 'utf8')
const CABECALHOS = fs.readFileSync(p('deploy/nginx/security-headers.conf'), 'utf8')
const ENTRYPOINT = fs.readFileSync(p('deploy/nginx/docker-entrypoint.sh'), 'utf8')
const DOCKER_NEXT = fs.readFileSync(p('deploy/Dockerfile.next-export'), 'utf8')
const DOCKER_VITE = fs.readFileSync(p('deploy/Dockerfile.vite-spa'), 'utf8')

const POLITICAS = {}
for (const f of fs.readdirSync(p('deploy/nginx'))) {
  if (/^csp-.*\.conf$/.test(f)) POLITICAS[f] = fs.readFileSync(p('deploy/nginx', f), 'utf8')
}

// O comentário que explica a regra cita as origens e as diretivas de que ele fala. Buscar com o
// comentário no texto faz o teste achar a si mesmo e aprovar configuração errada — foi exatamente
// o que aconteceu ao escrever o teste dos cabeçalhos, com a palavra "location".
const semComentarios = (t) => t.replace(/^[ \t]*#.*$/gm, '')

/** Lê os serviços de `frontends.compose.yml`: pasta, slug e qual Dockerfile. */
function frontsDoCompose(texto) {
  const corpo = texto.slice(texto.indexOf('\nservices:'))
  const fronts = []
  // Serviço = chave com 2 espaços de recuo dentro de `services:`.
  const re = /\n  ([a-z0-9][a-z0-9-]*):\n/g
  let m
  const marcas = []
  while ((m = re.exec(corpo))) marcas.push({ nome: m[1], i: m.index })
  for (let k = 0; k < marcas.length; k++) {
    const bloco = corpo.slice(marcas[k].i, k + 1 < marcas.length ? marcas[k + 1].i : corpo.length)
    const dir = (bloco.match(/APP_DIR:\s*(\S+)/) || [])[1]
    const slug = (bloco.match(/(?:NEXT_PUBLIC|VITE)_ARARA_APP_SLUG:\s*(\S+)/) || [])[1]
    const dockerfile = (bloco.match(/dockerfile:\s*(\S+)/) || [])[1]
    if (dir || slug) fronts.push({ nome: marcas[k].nome, dir, slug, dockerfile })
  }
  return fronts
}

/** O documento que o navegador recebe primeiro naquele front. */
function documentoDeEntrada(dir) {
  for (const rel of ['index.html', 'app/layout.tsx']) {
    const abs = p(dir, rel)
    if (fs.existsSync(abs)) return { rel, texto: fs.readFileSync(abs, 'utf8') }
  }
  return null
}

/** Origens externas citadas no documento, sem as do próprio domínio da Arara. */
function origensExternas(texto) {
  const achadas = (texto.match(/https:\/\/[a-zA-Z0-9.-]+/g) || []).map((u) => u.replace('https://', ''))
  return [...new Set(achadas)].filter((h) => !/(^|\.)arara-tech\.com$/.test(h))
}

function bateria(politicas, compose, cabecalhos, entrypoint, dockerNext, dockerVite) {
  const f = []

  // ── Cada arquivo de política ──────────────────────────────────────────────
  const nomes = Object.keys(politicas)
  if (!nomes.includes('csp-default.conf')) f.push('sem-csp-default')
  for (const [nome, texto] of Object.entries(politicas)) {
    // Por linha, e NÃO até o primeiro `;`: o valor da política tem ponto e vírgula entre as
    // diretivas, então cortar no primeiro recortava `add_header ... "default-src 'self';` e o
    // resto da política ficava fora de toda asserção — a bateria reprovava a configuração certa e
    // cada mutação "morria" nessa mesma reprovação, sem provar nada.
    const linhas = semComentarios(texto).match(/^[ \t]*add_header\b.*$/gm) || []
    const csp = linhas.filter((l) => /Content-Security-Policy/i.test(l))
    if (csp.length !== 1) { f.push('csp-nao-e-uma-linha-so:' + nome + ':' + csp.length); continue }
    if (linhas.length !== 1) f.push('arquivo-de-csp-com-outro-cabecalho:' + nome)
    if (!/\balways\s*;/.test(csp[0])) f.push('csp-sem-always:' + nome)
    // Sem estas duas, nenhuma tela carrega dado: o navegador fala com a API em outra origem.
    if (!/connect-src[^;"]*https:\/\/api\.arara-tech\.com/.test(csp[0])) f.push('connect-src-sem-a-api:' + nome)
    if (!/default-src\s+'self'/.test(csp[0])) f.push('sem-default-src-self:' + nome)
    // `X-Frame-Options: SAMEORIGIN` já está decidido no security-headers.conf; `'none'` aqui
    // diria o contrário, e quem ler os dois não sabe qual vale.
    if (!/frame-ancestors\s+'self'/.test(csp[0])) f.push('frame-ancestors-nao-casa-com-SAMEORIGIN:' + nome)
    // Permitir `eval` devolve ao atacante a execução que o resto da política tira.
    if (/'unsafe-eval'/.test(csp[0])) f.push('unsafe-eval-na-politica:' + nome)
    if (!/object-src\s+'none'/.test(csp[0])) f.push('sem-object-src-none:' + nome)
    // `media-src` e `frame-src` têm de ser EXPLÍCITOS. Faltando, caem no `default-src 'self'`, e
    // `'self'` NÃO cobre `data:` — a inbox toca nota de voz e vídeo a partir do `data_uri` que a
    // API devolve, e a prévia de anexo abre PDF em `<iframe>` e vídeo em `<video>` com URL que
    // também pode ser `data:`. Foi exatamente o que faltou na primeira versão desta política.
    for (const d of ['media-src', 'frame-src']) {
      const m = csp[0].match(new RegExp(d + "\\s+([^;\"]+)"))
      if (!m) { f.push('sem-' + d + ':' + nome); continue }
      for (const fonte of ["'self'", 'data:', 'blob:', 'https://api.arara-tech.com']) {
        if (!m[1].includes(fonte)) f.push(d + '-sem-' + fonte.replace(/[':]/g, '') + ':' + nome)
      }
    }
  }

  // ── REGRA ESTRUTURAL: o que o front carrega x o que a política dele deixa ──
  const fronts = frontsDoCompose(compose)
  if (fronts.length < 5) f.push('compose-com-menos-de-5-fronts:' + fronts.length)
  for (const fr of fronts) {
    if (!fr.slug) { f.push('front-sem-slug:' + fr.nome); continue }
    if (!fr.dir) { f.push('front-sem-pasta:' + fr.nome); continue }
    const doc = documentoDeEntrada(fr.dir)
    if (!doc) { f.push('front-sem-documento-de-entrada:' + fr.nome); continue }
    const propria = 'csp-' + fr.slug + '.conf'
    const vale = politicas[propria] !== undefined ? politicas[propria] : politicas['csp-default.conf']
    if (vale === undefined) { f.push('front-sem-politica:' + fr.nome); continue }
    const linha = (semComentarios(vale).match(/^[ \t]*add_header\b.*$/gm) || []).find((l) => /Content-Security-Policy/i.test(l)) || ''
    for (const host of origensExternas(doc.texto)) {
      if (!linha.includes(host)) f.push('origem-do-front-fora-da-politica:' + fr.nome + ':' + host)
    }
  }

  // ── Como a política chega à resposta ──────────────────────────────────────
  // Escrita dentro do security-headers.conf ela seria igual para os cinco fronts, que é
  // justamente o que não serve.
  if (/Content-Security-Policy/i.test(semComentarios(cabecalhos))) f.push('csp-escrita-no-arquivo-compartilhado')
  if (!/include\s+\/etc\/nginx\/csp\.conf;/.test(semComentarios(cabecalhos))) f.push('cabecalhos-sem-include-da-csp')

  // ── O entrypoint ──────────────────────────────────────────────────────────
  const ep = semComentarios(entrypoint)
  if (!/cp\s+"\$_csp"\s+\/etc\/nginx\/csp\.conf/.test(ep)) f.push('entrypoint-nao-escreve-csp.conf')
  if (!/csp-default\.conf/.test(ep)) f.push('entrypoint-sem-padrao')
  if (!/csp-\$\{ARARA_APP_SLUG\}\.conf/.test(ep)) f.push('entrypoint-nao-escolhe-pelo-slug')
  // Sem o teste de existência, slug de front novo aponta para arquivo que não existe e o nginx
  // NÃO SOBE — o front morre no deploy em vez de cair na política padrão.
  if (!/\[\s*-f\s+"\/etc\/nginx\/templates\/csp-\$\{ARARA_APP_SLUG\}\.conf"\s*\]/.test(ep)) {
    f.push('entrypoint-nao-confere-se-o-arquivo-existe')
  }
  // Dentro do conf.d o nginx carregaria o arquivo sozinho, no nível `http`, e a política sairia
  // duas vezes na mesma resposta.
  if (/\/etc\/nginx\/conf\.d\/csp/.test(ep)) f.push('entrypoint-escreve-csp-no-conf.d')

  // ── As duas imagens ───────────────────────────────────────────────────────
  for (const [nome, dockerfile, arg] of [
    ['next-export', dockerNext, 'NEXT_PUBLIC_ARARA_APP_SLUG'],
    ['vite-spa', dockerVite, 'VITE_ARARA_APP_SLUG'],
  ]) {
    const d = semComentarios(dockerfile)
    // Sem o COPY o `include` não resolve e o nginx não sobe.
    if (!/COPY\s+deploy\/nginx\/csp-\*\.conf\s+\/etc\/nginx\/templates\//.test(d)) f.push('imagem-sem-copy-das-politicas:' + nome)
    // O ARG precisa ser redeclarado DEPOIS do segundo FROM: argumento de build não atravessa
    // estágio, e sem ele o ENV sai vazio e todo front cai no padrão em silêncio.
    const runtime = d.slice(d.lastIndexOf('FROM '))
    if (!new RegExp('ARG\\s+' + arg + '\\b').test(runtime)) f.push('imagem-sem-arg-no-estagio-do-nginx:' + nome)
    if (!new RegExp('ENV\\s+ARARA_APP_SLUG=\\$\\{' + arg + '\\}').test(runtime)) f.push('imagem-sem-env-do-slug:' + nome)
  }
  return f
}

const BASE = {
  politicas: POLITICAS,
  compose: COMPOSE,
  cabecalhos: CABECALHOS,
  entrypoint: ENTRYPOINT,
  dockerNext: DOCKER_NEXT,
  dockerVite: DOCKER_VITE,
}
const rodar = (o) => bateria(o.politicas, o.compose, o.cabecalhos, o.entrypoint, o.dockerNext, o.dockerVite)

const f = rodar(BASE)
ok('cada política é uma linha com always, deixa a API passar e nega eval; todo front do compose tem política que cobre as origens do seu documento de entrada; e as duas imagens levam o slug', f.length === 0, f)

// Cada mutação é uma lista de (de, para); cada `de` tem de casar EXATAMENTE uma vez, senão o caso
// reprova como "âncora" em vez de passar por engano.
const MUTACOES = [
  ['o portal-cursos perde a origem da folha de estilo do Google', 'politicas',
    { 'csp-portal-cursos.conf': [["style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "style-src 'self' 'unsafe-inline'"]] }],
  ['o portal-horas perde a origem dos arquivos de fonte', 'politicas',
    { 'csp-portal-horas.conf': [["font-src 'self' data: https://fonts.gstatic.com", "font-src 'self' data:"]] }],
  ['a política padrão perde o media-src e som/vídeo caem no default-src', 'politicas',
    { 'csp-default.conf': [["media-src 'self' data: blob: https://api.arara-tech.com; ", '']] }],
  ['a política padrão perde o frame-src e a prévia de PDF cai no default-src', 'politicas',
    { 'csp-default.conf': [["frame-src 'self' data: blob: https://api.arara-tech.com; ", '']] }],
  ['o media-src perde o data: que a inbox usa', 'politicas',
    { 'csp-default.conf': [["media-src 'self' data: blob:", "media-src 'self' blob:"]] }],
  ['o portal-cursos perde o frame-src', 'politicas',
    { 'csp-portal-cursos.conf': [["frame-src 'self' data: blob: https://api.arara-tech.com; ", '']] }],
  ['a política padrão perde a API no connect-src', 'politicas',
    { 'csp-default.conf': [["connect-src 'self' https://api.arara-tech.com", "connect-src 'self'"]] }],
  ['a política padrão perde o always', 'politicas',
    { 'csp-default.conf': [['object-src \'none\'" always;', 'object-src \'none\'";']] }],
  ['volta o unsafe-eval', 'politicas',
    { 'csp-default.conf': [["script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'"]] }],
  ['frame-ancestors none contra o SAMEORIGIN já decidido', 'politicas',
    { 'csp-default.conf': [["frame-ancestors 'self'; base-uri", "frame-ancestors 'none'; base-uri"]] }],
  ['a política padrão some', 'politicas', { 'csp-default.conf': null }],
  ['a política do portal-cursos some e ele cai no padrão', 'politicas', { 'csp-portal-cursos.conf': null }],
  ['front novo com fonte de fora e sem política própria', 'compose',
    [['  portal-cursos:\n', '  portal-novo:\n    build:\n      dockerfile: deploy/Dockerfile.vite-spa\n      args:\n        APP_DIR: apps/portal-cursos\n        VITE_ARARA_APP_SLUG: portal-novo\n\n  portal-cursos:\n']]],
  ['a política é escrita no arquivo compartilhado', 'cabecalhos',
    [['include /etc/nginx/csp.conf;', 'add_header Content-Security-Policy "default-src \'self\'" always;']]],
  ['o arquivo compartilhado deixa de incluir a política', 'cabecalhos',
    [['include /etc/nginx/csp.conf;', '']]],
  ['o entrypoint não confere se o arquivo do slug existe', 'entrypoint',
    [['if [ -n "${ARARA_APP_SLUG:-}" ] && [ -f "/etc/nginx/templates/csp-${ARARA_APP_SLUG}.conf" ]; then',
      'if [ -n "${ARARA_APP_SLUG:-}" ]; then']]],
  ['o entrypoint deixa de escrever a política', 'entrypoint',
    [['cp "$_csp" /etc/nginx/csp.conf', ':']]],
  // Mantém a cópia certa e ACRESCENTA a errada: assim quem reprova é a guarda do conf.d, e não a
  // que exige a cópia — mutante tem de morrer na asserção dele.
  ['o entrypoint escreve a política também dentro do conf.d', 'entrypoint',
    [['cp "$_csp" /etc/nginx/csp.conf', 'cp "$_csp" /etc/nginx/csp.conf\ncp "$_csp" /etc/nginx/conf.d/csp.conf']]],
  ['a imagem Next não leva as políticas', 'dockerNext',
    [['COPY deploy/nginx/csp-*.conf /etc/nginx/templates/\n', '']]],
  ['a imagem Vite não leva as políticas', 'dockerVite',
    [['COPY deploy/nginx/csp-*.conf /etc/nginx/templates/\n', '']]],
  ['a imagem Vite não redeclara o ARG no estágio do nginx', 'dockerVite',
    [['FROM nginx:1.27-alpine\nARG VITE_ARARA_APP_SLUG\n', 'FROM nginx:1.27-alpine\n']]],
  ['a imagem Next não grava o slug no ambiente', 'dockerNext',
    [['ENV ARARA_APP_SLUG=${NEXT_PUBLIC_ARARA_APP_SLUG}\n', '']]],
]

for (const [nome, qual, mudanca] of MUTACOES) {
  let novo
  let aplicou = true
  if (qual === 'politicas') {
    novo = Object.assign({}, BASE.politicas)
    for (const [arquivo, pares] of Object.entries(mudanca)) {
      if (pares === null) {
        if (novo[arquivo] === undefined) { aplicou = false; break }
        delete novo[arquivo]
        continue
      }
      let texto = novo[arquivo]
      if (texto === undefined) { aplicou = false; break }
      for (const [de, para] of pares) {
        if (texto.split(de).length - 1 !== 1) { aplicou = false; break }
        texto = texto.replace(de, () => para)
      }
      if (!aplicou) break
      novo[arquivo] = texto
    }
  } else {
    let texto = BASE[qual]
    for (const [de, para] of mudanca) {
      if (texto.split(de).length - 1 !== 1) { aplicou = false; break }
      texto = texto.replace(de, () => para)
    }
    if (texto === BASE[qual]) aplicou = false
    novo = texto
  }
  if (!aplicou) {
    ok(`mutação "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora')
    continue
  }
  const fm = rodar(Object.assign({}, BASE, { [qual]: novo }))
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
