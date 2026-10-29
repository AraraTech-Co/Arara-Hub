// O deploy da API preserva a configuração e não é interrompido no meio.
//
// POR QUE ISTO É TESTE E NÃO CONFERÊNCIA DE OLHO:
// o script que roda no servidor vive dentro de um heredoc no YAML do workflow.
// Ninguém o executa num ambiente de teste, e foi exatamente ali que a API caiu:
// a extração do env do container era `docker inspect ... > prd.env`, e
// redirecionamento TRUNCA o destino antes de escrever — o arquivo ficava vazio
// no instante em que o comando começava.
//
// Então o teste EXTRAI o heredoc do YAML, faz a mesma expansão que o shell do
// runner faria, e roda o script de verdade contra um `docker` e um `curl`
// falsos. O laboratório tem de reproduzir o real: os falsos registram cada
// chamada, e é por eles que se afirma que o container NÃO foi removido.
//
// Roda com: node deploy-api-preserva-env.test.js
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ok, fim } = require('./_carregar.js')

const YAML = path.resolve(__dirname, '../../../../.github/workflows/deploy-api.yml')

// ── O script remoto, como o runner o entrega ao bash do servidor ───────────
function scriptRemoto() {
  const texto = fs.readFileSync(YAML, 'utf8')
  const abre = texto.indexOf('bash -s <<REMOTE')
  const fecha = texto.indexOf('\n          REMOTE\n', abre)
  if (abre < 0 || fecha < 0) return null
  const corpo = texto.slice(texto.indexOf('\n', abre) + 1, fecha)
  // O heredoc é SEM aspas: o shell do runner expande as variáveis dele e
  // converte `\$` em `$` e `\\` em `\`. A indentação de 10 espaços do YAML sai.
  return corpo
    .split('\n')
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n')
    .replace(/\\\$/g, '$')
    .replace(/\\\\/g, '\\')
}

const SCRIPT = scriptRemoto()
ok('o-script-remoto-foi-extraido', !!SCRIPT && SCRIPT.includes('docker run -d'), SCRIPT && SCRIPT.slice(0, 60))
if (!SCRIPT) { fim(); process.exit(0) }

