// Detalhe e edição de UMA conversa deixam de ler coleções inteiras.
//
// As rotas `GET /whatsapp/:id` (433) e `PATCH /whatsapp/:id` (459) montavam,
// para devolver uma conversa, o mapa de TODOS os perfis, departamentos,
// empresas, contatos, chamados, motivos de fechamento e etiquetas, mais todas
// as ligações conversa↔etiqueta e todas as mensagens — nove leituras de
// coleção inteira. O `serializeConv` só consulta UMA entrada de cada, por id.
// Agora `loadDepsDaConversa` busca só essas.
//
// O CRITÉRIO DURO É A RESPOSTA IDÊNTICA. Este teste roda o handler NOVO e uma
// variante ANTIGA (o mesmo código com o `loadDeps` de antes devolvido ao
// lugar) sobre a mesma massa e compara o JSON da resposta, id por id.
//
// A camada de modelos é emulada no que ela faz de verdade (lido em
// packages/api/src/lib/models.ts): `findMany` devolve as 500 MAIS RECENTES,
// o filtro por campo é aplicado ANTES do teto, e `findById` acha por chave de
// armazenamento OU por `data.id`.
//
// Sobra uma diferença que não é bug do teste: onde a versão antiga PERDIA dado
// porque o item caía fora das 500 mais recentes (chamado antigo, conversa cuja
// mensagem saiu da janela), a nova ENCONTRA. Isso é verificado à parte e dito
// com precisão — não escondido dentro da igualdade.
//
// Roda com: node conversa-sem-ler-tudo.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

// ── carregar o código do handler como texto, para montar as duas variantes ──
function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}

// O `loadDeps` de ANTES, devolvido ao lugar para servir de referência.
const LOAD_DEPS_ANTIGO = `
async function loadDeps(m) {
  var lastByConv = await lastMessagesByConv(m.Msg);
  var profiles = m.Profile ? await indexById(await m.Profile.findMany({})) : {};
  var depts = m.Dept ? await indexById(await m.Dept.findMany({})) : {};
  var companies = m.Company ? await indexById(await m.Company.findMany({})) : {};
  var contacts = m.Contact ? await indexById(await m.Contact.findMany({})) : {};
  var tickets = m.Ticket ? await indexById(await m.Ticket.findMany({})) : {};
  var closes = m.Close ? await indexById(await m.Close.findMany({})) : {};
  var tags = m.Tag ? await indexById(await m.Tag.findMany({})) : {};
  var convTags = m.ConvTag ? await m.ConvTag.findMany({}) : [];
  return { lastByConv: lastByConv, profiles: profiles, depts: depts, companies: companies, contacts: contacts, tickets: tickets, closes: closes, tags: tags, convTags: convTags };
}
`

const FIXO = Date.parse('2026-10-16T12:00:00.000Z')
class DataFixa extends Date {
  constructor(...a) { if (a.length) super(...a); else super(FIXO) }
  static now() { return FIXO }
}

