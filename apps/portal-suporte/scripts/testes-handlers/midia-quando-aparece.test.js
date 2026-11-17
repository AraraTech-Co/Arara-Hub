// A mídia da bolha é pedida só quando a bolha aparece na tela
// (app/_hooks/use-midia-quando-aparece.ts, usado por MediaSobDemanda em message-list.tsx).
//
// COMO ESTE TESTE EXERCITA O HOOK: não há React nem jsdom aqui. Como em
// trocar-conversa-sem-espera.test.js, o `react` é substituído por um mínimo com
// `useState`, `useRef` e `useEffect` seguindo a REGRA DOCUMENTADA do array de
// dependências. O IntersectionObserver e o relógio (`setTimeout`) são de brinquedo
// e controlados pelo teste. Um "render" zera o índice dos hooks, chama o hook,
// prende o `ref` no elemento (o que o React faz no commit) e aplica os efeitos.
//
// O QUE ISSO PROVA e o que não prova: prova o comportamento do hook SOB essa regra
// e com um observador que avisa entrada e saída da bolha. Não prova o React nem o
// IntersectionObserver de verdade.
//
// O QUE SE GARANTE:
//   - montar a bolha NÃO pede a mídia;
//   - bolha que passa pela tela por menos de 200 ms (a rolagem suave até o fim) NÃO pede;
//   - bolha que fica visível 200 ms pede UMA vez, e o observador é desligado;
//   - re-render com uma função de busca nova não pede de novo;
//   - erro na busca vira `erro`;
//   - desmontar no meio da espera cancela;
//   - sem IntersectionObserver, pede na hora (o comportamento de antes);
//   - o componente usa o hook, com o `ref` no elemento da bolha.
//
// MUTAÇÕES: cada uma aplicada uma vez e reprovada na asserção que a nomeia.
//
// Roda com: node midia-quando-aparece.test.js
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerHooks } = require('node:module')
const { ok, fim } = require('./_carregar.js')
const { semComentarios } = require('./_tela.js')

const ARQ_HOOK = path.resolve(__dirname, '../../app/_hooks/use-midia-quando-aparece.ts')

// ── O React mínimo, com a regra do array de dependências ───────────────────
const reagir = { efeitos: [], estados: [], refs: [], i: 0 }
globalThis.__reagir = reagir
const VARIANTES = {}
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'react') return { url: 'stub-react:react', shortCircuit: true }
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url === 'stub-react:react') {
      return {
        format: 'module', shortCircuit: true,
        source: `
          const r = globalThis.__reagir;
          export function useState(inicial) {
            const i = r.i++;
            if (!(i in r.estados)) r.estados[i] = typeof inicial === 'function' ? inicial() : inicial;
            return [r.estados[i], (v) => { r.estados[i] = typeof v === 'function' ? v(r.estados[i]) : v; }];
          }
          export function useRef(inicial) {
            const i = r.i++;
            if (!(i in r.refs)) r.refs[i] = { current: inicial };
            return r.refs[i];
          }
          export function useEffect(fn, deps) {
            const i = r.i++;
            const antes = r.efeitos[i];
            const mudou = !antes || !deps || !antes.deps || deps.length !== antes.deps.length
              || deps.some((d, k) => d !== antes.deps[k]);
            r.efeitos[i] = { deps, fn, limpar: antes ? antes.limpar : null, pendente: mudou };
          }
          export default { useState, useRef, useEffect };
        `,
      }
    }
    // Variante do hook: o mesmo arquivo com uma troca (mutação).
    const m = /[?&]v=(\w+)/.exec(url)
    if (m && url.includes('use-midia-quando-aparece')) {
      const [de, para] = VARIANTES[m[1]]
      const fonte = fs.readFileSync(ARQ_HOOK, 'utf8')
      const n = fonte.split(de).length - 1
      return { format: 'module-typescript', shortCircuit: true, source: n === 1 ? fonte.replace(de, () => para) : 'throw new Error("mutação não aplicou: ' + m[1] + '")' }
    }
    return next(url, ctx)
  },
})

function aplicarEfeitos() {
  for (const e of reagir.efeitos) {
    if (!e || !e.pendente) continue
    if (typeof e.limpar === 'function') e.limpar()
    const r = e.fn()
    e.limpar = typeof r === 'function' ? r : null
    e.pendente = false
  }
}
function desmontar() {
  for (const e of reagir.efeitos) if (e && typeof e.limpar === 'function') e.limpar()
}

