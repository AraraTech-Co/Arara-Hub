// O perímetro do portal, medido por COMPORTAMENTO: toda rota publicada é
// chamada com uma credencial de aplicativo SEM pessoa e tem de recusar (401 ou
// 403). As que podem responder sem pessoa estão nomeadas em PUBLICAS, uma a
// uma, com o motivo.
//
// POR QUE POR COMPORTAMENTO, e não por texto. O conferir-guarda.py procura a
// MARCA da guarda no código da rota, e marca presente não é guarda aplicada: o
// invólucro pode estar definido no corpo e a exportação entregar o handler cru,
// o que acontece sozinho quando um gerador monta o corpo por pedaços. Só chamar
// o handler EXPORTADO prova o perímetro. Este teste também não precisa de chave
// nem de rede, então roda na suíte, em todo branch.
//
// SEM PESSOA quer dizer: `ctx.user` é uma chave de aplicativo (que não carrega
// pessoa alguma) e as tabelas de sessão e de perfil não devolvem ninguém. É o
// que um portador de chave do app tem nas mãos. Sem a guarda, `_perfilDe`
// devolve `{ servico: true, nivel: 99 }` e a chave passa por toda permissão.
//
// O QUE SE GARANTE:
//   1. todo literal do arquivo decodifica e compila (nada é PULADO em silêncio);
//   2. toda rota fora de PUBLICAS responde 401 ou 403 sem pessoa;
//   3. toda entrada de PUBLICAS existe no arquivo E de fato não recusa — rota
//      que ganhou guarda tem de SAIR da lista, senão este teste reprova;
//   4. o controle: uma rota guardada tem a exportação trocada pelo handler cru,
//      e a varredura passa a acusá-la. Prova que o cenário morde.
//   5. a régua: com rotas de brinquedo, só 401 e 403 contam como recusa.
//
// Roda com: node perimetro-sem-pessoa.test.js
const fs = require('fs')
const { ok, fim, ARQ } = require('./_carregar.js')

// Rotas que PODEM responder sem pessoa. Qualquer outra que responda é falha.
const PUBLICAS = {
  // Porta de entrada: quem chama ainda não tem sessão.
  'POST /auth/login': 'stub 501 — o login de verdade é do hub',
  'POST /auth/register': 'stub 501',
  'POST /auth/signout': 'stub 501',
  'GET /auth/sessao/estado': 'diagnóstico de sessão sem expor token',
  'POST /auth/sessao/encerrar': 'encerrar sessão não exige sessão válida',
  'POST /auth/senha/solicitar': 'pedido de redefinição por e-mail',
  'POST /auth/senha/redefinir': 'redefinição pelo token do e-mail',
  'GET /diag/senha-estado': '410 — rota aposentada',
  // Máquina: health check e webhooks, autenticados pelo segredo do webhook.
  'GET /health': 'health check',
  'POST /whatsapp/inbound': 'webhook do WhatsApp (webhook_secret)',
  'GET /webhooks/whatsapp': '410 — rota aposentada',
  'POST /webhooks/whatsapp': '410 — rota aposentada',
  'POST /tickets/acompanhar': 'relógio interno (webhook_secret)',
  // Cliente sem conta, pelo link que recebeu.
  'GET /rate/:token': 'avaliação pelo link do e-mail',
  'POST /rate/:token': 'avaliação pelo link do e-mail',
  'POST /tickets/public/reply': 'resposta do cliente pelo link do chamado',
}

const TEXTO = fs.readFileSync(ARQ, 'utf8')
const RE = /\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)/g

/** Toda entrada do arquivo: chave "MÉTODO caminho", o literal e o id do cabeçalho. */
function rotas(texto) {
  const lista = []
  RE.lastIndex = 0
  let m
  while ((m = RE.exec(texto))) {
    const meta = m[1]
    const metodo = (meta.match(/method:\s*"([^"]+)"/) || [])[1]
    const caminho = (meta.match(/path:\s*"([^"]+)"/) || [])[1]
    // O id vem do comentário de cabeçalho, logo acima da entrada. Cinco
    // entradas não têm esse comentário, então ele é enfeite: a chave é
    // "MÉTODO caminho".
    const antes = texto.slice(Math.max(0, m.index - 400), m.index)
    const h = antes.match(/\n  \/\/ (\S+) \S+ (?:GET|POST|PUT|PATCH|DELETE) \S+[^\n]*\n[^\n]*$/)
    lista.push({ chave: `${metodo} ${caminho}`, id: h ? h[1] : '?', literal: m[2] })
  }
  return lista
}

const CTX_GLOBAIS = {
  console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat,
  isNaN, isFinite, RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent,
  Intl, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
}

