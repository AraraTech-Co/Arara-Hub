// Vincular a conversa a um chamado que já existe (PRD 06) —
// GET /whatsapp/:id/chamados-vinculaveis e POST /whatsapp/:id/ticket/vincular.
//
// O cliente volta dois dias depois sobre o mesmo assunto: a conversa é nova, o chamado é o mesmo.
// Sem estas rotas, o atendente abria um segundo chamado do mesmo assunto.
//
// O QUE SE GARANTE (os DOIS handlers EXECUTADOS, carregados do literal gerado):
//   LISTAGEM — o escopo sai da CONVERSA, no servidor: chamado de outra empresa não aparece, e o
//     filtro vai NA plataforma (o teste lê o que foi pedido ao `findMany`); finalizados, arquivados
//     e o chamado da própria conversa ficam de fora; mais novos primeiro; teto de 20; a resposta
//     carrega só 5 campos (nada de descrição); conversa sem empresa cai no cliente; conversa sem
//     empresa e sem cliente devolve lista VAZIA sem ler nada; varredura incompleta vira 503.
//   VÍNCULO — grava SÓ `ticket_id` e `updated_at`, não toca no chamado, registra `ticket_linked`
//     com a conversa; recusa sem gravar: 404 conversa, 403 outra conta, 409 conversa que já tem
//     chamado, 400 sem ticketId, 404 chamado inexistente, 403 chamado de outro cliente, 409
//     conversa sem cliente identificado.
//   TELA — "Vincular ticket" só no ramo da conversa SEM chamado, ao lado de "Criar ticket", e a
//     janela chama as duas rotas sem escolher escopo.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node vincular-chamado.test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { carregarHandler, reply, ok, fim, ARQ } = require('./_carregar.js')

const MARCA_LISTA = 'whatsapp GET /whatsapp/:id/chamados-vinculaveis'
const MARCA_VINC = 'whatsapp POST /whatsapp/:id/ticket/vincular'
const MARCA_DESV = 'whatsapp POST /whatsapp/:id/ticket/desvincular'

const hLista = carregarHandler(MARCA_LISTA)
const hVinc = carregarHandler(MARCA_VINC)
const hDesv = carregarHandler(MARCA_DESV)

const CONVERSA = {
  id: 'c1',
  remote_jid: '5519999998888@s.whatsapp.net',
  remote_lid: null,
  contact_name: 'Cliente',
  status: 'open',
  phase: 'em_atendimento',
  assigned_to_id: 'u1',
  ticket_id: null,
  company_id: 'empA',
  client_user_id: 'cliA',
  conta_id: null,
}

const chamado = (over) =>
  Object.assign(
    {
      id: 't1',
      ticket_number: 'TCK000001',
      title: 'Nota fiscal rejeitada',
      description: 'texto longo que NÃO deve sair na listagem',
      status: 'em_atendimento',
      company_id: 'empA',
      client_user_id: 'cliA',
      is_archived: false,
      created_at: '2026-10-20T12:00:00Z',
    },
    over,
  )

function mundo(over = {}) {
  return {
    conv: Object.assign({}, CONVERSA, over.conv || {}),
    chamados: over.chamados || [],
    perfil: over.perfil !== undefined ? over.perfil : { id: 'u1', role: 'support' },
    user: over.user !== undefined ? over.user : { id: 'u1' },
    sessao: over.sessao || null,
    body: over.body !== undefined ? over.body : {},
    // Índice da página (0, 1, 2…) em que a leitura de chamados falha.
    falhaNaPagina: over.falhaNaPagina,
    leituras: [],
    updates: [],
    ticketUpdates: [],
    logs: [],
    eventos: [],
  }
}

