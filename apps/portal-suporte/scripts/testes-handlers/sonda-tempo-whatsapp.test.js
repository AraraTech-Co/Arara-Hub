// Sonda de tempo do WhatsApp (scripts/sonda-tempo-whatsapp.py), nas rotas
// `POST /whatsapp` (enviar) e `GET /whatsapp/:id` (detalhe da conversa).
//
// O QUE SE GARANTE:
//   - a resposta ao atendente é IDÊNTICA à do handler sem sonda (o controle é o
//     mesmo literal com o bloco da sonda trocado pela exportação de antes);
//   - ligada, grava UM evento `diag_tempo` com os passos de `ctx.models`, as
//     chamadas de rede e o resultado da entrega;
//   - o evento não leva texto da mensagem, telefone, nome nem token, e o erro de
//     entrega sai com as sequências de 8+ dígitos trocadas por "#";
//   - desliga sozinha: a partir das 14:30 de Brasília de 13/11 (17:30 UTC) não
//     grava nada, e responde igual ao handler sem sonda;
//   - a gravação do evento não é esperada: se ela travar, o envio responde;
//   - um pedido não herda os passos do anterior.
//
// MUTAÇÕES: mutar-sonda-tempo-whatsapp.py, cada uma reprovada aqui.
//
// Roda com: node sonda-tempo-whatsapp.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

const MARCA = '// ── Sonda de tempo (scripts/sonda-tempo-whatsapp.py) ──'
const ANCORA = 'module.exports = { handler: _gsComSessao };'

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}
/** O mesmo literal sem a sonda: a exportação volta a ser a de antes. */
function semSonda(codigo) {
  const i = codigo.indexOf(MARCA)
  if (i < 0 || codigo.indexOf(MARCA, i + 1) >= 0) throw new Error('a sonda tem de aparecer uma vez')
  return codigo.slice(0, i) + ANCORA + '\n'
}

// Relógio controlado: a janela da sonda depende de Date.now(), e as respostas
// só são comparáveis byte a byte se ids e carimbos saírem iguais nas duas.
let AGORA = Date.parse('2026-11-13T15:00:00Z')
const RealDate = Date
class D extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(AGORA) }
  static now() { return AGORA }
}
const M = Object.create(Math)
M.random = () => 0.5

