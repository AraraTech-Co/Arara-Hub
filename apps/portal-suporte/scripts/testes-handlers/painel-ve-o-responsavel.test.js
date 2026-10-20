// O detalhe da conversa (rota 433, `GET /whatsapp/:id`) traz `assignedTo`.
//
// O painel lateral da inbox lê `detail.assignedTo` ({ id, fullName }). O servidor só
// devolvia `assigned_to` ({ id, name }), então o painel via toda conversa como "sem
// responsável": oferecia só "Vincular a mim" e não mostrava o menu de transferir para
// outro agente, o "Remover atribuição" nem o botão de chamar o backup do plantão.
//
// O QUE SE GARANTE:
//   - conversa atribuída, com perfil: `assignedTo = { id, fullName }` (nome completo, senão
//     nome, senão e-mail), e `assigned_to`/`assignedToId` seguem como estavam;
//   - conversa atribuída, perfil não achado: `{ id, fullName: null }` (o painel sabe que há dono);
//   - conversa sem atribuição: `assignedTo = null`;
//   - nada mais do detalhe muda.
//
// O CONTROLE: o bloco de antes (sem `assignedTo`) é reconstituído e rodado.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node painel-ve-o-responsavel.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

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
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const NOVO = codigoDe('433 whatsapp GET /whatsapp/:id')
const BLOCO = /  \/\/ O painel lateral da inbox lê `assignedTo`[\s\S]*?: \(data\.assigned_to_id \? \{ id: data\.assigned_to_id, fullName: null \} : null\);\n/
const ANTIGO = (() => { if (!BLOCO.test(NOVO)) throw new Error('âncora do bloco'); return NOVO.replace(BLOCO, '') })()

const PERFIS = {
  u1: { id: 'u1', full_name: 'Alexandre Ferreira', email: 'alexandre@arara.com', role: 'support' },
  u2: { id: 'u2', name: 'Só Nome', email: 'solo@arara.com', role: 'support' },
  u3: { id: 'u3', email: 'so-email@arara.com', role: 'support' },
}
async function rodar(codigo, conversa) {
  const handler = compilar(codigo)
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }] },
    WhatsAppMessage: { findMany: async () => [], findById: async () => null },
    Profile: { findById: async (id) => (PERFIS[id] ? { ...PERFIS[id] } : null), findMany: async () => [] },
    Sessao: vazio, SystemSettings: { findMany: async () => [{}] },
    WaDepartments: vazio, Company: vazio, CompanyContact: vazio, Ticket: vazio, WaCloseReasons: vazio, WaConversationTags: vazio, WaTags: vazio,
  }
  const r = await handler({ params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' }, models, reply: reply() })
  return { status: r.status, d: r.body && r.body.data }
}
const base = { id: 'c1', remote_jid: '5512992446758@s.whatsapp.net', status: 'open', phase: 'em_atendimento', conta_id: 'default' }

async function bateria(codigo) {
  const f = []
  const a = await rodar(codigo, { ...base, assigned_to_id: 'u1' })
  if (a.status !== 200 || !a.d.assignedTo || a.d.assignedTo.id !== 'u1' || a.d.assignedTo.fullName !== 'Alexandre Ferreira') f.push('com-perfil')
  if (a.d.assignedToId !== 'u1' || !a.d.assigned_to || a.d.assigned_to.name !== 'Alexandre Ferreira') f.push('campos-antigos')
  const b = await rodar(codigo, { ...base, assigned_to_id: 'u2' })
  if (!b.d.assignedTo || b.d.assignedTo.fullName !== 'Só Nome') f.push('nome-sem-full-name')
  const c = await rodar(codigo, { ...base, assigned_to_id: 'u3' })
  if (!c.d.assignedTo || c.d.assignedTo.fullName !== 'so-email@arara.com') f.push('cai-no-email')
  const d = await rodar(codigo, { ...base, assigned_to_id: 'u9' })
  if (!d.d.assignedTo || d.d.assignedTo.id !== 'u9' || d.d.assignedTo.fullName !== null) f.push('sem-perfil')
  const e = await rodar(codigo, { ...base })
  if (e.d.assignedTo !== null) f.push('sem-atribuicao')
  return f
}

;(async () => {
  const a = await rodar(NOVO, { ...base, assigned_to_id: 'u1' })
  ok('TRAVA: o detalhe foi montado (200, id da conversa)', a.status === 200 && a.d && a.d.id === 'c1', a)
  ok('conversa atribuída, com perfil: assignedTo = { id, fullName }', a.d.assignedTo && a.d.assignedTo.id === 'u1' && a.d.assignedTo.fullName === 'Alexandre Ferreira', a.d.assignedTo)
  ok('  assigned_to e assignedToId seguem como estavam', a.d.assignedToId === 'u1' && a.d.assigned_to.id === 'u1' && a.d.assigned_to.name === 'Alexandre Ferreira', [a.d.assignedToId, a.d.assigned_to])
  const b = await rodar(NOVO, { ...base, assigned_to_id: 'u2' })
  ok('sem nome completo, usa o nome', b.d.assignedTo.fullName === 'Só Nome', b.d.assignedTo)
  const c = await rodar(NOVO, { ...base, assigned_to_id: 'u3' })
  ok('sem nome algum, cai no e-mail', c.d.assignedTo.fullName === 'so-email@arara.com', c.d.assignedTo)
  const d = await rodar(NOVO, { ...base, assigned_to_id: 'u9' })
  ok('atribuída a perfil que não existe: { id, fullName: null } (o painel sabe que há dono)', d.d.assignedTo && d.d.assignedTo.id === 'u9' && d.d.assignedTo.fullName === null, d.d.assignedTo)
  const e = await rodar(NOVO, { ...base })
  ok('sem atribuição: assignedTo = null', e.d.assignedTo === null, e.d.assignedTo)
  const an = await rodar(ANTIGO, { ...base, assigned_to_id: 'u1' })
  ok('CONTROLE: o bloco de antes não trazia assignedTo (o painel via "sem responsável")', an.d.assignedTo === undefined && an.d.assigned_to && an.d.assigned_to.id === 'u1', an.d)
  const iguais = ['id', 'remote_jid', 'remoteJid', 'status', 'phase', 'assigned_to', 'assignedToId', 'unreadCount'].every((k) => JSON.stringify(a.d[k]) === JSON.stringify(an.d[k]))
  ok('nada mais do detalhe mudou (campos conferidos iguais ao de antes)', iguais, 'divergiu')

  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  const muts = [
    ['não preenche assignedTo', '  data.assignedTo = data.assigned_to\n', '  data.assignedTo = undefined && data.assigned_to\n'],
    ['usa name em vez de fullName', '{ id: data.assigned_to.id, fullName: data.assigned_to.name || null }', '{ id: data.assigned_to.id, name: data.assigned_to.name || null }'],
    ['sem perfil, some a atribuição', ': (data.assigned_to_id ? { id: data.assigned_to_id, fullName: null } : null);', ': null;'],
    ['sem atribuição devolve objeto', ': (data.assigned_to_id ? { id: data.assigned_to_id, fullName: null } : null);', ': { id: null, fullName: null };'],
    ['id errado', '{ id: data.assigned_to.id, fullName', '{ id: "x", fullName'],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let f
    try { f = await bateria(NOVO.replace(de, () => para)) } catch (err) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(err)); continue }
    ok(`mutação "${nome}" é pega (${f.join(',')})`, f.length > 0, 'sobreviveu')
  }
  fim()
})()
