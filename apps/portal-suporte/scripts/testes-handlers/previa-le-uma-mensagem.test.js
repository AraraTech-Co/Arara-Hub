// A prévia das conversas abertas que ficaram FORA da janela das 500 mensagens mais recentes
// (rota 432, laço `_faltam`) lê UMA mensagem por conversa, não até 500.
//
// A camada devolve a mais recente primeiro, então `limit: 1` entrega a mesma mensagem que o
// laço escolhia percorrendo tudo. Cada leitura filtrada custa o mesmo qualquer que seja o número
// de linhas, mas 500 linhas trazidas e descartadas por conversa pesam em memória e rede.
//
// O QUE SE GARANTE:
//   - cada leitura filtrada por conversa sai com `limit: 1`;
//   - a prévia (texto e horário) é a mesma de antes, lida sem limite sobre a mesma massa;
//   - se o filtro fosse ignorado, a conferência de conversation_id rejeita a linha: sem prévia, nunca prévia errada.
// MUTAÇÕES: tirar o `limit` reprova a primeira asserção; ler a mais antiga reprova a segunda.
//
// Roda com: node previa-le-uma-mensagem.test.js
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
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const COD = codigoDe('432 whatsapp GET /whatsapp')
const ALVO = 'await m.Msg.findMany({ conversation_id: _faltam[_q], limit: 1, mascararCampos: _MASCARAR_MIDIA })'
const SEM = 'await m.Msg.findMany({ conversation_id: _faltam[_q], mascararCampos: _MASCARAR_MIDIA })'
if (COD.split(ALVO).length - 1 !== 1) throw new Error('âncora do handler mudou')
const ANTES = COD.replace(ALVO, SEM)

const BASE = Date.now()
const ts = (n) => new Date(BASE - (10000 - n) * 1000).toISOString()

// 520 mensagens recentes de outras conversas empurram "cA" para fora da janela das 500
function massa() {
  const msgs = []
  msgs.push({ id: 'a1', conversation_id: 'cA', from_me: false, body: 'primeira de A', timestamp: ts(1), created_at: ts(1) })
  msgs.push({ id: 'a2', conversation_id: 'cA', from_me: false, body: 'segunda de A', timestamp: ts(2), created_at: ts(2) })
  msgs.push({ id: 'a3', conversation_id: 'cA', from_me: true, body: 'ultima de A', timestamp: ts(3), created_at: ts(3) })
  for (let i = 0; i < 520; i++) msgs.push({ id: 'o' + i, conversation_id: 'cB', from_me: false, body: 'b' + i, timestamp: ts(100 + i), created_at: ts(100 + i) })
  return msgs
}
function ctxDe(msgs, leituras, ignorarFiltro) {
  const conv = (id) => ({ id, remote_jid: id + '@s.whatsapp.net', status: 'open', phase: 'em_atendimento', updated_at: ts(50), created_at: ts(0), unread_count: 0, conta_id: 'default' })
  const vazio = { findMany: async () => [], findById: async () => null }
  return {
    params: {}, query: {}, body: {}, headers: {}, user: { id: 'u1' },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      WhatsAppConversation: { findById: async (i) => conv(i), findMany: async () => [conv('cA'), conv('cB')], update: async () => ({}) },
      WhatsAppMessage: {
        findMany: async (f) => {
          if (f && f.conversation_id) leituras.push(f)
          return camadaFindMany(msgs, ignorarFiltro && f ? { ...f, conversation_id: undefined, limit: f.limit } : f)
        },
        findById: async () => null,
      },
      SystemSettings: { findMany: async () => [{}] },
      CompanyContact: vazio, WaDepartment: vazio, Company: vazio, Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio, WaConversationEvents: vazio,
    },
    reply: reply(),
  }
}
async function rodar(cod, opc) {
  const leituras = []
  const r = await compilar(cod)(ctxDe(massa(), leituras, opc && opc.ignorarFiltro))
  return { r, leituras, corpo: JSON.stringify(r.body) }
}
const textoDe = (corpo, id) => {
  const j = JSON.parse(corpo); const lista = j.data || j
  const c = (Array.isArray(lista) ? lista : []).find((x) => x.id === id)
  return c ? JSON.stringify(c).includes('ultima de A') : null
}

;(async () => {
  const depois = await rodar(COD)
  const antes = await rodar(ANTES)
  const fA = depois.leituras.filter((f) => f.conversation_id === 'cA')
  ok(fA.length === 1 && fA[0].limit === 1, 'leitura da conversa que ficou de fora sai com limit: 1')
  ok(antes.leituras.every((f) => f.limit === undefined), 'controle: o código de antes lia sem limite')
  ok(depois.corpo === antes.corpo, 'a resposta é idêntica à de antes, byte a byte')
  ok(textoDe(depois.corpo, 'cA') === true, 'a prévia de cA é a mensagem mais recente')
  const semFiltro = await rodar(COD, { ignorarFiltro: true })
  ok(textoDe(semFiltro.corpo, 'cA') !== true, 'filtro ignorado: nunca prévia errada de outra conversa')
  fim()
})()