function compilar(codigo) {
  const c = {
    console, Date: D, JSON, String, Number, Object, Array, Math: M, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const ENVIO = codigoDe('464 whatsapp POST /whatsapp ')
const DETALHE = codigoDe('433 whatsapp GET /whatsapp/:id ')
const MENSAGENS = codigoDe('434 whatsapp GET /whatsapp/:id/messages ')

const TEXTO = 'Bom dia, o sistema voltou?'
const FONE = '5511999990000'
const TOKEN = 'token-falso-xyz'
const CONV = { id: 'c1', remote_jid: FONE + '@s.whatsapp.net', is_group: false, assigned_to_id: 'u1', phase: 'em_atendimento', status: 'open', conta_id: 'default' }
const PERFIL = { id: 'u1', role: 'support', full_name: 'Judá Mendes', active: true }

function cenario({ provedor = { status: 200, body: '{"ok":true}' }, criarEvento } = {}) {
  const eventos = []
  const vazio = { findMany: async () => [], findById: async () => null }
  const ctx = {
    params: {}, query: {}, headers: {}, body: { conversationId: 'c1', message: TEXTO },
    user: { id: 'u1' },
    secrets: { get: async () => TOKEN },
    fetch: async () => ({ ...provedor }),
    models: {
      WhatsAppConversation: { findById: async () => ({ ...CONV }), findMany: async () => [{ ...CONV }], update: async () => ({ ...CONV }) },
      WhatsAppMessage: { findById: async () => null, findMany: async () => [], create: async (r) => ({ ...r }), update: async (id, p) => p },
      Profile: { findById: async () => ({ ...PERFIL }), findMany: async () => [{ ...PERFIL }] },
      Sessao: vazio,
      SystemSettings: { findMany: async () => [{}] },
      WaConversationEvents: {
        findMany: async () => [],
        create: criarEvento || (async (r) => { eventos.push(r); return r }),
      },
      WaDepartments: vazio, Company: vazio, CompanyContact: vazio, Ticket: vazio, WaCloseReasons: vazio,
      WaConversationTags: vazio, WaTags: vazio, ClientUser: vazio, Unit: vazio,
    },
    reply: reply(),
  }
  return { ctx, eventos }
}
const tempos = (eventos) => eventos.filter((e) => e.kind === 'diag_tempo')
const payload = (e) => JSON.parse(e.payload)
const espera = () => new Promise((r) => setTimeout(r, 20))

async function rodar(codigo, opcoes = {}, ajustar) {
  const h = compilar(codigo)
  if (opcoes.depoisDe) AGORA += opcoes.depoisDe
  const c = cenario(opcoes)
  if (ajustar) ajustar(c.ctx)
  let r, erro = null
  try { r = await h(c.ctx) } catch (e) { erro = String(e && e.message) }
  await espera()
  if (opcoes.depoisDe) AGORA -= opcoes.depoisDe
  return { r, erro, eventos: c.eventos }
}

;(async () => {
  // ── envio, sonda ligada ──────────────────────────────────────────────────
  {
    const com = await rodar(ENVIO)
    const sem = await rodar(semSonda(ENVIO))
    ok('TRAVA: o envio respondeu 201 e entregou', com.r && com.r.status === 201 && com.r.body.data.entregue === true, com.r)
    ok('resposta do envio idêntica à do handler sem sonda', JSON.stringify(com.r) === JSON.stringify(sem.r), { com: com.r, sem: sem.r })
    ok('  o handler sem sonda não grava diag_tempo (controle)', tempos(sem.eventos).length === 0, sem.eventos)
    const t = tempos(com.eventos)
    ok('grava UM evento diag_tempo', t.length === 1, com.eventos.map((e) => e.kind))
    const p = t[0] ? payload(t[0]) : {}
    ok('  rota, HTTP, conversa e entrega', p.rota === 'POST /whatsapp' && p.http === 201 && p.conv === 'c1' && p.entregue === true && p.erro_entrega === null, p)
    ok('  marca citação e anexo como ausentes', p.citacao === false && p.anexo === false, p)
    const passos = p.passos || []
    ok('  anota a leitura da conversa', passos.some((x) => x.m === 'WhatsAppConversation' && x.op === 'findById' && x.achou === true && typeof x.ms === 'number'), passos)
    ok('  anota a gravação da mensagem', passos.some((x) => x.m === 'WhatsAppMessage' && x.op === 'create'), passos)
    ok('  findMany leva os NOMES dos campos e a contagem', passos.some((x) => x.op === 'findMany' && typeof x.f === 'string' && typeof x.n === 'number'), passos)
    const redes = p.redes || []
    ok('  anota a chamada ao provedor: caminho e HTTP', redes.some((x) => /\/sendMessage$/.test(x.caminho) && x.http === 200 && x.caminho.indexOf('http') !== 0), redes)
    const cru = t[0] ? t[0].payload : ''
    ok('  sem texto, telefone, nome ou token no evento', cru && !cru.includes(TEXTO) && !cru.includes(FONE) && !cru.includes('Judá') && !cru.includes(TOKEN), cru)
    ok('  evento no formato das outras sondas', t[0] && t[0].conversation_id === 'diagnostico' && /^dtmp_/.test(t[0].id) && typeof t[0].created_at === 'string', t[0])
  }

  // ── citação e anexo marcados ─────────────────────────────────────────────
  {
    const com = await rodar(ENVIO, {}, (ctx) => { ctx.body.responder_a = { message_id: 'WA_9' } })
    const p = tempos(com.eventos)[0] ? payload(tempos(com.eventos)[0]) : {}
    ok('envio com citação: citacao = true', p.citacao === true, p)
    // A busca da citada filtra por `message_id` com o id dela: o evento leva o
    // NOME do campo, nunca o valor.
    const cru = tempos(com.eventos)[0] ? tempos(com.eventos)[0].payload : ''
    ok('filtro vai pelo nome do campo, sem o valor',
      (p.passos || []).some((x) => x.op === 'findMany' && x.f === 'message_id') && !cru.includes('WA_9'), cru)
  }

  // ── entrega que falha ────────────────────────────────────────────────────
  {
    const prov = { status: 500, body: 'numero ' + FONE + ' nao encontrado' }
    const com = await rodar(ENVIO, { provedor: prov })
    const sem = await rodar(semSonda(ENVIO), { provedor: prov })
    ok('falha de entrega: resposta idêntica à sem sonda', JSON.stringify(com.r) === JSON.stringify(sem.r), { com: com.r, sem: sem.r })
    ok('  TRAVA: o handler disse que não entregou e citou o número', sem.r.body.data.entregue === false && String(sem.r.body.data.erro_entrega).includes(FONE), sem.r.body)
    const p = tempos(com.eventos)[0] ? payload(tempos(com.eventos)[0]) : {}
    ok('  o evento registra entregue = false', p.entregue === false, p)
    ok('  o erro vai sem o número', typeof p.erro_entrega === 'string' && p.erro_entrega.includes('#') && !p.erro_entrega.includes(FONE), p.erro_entrega)
    ok('  o HTTP do provedor fica nas redes', (p.redes || []).some((x) => x.http === 500), p.redes)
  }

  // ── desliga sozinha ──────────────────────────────────────────────────────
  {
    const antes = AGORA
    AGORA = Date.parse('2026-11-13T17:29:59Z')
    const dentro = await rodar(ENVIO)
    ok('às 14:29:59 de Brasília ainda grava', tempos(dentro.eventos).length === 1, dentro.eventos.map((e) => e.kind))
    AGORA = Date.parse('2026-11-13T17:30:00Z')
    const fora = await rodar(ENVIO)
    const sem = await rodar(semSonda(ENVIO))
    ok('às 14:30 de Brasília não grava nada', tempos(fora.eventos).length === 0, fora.eventos.map((e) => e.kind))
    ok('  e responde igual ao handler sem sonda', JSON.stringify(fora.r) === JSON.stringify(sem.r), { fora: fora.r, sem: sem.r })
    AGORA = Date.parse('2026-11-14T12:00:00Z')
    const amanha = await rodar(ENVIO)
    ok('no dia seguinte continua sem gravar', tempos(amanha.eventos).length === 0, amanha.eventos.map((e) => e.kind))
    AGORA = antes
  }

  // ── a gravação do evento não é esperada ──────────────────────────────────
  {
    const h = compilar(ENVIO)
    const c = cenario({ criarEvento: (r) => (r.kind === 'diag_tempo' ? new Promise(() => {}) : Promise.resolve(r)) })
    const r = await Promise.race([h(c.ctx), new Promise((res) => setTimeout(() => res('TRAVOU'), 500))])
    ok('evento que trava não segura a resposta', r !== 'TRAVOU' && r.status === 201, r)
  }

  // ── um pedido não herda o anterior ───────────────────────────────────────
  {
    const h = compilar(ENVIO)
    const a = cenario(); await h(a.ctx); await espera()
    const b = cenario(); await h(b.ctx); await espera()
    const pa = payload(tempos(a.eventos)[0]); const pb = payload(tempos(b.eventos)[0])
    ok('dois pedidos, passos do mesmo tamanho (nada acumula)', pa.passos.length === pb.passos.length && pb.passos.length > 0, [pa.passos.length, pb.passos.length])
  }

  // ── erro dentro do handler ───────────────────────────────────────────────
  {
    const quebra = (ctx) => { ctx.models.WhatsAppConversation.findById = async () => { throw new Error('banco fora') } }
    const com = await rodar(ENVIO, {}, quebra)
    const sem = await rodar(semSonda(ENVIO), {}, quebra)
    ok('erro no handler: mesmo desfecho com e sem sonda', JSON.stringify([com.r, com.erro]) === JSON.stringify([sem.r, sem.erro]), { com: [com.r, com.erro], sem: [sem.r, sem.erro] })
    const p = tempos(com.eventos)[0] ? payload(tempos(com.eventos)[0]) : {}
    ok('  o evento marca o passo que falhou', (p.passos || []).some((x) => x.m === 'WhatsAppConversation' && x.erro === true), p.passos)
  }

  // ── detalhe da conversa ──────────────────────────────────────────────────
  {
    const ajustar = (ctx) => { ctx.params = { id: 'c1' }; ctx.body = {} }
    const com = await rodar(DETALHE, {}, ajustar)
    const sem = await rodar(semSonda(DETALHE), {}, ajustar)
    ok('TRAVA: o detalhe respondeu 200 com a conversa', com.r && com.r.status === 200 && com.r.body.data.id === 'c1', com.r)
    ok('resposta do detalhe idêntica à do handler sem sonda', JSON.stringify(com.r) === JSON.stringify(sem.r), { com: com.r, sem: sem.r })
    const t = tempos(com.eventos)
    const p = t[0] ? payload(t[0]) : {}
    ok('detalhe grava UM diag_tempo com rota e conversa', t.length === 1 && p.rota === 'GET /whatsapp/:id' && p.http === 200 && p.conv === 'c1', p)
    ok('  anota a leitura da conversa', (p.passos || []).some((x) => x.m === 'WhatsAppConversation' && x.op === 'findById'), p.passos)
    ok('  sem telefone no evento', t[0] && !t[0].payload.includes(FONE), t[0] && t[0].payload)
  }

  // ── carregar as mensagens ────────────────────────────────────────────────
  {
    const MSGS = [
      { id: 'm1', conversation_id: 'c1', message_id: 'WA_1', from_me: false, body: TEXTO, sender_jid: FONE + '@s.whatsapp.net', timestamp: '2026-11-13T14:00:00.000Z' },
      { id: 'm2', conversation_id: 'c1', message_id: 'WA_2', from_me: true, body: 'ok', timestamp: '2026-11-13T14:01:00.000Z' },
    ]
    const ajustar = (ctx) => {
      ctx.params = { id: 'c1' }; ctx.body = {}
      ctx.models.WhatsAppMessage.findMany = async (f) => MSGS.filter((m) => !f || !f.conversation_id || m.conversation_id === f.conversation_id).map((m) => ({ ...m }))
    }
    const com = await rodar(MENSAGENS, {}, ajustar)
    const sem = await rodar(semSonda(MENSAGENS), {}, ajustar)
    ok('TRAVA: as mensagens vieram (200, duas)', com.r && com.r.status === 200 && (com.r.body.data || []).length === 2, com.r)
    ok('resposta das mensagens idêntica à do handler sem sonda', JSON.stringify(com.r) === JSON.stringify(sem.r), { com: com.r, sem: sem.r })
    // A tela consulta esta rota a cada poucos segundos: a chamada rápida não grava.
    ok('mensagens rápidas (abaixo de 1 s) não gravam nada', tempos(com.eventos).length === 0, com.eventos.map((e) => e.kind))
    // Lenta: a leitura das mensagens "leva" o tempo pedido no relógio controlado.
    const lenta = (ms) => (ctx) => {
      ajustar(ctx)
      const f = ctx.models.WhatsAppMessage.findMany
      ctx.models.WhatsAppMessage.findMany = async (q) => { AGORA += ms; return f(q) }
    }
    const antes = AGORA
    const quase = await rodar(MENSAGENS, {}, lenta(999))
    AGORA = antes
    ok('a 999 ms ainda não grava', tempos(quase.eventos).length === 0, quase.eventos.map((e) => e.kind))
    const devagar = await rodar(MENSAGENS, {}, lenta(1000))
    AGORA = antes
    const t = tempos(devagar.eventos)
    const p = t[0] ? payload(t[0]) : {}
    ok('mensagens lentas (1 s ou mais): UM diag_tempo com rota e conversa', t.length === 1 && p.rota === 'GET /whatsapp/:id/messages' && p.http === 200 && p.conv === 'c1' && p.ms >= 1000, p)
    ok('  anota a leitura das mensagens com o nome do filtro', (p.passos || []).some((x) => x.m === 'WhatsAppMessage' && x.op === 'findMany' && /conversation_id/.test(x.f || '') && x.ms >= 1000), p.passos)
    ok('  sem texto nem telefone no evento', t[0] && !t[0].payload.includes(TEXTO) && !t[0].payload.includes(FONE), t[0] && t[0].payload)
  }

  fim()
})()