/** Uma linha que casa qualquer leitura, para a recusa não vir de "não achei". */
function linha() {
  return {
    id: 'x1', user_id: 'u9', ticket_id: 't1', projeto_id: 'p1', conversation_id: 'c1',
    status: 'open', role: 'admin', ativo: 'sim', escopo: '', nome: 'n', title: 't',
    company_id: 'co1', created_at: new Date().toISOString(),
  }
}

/**
 * O `ctx` de quem só tem a chave do aplicativo.
 *
 * Os modelos são PERMISSIVOS de propósito: devolvem linha para tudo e aceitam
 * gravação. Se a rota recusar, a recusa é da guarda, não de um 404 por massa
 * vazia — era assim que um teste de "sem sessão não grava" passava sem guarda
 * nenhuma. Sessao e Profile são a exceção: são eles que diriam QUEM é a
 * pessoa, e aqui não há pessoa.
 *
 * Esses dois são DEFESA, não o que faz a recusa: a sonda não manda cabeçalho
 * `x-portal-sessao`, então a guarda nem chega a consultar a tabela de sessão —
 * conferido mutando o fake, e nenhuma rota se abriu. Quem faz a recusa é o
 * `ctx.user` ser chave de aplicativo: trocá-lo por uma pessoa abre uma dúzia de
 * rotas, e é essa mutação que está no mutar-perimetro.py. Ficam aqui para o dia em que
 * alguém acrescentar o cabeçalho à sonda.
 */
function contexto(metodo) {
  const escritas = []
  const um = () => new Proxy({}, {
    get: (_t, k) => {
      if (k === 'findMany') return async () => [linha()]
      if (k === 'findById') return async (id) => Object.assign(linha(), { id: String(id) })
      if (k === 'count') return async () => 1
      if (k === 'create' || k === 'update' || k === 'delete') {
        return async (a, b) => { escritas.push(k); return Object.assign(linha(), b || a) }
      }
      return undefined
    },
  })
  const vazio = { findById: async () => null, findMany: async () => [], count: async () => 0 }
  const models = new Proxy({}, {
    get: (_t, k) => (k === 'Sessao' || k === 'Profile' ? vazio : um()),
  })
  const resposta = () => {
    let s = 200
    const r = { status(c) { s = c; return r }, send(v) { return { status: s, body: v } } }
    return r
  }
  return {
    escritas,
    ctx: {
      method: metodo,
      params: new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? 'x1' : undefined) }),
      query: {}, body: {}, rawBody: null, files: null, headers: {},
      user: { type: 'apiKey' },
      app: { slug: 'portal-suporte' },
      models,
      secrets: { get: async () => null },
      users: { findByEmail: async () => null },
      fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
      notify: async () => {},
      randomBytes: () => 'ab',
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
      reply: resposta(),
    },
  }
}

/**
 * Chama o handler EXPORTADO e devolve o que ele respondeu.
 *
 * `erro` distingue os casos que um `continue` esconderia: literal que não
 * decodifica, módulo que não compila, exportação sem handler. Nenhum deles é
 * "rota que recusa" — todos são falha deste teste.
 */
async function responde(literal, metodo) {
  let codigo
  try { codigo = JSON.parse('"' + literal + '"') } catch (e) { return { erro: 'literal não decodifica: ' + e.message } }
  let h
  try {
    const mod = { exports: {} }
    const r = new Function(
      ...Object.keys(CTX_GLOBAIS), 'module', 'exports',
      codigo + ';return module.exports;',
    )(...Object.values(CTX_GLOBAIS), mod, mod.exports)
    h = r.handler || r.default || r
  } catch (e) { return { erro: 'não compila: ' + e.message } }
  if (typeof h !== 'function') return { erro: 'exportação sem handler' }
  const { ctx, escritas } = contexto(metodo)
  let r
  try {
    r = await Promise.race([
      Promise.resolve(h(ctx)),
      new Promise((pronto) => setTimeout(() => pronto({ status: 'tempo esgotado' }), 3000)),
    ])
  } catch (e) {
    // Exceção não é recusa: ninguém garante que o 500 do framework não
    // vazou nada antes de estourar. Mas também não é resposta 2xx — fica
    // registrada como estouro e não conta como vazamento.
    return { estouro: String(e && e.message).slice(0, 80), escritas: escritas.length }
  }
  return { status: (r && r.status) || 200, escritas: escritas.length }
}

