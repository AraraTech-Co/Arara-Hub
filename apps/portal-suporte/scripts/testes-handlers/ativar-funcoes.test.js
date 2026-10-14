// ⚠️ TEMPORÁRIO — apagar junto do card "Ativar funções novas".
//
// O card cria os mesmos models que os quatro scripts `.py`. São DUAS
// definições do mesmo schema: a do TypeScript (que o card usa) e a do Python
// (que os scripts usam). O Python não importa TypeScript, então a única forma
// de elas não divergirem é este teste — se alguém ajustar um lado e esquecer o
// outro, o card passa a criar um model diferente do que o script cria, e
// descobrir isso depois significa dois acervos com formas diferentes em
// produção.
//
// Roda com: node ativar-funcoes.test.js
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { registerHooks } = require('node:module')
const { ok, fim } = require('./_carregar.js')

const RAIZ = path.resolve(__dirname, '../..')

// O módulo do card importa o cliente e o guardião do JWT; nenhum dos dois é
// necessário para comparar schemas, e carregá-los exigiria o bundler.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === '@/lib/arara/client') return { url: 'stub-ativar:client', shortCircuit: true }
    if (spec === '@/lib/arara/auth-storage') return { url: 'stub-ativar:auth', shortCircuit: true }
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url === 'stub-ativar:client') {
      return { format: 'module', shortCircuit: true, source: "export const ARARA_URL='http://x';export const ARARA_SLUG='portal-suporte'" }
    }
    if (url === 'stub-ativar:auth') {
      return { format: 'module', shortCircuit: true, source: 'export function getJwt(){return null}' }
    }
    return next(url, ctx)
  },
})

/**
 * Lê os schemas declarados num script Python.
 *
 * Não é parser de Python: é leitura dos blocos `"name": ...` e das chaves de
 * `"properties"`, que é a forma em que esses quatro arquivos declaram o model.
 * Se alguém escrever o schema de outro jeito, o teste deixa de encontrá-lo — e
 * para isso existe a asserção de que cada script contribuiu pelo menos um
 * model.
 */
function schemasDoPython(arquivo) {
  const texto = fs.readFileSync(path.join(RAIZ, 'scripts', arquivo), 'utf8')
  const achados = {}
  const re = /"name":\s*"([^"]+)"[\s\S]*?"properties":\s*\{([\s\S]*?)\n\s{8}\},/g
  let m
  while ((m = re.exec(texto))) {
    const nome = m[1]
    const corpo = m[2]
    const props = {}
    for (const p of corpo.matchAll(/"(\w+)":\s*\{"type":\s*"(\w+)"\}/g)) {
      props[p[1]] = p[2]
    }
    achados[nome] = props
  }
  return achados
}

;(async () => {
  const mod = await import(pathToFileURL(path.join(RAIZ, 'app/lib/ativar-funcoes.ts')).href)

  // ── os schemas dos dois lados ────────────────────────────────────────────
  const doPython = Object.assign(
    {},
    schemasDoPython('wa-contas-modelo.py'),
    schemasDoPython('push-modelo.py'),
    schemasDoPython('arquivos-modelo.py'),
  )
  ok(`os scripts declaram models (achei ${Object.keys(doPython).length})`,
    Object.keys(doPython).length >= 7, Object.keys(doPython))

  const doTs = {}
  for (const passo of mod.PASSOS) {
    if (!passo.model) continue
    doTs[passo.model.name] = Object.fromEntries(
      Object.entries(passo.model.schema.properties).map(([k, v]) => [k, v.type]),
    )
  }
  ok(`o card declara ${Object.keys(doTs).length} models`, Object.keys(doTs).length === 7, Object.keys(doTs))

  // ── MESMOS models ────────────────────────────────────────────────────────
  const soNoPython = Object.keys(doPython).filter((n) => !(n in doTs))
  const soNoTs = Object.keys(doTs).filter((n) => !(n in doPython))
  ok('os dois lados declaram os MESMOS models', soNoPython.length === 0 && soNoTs.length === 0,
    { soNoPython, soNoTs })

  // ── MESMOS campos, com os MESMOS tipos ───────────────────────────────────
  const divergencias = []
  for (const nome of Object.keys(doTs)) {
    const a = doTs[nome]
    const b = doPython[nome] || {}
    for (const campo of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[campo] !== b[campo]) {
        divergencias.push(`${nome}.${campo}: card=${a[campo] ?? '(falta)'} script=${b[campo] ?? '(falta)'}`)
      }
    }
  }
  ok('campo por campo, os dois lados batem', divergencias.length === 0, divergencias)

  // ── o campo que a conversa ganha ─────────────────────────────────────────
  const contasPy = fs.readFileSync(path.join(RAIZ, 'scripts/wa-contas-modelo.py'), 'utf8')
  ok('o campo da conta na conversa é o mesmo nos dois',
    contasPy.includes(`"${mod.CAMPO_CONTA_NA_CONVERSA}": {"type": "string"}`),
    mod.CAMPO_CONTA_NA_CONVERSA)
  ok('  e o model da conversa também',
    contasPy.includes(mod.MODEL_CONVERSA), mod.MODEL_CONVERSA)

  // ── os nomes dos segredos VAPID ──────────────────────────────────────────
  const vapidPy = fs.readFileSync(path.join(RAIZ, 'scripts/push-vapid.py'), 'utf8')
  ok('os nomes dos segredos VAPID são os mesmos nos dois',
    vapidPy.includes(mod.SEGREDO_VAPID_PUBLICA) && vapidPy.includes(mod.SEGREDO_VAPID_PRIVADA),
    [mod.SEGREDO_VAPID_PUBLICA, mod.SEGREDO_VAPID_PRIVADA])
  // E o que o servidor LÊ tem de ser esse mesmo nome, senão o push fica mudo
  // com as chaves cadastradas.
  const agendador = fs.readFileSync(
    path.resolve(RAIZ, '../../packages/api/src/apps/portal-suporte/agendador.ts'), 'utf8')
  ok('  e são os nomes que o relógio procura no cofre',
    agendador.includes(mod.SEGREDO_VAPID_PUBLICA) && agendador.includes(mod.SEGREDO_VAPID_PRIVADA),
    'agendador.ts')

  // ── a ordem dos passos é a dos scripts ───────────────────────────────────
  const ordem = mod.PASSOS.map((p) => p.chave).join(',')
  ok('a ordem dos passos segue a dos scripts (contas → push → arquivos)',
    ordem === 'conta,conta_id,push_inscricao,push_preferencia,push_fila,vapid,arquivo,arquivo_conteudo,arquivo_evento',
    ordem)

  // ── sem JWT, nada é chamado ──────────────────────────────────────────────
  // O stub devolve `getJwt() === null`: a leitura tem de recusar ANTES de
  // qualquer fetch. Se um fetch acontecer, o teste quebra aqui.
  const fetchOriginal = globalThis.fetch
  let chamou = false
  globalThis.fetch = async () => { chamou = true; throw new Error('não deveria chamar') }
  let mensagem = null
  try { await mod.lerEstado() } catch (e) { mensagem = e.message }
  globalThis.fetch = fetchOriginal
  ok('sem JWT: recusa com "Sessão necessária"', mensagem === 'Sessão necessária', mensagem)
  ok('  e NÃO chama a rede', chamou === false, { chamou })

  fim()
})()
