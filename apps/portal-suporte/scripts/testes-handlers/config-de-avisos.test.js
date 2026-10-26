// Configuração dos avisos (prazo e três textos) — rotas do painel e os três envios que a leem.
//
// O QUE SE GARANTE:
//   1. O bloco de configuração é IDÊNTICO nas seis rotas que o carregam (entrada, varredura,
//      backup, GET, PUT, prévia): são strings compiladas separadas, sem módulo comum.
//   2. Sem configuração, as mensagens são as de hoje, byte a byte (reserva); texto vazio, variável
//      desconhecida ou que não resolve cai na reserva: nunca sai `{{nome}}` literal.
//   3. Painel: só admin; PUT recusa prazo fora de 0–240 ou não inteiro, texto > 600, `{{link}}`,
//      variável de outro texto e chave solta; `null` (vazio) e `0` (na hora) são gravados diferentes;
//      texto igual ao padrão não é gravado; o que não veio no corpo não muda.
//   4. Entrada e varredura CONCORDAM: mesmo estado e mesma configuração, mesma mensagem e mesma
//      decisão de avisar ou esperar (prazo do painel vence o do card, inclusive o zero).
//   5. Backup usa o texto configurado, com o link sempre ao fim e o telefone com e sem o nono dígito.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Nada sai para a Avisa: `ctx.fetch` é interceptado.
// Roda com: node config-de-avisos.test.js
const fs = require('fs')
const vm = require('vm')
const { carregarHandler, carregarHandlerEContexto, carregarContexto, reply, ok, fim, ARQ } = require('./_carregar.js')

const MARCAS = {
  entrada: '485 whatsapp POST /whatsapp/inbound',
  varredura: '490m whatsapp POST /whatsapp/plantao/varrer',
  backup: '490l whatsapp POST /whatsapp/:id/backup',
  get: '490n whatsapp GET /whatsapp/avisos (',
  put: '490n whatsapp PUT /whatsapp/avisos (',
  previa: '490n whatsapp POST /whatsapp/avisos/previa',
}
function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}
const INI = '// ── Configuração de avisos (21/10/2026)'
const FIM = '// ── fim da configuração de avisos'
const blocoDe = (cod) => { const i = cod.indexOf(INI), f = cod.indexOf(FIM); return i < 0 || f < 0 ? null : cod.slice(i, f) }

const HORARIO = {
  fuso: 'America/Sao_Paulo',
  plantao: { 1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']], 4: [['18:00', '22:00']], 5: [['18:00', '22:00']], 6: [['08:00', '22:00']], 0: [['08:00', '22:00']] },
}
const TOKEN = 'a'.repeat(64)
const DENTRO = new Date('2026-10-12T23:00:00Z').getTime()          // segunda 20h
const comRelogio = (t, fn) => { const real = Date.now; Date.now = () => t; return Promise.resolve(fn()).finally(() => { Date.now = real }) }
const PERFIS = [
  { id: 'ana', full_name: 'Ana', phone: '5519999990001', role: 'admin' },
  { id: 'sup', full_name: 'Suporte', phone: '5519999990002', role: 'support' },
  { id: 'carlos', full_name: 'Carlos', phone: '5519999990003', role: 'developer' },
]
const ESCALA = [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['carlos'] }]

function mundo({ wa = null, conversas = [], conv = null, card = 0 } = {}) {
  const estado = { linha: { id: 's1', waMenuEnabled: true, waHorario: JSON.stringify(HORARIO), ...(wa !== null ? { wa_avisos: wa } : {}) }, conversas: conversas.map((c) => ({ ...c })), enviadas: [], eventos: [], gravacoes: [], conv: conv && { ...conv } }
  return {
    estado,
    models: {
      WhatsAppConversation: {
        findById: async (id) => (estado.conv && estado.conv.id === id ? estado.conv : estado.conversas.find((c) => c.id === id) || null),
        findMany: async (a) => { const ch = Object.keys(a || {}); return (estado.conv ? [estado.conv] : estado.conversas).filter((c) => ch.every((k) => String(c[k] ?? '') === String(a[k]))) },
        update: async (id, p) => { const c = estado.conv || estado.conversas.find((x) => x.id === id); if (c) Object.assign(c, p) },
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: {
        findMany: async () => [estado.linha],
        update: async (id, p) => { estado.gravacoes.push(p); Object.assign(estado.linha, p) },
        create: async (p) => { estado.gravacoes.push(p); Object.assign(estado.linha, p) },
      },
      SupportSchedule: { findMany: async () => ESCALA },
      Profile: { findMany: async () => PERFIS, findById: async (id) => PERFIS.find((p) => p.id === id) || null },
      WaConversationEvents: { findMany: async () => estado.eventos, create: async (e) => { estado.eventos.push(e); return e } },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: { root: 'at', nodes: [{ id: 'at', type: 'handoff', data: { text: 'Já avisamos a equipe.', avisarApos: card } }], edges: [] } }] },
      Sessao: { findById: async () => null },
    },
    fetch: async (url, o) => { estado.enviadas.push(JSON.parse(o.body)); return { status: 200, body: '{}' } },
  }
}
const ctxDe = (m, extra = {}) => Object.assign({ params: {}, query: {}, body: {}, headers: {}, user: { id: 'ana' }, models: m.models, secrets: { get: async () => 'tok' }, fetch: m.fetch, reply: reply() }, extra)
const esperando = (id, desde, extra = {}) => Object.assign({ id, remote_jid: '5519' + id + '@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Cliente ' + id, aguardando_desde: desde }, extra)
// o que foi para o celular do plantonista (Ana); o que o fluxo diz ao cliente fica de fora
const soAvisos = (l) => l.filter((e) => String(e.number).startsWith('55199999900')).map((e) => e.message)