function ctxDe(w) {
  return {
    params: { id: 'c1' },
    body: w.body,
    headers: w.sessao ? { 'x-portal-sessao': w.sessao } : {},
    user: w.user,
    reply: reply(),
    models: {
      WhatsAppConversation: {
        findById: async (id) => (String(id) === String(w.conv.id) ? w.conv : null),
        update: async (id, patch) => {
          w.updates.push({ id, patch })
          return Object.assign(w.conv, patch)
        },
      },
      Ticket: {
        findById: async (id) => w.chamados.find((t) => String(t.id) === String(id)) || null,
        update: async (id, patch) => {
          w.ticketUpdates.push({ id, patch })
          return patch
        },
        // Responde como a camada (packages/api/src/lib/models.ts): `limit`/`offset`
        // paginam de verdade, no máximo 500 por chamada, da mais nova para a mais
        // velha, e os outros campos são igualdade ESTRITA — chamado sem o campo não
        // volta no filtro. É essa severidade que prova que o escopo foi pedido À
        // PLATAFORMA: se o filtro sair do pedido, o chamado de outra empresa volta.
        findMany: async (f) => {
          const filtro = Object.assign({}, f || {})
          const limite = Math.min(500, Math.max(1, Number(filtro.limit) || 500))
          const desvio = Math.max(0, Number(filtro.offset) || 0)
          if (w.falhaNaPagina !== undefined && Math.floor(desvio / limite) === w.falhaNaPagina) {
            throw new Error('leitura falhou')
          }
          delete filtro.limit
          delete filtro.offset
          w.leituras.push(Object.assign({ limite, desvio }, filtro))
          let linhas = w.chamados
          for (const k of Object.keys(filtro)) linhas = linhas.filter((t) => t[k] === filtro[k])
          return linhas.slice(desvio, desvio + limite)
        },
      },
      ActivityLog: {
        create: async (row) => {
          w.logs.push(row)
          return row
        },
      },
      WaConversationEvents: {
        create: async (row) => {
          w.eventos.push(row)
          return row
        },
      },
      Profile: {
        findById: async (id) => (w.perfil && String(w.perfil.id) === String(id) ? w.perfil : null),
      },
      Sessao: {
        findById: async (id) =>
          id === 'ses_abc' ? { user_id: 'u9', verificador: 'xyz', revogada: false } : null,
      },
    },
  }
}

// ─── Listagem: o escopo é do servidor ──────────────────────────────────────
async function bateriaListagem(h) {
  const f = []
  async function lista(nome, w, esperado) {
    const r = await h(ctxDe(w))
    const st = r.status || 200
    if (st !== esperado) {
      f.push(nome + ':status=' + st)
      return null
    }
    return r.body && r.body.data
  }

  // Chamado de outra empresa não entra, e o filtro foi pedido à plataforma.
  const w1 = mundo({
    chamados: [
      chamado({ id: 't1' }),
      chamado({ id: 't2', company_id: 'empB', client_user_id: 'cliB', ticket_number: 'TCK000002' }),
    ],
  })
  const d1 = await lista('escopo-empresa', w1, 200)
  if (d1) {
    const ids = d1.map((t) => t.id).join(',')
    if (ids !== 't1') f.push('escopo-empresa:devolveu=' + ids)
    if (!w1.leituras.length || w1.leituras[0].company_id !== 'empA') {
      f.push('escopo-empresa:filtro=' + JSON.stringify(w1.leituras[0] || null))
    }
    // Só os 5 campos da janela: descrição não sai daqui.
    const chaves = Object.keys(d1[0] || {}).sort().join(',')
    if (chaves !== 'created_at,id,status,ticket_number,title') f.push('escopo-empresa:campos=' + chaves)
  }

  // Encerrados, arquivados, card do quadro de Dev e o chamado da própria
  // conversa ficam de fora. O card de Dev tem status de OUTRO vocabulário
  // (app/lib/kanban-dev.ts): `aplicado_no_cliente` não está em `_ENCERRADOS`,
  // então só o `quadro` o mantém fora.
  const w2 = mundo({
    conv: { ticket_id: 'tMeu' },
    chamados: [
      chamado({ id: 'tMeu' }),
      chamado({ id: 'tResolvido', status: 'resolvido' }),
      chamado({ id: 'tFechado', status: 'fechado' }),
      chamado({ id: 'tCancelado', status: 'cancelado' }),
      chamado({ id: 'tArquivado', is_archived: true }),
      chamado({ id: 'tDev', quadro: 'dev', status: 'aplicado_no_cliente' }),
      chamado({ id: 'tBom' }),
    ],
  })
  const d2 = await lista('exclusoes', w2, 200)
  if (d2) {
    const ids = d2.map((t) => t.id).join(',')
    if (ids !== 'tBom') f.push('exclusoes:devolveu=' + ids)
  }

  // Mais novos primeiro.
  const w3 = mundo({
    chamados: [
      chamado({ id: 'velho', created_at: '2026-10-01T12:00:00Z' }),
      chamado({ id: 'novo', created_at: '2026-10-25T12:00:00Z' }),
      chamado({ id: 'meio', created_at: '2026-10-10T12:00:00Z' }),
    ],
  })
  const d3 = await lista('ordem', w3, 200)
  if (d3 && d3.map((t) => t.id).join(',') !== 'novo,meio,velho') {
    f.push('ordem:' + d3.map((t) => t.id).join(','))
  }

  // Teto de 20 na resposta.
  const muitos = []
  for (let i = 0; i < 40; i++) {
    muitos.push(chamado({ id: 'm' + i, created_at: '2026-10-' + String(10 + (i % 20)).padStart(2, '0') + 'T12:00:00Z' }))
  }
  const d4 = await lista('teto-de-20', mundo({ chamados: muitos }), 200)
  if (d4 && d4.length !== 20) f.push('teto-de-20:' + d4.length)

  // Conversa sem empresa cai no cliente; chamado de outro cliente não entra.
  const w5 = mundo({
    conv: { company_id: null },
    chamados: [
      chamado({ id: 'tCli', company_id: null }),
      chamado({ id: 'tOutro', company_id: null, client_user_id: 'cliB' }),
    ],
  })
  const d5 = await lista('escopo-cliente', w5, 200)
  if (d5) {
    if (d5.map((t) => t.id).join(',') !== 'tCli') f.push('escopo-cliente:devolveu=' + d5.map((t) => t.id).join(','))
    if (!w5.leituras.length || w5.leituras[0].client_user_id !== 'cliA') {
      f.push('escopo-cliente:filtro=' + JSON.stringify(w5.leituras[0] || null))
    }
  }

  // Sem empresa E sem cliente: lista vazia, e NENHUMA leitura — devolver "todos"
  // aqui mostraria chamado de outro cliente na janela.
  const w6 = mundo({
    conv: { company_id: null, client_user_id: null },
    chamados: [chamado({ id: 'tQualquer', company_id: null, client_user_id: null })],
  })
  const d6 = await lista('sem-escopo', w6, 200)
  if (d6 && d6.length !== 0) f.push('sem-escopo:devolveu=' + d6.length)
  if (w6.leituras.length) f.push('sem-escopo:leu=' + w6.leituras.length)

  // Trava de conta e conversa inexistente.
  const w7 = mundo({ conv: { conta_id: 'setor9' } })
  await lista('outra-conta', w7, 403)
  const w8 = mundo({ conv: { id: 'outra' } })
  await lista('conversa-inexistente', w8, 404)

  // Além da primeira página: a camada devolve 500 por chamada.
  const enche = (n) => {
    const l = []
    for (let i = 0; i < n; i++) l.push(chamado({ id: 'x' + i, status: 'fechado' }))
    return l
  }
  const paginado = enche(519)
  paginado[509] = chamado({ id: 'longe', created_at: '2026-10-26T12:00:00Z' })
  const d9 = await lista('candidato-na-segunda-pagina', mundo({ chamados: paginado }), 200)
  if (d9 && d9.map((t) => t.id).join(',') !== 'longe') {
    f.push('candidato-na-segunda-pagina:' + (d9.length ? d9.map((t) => t.id).join(',') : 'vazio'))
  }

  // Varredura incompleta: 503 em vez de lista cortada com cara de completa.
  // 10 mil: a 20ª página vem CHEIA, então ainda pode haver chamado além dela.
  await lista('teto-de-paginas', mundo({ chamados: enche(10000) }), 503)
  await lista('segunda-pagina-falha', mundo({ chamados: enche(519), falhaNaPagina: 1 }), 503)
  return f
}

