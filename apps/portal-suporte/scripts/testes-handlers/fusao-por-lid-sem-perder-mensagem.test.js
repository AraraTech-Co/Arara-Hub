// A fusão de conversas duplicadas, no webhook de entrada (485), não apaga conversa
// que ainda tem mensagem dentro.
//
// A fusão acontece SOZINHA: o cliente manda mensagem com telefone e LID, o webhook
// acha a conversa pelo telefone e a "só LID" pelo LID, move as mensagens para a
// primeira e apaga a segunda.
//
// O QUE A FUSÃO GARANTE AGORA, e é a invariante deste arquivo:
//
//   a conversa duplicada só é APAGADA depois de PROVAR que nenhuma mensagem aponta
//   mais para ela — a última leitura filtrada por ela voltou VAZIA. Sem a prova
//   (uma leitura falhou, o teto de rodadas foi atingido, uma atualização não pegou,
//   o filtro não foi honrado), ela é FECHADA e marcada como unida (`unida_em`), e as
//   mensagens que sobraram continuam alcançáveis. Perder a fusão é reversível;
//   apagar uma conversa com mensagem dentro não é.
//
// O CONTROLE: o bloco de ANTES é reconstituído e rodado sobre a mesma massa, para
// mostrar que o cenário REPRODUZ o defeito. Sem ele, "o novo move tudo" não
// provaria nada.
//
// A camada é emulada (_camada.js: mais recentes primeiro, filtro antes do teto de
// 500, `offset`/`limit`), com a semântica que o teste de premissas confere contra
// Postgres real. O arquivo irmão `rota-485-fusao-real.test.mjs` (em packages/api)
// roda a fusão sobre a camada de verdade.
//
// Roda com: node fusao-por-lid-sem-perder-mensagem.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}
function compilar(codigo) {
  const c = {
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt,
    parseFloat, isNaN, isFinite, RegExp, Buffer, Error, TypeError,
    encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    module: { exports: {} },
  }
  c.exports = c.module.exports
  c.globalThis = c
  vm.createContext(c)
  vm.runInContext(codigo, c)
  return c.module.exports.handler
}

// ── o bloco de ANTES (varredura da tabela inteira + apagar sem verificar) ───
const BLOCO_ANTIGO = `        try {
          if (Msg) {
            var _msgs = (await Msg.findMany({})) || [];
            for (var mm = 0; mm < _msgs.length; mm++) {
              var _cid = _msgs[mm].conversation_id || _msgs[mm].conversationId;
              if (String(_cid) === String(dup.id)) await Msg.update(_msgs[mm].id, { conversation_id: open.id });
            }
          }
          if (typeof Conv.delete === "function") await Conv.delete(dup.id);
          else await Conv.update(dup.id, { status: "closed", phase: "resolvido", unida_em: open.id, updated_at: ts });
`
// (o `} catch (e) {}` que fecha este bloco já está em FIM, logo abaixo, e é compartilhado)
const cod = codigoDe('485 whatsapp POST /whatsapp/inbound')
const INI = '        try {\n          // A conversa duplicada só é APAGADA depois de PROVAR'
const FIM = '        } catch (e) {}\n      }\n    }\n    // Re-identify if still blank'
const a = cod.indexOf(INI), b = cod.indexOf(FIM)
const blocoOk = a >= 0 && b > a
const NOVO = compilar(cod)
const ANTIGO = blocoOk ? compilar(cod.slice(0, a) + BLOCO_ANTIGO + cod.slice(b)) : null

// ── cenário ─────────────────────────────────────────────────────────────────
const SEGREDO = 'segredo-da-rota'
const FONE = '5519999990001@s.whatsapp.net'
const LID = '123456789012345'

/**
 * `dup` mensagens ANTIGAS na conversa "só LID" (cvB) e `ruido` mensagens MAIS NOVAS
 * de outras conversas, que as empurram para fora das 500 mais recentes da tabela.
 */