// ── Relógio e IntersectionObserver de brinquedo ────────────────────────────
let agora = 0
let timers = []
const setTimeoutReal = globalThis.setTimeout
function instalarRelogio() {
  agora = 0; timers = []
  globalThis.setTimeout = (fn, ms) => { const t = { fn, em: agora + ms, vivo: true }; timers.push(t); return t }
  globalThis.clearTimeout = (t) => { if (t) t.vivo = false }
}
function andar(ms) {
  agora += ms
  for (const t of timers.slice()) if (t.vivo && t.em <= agora) { t.vivo = false; t.fn() }
}
let observadores = []
class ObservadorFalso {
  constructor(cb, opcoes) { this.cb = cb; this.opcoes = opcoes; this.alvos = []; this.ligado = true; observadores.push(this) }
  observe(el) { this.alvos.push(el) }
  disconnect() { this.ligado = false; this.alvos = [] }
  avisar(dentro) { if (this.ligado && this.alvos.length) this.cb(this.alvos.map((target) => ({ target, isIntersecting: dentro }))) }
}
const ultimo = () => observadores[observadores.length - 1]
const esperar = () => new Promise((r) => setImmediate(r))

async function bateria(variante) {
  const f = []
  const mod = await import(pathToFileURL(ARQ_HOOK).href + (variante ? '?v=' + variante : ''))
  const { useMidiaQuandoAparece } = mod
  const EL = { nome: 'bolha' }
  let pedidos = []
  let falhar = false
  // Função nova a cada render, como um componente que não a memoriza.
  const novaBusca = () => async (id) => { pedidos.push(id); if (falhar) throw new Error('x'); return 'data:image/png;base64,AAA' }
  let saida = null
  const render = (id = 'wam_1', opcoes) => {
    reagir.i = 0
    saida = useMidiaQuandoAparece(id, novaBusca(), opcoes)
    saida.ref.current = EL
    aplicarEfeitos()
  }
  const zerar = () => { reagir.efeitos = []; reagir.estados = []; reagir.refs = []; observadores = []; pedidos = []; falhar = false; instalarRelogio() }

  // ── com IntersectionObserver ──────────────────────────────────────────────
  globalThis.IntersectionObserver = ObservadorFalso
  zerar()
  render()
  await esperar()
  if (pedidos.length !== 0) f.push('montar a bolha não pede a mídia')
  if (!(ultimo() && ultimo().alvos[0] === EL)) f.push('TRAVA: o observador vigia o elemento da bolha')
  if (!(ultimo() && ultimo().opcoes && ultimo().opcoes.rootMargin === '400px 0px')) f.push('começa a carregar 400px antes da bolha entrar')

  // a rolagem suave passa pela bolha: entra e sai em menos de 200 ms
  ultimo().avisar(true); andar(120); ultimo().avisar(false); andar(500)
  render(); await esperar()
  if (pedidos.length !== 0) f.push('bolha que só passou pela tela (< 200 ms) não pede')

  // agora fica visível
  ultimo().avisar(true); andar(199)
  render(); await esperar()
  if (pedidos.length !== 0) f.push('antes de 200 ms visível ainda não pede')
  andar(1)
  render(); await esperar()
  if (!(pedidos.length === 1 && pedidos[0] === 'wam_1')) f.push('visível 200 ms: pede a mídia uma vez')
  if (!observadores.every((o) => !o.ligado)) f.push('depois de aparecer, o observador é desligado')
  render(); await esperar()
  render(); await esperar()
  if (pedidos.length !== 1) f.push('re-render com função de busca nova não pede de novo')
  if (saida.url !== 'data:image/png;base64,AAA') f.push('a mídia chega no url')

  // erro
  zerar(); falhar = true
  render(); ultimo().avisar(true); andar(200); render(); await esperar(); render()
  if (!(saida.erro === true && saida.url === null)) f.push('erro na busca vira erro')

  // desmontar no meio da espera
  zerar()
  render(); ultimo().avisar(true); andar(100); desmontar()
  const semEspera = timers.every((t) => !t.vivo)
  const desligado = observadores.every((o) => !o.ligado)
  andar(500); await esperar()
  if (!(pedidos.length === 0 && semEspera && desligado)) f.push('desmontar no meio da espera cancela')

  // ── sob clique (vídeo, documento): nada sozinho, pede no carregar() ───────
  zerar()
  const SOB = { automatico: false }
  render('wam_9', SOB); render('wam_9', SOB); andar(1000); await esperar()
  if (!(observadores.length === 0 && pedidos.length === 0 && saida.pedida === false)) f.push('sob clique: não observa nem pede ao montar')
  saida.carregar(); render('wam_9', SOB); await esperar(); render('wam_9', SOB)
  if (!(pedidos.length === 1 && pedidos[0] === 'wam_9' && saida.pedida === true && saida.url)) f.push('sob clique: carregar() pede a mídia uma vez')
  render('wam_9', SOB); await esperar()
  if (pedidos.length !== 1) f.push('sob clique: depois de carregar, não pede de novo')

  // quais tipos carregam sozinhos
  const tipos = ['image', 'sticker', 'audio', 'video', 'document', null].map((t) => mod.carregaSozinha(t))
  if (JSON.stringify(tipos) !== JSON.stringify([true, true, true, false, false, false])) f.push('imagem, figurinha e áudio carregam sozinhos; vídeo, documento e desconhecido esperam o clique')

  // ── sem IntersectionObserver: pede na hora ────────────────────────────────
  delete globalThis.IntersectionObserver
  zerar()
  render(); render(); await esperar()
  if (pedidos.length !== 1) f.push('sem IntersectionObserver, pede na hora')
  return f
}