// ── O laboratório ──────────────────────────────────────────────────────────
function laboratorio({ containerExiste, envDoContainer, prdEnv, saude }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-api-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const chamadas = path.join(dir, 'chamadas.log')
  fs.writeFileSync(chamadas, '')

  // `docker` falso: registra tudo e responde o que o cenário pede.
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/bash
echo "docker $*" >> ${JSON.stringify(chamadas)}
case "$1" in
  build) exit 0 ;;
  inspect)
    if [ "${containerExiste ? '1' : '0'}" != "1" ]; then exit 1; fi
    for a in "$@"; do if [ "$a" = "--format" ]; then cat ${JSON.stringify(path.join(dir, 'env-do-container'))}; fi; done
    exit 0 ;;
  rm) exit 0 ;;
  run) echo "idfalso123"; exit 0 ;;
  logs) echo "linha de log do container"; exit 0 ;;
  ps) exit 0 ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 })

  // `curl` falso: a saúde do cenário.
  fs.writeFileSync(path.join(bin, 'curl'), `#!/bin/bash
echo "curl $*" >> ${JSON.stringify(chamadas)}
${saude === 'ok' ? 'echo \'{"ok":true}\'; exit 0' : 'exit 7'}
`, { mode: 0o755 })

  // `sleep` falso: o teste não espera 40 segundos de verdade.
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })

  // `mktemp` que escreve DENTRO do laboratório. O do macOS ignora o TMPDIR
  // quando chamado sem template, e o sandbox não deixa criar em /var/folders —
  // o script morreria por causa da máquina, não do código.
  fs.writeFileSync(path.join(bin, 'mktemp'), `#!/bin/bash
f=${JSON.stringify(dir)}/tmp.$$.$RANDOM
: > "$f"
echo "$f"
`, { mode: 0o755 })

  // `sed` que fala GNU, porque o servidor é Linux.
  //
  // Esta é a ÚNICA diferença que o laboratório emula, e ela precisa ser dita: o
  // `sed -i` do BSD (macOS) exige um sufixo de backup, o do GNU não. Sem o
  // shim, o script morre aqui por causa da máquina de teste, não do código —
  // e eu quase concluí que o workflow estava errado.
  fs.writeFileSync(path.join(bin, 'sed'), `#!/bin/bash
if [ "$1" = "-i" ]; then shift; exec /usr/bin/sed -i '' "$@"; fi
exec /usr/bin/sed "$@"
`, { mode: 0o755 })

  // O env do container vai num arquivo: `printf '%s'` não interpreta o `\n`, e
  // o falso devolvia tudo numa linha só — a leitura via uma chave e ignorava o
  // resto, fazendo o caso passar por motivo errado.
  fs.writeFileSync(path.join(dir, 'env-do-container'), envDoContainer || '')

  const app = path.join(dir, 'app')
  fs.mkdirSync(app)
  if (prdEnv !== null) fs.writeFileSync(path.join(app, 'prd.env'), prdEnv)

  // O cabeçalho que o runner expande: as três variáveis do topo do heredoc.
  const comCabecalho = SCRIPT
    .replace('RAW="${RAW}"', `RAW=${JSON.stringify(app)}`)
    .replace('IMAGE="${IMAGE}"', 'IMAGE="arara-api:local"')
    .replace('DEFAULT_FETCH_BY_APP="${DEFAULT_FETCH_BY_APP}"', 'DEFAULT_FETCH_BY_APP="portal-suporte:x"')

  let saida = '', status = 0
  try {
    saida = execFileSync('bash', ['-c', comCabecalho], {
      // TMPDIR dentro do laboratório: o `mktemp` do script precisa de um lugar
      // onde possa escrever, e o sandbox não deixa criar em /var/folders.
      env: { ...process.env, PATH: bin + ':' + process.env.PATH, HOME: dir, TMPDIR: dir },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    status = e.status === undefined ? -1 : e.status
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  const log = fs.readFileSync(chamadas, 'utf8')
  const envFinal = fs.existsSync(path.join(app, 'prd.env'))
    ? fs.readFileSync(path.join(app, 'prd.env'), 'utf8') : null
  return {
    status, saida, log, envFinal,
    removeu: /docker rm -f arara-platform-prd/.test(log),
    subiu: /docker run -d/.test(log),
    backup: fs.existsSync(path.join(app, 'prd.env.bak')),
    backupConteudo: fs.existsSync(path.join(app, 'prd.env.bak'))
      ? fs.readFileSync(path.join(app, 'prd.env.bak'), 'utf8') : null,
  }
}

const COMPLETO = 'DATABASE_URL=postgres://x\nJWT_SECRET=abc\nAPP_SECRETS_KEY=def\n'
const SO_PADROES = 'DISABLE_HOSTING_RESTORE=1\nDISABLE_APP_HOSTING=1\n'

;(async () => {
  // ── 1. Container existe, env completa: atualiza e sobe ────────────────────
  {
    const r = laboratorio({
      containerExiste: true,
      envDoContainer: COMPLETO + 'EXTRA_DO_CONTAINER=1\n',
      prdEnv: COMPLETO,
      saude: 'ok',
    })
    ok('1-container-existe:sai-bem', r.status === 0, { status: r.status, saida: r.saida.slice(-300) })
    ok('1-container-existe:removeu-e-subiu', r.removeu && r.subiu, r.log)
    ok('1-container-existe:guardou-copia', r.backup, r.backup)
    // O que o container tinha e o prd.env não tinha ENTRA.
    ok('1-container-existe:chave-nova-do-container-entra',
      /EXTRA_DO_CONTAINER=1/.test(r.envFinal), r.envFinal)
    ok('1-container-existe:os-tres-segredos-continuam',
      /DATABASE_URL=postgres:\/\/x/.test(r.envFinal)
      && /JWT_SECRET=abc/.test(r.envFinal)
      && /APP_SECRETS_KEY=def/.test(r.envFinal), r.envFinal)
  }

  // ── 2. O prd.env do servidor é a FONTE, não o container ───────────────────
  //
  // O defeito era o container sobrescrever o arquivo. Aqui o container traz
  // valores diferentes para as mesmas chaves, e o do servidor tem de vencer.
  {
    const r = laboratorio({
      containerExiste: true,
      envDoContainer: 'DATABASE_URL=postgres://DO_CONTAINER\nJWT_SECRET=DO_CONTAINER\nAPP_SECRETS_KEY=DO_CONTAINER\n',
      prdEnv: COMPLETO,
      saude: 'ok',
    })
    ok('2-o-servidor-vence:sai-bem', r.status === 0, { status: r.status })
    ok('2-o-servidor-vence:o-valor-do-servidor-fica',
      /DATABASE_URL=postgres:\/\/x/.test(r.envFinal)
      && !/DO_CONTAINER/.test(r.envFinal), r.envFinal)
  }

  // ── 3. Sem container e com prd.env completo: usa o prd.env ────────────────
  {
    const r = laboratorio({
      containerExiste: false, envDoContainer: '', prdEnv: COMPLETO, saude: 'ok',
    })
    ok('3-sem-container-com-env:sai-bem', r.status === 0, { status: r.status, saida: r.saida.slice(-300) })
    ok('3-sem-container-com-env:subiu', r.subiu, r.log)
    ok('3-sem-container-com-env:os-segredos-continuam',
      /APP_SECRETS_KEY=def/.test(r.envFinal), r.envFinal)
  }

  // ── 4. Sem container e prd.env só com padrões: ABORTA sem remover ────────
  //
  // É o cenário do incidente. O que importa não é só o exit 1: é que o
  // container antigo NÃO seja removido, para o deploy falhar sem derrubar nada.
  {
    const r = laboratorio({
      containerExiste: false, envDoContainer: '', prdEnv: SO_PADROES, saude: 'ok',
    })
    ok('4-env-so-padroes:aborta', r.status === 1, { status: r.status, saida: r.saida.slice(-400) })
    ok('4-env-so-padroes:NAO-removeu-o-container', !r.removeu, r.log)
    ok('4-env-so-padroes:nao-subiu-nada', !r.subiu, r.log)
    ok('4-env-so-padroes:nomeia-as-tres-chaves',
      /DATABASE_URL/.test(r.saida) && /JWT_SECRET/.test(r.saida) && /APP_SECRETS_KEY/.test(r.saida),
      r.saida.slice(-400))
  }

  // ── 5. Faltando UMA chave: aborta e nomeia justamente ela ────────────────
  {
    const r = laboratorio({
      containerExiste: false, envDoContainer: '',
      prdEnv: 'DATABASE_URL=postgres://x\nJWT_SECRET=abc\nAPP_SECRETS_KEY=\n',
      saude: 'ok',
    })
    ok('5-sem-uma-chave:aborta', r.status === 1, { status: r.status })
    ok('5-sem-uma-chave:NAO-removeu', !r.removeu, r.log)
    ok('5-sem-uma-chave:nomeia-a-chave-que-falta',
      /APP_SECRETS_KEY/.test(r.saida) && !/DATABASE_URL/.test(r.saida.split('Falta')[1] || ''),
      r.saida.slice(-400))
    // O valor NUNCA aparece na mensagem.
    ok('5-sem-uma-chave:nao-vaza-valor',
      !r.saida.includes('postgres://x') && !r.saida.includes('abc'), r.saida.slice(-400))
  }

  // ── 5b. A chave que falta NÃO é a última do laço ─────────────────────────
  //
  // Caso irmão do 5, e ele existe por um motivo preciso: ali a chave que falta
  // é a última conferida, então a variável do laço termina vazia e um vazamento
  // de valor passaria sem ser visto. Aqui falta a PRIMEIRA, e as outras duas
  // têm segredo de verdade — é este caso que prova que a mensagem não imprime
  // o que leu.
  {
    const r = laboratorio({
      containerExiste: false, envDoContainer: '',
      prdEnv: 'JWT_SECRET=segredo-do-jwt\nAPP_SECRETS_KEY=segredo-das-chaves\n',
      saude: 'ok',
    })
    ok('5b-falta-a-primeira:aborta', r.status === 1, { status: r.status })
    ok('5b-falta-a-primeira:NAO-removeu', !r.removeu, r.log)
    ok('5b-falta-a-primeira:nomeia-a-que-falta', /DATABASE_URL/.test(r.saida), r.saida.slice(-300))
    ok('5b-falta-a-primeira:nao-vaza-nenhum-segredo',
      !r.saida.includes('segredo-do-jwt') && !r.saida.includes('segredo-das-chaves'),
      r.saida.slice(-300))
  }

  // ── 6. A API não sobe: imprime os logs e falha ────────────────────────────
  {
    const r = laboratorio({
      containerExiste: true, envDoContainer: COMPLETO, prdEnv: COMPLETO, saude: 'ruim',
    })
    ok('6-api-nao-sobe:falha', r.status === 1, { status: r.status })
    ok('6-api-nao-sobe:imprime-os-logs-do-container',
      /docker logs --tail 30/.test(r.log), r.log)
    ok('6-api-nao-sobe:a-saida-traz-a-linha-do-log',
      r.saida.includes('linha de log do container'), r.saida.slice(-300))
    // Tentou mais de uma vez antes de desistir.
    ok('6-api-nao-sobe:tentou-varias-vezes',
      (r.log.match(/curl -sf http:\/\/127\.0\.0\.1:4100\/health/g) || []).length >= 10,
      (r.log.match(/curl/g) || []).length)
  }

  // ── 7. O arquivo nunca é truncado por redirecionamento ───────────────────
  {
    const texto = fs.readFileSync(YAML, 'utf8')
    ok('7-nao-ha-redirecionamento-para-o-prd.env',
      !/docker inspect[^\n]*>\s*"\$ENV_FILE"/.test(texto)
      && !/docker inspect[^\n]*>\s*"\\\$ENV_FILE"/.test(texto), null)
    ok('7-a-extracao-vai-para-arquivo-temporario', /mktemp/.test(texto), null)
    ok('7-o-deploy-nao-e-interrompido-no-meio',
      /cancel-in-progress:\s*false/.test(texto), null)
    ok('7-a-trava-vem-antes-do-rm',
      texto.indexOf('faltando=') < texto.indexOf('docker rm -f arara-platform-prd'), null)
  }

  fim()
})()