// ─── Vínculo: grava só o vínculo, e só no escopo ───────────────────────────
async function bateriaVinculo(h) {
  const f = []
  async function recusa(nome, w, esperado) {
    const r = await h(ctxDe(w))
    if ((r.status || 200) !== esperado) f.push(nome + ':status=' + (r.status || 200))
    if (w.updates.length) f.push(nome + ':gravou')
    if (w.logs.length) f.push(nome + ':log')
    if (w.eventos.length) f.push(nome + ':evento')
  }

  // Caminho feliz.
  const w = mundo({ chamados: [chamado({ id: 't1' })], body: { ticketId: 't1' } })
  const r = await h(ctxDe(w))
  if ((r.status || 200) !== 200) f.push('feliz:status=' + r.status)
  if (w.updates.length !== 1) f.push('feliz:gravou ' + w.updates.length + 'x')
  else {
    const p = w.updates[0].patch
    if (p.ticket_id !== 't1') f.push('feliz:ticket_id=' + p.ticket_id)
    if (!p.updated_at) f.push('feliz:sem-updated_at')
    const chaves = Object.keys(p).sort().join(',')
    if (chaves !== 'ticket_id,updated_at') f.push('feliz:gravou-mais=' + chaves)
  }
  if (w.ticketUpdates.length) f.push('feliz:mexeu-no-chamado')
  const log = w.logs[0]
  if (!log || log.action !== 'ticket_linked') f.push('feliz:sem-log')
  else {
    if (String(log.ticket_id) !== 't1') f.push('feliz:log-de-outro-chamado')
    if (String(log.details && log.details.conversation_id) !== 'c1') f.push('feliz:log-sem-conversa')
  }
  // Histórico da CONVERSA, além do histórico do chamado.
  const ev = w.eventos[0]
  if (!ev || ev.type !== 'ticket_linked') f.push('feliz:sem-evento-da-conversa')
  else {
    if (String(ev.conversation_id) !== 'c1') f.push('feliz:evento-de-outra-conversa')
    if (ev.from_value) f.push('feliz:evento-com-anterior:' + ev.from_value)
    if (String(ev.to_value) !== 't1') f.push('feliz:evento-sem-destino')
    if (ev.actor_id !== 'u1') f.push('feliz:evento-sem-autor:' + ev.actor_id)
  }
  if (!r.body || !r.body.data || r.body.data.ticket_number !== 'TCK000001') f.push('feliz:resposta')

  // ── Troca: conversa que já tem chamado passa a apontar para outro ────────
  const wt = mundo({
    conv: { ticket_id: 'tAntigo' },
    chamados: [chamado({ id: 'tAntigo' }), chamado({ id: 't1' })],
    body: { ticketId: 't1' },
  })
  const rt = await h(ctxDe(wt))
  if ((rt.status || 200) !== 200) f.push('troca:status=' + rt.status)
  if (wt.updates.length !== 1) f.push('troca:gravou ' + wt.updates.length + 'x')
  else if (wt.updates[0].patch.ticket_id !== 't1') f.push('troca:ticket_id=' + wt.updates[0].patch.ticket_id)
  const evt = wt.eventos[0]
  if (!evt || evt.type !== 'ticket_changed') f.push('troca:evento=' + (evt && evt.type))
  else {
    // De qual para qual: sem isso, a troca aparece como vínculo do nada.
    if (String(evt.from_value) !== 'tAntigo') f.push('troca:evento-sem-anterior:' + evt.from_value)
    if (String(evt.to_value) !== 't1') f.push('troca:evento-sem-destino:' + evt.to_value)
  }
  const logt = wt.logs[0]
  if (!logt || logt.action !== 'ticket_changed') f.push('troca:log=' + (logt && logt.action))
  else if (String(logt.details && logt.details.de) !== 'tAntigo') f.push('troca:log-sem-anterior')
  if (wt.ticketUpdates.length) f.push('troca:mexeu-no-chamado')

  // O mesmo chamado de novo não é troca.
  await recusa(
    'mesmo-chamado',
    mundo({ conv: { ticket_id: 't1' }, chamados: [chamado({ id: 't1' })], body: { ticketId: 't1' } }),
    409,
  )

  // Sem empresa, o vínculo sai pelo cliente.
  const wc = mundo({
    conv: { company_id: null },
    chamados: [chamado({ id: 't1', company_id: null })],
    body: { ticketId: 't1' },
  })
  const rc = await h(ctxDe(wc))
  if ((rc.status || 200) !== 200) f.push('por-cliente:status=' + rc.status)
  if (wc.updates.length !== 1) f.push('por-cliente:gravou ' + wc.updates.length + 'x')

  // ── Recusas, nenhuma gravando ────────────────────────────────────────────
  // 403 da conta vem ANTES do resto: as duas saem da mesma trava.
  await recusa('outra-conta', mundo({ conv: { conta_id: 'setor9' }, body: { ticketId: 't1' } }), 403)
  await recusa('conversa-inexistente', mundo({ conv: { id: 'outra' }, body: { ticketId: 't1' } }), 404)
  await recusa('sem-ticketId', mundo({ chamados: [chamado({ id: 't1' })], body: {} }), 400)
  await recusa('chamado-inexistente', mundo({ chamados: [], body: { ticketId: 't1' } }), 404)
  // A lista da janela não protege nada: quem chama a rota escolhe o id.
  await recusa(
    'chamado-encerrado',
    mundo({ chamados: [chamado({ id: 't1', status: 'resolvido' })], body: { ticketId: 't1' } }),
    409,
  )
  await recusa(
    'chamado-arquivado',
    mundo({ chamados: [chamado({ id: 't1', is_archived: true })], body: { ticketId: 't1' } }),
    409,
  )
  await recusa(
    'card-do-quadro-de-dev',
    mundo({
      chamados: [chamado({ id: 't1', quadro: 'dev', status: 'aplicado_no_cliente' })],
      body: { ticketId: 't1' },
    }),
    409,
  )
  // O coração da guarda: chamado de outro cliente não vincula.
  await recusa(
    'outra-empresa',
    mundo({
      chamados: [chamado({ id: 't1', company_id: 'empB', client_user_id: 'cliB' })],
      body: { ticketId: 't1' },
    }),
    403,
  )
  await recusa(
    'chamado-sem-empresa',
    mundo({ chamados: [chamado({ id: 't1', company_id: null })], body: { ticketId: 't1' } }),
    403,
  )
  await recusa(
    'outro-cliente-sem-empresa',
    mundo({
      conv: { company_id: null },
      chamados: [chamado({ id: 't1', company_id: null, client_user_id: 'cliB' })],
      body: { ticketId: 't1' },
    }),
    403,
  )
  // Conversa sem cliente identificado: não há escopo para provar.
  await recusa(
    'conversa-sem-cliente',
    mundo({
      conv: { company_id: null, client_user_id: null },
      chamados: [chamado({ id: 't1', company_id: null, client_user_id: null })],
      body: { ticketId: 't1' },
    }),
    409,
  )
  return f
}