;(async () => {
  // ── 1. blocos idênticos ──
  const blocos = Object.fromEntries(Object.entries(MARCAS).map(([k, v]) => [k, blocoDe(codigoDe(v))]))
  ok('as seis rotas carregam o bloco de configuração', Object.values(blocos).every((b) => b && b.length > 500), Object.fromEntries(Object.entries(blocos).map(([k, b]) => [k, b && b.length])))
  ok('o bloco é IDÊNTICO nas seis', new Set(Object.values(blocos)).size === 1, Object.entries(blocos).map(([k, b]) => [k, b && b.length]))

  // ── 2. render ──
  const av = new Function(blocos.get + '\n' + FIM + '\nreturn { _avRenderizar, _avLerConfig, _AV_PADRAO }')()
  const R = (chave, t, v) => av._avRenderizar(chave, t, v)
  const P = av._AV_PADRAO
  ok('padrão da conversa única = texto de hoje', R('texto_uma', P.texto_uma, { nome: 'Ana', desde: '12:30' }) === 'Plantão Arara Tech: Ana (desde 12:30) aguarda atendimento.')
  ok('  sem horário não deixa "(desde )"', R('texto_uma', P.texto_uma, { nome: 'Ana', desde: '' }) === 'Plantão Arara Tech: Ana aguarda atendimento.')
  ok('padrão de várias = texto de hoje', R('texto_varias', P.texto_varias, { quantas: 3, lista: '• A\n• B' }) === 'Plantão Arara Tech: 3 conversas aguardam atendimento.\n\n• A\n• B')
  ok('padrão do backup = texto de hoje, e sem empresa não deixa "()"', R('texto_backup', P.texto_backup, { quem_pediu: 'Ana', nome: 'C', empresa: '' }) === 'Plantão Arara Tech: Ana pede intervenção técnica — C')
  ok('texto vazio cai na reserva', R('texto_uma', '   ', { nome: 'Ana', desde: '1' }) === R('texto_uma', P.texto_uma, { nome: 'Ana', desde: '1' }))
  ok('variável desconhecida cai na reserva (nunca sai literal)', !/\{\{/.test(R('texto_uma', 'oi {{foo}} {{nome}}', { nome: 'Ana', desde: '1' })))
  ok('variável de OUTRO texto cai na reserva', !/\{\{/.test(R('texto_uma', '{{quantas}} aguardam', { nome: 'Ana', desde: '1' })))
  ok('texto próprio com variáveis certas é usado', R('texto_uma', 'Atenção: {{nome}} desde {{desde}}', { nome: 'Ana', desde: '12:30' }) === 'Atenção: Ana desde 12:30')
  ok('prazo vazio e zero são coisas diferentes ao ler', av._avLerConfig({ wa_avisos: { prazo_min: null } }).prazo_min === null && av._avLerConfig({ wa_avisos: { prazo_min: 0 } }).prazo_min === 0)
  ok('prazo fora de 0–240 lido como vazio', av._avLerConfig({ wa_avisos: { prazo_min: 999 } }).prazo_min === null && av._avLerConfig({ wa_avisos: { prazo_min: -1 } }).prazo_min === null)

  // ── 3. painel ──
  const get = carregarHandler(MARCAS.get), put = carregarHandler(MARCAS.put), previa = carregarHandler(MARCAS.previa)
  let m = mundo()
  let r = await get(ctxDe(m, { user: { id: 'sup' } }))
  ok('GET: suporte não passa (403)', r.status === 403, r.status)
  r = await get(ctxDe(m, { user: {} }))
  ok('GET: sem sessão não passa (401 da guarda ou 403)', r.status === 401 || r.status === 403, r.status)
  r = await get(ctxDe(m))
  ok('GET: admin lê a configuração, o padrão, as variáveis e a prévia', r.status === 200 && r.body.data.config.prazo_min === null && r.body.data.padrao.texto_uma === P.texto_uma && r.body.data.variaveis.texto_backup.includes('quem_pediu') && r.body.data.previa.texto_uma.tamanho > 20, r.body)
  ok('  a prévia termina no link', /inbox\?c=exemplo$/.test(r.body.data.previa.texto_uma.texto) && /\/inbox$/.test(r.body.data.previa.texto_varias.texto))
  r = await put(ctxDe(m, { user: { id: 'sup' }, body: { prazo_min: 5 } }))
  ok('PUT: suporte não grava (403)', r.status === 403 && m.estado.gravacoes.length === 0, r.status)
  for (const [nome, corpo] of [['prazo negativo', { prazo_min: -1 }], ['prazo 241', { prazo_min: 241 }], ['prazo fracionado', { prazo_min: 1.5 }], ['prazo texto', { prazo_min: 'abc' }], ['texto com {{link}}', { texto_uma: 'veja {{link}}' }], ['variável de outro texto', { texto_uma: '{{quantas}}' }], ['chave solta', { texto_uma: 'oi }} {{nome}}' }], ['texto acima do máximo', { texto_uma: 'x'.repeat(601) }], ['texto não é string', { texto_uma: 5 }]]) {
    const mm = mundo(); const rr = await put(ctxDe(mm, { body: corpo }))
    ok(`PUT recusa ${nome} e não grava`, rr.status === 400 && mm.estado.gravacoes.length === 0, { s: rr.status, e: rr.body && rr.body.error })
  }
  r = await put(ctxDe(mundo(), { body: { texto_uma: 'veja {{ Link }}' } }))
  ok('  e o erro do {{link}} diz que o link entra sozinho ao fim', /acrescentado automaticamente/.test(r.body.error), r.body.error)
  m = mundo(); r = await put(ctxDe(m, { body: { prazo_min: 0 } }))
  ok('PUT: zero é gravado como 0 (na hora)', r.status === 200 && m.estado.linha.wa_avisos.prazo_min === 0, m.estado.linha.wa_avisos)
  r = await put(ctxDe(m, { body: { prazo_min: '' } }))
  ok('  vazio é gravado como null (vale o prazo do card)', m.estado.linha.wa_avisos.prazo_min === null, m.estado.linha.wa_avisos)
  r = await put(ctxDe(m, { body: { prazo_min: 15, texto_uma: 'Alerta: {{nome}}' } }))
  ok('  texto e prazo próprios são gravados, com versão e autor', m.estado.linha.wa_avisos.prazo_min === 15 && m.estado.linha.wa_avisos.texto_uma === 'Alerta: {{nome}}' && m.estado.linha.wa_avisos.versao === 3 && m.estado.linha.wa_avisos.atualizado_por === 'ana', m.estado.linha.wa_avisos)
  r = await put(ctxDe(m, { body: { texto_backup: 'Chamado: {{quem_pediu}}' } }))
  ok('  o que não veio no corpo não muda', m.estado.linha.wa_avisos.prazo_min === 15 && m.estado.linha.wa_avisos.texto_uma === 'Alerta: {{nome}}' && m.estado.linha.wa_avisos.texto_backup === 'Chamado: {{quem_pediu}}', m.estado.linha.wa_avisos)
  r = await put(ctxDe(m, { body: { texto_uma: P.texto_uma } }))
  ok('  texto igual ao padrão não é gravado (volta a seguir o padrão do código)', m.estado.linha.wa_avisos.texto_uma === '' && r.body.data.config.texto_uma === P.texto_uma, m.estado.linha.wa_avisos)
  r = await get(ctxDe(m))
  ok('  GET devolve o que o PUT gravou', r.body.data.config.prazo_min === 15 && r.body.data.config.texto_backup === 'Chamado: {{quem_pediu}}', r.body.data.config)
  r = await previa(ctxDe(m, { body: { texto_uma: 'Oi {{nome}} ({{desde}})', texto_varias: '{{foo}}' } }))
  ok('prévia: devolve o texto e o tamanho, e o erro por campo', r.body.data.previa.texto_uma.texto.startsWith('Oi Maria Silva (18:12)') && r.body.data.previa.texto_uma.tamanho === r.body.data.previa.texto_uma.texto.length && /não existe/.test(r.body.data.previa.texto_varias.erro), r.body)
  r = await previa(ctxDe(mundo(), { user: { id: 'sup' }, body: { texto_uma: 'x' } }))
  ok('prévia: suporte não passa (403)', r.status === 403, r.status)

  // ── 4. entrada e varredura concordam ──
  const { handler: varrer, contexto: ctxVm } = carregarHandlerEContexto(MARCAS.varredura)
  Object.defineProperty(ctxVm, '__araraAgendadorToken', { value: TOKEN, enumerable: false, writable: false, configurable: true })
  const _triagem = carregarContexto(MARCAS.entrada)._triagem
  async function ambos(wa, conversas) {
    const a = mundo({ wa, conversas }), b = mundo({ wa, conversas })
    await comRelogio(DENTRO, () => varrer(ctxDe(a, { agendadorInterno: TOKEN, user: { type: 'agendador' } })))
    await comRelogio(DENTRO, async () => { await _triagem({ models: b.models, secrets: { get: async () => 'tok' }, fetch: b.fetch }, b.estado.conversas[0], 'oi') })
    return { rota: soAvisos(a.estado.enviadas), entrada: soAvisos(b.estado.enviadas) }
  }
  const tres = () => [esperando('c1', '2026-10-12T21:00:00Z'), esperando('c2', '2026-10-12T21:30:00Z'), esperando('c3', '2026-10-12T22:00:00Z')]
  const um = () => [esperando('c1', '2026-10-12T21:00:00Z')]
  let x = await ambos({ texto_varias: 'ALERTA: {{quantas}} esperando\n{{lista}}' }, tres())
  ok('várias: texto próprio, igual nos dois caminhos', x.rota.length === 1 && x.rota[0] === x.entrada[0] && x.rota[0].startsWith('ALERTA: 3 esperando\n• Cliente c1 (desde 18:00)') && x.rota[0].endsWith('\n\nhttps://suporte.arara-tech.com/inbox'), x)
  x = await ambos({ texto_uma: 'Fila: {{nome}} às {{desde}}' }, um())
  ok('uma: texto próprio, igual nos dois caminhos, com link da conversa', x.rota.length === 1 && x.rota[0] === x.entrada[0] && x.rota[0] === 'Fila: Cliente c1 às 18:00\n\nhttps://suporte.arara-tech.com/inbox?c=c1', x)
  x = await ambos(null, tres())
  ok('sem configuração: mensagem de hoje, igual nos dois', x.rota[0] === x.entrada[0] && x.rota[0].startsWith('Plantão Arara Tech: 3 conversas aguardam atendimento.\n\n• Cliente c1 (desde 18:00)'), x)
  // A hora do "(desde …)" é a do RELÓGIO DA EMPRESA, não a do ISO em UTC: 21:00Z = 18:00 em Brasília.
  // O fuso vem da configuração (`waHorario`), o mesmo do horário comercial: com Manaus (-04) a mesma
  // espera é 17:00, nos dois caminhos.
  x = await ambos({ texto_uma: 'Fila: {{nome}} às {{desde}}' }, [esperando('c1', '2026-10-12T11:00:00Z')])
  ok('hora do relato: 11:00Z aparece como 08:00 (não 11:00), nos dois caminhos', x.rota[0] === x.entrada[0] && x.rota[0].startsWith('Fila: Cliente c1 às 08:00'), x)
  {
    const em = (fuso) => async (conversas) => {
      const a = mundo({ conversas }), b = mundo({ conversas })
      for (const w of [a, b]) w.estado.linha.waHorario = JSON.stringify({ ...HORARIO, fuso })
      await comRelogio(DENTRO, () => varrer(ctxDe(a, { agendadorInterno: TOKEN, user: { type: 'agendador' } })))
      await comRelogio(DENTRO, async () => { await _triagem({ models: b.models, secrets: { get: async () => 'tok' }, fetch: b.fetch }, b.estado.conversas[0], 'oi') })
      return { rota: soAvisos(a.estado.enviadas), entrada: soAvisos(b.estado.enviadas) }
    }
    const manaus = await em('America/Manaus')([esperando('c1', '2026-10-12T21:00:00Z')])
    ok('fuso da configuração manda: com America/Manaus a espera de 21:00Z é 17:00, nos dois caminhos',
      manaus.rota.length === 1 && manaus.rota[0] === manaus.entrada[0] && /\(desde 17:00\)/.test(manaus.rota[0]), manaus)
  }
  x = await ambos({ texto_uma: '{{foo}}' }, um())
  ok('texto quebrado: reserva nos dois, sem chave literal', x.rota.length === 1 && !/\{\{/.test(x.rota[0]) && x.rota[0] === x.entrada[0], x)
  // prazo: espera desde 22:00Z = 19h SP; agora 20h SP = 60 min
  const cardTrinta = () => [esperando('c1', '2026-10-12T22:50:00Z', { aviso_plantao_apos_min: 30 })]
  x = await ambos({ prazo_min: 0 }, cardTrinta())
  ok('prazo 0 no painel: avisa na hora, nos dois', x.rota.length === 1 && x.entrada.length === 1, x)
  x = await ambos(null, cardTrinta())
  ok('prazo vazio: avisa na hora, nos dois (o campo legado da conversa não conta mais)', x.rota.length === 1 && x.entrada.length === 1, x)
  x = await ambos({ prazo_min: 15 }, [esperando('c1', '2026-10-12T22:50:00Z')])
  ok('prazo 15 no painel: 10 min de espera não avisa, nos dois', x.rota.length === 0 && x.entrada.length === 0, x)
  x = await ambos({ prazo_min: 15 }, [esperando('c1', '2026-10-12T22:40:00Z')])
  ok('  e com 20 min de espera avisa, nos dois', x.rota.length === 1 && x.entrada.length === 1, x)

  // ── 5. backup ──
  const chamar = carregarHandler(MARCAS.backup)
  const CONV = { id: 'c1', remote_jid: '5519988887777@s.whatsapp.net', status: 'open', assigned_to_id: 'ana', contact_name: 'Cliente Teste', company_name: 'Empresa X' }
  const bm = mundo({ wa: { texto_backup: 'URGENTE de {{quem_pediu}}: {{nome}} / {{empresa}}' }, conv: CONV })
  r = await comRelogio(DENTRO, () => chamar(ctxDe(bm, { params: { id: 'c1' } })))
  ok('backup: usa o texto configurado e o link vai ao fim', bm.estado.enviadas[0] && bm.estado.enviadas[0].message === 'URGENTE de Ana: Cliente Teste / Empresa X\n\nhttps://suporte.arara-tech.com/inbox?c=c1', bm.estado.enviadas[0])
  const bn = mundo({ conv: CONV })
  await comRelogio(DENTRO, () => chamar(ctxDe(bn, { params: { id: 'c1' } })))
  ok('backup sem configuração: texto de hoje', bn.estado.enviadas[0].message === 'Plantão Arara Tech: Ana pede intervenção técnica — Cliente Teste (Empresa X)\n\nhttps://suporte.arara-tech.com/inbox?c=c1', bn.estado.enviadas[0])
  const bf = mundo({ conv: CONV }); bf.fetch = async (u, o) => { const b = JSON.parse(o.body); bf.estado.enviadas.push(b); return { status: b.number === '5519999990003' ? 500 : 200, body: '{}' } }
  await comRelogio(DENTRO, () => chamar(ctxDe(bf, { params: { id: 'c1' } })))
  ok('backup: tenta também a variante sem o nono dígito', bf.estado.enviadas.map((e) => e.number).join(',') === '5519999990003,551999990003', bf.estado.enviadas.map((e) => e.number))

  // ── entrega à pessoa (fluxo termina em atendente): o prazo do painel decide se avisa na hora ──
  async function entrega(wa, card) {
    const w = mundo({ wa, card, conversas: [esperando('n1', undefined, { aguardando_desde: undefined })] })
    await comRelogio(DENTRO, async () => { await _triagem({ models: w.models, secrets: { get: async () => 'tok' }, fetch: w.fetch, body: {} }, w.estado.conversas[0], 'oi') })
    return soAvisos(w.estado.enviadas).length
  }
  ok('entrega ao atendente: sem prazo nenhum, avisa na hora (como hoje)', (await entrega(null, 0)) === 1)
  ok('  prazo do painel 15: não avisa na hora (quem avisa é o relógio)', (await entrega({ prazo_min: 15 }, 0)) === 0)
  ok('  prazo do painel 0, mesmo com card em 30: avisa na hora', (await entrega({ prazo_min: 0 }, 30)) === 1)
  ok('  card com prazo (30) é ignorado: sem prazo no painel, avisa na hora', (await entrega(null, 30)) === 1)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
