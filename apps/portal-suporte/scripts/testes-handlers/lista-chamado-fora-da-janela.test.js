// Lista de conversas (rota 432): o vínculo conversa↔chamado não pode sumir
// porque a tabela de chamados passou de 500 linhas.
//
// `Ticket.findMany({})` devolve no máximo 500, do mais NOVO para o mais velho.
// Com 800+ chamados, o chamado ANTIGO ligado a uma conversa fica fora da
// janela, o índice não acha, e a tela mostra a conversa sem vínculo nenhum.
// Não aparece erro: quem olha conclui que a conversa não tem chamado.
//
// O que este teste fixa nos DOIS sentidos:
//  - tabela que cabe na janela: ZERO consultas extras. O conserto não pode
//    custar nada no caso comum, senão troca um defeito silencioso por uma
//    tempestade de requisições a cada 10 s;
//  - tabela cortada: o chamado de fora da janela aparece.
//
// Roda com: node lista-chamado-fora-da-janela.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const lista = carregarHandler('432 whatsapp GET /whatsapp')

const AGORA = Date.now()
const iso = (h) => new Date(AGORA - h * 3600000).toISOString()
const TETO = 500

/**
 * @param quantosChamados total na tabela
 * @param idDoVinculo     chamado que a conversa referencia
 * @param dentroDaJanela  o vínculo está entre os 500 mais novos?
 */
function cenario({ quantosChamados, idDoVinculo = 'T_VINCULO', dentroDaJanela = true, conversas = null }) {
  // Os chamados, do mais novo para o mais velho, como o banco devolve.
  const todos = []
  for (let i = 0; i < quantosChamados; i++) {
    todos.push({ id: 'T' + i, title: 'Chamado ' + i, status: 'aberto', ticket_number: 1000 + i })
  }
  const vinculo = { id: idDoVinculo, title: 'O chamado da conversa', status: 'aberto', ticket_number: 777 }
  if (dentroDaJanela) todos.unshift(vinculo)
  else todos.push(vinculo)          // mais velho de todos: cai fora do corte

  const convs = conversas || [
    { id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', status: 'open', ticket_id: idDoVinculo, updated_at: iso(1), created_at: iso(2) },
  ]
  const estado = { porId: [], leiturasInteiras: 0 }

  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    Sessao: { findById: async () => null },
    Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
    WhatsAppConversation: { findMany: async () => convs, update: async () => {} },
    WhatsAppMessage: { findMany: async () => [] },
    SystemSettings: vazio,
    WaDepartment: vazio, Company: vazio, CompanyContact: vazio,
    WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio,
    WaConversationEvents: Object.assign({}, vazio, { create: async (e) => e }),
    Ticket: {
      findMany: async () => { estado.leiturasInteiras++; return todos.slice(0, TETO) },
      findById: async (id) => {
        estado.porId.push(String(id))
        return todos.find((t) => t.id === String(id)) || null
      },
    },
  }
  return {
    estado,
    ctx: { params: {}, query: {}, body: {}, headers: {}, user: { id: 'u1' }, app: { slug: 'portal-suporte' }, models, reply: reply() },
  }
}

const primeira = (r) => ((r.body && r.body.data) || [])[0] || null