// ─── Desvincular: solta a conversa, mesmo de chamado já resolvido ──────────
async function bateriaDesvincular(h) {
  const f = []
  // Caminho feliz: grava só a saída do vínculo e registra nos dois históricos.
  const w = mundo({ conv: { ticket_id: 't1' }, chamados: [chamado({ id: 't1' })] })
  const r = await h(ctxDe(w))
  if ((r.status || 200) !== 200) f.push('feliz:status=' + r.status)
  if (w.updates.length !== 1) f.push('feliz:gravou ' + w.updates.length + 'x')
  else {
    const p = w.updates[0].patch
    if (p.ticket_id !== null) f.push('feliz:ticket_id=' + JSON.stringify(p.ticket_id))
    if (!p.updated_at) f.push('feliz:sem-updated_at')
    const chaves = Object.keys(p).sort().join(',')
    if (chaves !== 'ticket_id,updated_at') f.push('feliz:gravou-mais=' + chaves)
  }
  if (w.ticketUpdates.length) f.push('feliz:mexeu-no-chamado')
  const ev = w.eventos[0]
  if (!ev || ev.type !== 'ticket_unlinked') f.push('feliz:evento=' + (ev && ev.type))
  else {
    if (String(ev.from_value) !== 't1') f.push('feliz:evento-sem-anterior:' + ev.from_value)
    if (ev.to_value !== null) f.push('feliz:evento-com-destino:' + ev.to_value)
    if (ev.actor_id !== 'u1') f.push('feliz:evento-sem-autor:' + ev.actor_id)
  }
  const log = w.logs[0]
  if (!log || log.action !== 'ticket_unlinked') f.push('feliz:log=' + (log && log.action))
  else if (String(log.ticket_id) !== 't1') f.push('feliz:log-de-outro-chamado')

  // Chamado JÁ RESOLVIDO se desvincula: é justamente o caso em que o atendente
  // quer soltar a conversa. Conferir a situação aqui travaria a saída.
  const wr = mundo({
    conv: { ticket_id: 't1' },
    chamados: [chamado({ id: 't1', status: 'resolvido' })],
  })
  const rr = await h(ctxDe(wr))
  if ((rr.status || 200) !== 200) f.push('resolvido:status=' + rr.status)
  if (wr.updates.length !== 1) f.push('resolvido:gravou ' + wr.updates.length + 'x')
  // Card de Dev também sai: o vínculo pode ter nascido antes desta regra.
  const wd = mundo({
    conv: { ticket_id: 't1' },
    chamados: [chamado({ id: 't1', quadro: 'dev', status: 'aplicado_no_cliente' })],
  })
  const rd = await h(ctxDe(wd))
  if ((rd.status || 200) !== 200) f.push('dev:status=' + rd.status)
  // Chamado que nem existe mais: o vínculo ainda sai.
  const wx = mundo({ conv: { ticket_id: 'tSumiu' }, chamados: [] })
  const rx = await h(ctxDe(wx))
  if ((rx.status || 200) !== 200) f.push('chamado-sumiu:status=' + rx.status)

  async function recusa(nome, w2, esperado) {
    const r2 = await h(ctxDe(w2))
    if ((r2.status || 200) !== esperado) f.push(nome + ':status=' + (r2.status || 200))
    if (w2.updates.length) f.push(nome + ':gravou')
    if (w2.eventos.length) f.push(nome + ':evento')
  }
  await recusa('sem-vinculo', mundo({ conv: { ticket_id: null } }), 409)
  await recusa('outra-conta', mundo({ conv: { ticket_id: 't1', conta_id: 'setor9' } }), 403)
  await recusa('conversa-inexistente', mundo({ conv: { id: 'outra', ticket_id: 't1' } }), 404)
  return f
}

