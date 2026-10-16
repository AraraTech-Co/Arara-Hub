// Trocar de conversa consulta na hora, em vez de esperar o próximo tique.
//
// `usePolling` dependia só de `[enabled, intervalMs]`. Trocar entre duas
// conversas não muda nenhum dos dois, então o ciclo não reiniciava e a primeira
// consulta da conversa nova nunca era disparada: a tela ficava em "Carregando
// mensagens…" até o tique seguinte — 0 a 5 s, média 2,5 s. Na troca de aba de
// conta, até 10 s de lista vazia.
//
// COMO ESTE TESTE EXERCITA O HOOK DE VERDADE: não há React nem jsdom aqui, mas
// `registerHooks` permite interceptar o import — é o que o teste de push já faz
// com `web-push`. O `react` é substituído por um mínimo que implementa
// `useState`, `useRef` e `useEffect` seguindo a REGRA DOCUMENTADA do array de
// dependências: ao re-renderizar, se alguma dependência mudou (comparação por
// identidade), roda a limpeza do efeito anterior e executa o efeito de novo.
//
// O QUE ISSO PROVA e o que não prova: prova que o hook, sob essa regra, dispara
// a consulta quando a chave muda, e que NÃO dispara quando nada muda. Não prova
// o comportamento dentro do React de verdade — para isso o portal precisaria de
// um renderizador, que ele não tem. A regra modelada é a que o React documenta.
//
// Roda com: node trocar-conversa-sem-espera.test.js
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerHooks } = require('node:module')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../..')

// ── O React mínimo, com a regra do array de dependências ───────────────────
const reagir = {
  efeitos: [],      // { deps, limpar, fn }
  estados: [],
  refs: [],
  i: 0,
};
globalThis.__reagir = reagir;

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'react') return { url: 'stub-react:react', shortCircuit: true }
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url === 'stub-react:react') {
      return {
        format: 'module',
        shortCircuit: true,
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
            // A regra: sem deps, roda sempre; com deps, roda quando alguma
            // mudou por identidade (ou na primeira vez).
            const mudou = !antes || !deps || !antes.deps || deps.length !== antes.deps.length
              || deps.some((d, k) => d !== antes.deps[k]);
            r.efeitos[i] = { deps, fn, limpar: antes ? antes.limpar : null, pendente: mudou };
          }
          export default { useState, useRef, useEffect };
        `,
      }
    }
    return next(url, ctx)
  },
})

/** Executa os efeitos pendentes, rodando a limpeza do anterior primeiro. */
function aplicarEfeitos() {
  for (const e of reagir.efeitos) {
    if (!e || !e.pendente) continue
    if (typeof e.limpar === 'function') e.limpar()
    const r = e.fn()
    e.limpar = typeof r === 'function' ? r : null
    e.pendente = false
  }
}

;(async () => {
  // O documento e a janela que o hook usa para pausar em aba escondida.
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener() {}, removeEventListener() {},
  }
  globalThis.window = { addEventListener() {}, removeEventListener() {} }

  const mod = await import(pathToFileURL(path.join(APP, 'app/_hooks/use-polling.ts')).href)
  const { usePolling } = mod

  const consultas = []
  const buscar = async () => { consultas.push(Date.now()) }

  /** Um "render" do componente que usa o hook. */
  function render(opcoes) {
    reagir.i = 0
    usePolling(buscar, opcoes)
    aplicarEfeitos()
  }

  // ══ a primeira montagem consulta ══════════════════════════════════════
  render({ intervalMs: 5000, enabled: true, chave: 'c1' })
  await new Promise((r) => setImmediate(r))
  ok('montar consulta na hora', consultas.length === 1, consultas.length)

  // ══ re-render sem mudar nada NÃO consulta de novo ═════════════════════
  render({ intervalMs: 5000, enabled: true, chave: 'c1' })
  await new Promise((r) => setImmediate(r))
  ok('re-render com a mesma conversa NÃO consulta de novo', consultas.length === 1, consultas.length)

  // ══ O CASO DO DEFEITO: trocar de conversa ═════════════════════════════
  render({ intervalMs: 5000, enabled: true, chave: 'c2' })
  await new Promise((r) => setImmediate(r))
  ok('trocar de conversa consulta NA HORA', consultas.length === 2, consultas.length)

  // ══ e de novo, para a terceira ════════════════════════════════════════
  render({ intervalMs: 5000, enabled: true, chave: 'c3' })
  await new Promise((r) => setImmediate(r))
  ok('e a cada troca seguinte', consultas.length === 3, consultas.length)

  // ══ trocar de aba de conta (chave diferente, mesmo mecanismo) ═════════
  render({ intervalMs: 10000, enabled: true, chave: 'conta-vendas' })
  await new Promise((r) => setImmediate(r))
  ok('trocar a aba de conta também consulta na hora', consultas.length === 4, consultas.length)

  // ══ desligar não consulta ═════════════════════════════════════════════
  render({ intervalMs: 10000, enabled: false, chave: null })
  await new Promise((r) => setImmediate(r))
  ok('sem conversa selecionada, não consulta', consultas.length === 4, consultas.length)

  // ══ e os dois chamadores passam a chave ═══════════════════════════════
  const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  const conversa = semComentarios(fs.readFileSync(path.join(APP, 'app/_hooks/use-conversation-stream.ts'), 'utf8'))
  const inbox = semComentarios(fs.readFileSync(path.join(APP, 'app/_hooks/use-inbox-stream.ts'), 'utf8'))
  const hook = semComentarios(fs.readFileSync(path.join(APP, 'app/_hooks/use-polling.ts'), 'utf8'))

  ok('a conversa passa o id como chave', /chave:\s*conversationId/.test(conversa), 'use-conversation-stream')
  ok('a inbox passa a conta como chave', /chave:\s*conta\s*\?\?\s*null/.test(inbox), 'use-inbox-stream')
  ok('e a chave está nas dependências do efeito',
    /\[enabled,\s*intervalMs,\s*chave\]/.test(hook), hook.match(/\}, \[[^\]]*\]\)/g))

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