;(async () => {
  // ══ tabela pequena: nada muda, e nada custa ═══════════════════════════
  {
    const c = cenario({ quantosChamados: 10 })
    const r = await lista(c.ctx)
    ok('tabela que cabe na janela: o vínculo aparece',
      primeira(r) && primeira(r).ticket && primeira(r).ticket.id === 'T_VINCULO', primeira(r) && primeira(r).ticket)
    ok('  uma leitura inteira, como hoje', c.estado.leiturasInteiras === 1, c.estado.leiturasInteiras)
    ok('  e ZERO consultas por id', c.estado.porId.length === 0, c.estado.porId)
  }

  // ══ tabela pequena e chamado INEXISTENTE: ainda assim nenhuma consulta ══
  //
  // Conversa apontando para chamado apagado existe, e é o caso que separa
  // "preenche quando a leitura cortou" de "preenche sempre que falta algo".
  // Preenchendo sempre, esta conversa geraria uma consulta por id em TODA
  // chamada da lista — a cada 10 s, por pessoa, para um chamado que não existe.
  {
    const conversas = [{
      id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', status: 'open',
      ticket_id: 'T_APAGADO', updated_at: iso(1), created_at: iso(2),
    }]
    const c = cenario({ quantosChamados: 10, conversas })
    const r = await lista(c.ctx)
    ok('tabela não cortada com chamado inexistente: ZERO consultas por id',
      c.estado.porId.length === 0, c.estado.porId)
    ok('  e a conversa aparece sem vínculo', primeira(r) && primeira(r).ticket === null,
      primeira(r) && primeira(r).ticket)
  }

  // ══ tabela cortada, vínculo DENTRO da janela: também sem consulta extra ═
  {
    const c = cenario({ quantosChamados: 600, dentroDaJanela: true })
    const r = await lista(c.ctx)
    ok('tabela cortada com o vínculo dentro: aparece',
      primeira(r) && primeira(r).ticket && primeira(r).ticket.id === 'T_VINCULO', primeira(r) && primeira(r).ticket)
    ok('  sem consulta por id, porque já estava no índice', c.estado.porId.length === 0, c.estado.porId)
  }

  // ══ O CASO DO DEFEITO: vínculo FORA da janela de 500 ══════════════════
  {
    const c = cenario({ quantosChamados: 800, dentroDaJanela: false })
    const r = await lista(c.ctx)
    const t = primeira(r) && primeira(r).ticket
    ok('vínculo FORA da janela de 500: volta a aparecer', t && t.id === 'T_VINCULO', t)
    ok('  com o título e o número certos',
      t && t.title === 'O chamado da conversa' && t.ticket_number === 777, t)
    ok('  buscado por id, uma vez só', c.estado.porId.join(',') === 'T_VINCULO', c.estado.porId)
    ok('  e a leitura inteira continua sendo uma', c.estado.leiturasInteiras === 1, c.estado.leiturasInteiras)
  }

  // ══ o teto dos avulsos: 80 faltando, 60 buscados ══════════════════════
  {
    const conversas = []
    for (let i = 0; i < 80; i++) {
      conversas.push({
        id: 'c' + i, remote_jid: '55199999' + String(10000 + i) + '@s.whatsapp.net',
        status: 'open', ticket_id: 'FALTANTE' + i, updated_at: iso(1), created_at: iso(2),
      })
    }
    const c = cenario({ quantosChamados: 600, dentroDaJanela: false, conversas })
    await lista(c.ctx)
    ok('80 chamados faltando: busca no máximo 60', c.estado.porId.length === 60, c.estado.porId.length)
    ok('  sem repetir id', new Set(c.estado.porId).size === 60, new Set(c.estado.porId).size)
  }

  // ══ conversa sem chamado não gera consulta ════════════════════════════
  {
    const conversas = [{ id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', status: 'open', updated_at: iso(1), created_at: iso(2) }]
    const c = cenario({ quantosChamados: 800, dentroDaJanela: false, conversas })
    const r = await lista(c.ctx)
    ok('conversa sem chamado: nenhuma consulta por id', c.estado.porId.length === 0, c.estado.porId)
    ok('  e a conversa aparece sem vínculo', primeira(r) && primeira(r).ticket === null, primeira(r) && primeira(r).ticket)
  }

  // ══ busca que falha não derruba a lista ═══════════════════════════════
  {
    const c = cenario({ quantosChamados: 800, dentroDaJanela: false })
    c.ctx.models.Ticket.findById = async (id) => { c.estado.porId.push(String(id)); throw new Error('banco fora') }
    const r = await lista(c.ctx)
    ok('consulta por id que falha: a lista continua respondendo', r.status === 200, r.status)
    ok('  e a conversa aparece sem vínculo, como hoje',
      primeira(r) && primeira(r).ticket === null, primeira(r) && primeira(r).ticket)
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
