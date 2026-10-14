// Fase 2 — POST /whatsapp/conversa/nova (bloco 490n).
//
// Esta rota MANDA WHATSAPP DE VERDADE para o número digitado. Aqui o
// `ctx.fetch` é interceptado: nada sai. O que o teste garante:
//
//  - as DUAS normalizações (app/lib/wa-telefone.ts e a gêmea dentro do
//    handler) concordam sobre a mesma tabela de números. É a única gêmea do
//    projeto que dá para comparar de verdade — as duas rodam neste processo;
//  - a busca pela conversa existente é por FILTRO. O mock FALHA se o handler
//    chamar `findMany({})`: com ~476 conversas e teto de 500, varredura
//    acharia "nada" e criaria duplicata;
//  - envio recusado não deixa conversa órfã na lista.
//
// Roda com: node nova-conversa.test.js
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { carregarHandler, carregarContexto, reply, ok, fim } = require('./_carregar.js')

const nova = carregarHandler('490n whatsapp POST /whatsapp/conversa/nova')
const dentro = carregarContexto('490n whatsapp POST /whatsapp/conversa/nova')

const EU = 'u-ana'
const PERFIL = { id: EU, full_name: 'Ana', role: 'support', active: true }

function cenario({ conversas = [], token = 'tok', respostas = [{ status: 200, body: '{}' }], cfg = {} } = {}) {
  const estado = { conversas: [...conversas], mensagens: [], eventos: [], enviadas: [], varreu: false }
  let i = 0
  return {
    estado,
    models: {
      WhatsAppConversation: {
        findById: async (id) => estado.conversas.find((c) => c.id === id) || null,
        findMany: async (arg) => {
          const chaves = Object.keys(arg || {})
          // A ARMADILHA: varredura é defeito, não estilo. Marcar e devolver
          // vazio imita o teto de 500 estourado, que é como isso apareceria
          // em produção — silenciosamente.
          if (!chaves.length) { estado.varreu = true; return [] }
          return estado.conversas.filter((c) => chaves.every((k) => String(c[k] ?? '') === String(arg[k])))
        },
        create: async (c) => { estado.conversas.push(c); return c },
        update: async (id, p) => { const c = estado.conversas.find((x) => x.id === id); if (c) Object.assign(c, p) },
      },
      WhatsAppMessage: { create: async (m) => { estado.mensagens.push(m); return m } },
      Profile: { findById: async (id) => (id === EU ? PERFIL : null), findMany: async () => [PERFIL] },
      SystemSettings: { findMany: async () => [cfg] },
      WaConversationEvents: { create: async (e) => { estado.eventos.push(e); return e } },
      Sessao: { findById: async () => null },
    },
    secrets: { get: async () => token },
    fetch: async (url, o) => {
      estado.enviadas.push(JSON.parse(o.body))
      const r = respostas[Math.min(i, respostas.length - 1)]
      i++
      return r
    },
  }
}

const ctxDe = (c, body, extra = {}) => Object.assign({
  params: {}, query: {}, headers: {},
  body,
  user: { id: EU },
  models: c.models,
  secrets: c.secrets,
  fetch: c.fetch,
  reply: reply(),
}, extra)

