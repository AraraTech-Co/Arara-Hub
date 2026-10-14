// A escala continua certa quando a tabela passa do limite de leitura.
//
// As rotas da escala achavam o dia varrendo a tabela inteira (`findMany({})`) e
// procurando a data na memória. Essa leitura vem TRUNCADA, e o dia que fica
// fora da parte lida não existe para quem pergunta:
//   - salvar não acha o registro do dia e grava um SEGUNDO plantão para a
//     mesma noite — o defeito que a própria rota diz ter corrigido;
//   - o on-call responde "ninguém" com a escala gravada;
//   - a listagem mostra o dia VAZIO, e quem preenchesse o mês gravaria em cima
//     de alguém já escalado.
// Agora cada rota procura o dia POR DATA, e a varredura é o último recurso.
//
// O modelo falso abaixo imita o corte: leitura sem filtro devolve só os
// primeiros N; leitura por data devolve o registro exato, venha de onde vier.
//
// Roda com: node escala-teto-500.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const TETO = 500
/** Um instante dentro da janela de plantão em qualquer dia da semana (19h em São Paulo). */
const QUANDO = '2026-10-14T22:00:00Z'
const DIA = '2026-10-14'

const salvar = carregarHandler('317 schedules POST /schedules ')
const listar = carregarHandler('311 schedules GET /schedules ')
const onCall = carregarHandler('316 schedules GET /schedules/on-call')
const apagar = carregarHandler('309 schedules DELETE /schedules/:id')

/**
 * Modelo falso com o mesmo corte da leitura real.
 *
 * `linhas` é o banco; `findMany({})` devolve só os primeiros `TETO`, como em
 * produção. Registra toda chamada, para o teste provar o que NÃO aconteceu.
 */
function modeloComTeto(linhas) {
  const chamadas = []
  return {
    chamadas,
    findMany: async (filtro) => {
      const f = filtro || {}
      const chaves = Object.keys(f)
      if (!chaves.length) { chamadas.push(['findMany', 'sem-filtro']); return linhas.slice(0, TETO) }
      if (chaves.length === 1 && f.date) { chamadas.push(['findMany', f.date]); return linhas.filter((l) => l.date === f.date) }
      // Filtro que o modelo real não suporta: devolve vazio, como ele faria.
      chamadas.push(['findMany', 'filtro-desconhecido']); return []
    },
    create: async (r) => { chamadas.push(['create', r.date]); const novo = Object.assign({ id: 'criado_1' }, r); linhas.push(novo); return novo },
    update: async (id, p) => {
      chamadas.push(['update', id])
      const i = linhas.findIndex((l) => l.id === id)
      linhas[i] = Object.assign({}, linhas[i], p)
      return linhas[i]
    },
    delete: async (id) => { chamadas.push(['delete', id]); return true },
  }
}

/** 500 registros de outros dias, e o dia do teste no fim — fora da parte lida. */
function bancoComDiaForaDoCorte() {
  const linhas = []
  for (let i = 0; i < TETO; i++) {
    linhas.push({
      id: 'antigo_' + i, kind: 'plantao', date: '2020-01-' + String((i % 28) + 1).padStart(2, '0'),
      agent_ids: ['u_antigo'], backup_ids: [], notes: null,
    })
  }
  linhas.push({ id: 'alvo_1', kind: 'plantao', date: DIA, agent_ids: ['u1'], backup_ids: ['u2'], notes: null })
  return linhas
}

function ctxDe(model, { body = {}, query = {}, params = {} } = {}) {
  return {
    params, query, body, headers: {},
    user: { id: 'adm' },
    models: {
      SupportSchedule: model,
      Profile: {
        findById: async () => ({ id: 'adm', role: 'admin' }),
        findMany: async () => [
          { id: 'u1', full_name: 'Plantonista Um', email: 'u1@arara-tech.com', phone: '5511999990001' },
          { id: 'u2', full_name: 'Backup Dois', email: 'u2@arara-tech.com', phone: '5511999990002' },
          { id: 'adm', full_name: 'Admin', email: 'adm@arara-tech.com', phone: '5511999990003' },
        ],
      },
      SystemSettings: { findMany: async () => [] },
      Sessao: { findById: async () => null },
    },
    reply: reply(),
  }
}