/** Quem respondeu algo diferente de 401/403 sem pessoa. */
async function varrer(lista) {
  const abertas = []
  const quebradas = []
  for (const r of lista) {
    const metodo = r.chave.split(' ')[0]
    const resp = await responde(r.literal, metodo)
    if (resp.erro) { quebradas.push(`${r.id} ${r.chave}: ${resp.erro}`); continue }
    if (typeof resp.status === 'number' && resp.status !== 401 && resp.status !== 403) {
      abertas.push({ ...r, status: resp.status, gravou: resp.escritas > 0 })
    }
  }
  return { abertas, quebradas }
}

;(async () => {
  const lista = rotas(TEXTO)
  const literais = (TEXTO.match(/compileController\(/g) || []).length

  ok('toda entrada do arquivo foi lida', lista.length === literais, { lidas: lista.length, literais })
  ok('nenhuma chave repetida', new Set(lista.map((r) => r.chave)).size === lista.length,
    { chaves: new Set(lista.map((r) => r.chave)).size, rotas: lista.length })

  const { abertas, quebradas } = await varrer(lista)
  ok('todo literal decodifica, compila e exporta handler', quebradas.length === 0, quebradas.slice(0, 5))

  // (2) Nada fora da lista responde sem pessoa.
  const fora = abertas.filter((r) => !PUBLICAS[r.chave])
  ok('nenhuma rota de negócio responde sem pessoa', fora.length === 0,
    fora.map((r) => `${r.id} ${r.chave} -> ${r.status}${r.gravou ? ' GRAVOU' : ''}`))

  // (3) A lista não apodrece: entrada que não existe mais, ou que hoje recusa,
  // tem de sair. Sem isto a allowlist viraria um buraco permanente.
  const chaves = new Set(lista.map((r) => r.chave))
  const inexistentes = Object.keys(PUBLICAS).filter((k) => !chaves.has(k))
  ok('toda rota de PUBLICAS existe no arquivo', inexistentes.length === 0, inexistentes)
  const respondem = new Set(abertas.map((r) => r.chave))
  const jaRecusam = Object.keys(PUBLICAS).filter((k) => chaves.has(k) && !respondem.has(k))
  ok('toda rota de PUBLICAS de fato responde sem pessoa (as que recusam saem da lista)',
    jaRecusam.length === 0, jaRecusam)

  // (4) O CONTROLE. Troca a exportação de uma rota guardada pelo handler cru e
  // confere que a varredura acusa. Sem
  // este caso, "nenhuma rota aberta" poderia significar só que o laboratório
  // não enxerga rota aberta nenhuma.
  const COBAIAS = ['GET /admin/teams', 'GET /admin/units', 'GET /projetos']
  for (const chave of COBAIAS) {
    const cobaia = lista.find((r) => r.chave === chave)
    ok(`a cobaia ${chave} existe`, !!cobaia, chave)
    if (!cobaia) continue
    const semGuarda = cobaia.literal
      .split('module.exports = { handler: _gsComSessao };')
      .join('module.exports = { handler };')
    ok(`${chave} estava protegida pelo invólucro`, semGuarda !== cobaia.literal, chave)
    const antes = await responde(cobaia.literal, 'GET')
    const depois = await responde(semGuarda, 'GET')
    ok(`com o invólucro, ${chave} recusa`, antes.status === 401 || antes.status === 403, antes)
    ok(`sem o invólucro, a varredura ACUSA ${chave}`,
      typeof depois.status === 'number' && depois.status !== 401 && depois.status !== 403, depois)
  }

  // (5) A RÉGUA da varredura, medida com rotas de brinquedo. Só 401 e 403
  // contam como recusa: um 500 sem pessoa não é proteção, é erro DEPOIS de já
  // ter entrado, e um 404 pode ser a massa, não a guarda. Sem este caso,
  // afrouxar a régua (aceitar 500, por exemplo) passaria sem ninguém notar,
  // porque hoje nenhuma rota responde 500 nesta varredura.
  const brinquedo = (st) =>
    JSON.stringify(`module.exports = { handler: async () => ({ status: ${st} }) };`).slice(1, -1)
  for (const st of [200, 404, 500]) {
    const r = await varrer([{ chave: `GET /brinquedo/${st}`, id: 'teste', literal: brinquedo(st) }])
    ok(`a varredura acusa ${st} sem pessoa`,
      r.abertas.length === 1 && r.abertas[0].status === st, r)
  }
  for (const st of [401, 403]) {
    const r = await varrer([{ chave: `GET /brinquedo/${st}`, id: 'teste', literal: brinquedo(st) }])
    ok(`a varredura aceita ${st} como recusa`,
      r.abertas.length === 0 && r.quebradas.length === 0, r)
  }

  console.log(`\n   ${lista.length} rotas varridas | ${abertas.length} respondem sem pessoa | ${Object.keys(PUBLICAS).length} na lista de públicas`)
  fim()
})()