function compilar(codigo) {
  const c = {
    console, Date: DataFixa, JSON, String, Number, Object, Array, Math, Promise, parseInt,
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

function variantes(marca, chamadaNova, chamadaAntiga) {
  const novo = codigoDe(marca)
  if (!novo.includes(chamadaNova)) throw new Error('chamada nova não achada em ' + marca)
  const antigo = novo.replace(chamadaNova, () => chamadaAntiga) + '\n' + LOAD_DEPS_ANTIGO
  return { novo: compilar(novo), antigo: compilar(antigo), codigoNovo: novo }
}

const R433 = variantes(
  '433 whatsapp GET /whatsapp/:id',
  'await loadDepsDaConversa(m, conv)', 'await loadDeps(m)',
)
const R459 = variantes(
  '459 whatsapp PATCH /whatsapp/:id',
  'await loadDepsDaConversa(m, updated)', 'await loadDeps(m)',
)

// ── a camada de modelos, no que ela faz de verdade ──────────────────────────
function colecao(nome, estado) {
  const linhas = []
  let ordem = 0
  const forma = (r) => ({
    ...r.data,
    id: (typeof r.data.id === 'string' && r.data.id) || r.pk,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })
  const achar = (id) =>
    linhas.find((r) => r.pk === id) || linhas.find((r) => r.data.id === id) || null
  const META = ['limit', 'offset', 'page', 'pageSize', 'perPage', 'sort', 'order', 'orderBy', 'q', 'search', 'include', 'fields']
  const api = {
    findMany: async (filtro = {}) => {
      const campos = Object.keys(filtro).filter((k) => !META.includes(k))
      estado.leituras.push({ modelo: nome, filtro: campos })
      const take = Math.min(500, Math.max(1, Number(filtro.limit ?? filtro.pageSize ?? filtro.perPage) || 500))
      const off = Math.max(0, Number(filtro.offset) || 0)
      return linhas
        .filter((r) => campos.every((k) => JSON.stringify(r.data[k]) === JSON.stringify(filtro[k])))
        .sort((a, b) => b.createdAt - a.createdAt || b.ordem - a.ordem)
        .slice(off, off + take)
        .map(forma)
    },
    findById: async (id) => {
      estado.porId.push({ modelo: nome, id })
      const r = achar(id)
      return r ? forma(r) : null
    },
    update: async (id, patch) => {
      const r = achar(id)
      if (!r) throw new Error(nome + ' not found: ' + id)
      r.data = { ...r.data, ...patch }
      r.updatedAt = r.updatedAt + 1
      return forma(r)
    },
  }
  api.semear = (data, quando, pk) => {
    linhas.push({ pk: pk || 'pk_' + nome + '_' + ordem, data, createdAt: quando, updatedAt: quando, ordem: ordem++ })
  }
  api.linhas = linhas
  return api
}

// ── massa de dados, determinística ──────────────────────────────────────────
function rng(semente) {
  let x = semente
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

function montar({ nTickets = 120, nMsgsForaDaJanela = 0, ticketAntigoDaConv = null } = {}) {
  const estado = { leituras: [], porId: [] }
  const M = {
    WhatsAppConversation: colecao('WhatsAppConversation', estado),
    WhatsAppMessage: colecao('WhatsAppMessage', estado),
    Profile: colecao('Profile', estado),
    WaDepartments: colecao('WaDepartments', estado),
    Company: colecao('Company', estado),
    CompanyContact: colecao('CompanyContact', estado),
    Ticket: colecao('Ticket', estado),
    WaCloseReasons: colecao('WaCloseReasons', estado),
    WaTags: colecao('WaTags', estado),
    WaConversationTags: colecao('WaConversationTags', estado),
    ClientUser: colecao('ClientUser', estado),
    Unit: colecao('Unit', estado),
  }
  const r = rng(7)
  const T0 = 1_700_000_000_000

  // Perfis: a chave de armazenamento NÃO é o id de negócio (produção guarda o
  // perfil pelo id do usuário da plataforma em data.id).
  // `u1` é quem chama; o handler exportado tem guarda de nível e nega sem papel.
  for (let i = 1; i <= 6; i++) M.Profile.semear({ id: 'u' + i, full_name: 'Atendente ' + i, email: `a${i}@x.com`, role: i === 1 ? 'admin' : 'support' }, T0 + i, 'pk_prof_' + i)
  for (let i = 1; i <= 4; i++) M.WaDepartments.semear({ id: 'd' + i, name: 'Depto ' + i, color: i % 2 ? '#fff' : undefined }, T0 + i)
  for (let i = 1; i <= 12; i++) M.Company.semear({ id: 'e' + i, name: 'Empresa ' + i, trade_name: i % 3 ? undefined : 'Fantasia ' + i }, T0 + i)
  for (let i = 1; i <= 20; i++) M.CompanyContact.semear({ id: 'k' + i, name: 'Contato ' + i, whatsapp: '55199999' + String(1000 + i), company_id: 'e' + (1 + (i % 12)) }, T0 + i)
  for (let i = 1; i <= 5; i++) M.WaCloseReasons.semear({ id: 'r' + i, name: 'Motivo ' + i }, T0 + i)
  for (let i = 1; i <= 6; i++) M.WaTags.semear({ id: 'g' + i, name: 'Etiqueta ' + i, color: i % 2 ? '#0f0' : undefined }, T0 + i)
  for (let i = 1; i <= nTickets; i++) {
    M.Ticket.semear({
      id: 't' + i, title: 'Chamado ' + i, status: i % 4 ? 'open' : 'closed',
      priority: ['low', 'medium', 'high'][i % 3], ticket_number: 1000 + i,
      company_name: 'Empresa ' + (1 + (i % 12)),
    }, T0 + i)
  }
  for (let i = 1; i <= 3; i++) M.ClientUser.semear({ id: 'cu' + i, name: 'Cliente ' + i, whatsapp: '55199998' + String(1000 + i), company_id: 'e' + i }, T0 + i)

  // 20 conversas, com combinações de referências, inclusive pendentes.
  const convs = []
  for (let n = 1; n <= 20; n++) {
    const d = {
      id: 'cv' + n,
      remote_jid: n % 5 === 0 ? `${1000000 + n}@lid` : `55199999${String(1000 + n)}@s.whatsapp.net`,
      contact_name: n % 4 === 0 ? null : 'Pessoa ' + n,
      status: ['open', 'pending', 'closed'][n % 3],
      phase: n % 2 ? 'em_atendimento' : 'novo',
      priority: ['low', 'medium', 'high'][n % 3],
      unread_count: n % 6,
    }
    // referências: algumas presentes, algumas ausentes, algumas PENDENTES
    if (n % 2) d.assigned_to_id = n % 7 === 0 ? 'u99' : 'u' + (1 + (n % 6)) // u99 não existe
    if (n % 3 !== 1) d.department_id = 'd' + (1 + (n % 4))
    if (n % 3 === 0) d.company_id = 'e' + (1 + (n % 12))
    if (n % 4 === 1) d.company_contact_id = 'k' + (1 + (n % 20))
    if (n % 2 === 0 && n <= 14) d.ticket_id = 't' + (1 + ((n * 7) % Math.min(nTickets, 100)))
    if (n === 16) { d.ticketId = 't5'; delete d.ticket_id } // camelCase
    if (n === 17) { d.assignedToId = 'u2'; delete d.assigned_to_id } // camelCase
    if (n % 5 === 2) d.close_reason_id = 'r' + (1 + (n % 5))
    if (n === 20 && ticketAntigoDaConv) d.ticket_id = ticketAntigoDaConv
    M.WhatsAppConversation.semear(d, T0 + 1000 + n)
    convs.push(d.id)
  }

  // ligações de etiqueta: 0, 1, várias, duplicada, para etiqueta apagada
  const liga = (c, tag) => M.WaConversationTags.semear({ id: `lk_${c}_${tag}`, conversation_id: c, tag_id: tag }, T0 + 2000)
  liga('cv1', 'g1'); liga('cv2', 'g1'); liga('cv2', 'g2'); liga('cv2', 'g3')
  liga('cv3', 'g99') // etiqueta inexistente
  liga('cv4', 'g4'); liga('cv4', 'g4') // duplicada
  M.WaConversationTags.semear({ id: 'lk_cv5', conversationId: 'cv5', tagId: 'g2' }, T0 + 2000) // camelCase
  // As duas grafias na MESMA conversa, a camelCase mais nova: a ordem das
  // etiquetas na resposta segue a recência, e só uma junção que ordene acerta.
  liga('cv6', 'g1')
  M.WaConversationTags.semear({ id: 'lk_cv6_b', conversationId: 'cv6', tagId: 'g2' }, T0 + 2500)

  // mensagens: de 0 a 40 por conversa, com empates e sem timestamp em algumas
  let tick = T0 + 5000
  for (const cid of convs) {
    const n = cid === 'cv7' ? 0 : Math.floor(r() * 40) + 1
    for (let k = 0; k < n; k++) {
      const empate = k % 9 === 8
      const ts = new Date(T0 + 10_000 + Math.floor(r() * 5000) * 1000).toISOString()
      M.WhatsAppMessage.semear({
        id: `${cid}_m${k}`, conversation_id: cid, from_me: k % 2 === 0,
        body: `msg ${k} de ${cid}`, sender_name: k % 2 ? 'Cliente' : 'Atendente',
        ...(k % 7 === 6 ? { created_at: ts } : { timestamp: empate ? '2026-01-01T00:00:00.000Z' : ts }),
        media_type: k % 11 === 10 ? 'image' : null,
      }, tick++)
    }
  }
  // Grafia antiga (camelCase), com os timestamps MAIS novos de cv3: se a busca
  // só olhar `conversation_id`, a última mensagem sai errada.
  for (let k = 0; k < 2; k++) {
    M.WhatsAppMessage.semear({
      id: `cv3_camel${k}`, conversationId: 'cv3', fromMe: false, body: 'grafia antiga ' + k,
      // depois do 2026-01-01 dos empates, senão a camelCase nunca é a última
      timestamp: `2026-06-0${k + 1}T00:00:00.000Z`,
    }, tick++)
  }
  // mensagens de OUTRAS conversas, antigas demais para a janela de 500
  for (let k = 0; k < nMsgsForaDaJanela; k++) {
    M.WhatsAppMessage.semear({ id: `lixo_${k}`, conversation_id: 'outra', body: 'x', timestamp: new Date(T0 + k).toISOString() }, tick++)
  }
  return { M, estado, convs }
}

function ctxDe(M, id, body) {
  return {
    params: { id }, query: {}, headers: {}, body: body || {}, rawBody: null,
    user: { id: 'u1' }, models: M, reply: reply(),
    secrets: { get: async () => null },
    fetch: async () => ({ status: 200, body: '{}' }),
    notify: async () => ({}),
  }
}

const json = (x) => JSON.stringify(x)

async function main() {
// ═══ 1. GET: resposta IDÊNTICA para as 20 conversas (e uma que não existe) ═══
{
  const A = montar(), B = montar()
  let todasIguais = true, primeiraDif = null, reais = 0, naoReal = null
  for (const id of [...A.convs, 'nao-existe']) {
    const novo = await (R433.novo(ctxDe(A.M, id)))
    const antigo = await (R433.antigo(ctxDe(B.M, id)))
    if (json(novo) !== json(antigo)) { todasIguais = false; primeiraDif = primeiraDif || { id, novo, antigo } }
    // TRAVA CONTRA VERDE FALSO: duas negativas iguais (403, 500) também são
    // "idênticas". Só conta como conversa real a resposta 200 com o id pedido.
    if (id !== 'nao-existe') {
      if (novo && novo.status === 200 && novo.body && novo.body.data && novo.body.data.id === id) reais++
      else naoReal = naoReal || { id, novo }
    } else if (!(novo && novo.status === 404)) naoReal = naoReal || { id, novo }
  }
  ok('as 20 respostas são conversas REAIS (200 com o id), e a inexistente é 404', reais === 20 && !naoReal, naoReal)
  ok('GET /whatsapp/:id — JSON idêntico, 20 conversas + 1 inexistente', todasIguais, primeiraDif)
}

// ═══ 2. PATCH: idêntico (resposta E conversa gravada) ═══════════════════════
{
  const A = montar(), B = montar()
  let iguais = true, dif = null, reais = true, naoReal = null
  for (const id of A.convs) {
    const corpo = { priority: 'high', contact_name: 'Renomeada ' + id }
    const novo = await (R459.novo(ctxDe(A.M, id, corpo)))
    const antigo = await (R459.antigo(ctxDe(B.M, id, corpo)))
    const gravadoN = json(A.M.WhatsAppConversation.linhas.find((l) => l.data.id === id).data)
    const gravadoA = json(B.M.WhatsAppConversation.linhas.find((l) => l.data.id === id).data)
    if (json(novo) !== json(antigo) || gravadoN !== gravadoA) { iguais = false; dif = dif || { id, novo, antigo } }
    if (!(novo && novo.status === 200 && novo.body && novo.body.data && novo.body.data.priority === 'high')) { reais = false; naoReal = naoReal || { id, novo } }
  }
  ok('as 20 edições foram APLICADAS (200 e prioridade nova na resposta)', reais && !naoReal, naoReal)
  ok('PATCH /whatsapp/:id — resposta e gravação idênticas, 20 conversas', iguais, dif)
}

// ═══ 3. o custo: nenhuma das coleções de apoio é lida inteira ═══════════════
{
  const COLECOES = ['WhatsAppMessage', 'Profile', 'WaDepartments', 'Company', 'CompanyContact', 'Ticket', 'WaCloseReasons', 'WaTags', 'WaConversationTags']
  const { M, estado } = montar()
  await (R459.novo(ctxDe(M, 'cv2', { priority: 'low' })))
  const inteiras = estado.leituras.filter((l) => COLECOES.includes(l.modelo) && l.filtro.length === 0)
  ok('PATCH: zero leituras de coleção inteira', inteiras.length === 0, inteiras)

  const g = montar()
  await (R433.novo(ctxDe(g.M, 'cv2')))
  const inteirasG = g.estado.leituras.filter((l) => l.filtro.length === 0).map((l) => l.modelo).sort()
  // O resolvedor de identificação casa por FINAL DE TELEFONE/LID, não por id:
  // não dá para trocar por busca direta sem mudar a resposta. Ficam estas duas.
  ok('GET: sobram só as 2 leituras do resolvedor por telefone',
    json(inteirasG) === json(['ClientUser', 'CompanyContact']), inteirasG)

  const antes = montar()
  const lidas = []
  const orig = antes.M.Ticket.findMany
  antes.M.Ticket.findMany = async (f) => { lidas.push(f); return orig(f) }
  await (R433.antigo(ctxDe(antes.M, 'cv2')))
  ok('controle: a variante antiga LÊ a coleção inteira (o teste enxerga a diferença)', lidas.length >= 1 && Object.keys(lidas[0] || {}).length === 0, lidas)
}

// ═══ 4. onde a versão antiga PERDIA dado, a nova encontra — e SÓ aí ═════════
{
  // 600 chamados: o chamado t1 é o mais antigo e cai fora das 500 mais recentes.
  const A = montar({ nTickets: 600, ticketAntigoDaConv: 't1' })
  const B = montar({ nTickets: 600, ticketAntigoDaConv: 't1' })
  const novo = await (R433.novo(ctxDe(A.M, 'cv20')))
  const antigo = await (R433.antigo(ctxDe(B.M, 'cv20')))
  const dn = novo.body && novo.body.data, da = antigo.body && antigo.body.data
  ok('chamado fora das 500 mais recentes: a antiga devolvia null', da && da.ticket === null, da && da.ticket)
  ok('chamado fora das 500 mais recentes: a nova devolve o chamado', dn && dn.ticket && dn.ticket.id === 't1', dn && dn.ticket)
  const semTicket = (d) => json({ ...d, ticket: undefined })
  ok('e tudo o MAIS é idêntico (a diferença é só o campo `ticket`)', semTicket(dn) === semTicket(da), { dn, da })
}
{
  // 700 mensagens de outras conversas, mais novas que as de cv1: empurram as de
  // cv1 para fora da janela de 500 da leitura inteira.
  const A = montar({ nMsgsForaDaJanela: 0 }), B = montar({ nMsgsForaDaJanela: 0 })
  for (const X of [A, B]) {
    const base = 9_000_000_000_000
    for (let k = 0; k < 700; k++) X.M.WhatsAppMessage.semear({ id: `novo_${k}`, conversation_id: 'outra', body: 'y', timestamp: new Date(base + k).toISOString() }, base + k)
  }
  const novo = await (R433.novo(ctxDe(A.M, 'cv1')))
  const antigo = await (R433.antigo(ctxDe(B.M, 'cv1')))
  ok('mensagem fora da janela: a antiga devolvia last_message null', antigo.body.data.last_message === null, antigo.body.data.last_message)
  ok('mensagem fora da janela: a nova devolve a última de verdade', !!(novo.body.data.last_message && novo.body.data.last_message.id), novo.body.data.last_message)
  const semUltima = (d) => json({ ...d, last_message: undefined })
  ok('e tudo o MAIS é idêntico (a diferença é só `last_message`)', semUltima(novo.body.data) === semUltima(antigo.body.data), { n: novo.body.data, a: antigo.body.data })
}

// ═══ 5. a conversa que não existe continua 404 e o erro continua erro ═══════
{
  const { M } = montar()
  const r = await (R433.novo(ctxDe(M, 'nao-existe')))
  ok('conversa inexistente: 404, como antes', r && r.status === 404, r)
}

}

main().then(fim).catch((e) => { console.error(e); process.exit(1) })