function mundo({ dup = 6, ruido = 600, camel = 0, opcoes = {} } = {}) {
  const msgs = []
  const add = (id, conv, extra) => msgs.push({ id, conversation_id: conv, from_me: false, body: 'm ' + id,
    timestamp: new Date(1700000000000 + msgs.length * 1000).toISOString(), ...extra })
  for (let i = 0; i < dup; i++) add('dup_' + i, 'cvB')
  for (let i = 0; i < camel; i++) msgs.push({ id: 'camel_' + i, conversationId: 'cvB', from_me: false, body: 'c ' + i, timestamp: new Date(1700000000000 + msgs.length * 1000).toISOString() })
  for (let i = 0; i < ruido; i++) add('ruido_' + i, 'cvZ')
  const convs = [
    { id: 'cvA', status: 'open', remote_jid: FONE, phase: 'novo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'cvB', status: 'open', remote_jid: LID + '@lid', remote_lid: LID, phase: 'novo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ]
  const w = { convs, msgs, apagadas: [], leiturasDeB: [], atualizacoes: 0 }
  const vazio = { findMany: async () => [], findById: async () => null }
  const ehDeB = (a) => a && (a.conversation_id === 'cvB' || a.conversationId === 'cvB')
  w.models = {
    WhatsAppConversation: {
      findById: async (id) => { const c = convs.find((x) => x.id === id); return c ? { ...c } : null },
      findMany: async (a) => { const ch = Object.keys(a || {}); return convs.filter((c) => ch.every((k) => String(c[k] ?? '') === String(a[k]))).map((c) => ({ ...c })) },
      create: async (c) => { convs.push({ ...c }); return c },
      update: async (id, p) => { const c = convs.find((x) => x.id === id); Object.assign(c, p); return { ...c } },
      delete: async (id) => { w.apagadas.push(id); const i = convs.findIndex((x) => x.id === id); if (i >= 0) convs.splice(i, 1); return { ok: true } },
    },
    WhatsAppMessage: {
      findMany: async (a) => {
        if (ehDeB(a)) {
          w.leiturasDeB.push(JSON.parse(JSON.stringify(a)))
          if (opcoes.falhaNaLeitura && w.leiturasDeB.length === opcoes.falhaNaLeitura) throw new Error('falha de leitura')
          if (opcoes.filtroIgnorado) return camadaFindMany(msgs, {})
        }
        return camadaFindMany(msgs, a)
      },
      findById: async (id) => msgs.find((m) => m.id === id) || null,
      create: async (m) => { msgs.push({ ...m }); return m },
      update: async (id, p) => {
        w.atualizacoes++
        if (opcoes.updateFalha) throw new Error('falha de gravação')
        if (opcoes.updateIgnorado) return {}
        Object.assign(msgs.find((m) => m.id === id), p); return {}
      },
    },
    WaConversationEvents: { findMany: async () => [], create: async (x) => x },
    Profile: { findById: async () => ({ id: 'u9', role: 'support' }), findMany: async () => [] }, Sessao: { findById: async () => null },
    SystemSettings: { findMany: async () => [{ id: 's1', waMenuEnabled: false }], update: async () => ({}) },
    PushInscricao: vazio, PushNaFila: { create: async (x) => x },
    SupportSchedule: vazio, WaFlows: vazio, Company: vazio, CompanyContact: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio, WaTags: vazio, WaConversationTags: vazio,
  }
  w.ctx = () => ({ params: {}, headers: {}, query: { token: SEGREDO },
    body: { phone: FONE, lid: LID, message: 'oi, sou eu', name: 'Cliente', message_id: 'WA_NOVA_1' },
    models: w.models, secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
    fetch: async () => ({ status: 200, body: '{}' }), notify: async () => ({}), reply: reply() })
  return w
}
const folga = () => new Promise((r) => setTimeout(r, 25))
const apontamParaB = (w) => w.msgs.filter((m) => m.conversation_id === 'cvB' || m.conversationId === 'cvB').length
const emA = (w, prefixo) => w.msgs.filter((m) => m.id.startsWith(prefixo) && m.conversation_id === 'cvA').length
const convB = (w) => w.convs.find((c) => c.id === 'cvB')

;(async () => {
  ok('o bloco novo da fusão foi localizado e o de antes pôde ser reconstituído', blocoOk && !!ANTIGO, { a, b })

  // ═══ TRAVA DE MASSA: a janela da tabela NÃO enxerga a duplicada ═══
  {
    const w = mundo()
    const janela = camadaFindMany(w.msgs, {})
    ok('TRAVA DE MASSA — a janela das 500 mais recentes da TABELA não contém nenhuma mensagem da duplicada (é o que o código de antes lia)',
      janela.length === 500 && janela.filter((m) => m.conversation_id === 'cvB').length === 0 && apontamParaB(w) === 6,
      { janela: janela.length, daDuplicada: janela.filter((m) => m.conversation_id === 'cvB').length })
  }

  // ═══ 1. CONTROLE × AGORA: duplicada com mensagens fora da janela ═══
  {
    const wa = mundo(), wn = mundo()
    const ra = await ANTIGO(wa.ctx()); await folga()
    const rn = await NOVO(wn.ctx()); await folga()
    ok('CONTROLE — o código de ANTES apagava a duplicada com as 6 mensagens ainda dentro (nenhuma movida)',
      ra.status === 200 && wa.apagadas.includes('cvB') && emA(wa, 'dup_') === 0 && apontamParaB(wa) === 6, { apagadas: wa.apagadas, movidas: emA(wa, 'dup_'), orfas: apontamParaB(wa) })
    ok('AGORA — as 6 mensagens vão para a conversa que fica', rn.status === 200 && emA(wn, 'dup_') === 6, emA(wn, 'dup_'))
    ok('  nenhuma mensagem aponta mais para a duplicada, e só então ela é apagada', apontamParaB(wn) === 0 && wn.apagadas.join() === 'cvB', { orfas: apontamParaB(wn), apagadas: wn.apagadas })
    ok('  e a mensagem que chegou também foi gravada, na conversa que fica', wn.msgs.some((m) => m.conversation_id === 'cvA' && /oi, sou eu/.test(m.body || '')), wn.msgs.slice(-2))
  }

  // ═══ 2. mais de uma rodada: 1300 mensagens, 3 rodadas, e a leitura de prova ═══
  {
    const w = mundo({ dup: 1300, ruido: 50 })
    await NOVO(w.ctx()); await folga()
    ok('1300 mensagens na duplicada: TODAS movidas, nenhuma órfã, conversa apagada', emA(w, 'dup_') === 1300 && apontamParaB(w) === 0 && w.apagadas.join() === 'cvB', { movidas: emA(w, 'dup_'), orfas: apontamParaB(w) })
    const lidas = w.leiturasDeB.filter((l) => 'conversation_id' in l)
    ok('  em 4 leituras filtradas: 500, 500, 300 e a que PROVA que acabou (vazia)', lidas.length === 4, lidas.length)
  }

  // ═══ 3. mensagens na grafia camelCase também são movidas ═══
  {
    const w = mundo({ dup: 2, camel: 3, ruido: 600 })
    await NOVO(w.ctx()); await folga()
    ok('mensagens com `conversationId` (camelCase) são movidas e não sobra apontador nenhum', emA(w, 'dup_') === 2 && w.msgs.filter((m) => m.id.startsWith('camel_') && m.conversation_id === 'cvA').length === 3 && apontamParaB(w) === 0,
      { camelMovidas: w.msgs.filter((m) => m.id.startsWith('camel_') && m.conversation_id === 'cvA').length, orfas: apontamParaB(w) })
    ok('  e a conversa só foi apagada depois', w.apagadas.join() === 'cvB', w.apagadas)
  }

  // ═══ 4. A INVARIANTE: sem a prova, NÃO apaga — fecha e marca como unida ═══
  const naoApagou = (nome, w, extra) => {
    ok(`${nome}: a duplicada NÃO é apagada`, w.apagadas.length === 0 && !!convB(w), { apagadas: w.apagadas })
    ok(`  e fica FECHADA e marcada como unida (o registro é preservado)`, convB(w) && convB(w).status === 'closed' && convB(w).unida_em === 'cvA', convB(w))
    if (extra) extra()
  }
  {
    const w = mundo({ dup: 1300, ruido: 50, opcoes: { falhaNaLeitura: 2 } })
    const r = await NOVO(w.ctx()); await folga()
    ok('leitura que FALHA na 2ª rodada: o webhook ainda responde 200', r.status === 200, r.status)
    naoApagou('leitura que falha', w, () => {
      ok('  as 500 já movidas ficam movidas e as outras 800 continuam alcançáveis na duplicada', emA(w, 'dup_') === 500 && apontamParaB(w) === 800, { movidas: emA(w, 'dup_'), restam: apontamParaB(w) })
    })
  }
  {
    const w = mundo({ opcoes: { updateFalha: true } })
    await NOVO(w.ctx()); await folga()
    naoApagou('toda atualização falha', w, () => {
      ok('  sem progresso a rodada para: no máximo 2 leituras da duplicada (não gira em falso)', w.leiturasDeB.length <= 2, w.leiturasDeB.length)
      ok('  e as 6 mensagens continuam na duplicada', apontamParaB(w) === 6, apontamParaB(w))
    })
  }
  {
    const w = mundo({ opcoes: { updateIgnorado: true } })
    await NOVO(w.ctx()); await folga()
    naoApagou('atualização que resolve mas NÃO pega (a linha continua na duplicada)', w, () => {
      ok('  para no teto de 20 rodadas, sem laço infinito', w.leiturasDeB.filter((l) => 'conversation_id' in l).length === 20, w.leiturasDeB.length)
      ok('  e as 6 mensagens continuam na duplicada', apontamParaB(w) === 6, apontamParaB(w))
    })
  }
  {
    const w = mundo({ opcoes: { filtroIgnorado: true } })
    await NOVO(w.ctx()); await folga()
    naoApagou('o filtro por conversa NÃO é honrado pela plataforma (volta linha de outras conversas)', w, () => {
      ok('  e nada foi movido por engano (nenhuma mensagem de outra conversa trocou de dono)', w.msgs.filter((m) => m.id.startsWith('ruido_') && m.conversation_id !== 'cvZ').length === 0, 'moveu o que não era da duplicada')
    })
  }
  {
    const w = mundo({ dup: 10001, ruido: 10 })
    await NOVO(w.ctx()); await folga()
    naoApagou('duplicada com 10001 mensagens (acima do teto de 20 rodadas de 500)', w, () => {
      ok('  moveu 10000 e deixou 1 (alcançável)', emA(w, 'dup_') === 10000 && apontamParaB(w) === 1, { movidas: emA(w, 'dup_'), restam: apontamParaB(w) })
    })
  }

  // ═══ 5. sem duplicata, nada muda ═══
  {
    const w = mundo({ dup: 0, ruido: 5 })
    w.convs.splice(w.convs.findIndex((c) => c.id === 'cvB'), 1)   // só a conversa pelo telefone
    const r = await NOVO(w.ctx()); await folga()
    ok('sem conversa duplicada: nenhuma leitura de duplicada e nada apagado', r.status === 200 && w.leiturasDeB.length === 0 && w.apagadas.length === 0 && w.msgs.some((m) => m.conversation_id === 'cvA' && /oi, sou eu/.test(m.body || '')), { leituras: w.leiturasDeB.length, apagadas: w.apagadas })
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