;(async () => {
  // ══ as duas normalizações concordam ═══════════════════════════════════
  const mod = await import(
    pathToFileURL(path.resolve(__dirname, '../../app/lib/wa-telefone.ts')).href
  )
  const doServidor = dentro._normalizar
  ok('o handler expõe a gêmea para comparação', typeof doServidor === 'function', typeof doServidor)

  const TABELA = [
    '19999990001', '(19) 99999-0001', '+55 19 99999-0001', '5519999990001',
    '551999990001', '1999990001', '11 2345-6789', '199999', '1', '',
    '5511987654321', '120363123456@g.us', '123456789012345@lid',
    '  19 99999 0001  ', '19-99999-0001', '0019999990001',
  ]
  let divergiu = []
  for (const n of TABELA) {
    const a = mod.normalizarTelefoneWhatsapp(n)
    const b = doServidor(n)
    const mesmo = a.ok === b.ok && (a.ok
      ? a.valor.digitos === b.valor.digitos
        && a.valor.jid === b.valor.jid
        && a.valor.variantes.join(',') === b.valor.variantes.join(',')
      : a.motivo === b.motivo)
    if (!mesmo) divergiu.push({ n, front: a, servidor: b })
  }
  ok(`front e servidor normalizam igual nos ${TABELA.length} números`,
    divergiu.length === 0, divergiu.slice(0, 3))

  // E a tabela precisa ter casos dos dois lados, senão "concordam" é vazio.
  const aceitos = TABELA.filter((n) => mod.normalizarTelefoneWhatsapp(n).ok).length
  ok('  com aceitos E recusados na tabela',
    aceitos > 0 && aceitos < TABELA.length, { aceitos, total: TABELA.length })

  // ══ a guarda ══════════════════════════════════════════════════════════
  let c = cenario()
  let r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }, { user: null }))
  ok('sem sessão: 401', r.status === 401, r)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, c.estado.enviadas)

  c = cenario()
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }, {
    user: { id: 'u-cliente' },
    models: Object.assign({}, c.models, {
      Profile: { findById: async () => ({ id: 'u-cliente', role: 'user' }), findMany: async () => [] },
    }),
  }))
  ok('cliente (nível user): 403', r.status === 403, r)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, c.estado.enviadas)

  // ══ número recusado ═══════════════════════════════════════════════════
  for (const [numero, pedaco] of [
    ['199', 'curto demais'],
    ['', 'com DDD'],
    ['120363123456@g.us', 'grupo'],
    ['123456789012345@lid', 'identificador interno'],
  ]) {
    c = cenario()
    r = await nova(ctxDe(c, { telefone: numero, message: 'oi' }))
    ok(`${JSON.stringify(numero)} recusado com motivo em texto`,
      r.status === 400 && String(r.body?.error || '').includes(pedaco),
      { status: r.status, erro: r.body?.error })
    ok('  e nada foi enviado', c.estado.enviadas.length === 0, c.estado.enviadas)
  }

  c = cenario()
  r = await nova(ctxDe(c, { telefone: '19999990001', message: '   ' }))
  ok('sem a primeira mensagem: 400', r.status === 400, r)

  // ══ número da própria conta (quando configurado) ══════════════════════
  c = cenario({ cfg: { waNumeroDaConta: '5519999990001' } })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('o número da própria conta é recusado', r.status === 400
    && String(r.body?.error || '').includes('própria conta'), r.body?.error)
  // E pela variante do nono dígito também — o loop não se abre por um dígito.
  c = cenario({ cfg: { waNumeroDaConta: '5519999990001' } })
  r = await nova(ctxDe(c, { telefone: '551999990001', message: 'oi' }))
  ok('  inclusive na variante do nono dígito', r.status === 400, r.body?.error)
  // Sem a configuração, a recusa não acontece — e isso está dito no PR.
  c = cenario({ cfg: {} })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('  sem waNumeroDaConta configurado, não há como recusar', r.status === 200, r.status)

  // ══ conversa existente: abre, não cria ═══════════════════════════════
  const EXISTENTE = {
    id: 'c-velha', remote_jid: '5519999990001@s.whatsapp.net', status: 'open', phase: 'novo',
  }
  c = cenario({ conversas: [EXISTENTE] })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('número com conversa: devolve a existente', r.body?.data?.id === 'c-velha', r.body?.data)
  ok('  dizendo que é existente', r.body?.data?.existente === true, r.body?.data)
  ok('  SEM enviar nada', c.estado.enviadas.length === 0, c.estado.enviadas)
  ok('  e sem criar conversa', c.estado.conversas.length === 1, c.estado.conversas.length)

  // O caso que o risco do documento aponta: gravada SEM o nono dígito, e o
  // atendente digita COM. Sem procurar as variantes, isto duplicaria.
  c = cenario({ conversas: [{ id: 'c-sem9', remote_jid: '551999990001@s.whatsapp.net', status: 'open' }] })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('gravada sem o nono dígito, digitada com: acha a existente',
    r.body?.data?.id === 'c-sem9' && r.body?.data?.existente === true, r.body?.data)
  ok('  sem duplicar', c.estado.conversas.length === 1, c.estado.conversas.length)

  // E o contrário.
  c = cenario({ conversas: [{ id: 'c-com9', remote_jid: '5519999990001@s.whatsapp.net', status: 'open' }] })
  r = await nova(ctxDe(c, { telefone: '551999990001', message: 'oi' }))
  ok('gravada com o nono dígito, digitada sem: acha a existente',
    r.body?.data?.id === 'c-com9', r.body?.data)

  // ══ A BUSCA É POR FILTRO ═════════════════════════════════════════════
  c = cenario({ conversas: [EXISTENTE] })
  await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('a rota NUNCA varre a tabela de conversas', c.estado.varreu === false,
    { varreu: c.estado.varreu })

  // ══ número novo: cria, atribui, envia, registra ══════════════════════
  c = cenario()
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'Olá, aqui é a Ana do suporte.' }))
  ok('número novo: cria a conversa', r.body?.data?.existente === false, r.body?.data)
  ok('  atribuída a quem criou', c.estado.conversas[0].assigned_to_id === EU, c.estado.conversas[0])
  ok('  em atendimento (vai para "Minhas")', c.estado.conversas[0].phase === 'em_atendimento',
    c.estado.conversas[0].phase)
  ok('  com o jid normalizado', c.estado.conversas[0].remote_jid === '5519999990001@s.whatsapp.net',
    c.estado.conversas[0].remote_jid)
  ok('  a mensagem foi enviada ao número normalizado',
    c.estado.enviadas[0]?.number === '5519999990001', c.estado.enviadas)
  ok('  e gravada como nossa', c.estado.mensagens[0]?.from_me === true
    && c.estado.mensagens[0]?.body === 'Olá, aqui é a Ana do suporte.', c.estado.mensagens[0])
  ok('  conta_id preparado com o default', c.estado.conversas[0].conta_id === 'default',
    c.estado.conversas[0].conta_id)
  const ev = c.estado.eventos.find((e) => e.kind === 'conversa_iniciada_pelo_portal')
  ok('  e o rastro de quem abriu', !!ev && JSON.parse(ev.payload).por === EU, c.estado.eventos)

  // conta_id explícito é respeitado (Fase 3 vai usar; sem UI hoje)
  c = cenario()
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi', conta_id: 'vendas' }))
  ok('conta_id do payload é respeitado', c.estado.conversas[0].conta_id === 'vendas',
    c.estado.conversas[0].conta_id)

  // ══ recusa do provedor: texto do servidor, e sem conversa órfã ═══════
  c = cenario({ respostas: [{ status: 400, body: '{"error":"number not registered on whatsapp"}' }] })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('recusa do provedor: 502', r.status === 502, r.status)
  ok('  com o TEXTO do provedor na resposta',
    String(r.body?.error || '').includes('number not registered'), r.body?.error)
  ok('  e NENHUMA conversa criada', c.estado.conversas.length === 0, c.estado.conversas)
  ok('  nem mensagem gravada', c.estado.mensagens.length === 0, c.estado.mensagens)
  ok('  tendo tentado as duas variantes antes de desistir',
    c.estado.enviadas.length === 2, c.estado.enviadas.map((e) => e.number))

  // Fora da janela de 24 h é uma recusa como as outras — o texto sobe.
  c = cenario({ respostas: [{ status: 403, body: '{"message":"outside the 24 hour customer service window"}' }] })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('fora da janela de 24 h: o motivo chega à tela',
    String(r.body?.error || '').includes('24 hour'), r.body?.error)

  // A segunda variante dando certo: a conversa fica com o número que FUNCIONOU
  c = cenario({ respostas: [{ status: 400, body: '{"error":"nope"}' }, { status: 200, body: '{}' }] })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('se só a variante atende, a conversa guarda o número que funcionou',
    c.estado.conversas[0]?.remote_jid === '551999990001@s.whatsapp.net',
    c.estado.conversas[0]?.remote_jid)
  const ev2 = JSON.parse(c.estado.eventos[0].payload)
  ok('  e o rastro diz que foi pela variante', ev2.variante_do_nono_digito === true, ev2)

  // ══ sem token: não finge que enviou ══════════════════════════════════
  c = cenario({ token: null })
  r = await nova(ctxDe(c, { telefone: '19999990001', message: 'oi' }))
  ok('sem token da conta: 503 e nada criado',
    r.status === 503 && c.estado.conversas.length === 0, { status: r.status, convs: c.estado.conversas.length })

  fim()
})()