// ─── Mutações: cada handler reescrito no literal, recompilado e reexecutado ─
function fonteDaRota(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  const m = re.exec(s)
  return JSON.parse('"' + m[1] + '"')
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

const MUT_LISTA = [
  // Escopo fora do pedido à plataforma: volta chamado de outra empresa.
  ['escopo não vai no filtro',
    [['    if (_empresa) _f.company_id = _empresa;\n    else _f.client_user_id = _cliente;\n', '']]],
  ['escopo só por empresa', [['    else _f.client_user_id = _cliente;\n', '']]],
  // Conversa sem cliente passa a varrer e devolver o que achar.
  ['sem escopo devolve o que achar', [['if (!_empresa && !_cliente) return ok(ctx, []);', 'if (false) return ok(ctx, []);']]],
  ['inclui encerrados', [['    if (_encerrado(_t)) continue;\n', '']]],
  ['inclui arquivados', [['    if (t.is_archived || t.isArchived) return true;\n', '']]],
  ['inclui cards do quadro de Dev', [['    if (_ehDoDev(_t)) continue;\n', '']]],
  ['inclui a própria conversa', [['if (_meu && String(_t.id) === _meu) continue;\n', '']]],
  ['ordem invertida', [['return ta < tb ? 1 : -1;', 'return ta < tb ? -1 : 1;']]],
  ['teto de 20 ignorado', [['_s < _cands.length && _s < 20', '_s < _cands.length']]],
  // Devolve a linha inteira: descrição do chamado passa a sair na listagem.
  ['devolve o chamado inteiro', [['    _saida.push({\n      id: _c.id,', '    _saida.push(_c);\n    if (false) _saida.push({\n      id: _c.id,']]],
  ['lê só a primeira página', [['if (_pag.length < _PAGINA) break;', 'break;']]],
  ['teto de páginas ignorado', [['if (_k === _MAX_PAGINAS - 1) {', 'if (false) {']]],
  ['ignora falha de página',
    [['duplicado.\n      return fail(ctx, 503,', 'duplicado.\n      _pag = []; if (false) return fail(ctx, 503,']]],
]

const MUT_VINC = [
  // A guarda central: sem ela, qualquer id de chamado vincula.
  ['não confere o escopo', [['if (!_mesmo) return fail(ctx, 403, "Este chamado é de outro cliente");', '']]],
  ['escopo só por empresa',
    [['    : String(_tCliente || "") === String(_cliente);', '    : true;']]],
  ['chamado sem empresa passa',
    [['    ? String(_tEmpresa || "") === String(_empresa)', '    ? !_tEmpresa || String(_tEmpresa) === String(_empresa)']]],
  ['aceita conversa sem cliente identificado',
    [['  if (!_empresa && !_cliente) {\n    return fail(ctx, 409,', '  if (false) {\n    return fail(ctx, 409,']]],
  // Vincular ao MESMO chamado não é troca: gravaria e geraria evento de uma
  // troca que não houve.
  ['aceita o mesmo chamado de novo',
    [['  if (_antes && String(_t.id) === _antes) {', '  if (false) {']]],
  ['aceita pedido sem ticketId', [['if (!_tid) return fail(ctx, 400, "ticketId obrigatório");', '']]],
  // A tela deixar de oferecer não é guarda: quem chama a rota escolhe o id.
  ['aceita chamado encerrado',
    [['if (_encerrado(_t)) return fail(ctx, 409, "Este chamado já está encerrado");', '']]],
  ['aceita card do quadro de Dev',
    [['if (_ehDoDev(_t)) return fail(ctx, 409, "Este chamado é do quadro de Dev");', '']]],
  ['encerrado só pelo status, sem o arquivado',
    [['    if (t.is_archived || t.isArchived) return true;\n', '']]],
  ['grava mais que o vínculo',
    [['await m.Conv.update(id, { ticket_id: _t.id, updated_at: ts });',
      'await m.Conv.update(id, { ticket_id: _t.id, updated_at: ts, status: "open" });']]],
  ['mexe no chamado ao vincular',
    [['  await m.Conv.update(id, { ticket_id: _t.id, updated_at: ts });',
      '  await m.Conv.update(id, { ticket_id: _t.id, updated_at: ts });\n  await m.Ticket.update(_t.id, { status: "em_atendimento" });']]],
  ['não registra no histórico do chamado',
    [['        action: _antes ? "ticket_changed" : "ticket_linked",', '        action: "outro",']]],
  // O histórico da conversa é a outra metade do pedido.
  ['não grava o evento da conversa',
    [['      type: _antes ? "ticket_changed" : "ticket_linked",', '      type: "outro",']]],
  // Troca que não diz de qual chamado veio aparece como vínculo do nada.
  ['troca sem registrar o anterior', [['      from_value: _antes,\n', '      from_value: null,\n']]],
  ['troca não se distingue do vínculo',
    [['      type: _antes ? "ticket_changed" : "ticket_linked",', '      type: "ticket_linked",']]],
  ['histórico sem a conversa', [['          conversation_id: String(id),\n', '']]],
  ['grava antes de conferir a conta',
    [['  var _barrado = await _barrarPorConta(ctx, conv);\n  if (_barrado) return _barrado;\n',
      '  var _barrado = await _barrarPorConta(ctx, conv);\n  if (_barrado) { await m.Conv.update(id, { ticket_id: "t1" }); return _barrado; }\n']]],
]

const MUT_DESV = [
  // Conferir a situação do chamado aqui travaria a saída de um resolvido, que
  // é justamente o caso em que o atendente quer soltar a conversa.
  ['desvincular confere o status',
    [['  var ts = nowIso();',
      '  var _tv = await m.Ticket.findById(_antes);\n  if (_tv && String(_tv.status || "") === "resolvido") return fail(ctx, 409, "encerrado");\n  var ts = nowIso();']]],
  ['desvincular sem conferir a conta',
    [['  var _barrado = await _barrarPorConta(ctx, conv);\n  if (_barrado) return _barrado;\n', '']]],
  ['desvincular sem vínculo nenhum',
    [['if (!_antes) return fail(ctx, 409, "Esta conversa não tem chamado vinculado");', '']]],
  ['não limpa o vínculo', [['{ ticket_id: null, updated_at: ts }', '{ updated_at: ts }']]],
  ['não grava o evento da conversa', [['      type: "ticket_unlinked",', '      type: "outro",']]],
  ['evento sem o chamado anterior', [['      from_value: _antes,\n      to_value: null,', '      from_value: null,\n      to_value: null,']]],
  ['não registra no histórico do chamado', [['        action: "ticket_unlinked",', '        action: "outro",']]],
]

// ─── A tela: o botão novo ao lado do de criar, e a janela chama as rotas ────
const semComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PAINEL = semComentarios(
  fs.readFileSync(path.resolve(__dirname, '../../app/_components/inbox/crm-context-panel.tsx'), 'utf8'),
)
const JANELA = semComentarios(
  fs.readFileSync(path.resolve(__dirname, '../../app/_components/inbox/wa-link-ticket-dialog.tsx'), 'utf8'),
)

function bateriaTela(painel, janela) {
  const f = []
  if (!/Vincular ticket/.test(painel)) f.push('sem-rotulo')
  // Dois botões abrem a MESMA janela: "Vincular ticket" e "Trocar".
  if ((painel.match(/setVincularDialogOpen\(true\)/g) || []).length !== 2) {
    f.push('botoes-nao-abrem-a-janela')
  }
  if (!/open=\{vincularDialogOpen\}/.test(painel)) f.push('janela-nao-ligada-ao-estado')
  if (!/<WALinkTicketDialog/.test(painel)) f.push('janela-nao-montada')
  if (!/Criar ticket/.test(painel)) f.push('criar-sumiu')
  // Com chamado: trocar e desvincular, e o desvincular pede confirmação.
  if (!/>\s*Trocar\s*</.test(painel)) f.push('sem-trocar')
  if (!/setDesvincularAberto\(true\)/.test(painel)) f.push('sem-desvincular')
  if (!/<AlertDialog\b/.test(painel)) f.push('desvincular-sem-confirmacao')
  if (!/whatsappApi\.unlinkTicket\(detail\.id\)/.test(painel)) f.push('nao-chama-desvincular')
  // O botão tem de estar no ramo da conversa SEM chamado: o `) : (` do ternário
  // `detail.ticket ? (…) : (…)` é a fronteira, e o `</dl>` fecha a lista.
  const iTernario = painel.indexOf('{detail.ticket ? (')
  const iElse = painel.indexOf(') : (', iTernario)
  const iVinc = painel.indexOf('Vincular ticket')
  const iFim = painel.indexOf('</dl>', iElse)
  if (iTernario < 0 || iElse < 0 || iVinc < 0 || iFim < 0 || !(iElse < iVinc && iVinc < iFim)) {
    f.push('botao-fora-do-ramo-sem-chamado')
  }
  // E "Trocar"/"Desvincular" no ramo de CIMA, o da conversa COM chamado.
  const iTrocar = painel.search(/>\s*Trocar\s*</)
  const iDesv = painel.indexOf('setDesvincularAberto(true)')
  if (!(iTernario < iTrocar && iTrocar < iElse)) f.push('trocar-fora-do-ramo-com-chamado')
  if (!(iTernario < iDesv && iDesv < iElse)) f.push('desvincular-fora-do-ramo-com-chamado')
  if (!/whatsappApi\.listLinkableTickets\(conversationId\)/.test(janela)) f.push('janela-nao-lista')
  if (!/whatsappApi\.linkTicket\(conversationId, escolhido\)/.test(janela)) f.push('janela-nao-vincula')
  if (!/disabled=\{salvando \|\| !escolhido\}/.test(janela)) f.push('confirma-sem-escolher')
  return f
}

function rodarMutacoes(nomePrefixo, texto, muts, avaliar) {
  for (const [nome, pares] of muts) {
    let mut = texto
    let aplicou = true
    for (const [de, para] of pares) {
      if (mut.split(de).length - 1 !== 1) { aplicou = false; break }
      mut = mut.replace(de, () => para)
    }
    if (!aplicou || mut === texto) {
      ok(`mutação ${nomePrefixo}"${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora')
      continue
    }
    avaliar(nome, mut)
  }
}

;(async () => {
  const ft = bateriaTela(PAINEL, JANELA)
  ok('a tela oferece "Vincular ticket" só na conversa sem chamado e chama as duas rotas', ft.length === 0, ft)
  rodarMutacoes('tela ', PAINEL, [
    ['some o botão de vincular', [['Vincular ticket', 'Outra coisa']]],
    ['botão de vincular não abre a janela',
      [['onClick={() => setVincularDialogOpen(true)}\n                    >\n                      <Link2', 'onClick={() => undefined}\n                    >\n                      <Link2']]],
    ['janela não liga no estado', [['open={vincularDialogOpen}', 'open={false}']]],
    ['janela não é montada', [['<WALinkTicketDialog', '<Fragment data-x']]],
    ['some o de criar', [['Criar ticket', 'Outra coisa']]],
    ['some o Trocar', [['                        Trocar\n', '']]],
    ['desvincular sem confirmação', [['onClick={() => setDesvincularAberto(true)}', 'onClick={() => void runAction(() => whatsappApi.unlinkTicket(detail.id), "x")}']]],
    ['não chama o desvincular', [['whatsappApi.unlinkTicket(detail.id)', 'Promise.resolve()']]],
  ], (nome, mut) => {
    const fm = bateriaTela(mut, JANELA)
    ok(`mutação tela "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  })
  rodarMutacoes('janela ', JANELA, [
    ['não chama a listagem', [['whatsappApi.listLinkableTickets(conversationId)', 'Promise.resolve({ data: [] })']]],
    ['não chama o vínculo', [['whatsappApi.linkTicket(conversationId, escolhido)', 'Promise.resolve({ data: {} })']]],
    ['confirma sem escolher', [['disabled={salvando || !escolhido}', 'disabled={salvando}']]],
  ], (nome, mut) => {
    const fm = bateriaTela(PAINEL, mut)
    ok(`mutação janela "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  })

  const fl = await bateriaListagem(hLista)
  ok('lista só os chamados do cliente desta conversa, sem finalizados, paginando', fl.length === 0, fl)
  const baseL = fonteDaRota(MARCA_LISTA)
  for (const [nome, pares] of MUT_LISTA) {
    let mut = baseL
    let aplicou = true
    for (const [de, para] of pares) {
      if (mut.split(de).length - 1 !== 1) { aplicou = false; break }
      mut = mut.replace(de, () => para)
    }
    if (!aplicou || mut === baseL) {
      ok(`mutação listagem "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora')
      continue
    }
    const fm = await bateriaListagem(compilar(mut))
    ok(`mutação listagem "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }

  const fv = await bateriaVinculo(hVinc)
  ok('vincula só o que é do cliente, grava só o vínculo e registra no chamado', fv.length === 0, fv)
  const baseV = fonteDaRota(MARCA_VINC)
  for (const [nome, pares] of MUT_VINC) {
    let mut = baseV
    let aplicou = true
    for (const [de, para] of pares) {
      if (mut.split(de).length - 1 !== 1) { aplicou = false; break }
      mut = mut.replace(de, () => para)
    }
    if (!aplicou || mut === baseV) {
      ok(`mutação vínculo "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora')
      continue
    }
    const fm = await bateriaVinculo(compilar(mut))
    ok(`mutação vínculo "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }

  const fd = await bateriaDesvincular(hDesv)
  ok('desvincula a conversa, inclusive de chamado resolvido, e registra nos dois históricos', fd.length === 0, fd)
  const baseD = fonteDaRota(MARCA_DESV)
  for (const [nome, pares] of MUT_DESV) {
    let mut = baseD
    let aplicou = true
    for (const [de, para] of pares) {
      if (mut.split(de).length - 1 !== 1) { aplicou = false; break }
      mut = mut.replace(de, () => para)
    }
    if (!aplicou || mut === baseD) {
      ok(`mutação desvínculo "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora')
      continue
    }
    const fm = await bateriaDesvincular(compilar(mut))
    ok(`mutação desvínculo "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