const porNome = (m, nome) => m.chamadas.filter((c) => c[0] === nome)
const dados = (r) => (r.body && r.body.data) || null

;(async () => {
  // ── salvar: o dia fora do corte é ATUALIZADO, não duplicado ──────────────
  {
    const linhas = bancoComDiaForaDoCorte()
    const model = modeloComTeto(linhas)
    const r = await salvar(ctxDe(model, { body: { date: DIA, agent_ids: ['u2'], backup_ids: ['u1'] } }))
    ok('salvar: responde sem erro', r.status === 200 || r.status === 201, { status: r.status, body: r.body })
    ok('  atualiza o registro que existe', porNome(model, 'update').length === 1
      && porNome(model, 'update')[0][1] === 'alvo_1', model.chamadas.slice(-3))
    ok('  e NÃO cria um segundo plantão para o mesmo dia', porNome(model, 'create').length === 0, model.chamadas)
    ok('  o banco continua com um registro para o dia',
      linhas.filter((l) => l.kind === 'plantao' && l.date === DIA).length === 1,
      linhas.filter((l) => l.date === DIA))
    ok('  achou por data, sem precisar da varredura',
      porNome(model, 'findMany').some((c) => c[1] === DIA), model.chamadas)
  }

  // ── on-call: acha o plantão de hoje fora do corte ────────────────────────
  {
    const model = modeloComTeto(bancoComDiaForaDoCorte())
    const r = await onCall(ctxDe(model, { query: { em: QUANDO } }))
    const d = dados(r)
    ok('on-call: responde 200', r.status === 200, { status: r.status, body: r.body })
    ok('  o dia de referência é o esperado', d && d.agora && d.agora.data === DIA, d && d.agora)
    ok('  está dentro da janela de plantão', d && d.agora.em_plantao === true, d && d.agora)
    ok('  acha o plantão do dia', d && d.plantao_do_dia && d.plantao_do_dia.date === DIA, d && d.plantao_do_dia)
    ok('  e avisa a pessoa escalada', d && d.avisar.length === 1 && d.avisar[0].id === 'u1', d && d.avisar)
    ok('  com o backup do dia', d && d.backup_do_dia.length === 1 && d.backup_do_dia[0].id === 'u2', d && d.backup_do_dia)
  }

  // ── listar: o dia fora do corte aparece no intervalo ─────────────────────
  {
    const model = modeloComTeto(bancoComDiaForaDoCorte())
    const r = await listar(ctxDe(model, { query: { from: '2026-10-01', to: '2026-10-31' } }))
    const d = dados(r)
    ok('listar: responde 200', r.status === 200, { status: r.status, body: r.body })
    ok('  traz o dia que ficou fora da varredura',
      Array.isArray(d) && d.some((x) => x.date === DIA), d)
    const dia = (d || []).find((x) => x.date === DIA)
    ok('  com as pessoas do dia', dia && dia.agent_ids.length === 1 && dia.backup_ids.length === 1, dia)
    ok('  consultando por data só os dias que faltaram',
      porNome(model, 'findMany').filter((c) => c[1] !== 'sem-filtro').length === 31, model.chamadas.length)
  }

  // ── listar: cabendo na varredura, nenhuma consulta extra ────────────────
  {
    const linhas = [{ id: 'so_um', kind: 'plantao', date: DIA, agent_ids: ['u1'], backup_ids: [], notes: null }]
    const model = modeloComTeto(linhas)
    const r = await listar(ctxDe(model, { query: { from: '2026-10-01', to: '2026-10-31' } }))
    ok('listar (tabela pequena): responde 200', r.status === 200, { status: r.status })
    ok('  traz o dia', (dados(r) || []).some((x) => x.date === DIA), dados(r))
    ok('  e NÃO faz consulta por data nenhuma',
      porNome(model, 'findMany').length === 1 && porNome(model, 'findMany')[0][1] === 'sem-filtro', model.chamadas)
  }

  // ── intervalo com data que não existe: responde, não estoura ────────────
  // `_soData` é só um padrão de texto: mês 00 e dia 32 passam por ele. Andar
  // por esses valores estourava o laço FORA do try, e a resposta virava erro
  // de servidor em vez de uma lista.
  // `semConsultas: true` é o valor que nem chega a ser um instante: aí não há
  // intervalo para percorrer e a varredura é a única leitura. Já `2026-02-31` o
  // próprio runtime normaliza para 03/03 — o intervalo existe, as consultas
  // acontecem, e o que importa é que a resposta sai.
  for (const [nome, query, semConsultas] of [
    ['mês 00 no from', { from: '2026-00-10', to: '2026-10-31' }, true],
    ['dia 32 no from', { from: '2026-10-32', to: '2026-11-30' }, true],
    ['texto no lugar da data', { from: 'ontem', to: 'hoje' }, true],
    ['dia 31 em fevereiro (o runtime normaliza)', { from: '2026-02-31', to: '2026-03-31' }, false],
  ]) {
    const model = modeloComTeto(bancoComDiaForaDoCorte())
    let r = null
    let estourou = null
    try { r = await listar(ctxDe(model, { query })) } catch (e) { estourou = e }
    ok(`listar com ${nome}: responde em vez de estourar`,
      !estourou && r && r.status === 200, estourou ? String(estourou.message) : { status: r && r.status })
    const lista = r ? dados(r) : null
    ok('  e devolve uma lista', Array.isArray(lista), estourou ? 'estourou antes de responder' : lista)
    const extras = porNome(model, 'findMany').filter((c) => c[1] !== 'sem-filtro').length
    if (semConsultas) ok('  sem consulta por data nenhuma', extras === 0, extras)
    else ok('  consultando as datas do intervalo normalizado', extras > 0 && extras <= 62, extras)
  }

  // ── apagar por data: acha o dia fora do corte ───────────────────────────
  {
    const model = modeloComTeto(bancoComDiaForaDoCorte())
    const r = await apagar(ctxDe(model, { query: { date: DIA } }))
    ok('apagar por data: responde 200', r.status === 200, { status: r.status, body: r.body })
    ok('  apaga o registro certo', porNome(model, 'delete').length === 1
      && porNome(model, 'delete')[0][1] === 'alvo_1', model.chamadas.slice(-2))
  }

  // ── as rotas sem uso respondem 410 e não tocam na escala ────────────────
  const DESATIVADAS = [
    ['310 schedules DELETE /schedules/daily', {}],
    ['318 schedules POST /schedules/daily', { body: { date: DIA, agent_ids: ['u1'] } }],
    ['319 schedules POST /schedules/generate', { body: { date: DIA, agent_ids: ['u1'] } }],
    ['320 schedules PUT /schedules/:id', { params: { id: 'alvo_1' }, body: { agent_ids: [] } }],
  ]
  for (const [marca, extra] of DESATIVADAS) {
    const h = carregarHandler(marca)
    const linhas = bancoComDiaForaDoCorte()
    const model = modeloComTeto(linhas)
    const r = await h(ctxDe(model, extra))
    const nome = marca.split(' ').slice(0, 1).concat(marca.split(' ').slice(2)).join(' ')
    ok(`${nome}: responde 410`, r.status === 410, { status: r.status, body: r.body })
    ok('  e não escreve nada na escala',
      porNome(model, 'create').length === 0 && porNome(model, 'update').length === 0
      && porNome(model, 'delete').length === 0, model.chamadas)
    ok('  o registro do dia fica intacto',
      JSON.stringify(linhas[linhas.length - 1].agent_ids) === JSON.stringify(['u1']),
      linhas[linhas.length - 1])
  }

  // A guarda de sessão continua na frente: sem pessoa, nem 410 se alcança.
  {
    const model = modeloComTeto(bancoComDiaForaDoCorte())
    const ctx = ctxDe(model, {})
    ctx.user = {}
    const r = await carregarHandler('319 schedules POST /schedules/generate')(ctx)
    ok('rota desativada sem sessão: 401, não 410', r.status === 401, { status: r.status, body: r.body })
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