const NOMES = [
  'TRAVA: o observador vigia o elemento da bolha',
  'montar a bolha não pede a mídia',
  'começa a carregar 400px antes da bolha entrar',
  'bolha que só passou pela tela (< 200 ms) não pede',
  'antes de 200 ms visível ainda não pede',
  'visível 200 ms: pede a mídia uma vez',
  'depois de aparecer, o observador é desligado',
  're-render com função de busca nova não pede de novo',
  'a mídia chega no url',
  'erro na busca vira erro',
  'desmontar no meio da espera cancela',
  'sem IntersectionObserver, pede na hora',
  'sob clique: não observa nem pede ao montar',
  'sob clique: carregar() pede a mídia uma vez',
  'sob clique: depois de carregar, não pede de novo',
  'imagem, figurinha e áudio carregam sozinhos; vídeo, documento e desconhecido esperam o clique',
]

;(async () => {
  let f
  try { f = await bateria() } catch (e) { f = ['erro: ' + e.message] }
  for (const n of NOMES) ok(n, !f.includes(n), f)

  // O componente usa o hook, com o ref no elemento, e não pede mais a mídia direto.
  const lista = semComentarios('_components/inbox/message-list.tsx')
  const ini = lista.indexOf('function MediaSobDemanda(')
  const corpo = ini >= 0 ? lista.slice(ini, lista.indexOf('\n}\n', ini)) : ''
  ok('MediaSobDemanda usa o hook e põe o ref no elemento',
    corpo.includes('useMidiaQuandoAparece') && /<div ref=\{ref\}>/.test(corpo) && !corpo.includes('whatsappApi.midia('), corpo.slice(0, 300))
  ok('MediaSobDemanda decide pelo tipo e o botão chama carregar()',
    /carregaSozinha\(type\)/.test(corpo) && corpo.includes('{ automatico }') && /onClick=\{[^}]*carregar\(\)/.test(corpo), corpo.slice(0, 400))

  const MUTS = [
    ['pede ao montar', 'if (!visivel) return\n    let vivo', 'let vivo', 'montar a bolha não pede a mídia'],
    ['sem permanência', 'PERMANENCIA_MS = 200', 'PERMANENCIA_MS = 0', 'bolha que só passou pela tela (< 200 ms) não pede'],
    ['sair não cancela a espera', '        clearTimeout(timer)\n        timer = null\n', '', 'bolha que só passou pela tela (< 200 ms) não pede'],
    ['limpeza não desliga o observador', '      if (timer !== null) clearTimeout(timer)\n      obs.disconnect()\n', '      if (timer !== null) clearTimeout(timer)\n', 'desmontar no meio da espera cancela'],
    ['busca nas dependências', '  }, [id, visivel])\n\n  return', '  }, [id, visivel, buscar])\n\n  return', 're-render com função de busca nova não pede de novo'],
    ['desmontar não limpa o timer', '      if (timer !== null) clearTimeout(timer)\n', '', 'desmontar no meio da espera cancela'],
    ['sem margem', "MARGEM = '400px 0px'", "MARGEM = '0px'", 'começa a carregar 400px antes da bolha entrar'],
    ['sob clique observa mesmo assim', 'if (visivel || !automatico) return', 'if (visivel) return', 'sob clique: não observa nem pede ao montar'],
    ['carregar não faz nada', 'carregar: () => setVisivel(true)', 'carregar: () => {}', 'sob clique: carregar() pede a mídia uma vez'],
    ['vídeo carrega sozinho', "type === 'audio'\n", "type === 'audio' || type === 'video'\n", 'imagem, figurinha e áudio carregam sozinhos; vídeo, documento e desconhecido esperam o clique'],
    ['sem reserva para navegador antigo', '      setVisivel(true)\n      return\n', '      return\n', 'sem IntersectionObserver, pede na hora'],
  ]
  for (const [nome, de, para, assercao] of MUTS) {
    VARIANTES[nome.replace(/\W/g, '_')] = [de, para]
    let fm
    try { fm = await bateria(nome.replace(/\W/g, '_')) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" morre em "${assercao}"`, fm.includes(assercao), fm)
  }
  globalThis.setTimeout = setTimeoutReal
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
