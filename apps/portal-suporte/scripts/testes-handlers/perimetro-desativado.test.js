// Membro desativado não passa de rota nenhuma do portal — medido chamando o
// handler EXPORTADO de toda rota, no molde do perimetro-sem-pessoa.test.js.
//
// A PESSOA é um admin com `active: false` no Profile. Admin de propósito: se
// a recusa viesse de nível, um admin passaria, e o teste não distinguiria
// "barrado por estar desativado" de "barrado por não ter cargo".
//
// O QUE SE GARANTE:
//   1. por JWT (`ctx.user`) e por sessão do portal (`x-portal-sessao`), toda
//      rota fora de ABERTAS responde 403 com `desativado: true` — a marca de
//      que a recusa é ESTA regra, e não outra guarda que por acaso recuse;
//   2. ABERTAS não apodrece: toda entrada existe e de fato não recusa;
//   3. o controle: a mesma pessoa ATIVA não é recusada como desativada em
//      rota nenhuma, e passa por centenas — sem isto, "todas recusam" poderia
//      ser só o laboratório recusando tudo;
//   4. `active` ausente é ativo, e só `false` literal desativa;
//   5. ler o Profile falhou: as rotas da barreira respondem 503, nem 2xx nem
//      401/403.
//
// Roda com: node perimetro-desativado.test.js
const fs = require('fs')
const { ok, fim, ARQ } = require('./_carregar.js')

// Rotas que respondem a quem foi desativado. Todas, menos a última, não
// identificam pessoa nenhuma: são porta de entrada, máquina ou link público.
const ABERTAS = {
  'POST /auth/login': 'stub 501 — o login de verdade é do hub',
  'POST /auth/register': 'stub 501',
  'POST /auth/signout': 'stub 501',
  'POST /auth/senha/solicitar': 'pedido de redefinição por e-mail, sem pessoa',
  'POST /auth/senha/redefinir': 'redefinição pelo token do e-mail, sem pessoa',
  'GET /diag/senha-estado': '410 — rota aposentada',
  'GET /health': 'health check',
  'POST /whatsapp/inbound': 'webhook do WhatsApp (webhook_secret)',
  'GET /webhooks/whatsapp': '410 — rota aposentada',
  'POST /webhooks/whatsapp': '410 — rota aposentada',
  'POST /tickets/acompanhar': 'relógio interno (webhook_secret)',
  'POST /whatsapp/plantao/varrer': 'relógio interno, prova de origem própria',
  'GET /rate/:token': 'avaliação pelo link do e-mail',
  'POST /rate/:token': 'avaliação pelo link do e-mail',
  'POST /tickets/public/reply': 'resposta do cliente pelo link do chamado',
  // A única que identifica pessoa e fica aberta: sair tem de funcionar.
  'POST /auth/sessao/encerrar': 'sair do portal tem de funcionar para quem foi desativado',
}

const TEXTO = fs.readFileSync(ARQ, 'utf8')
const RE = /\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)/g

function rotas(texto) {
  const lista = []
  RE.lastIndex = 0
  let m
  while ((m = RE.exec(texto))) {
    const metodo = (m[1].match(/method:\s*"([^"]+)"/) || [])[1]
    const caminho = (m[1].match(/path:\s*"([^"]+)"/) || [])[1]
    lista.push({ chave: `${metodo} ${caminho}`, literal: m[2] })
  }
  return lista
}

const G = {
  console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat,
  isNaN, isFinite, RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent,
  Intl, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
}

const EU = 'u_desativado'
const SID = 'abcdef0123456789'
const VERIF = 'f'.repeat(48)

/** Linha que casa qualquer leitura: a recusa não pode vir de "não achei". */
function linha() {
  return {
    id: 'x1', user_id: 'u9', ticket_id: 't1', status: 'open', role: 'admin', ativo: 'sim',
    company_id: 'co1', created_at: new Date().toISOString(),
  }
}

/**
 * O `ctx` de quem chama. `perfil` é o que o Profile devolve para a pessoa:
 * um objeto, ou a string 'estoura' para simular falha de leitura.
 */
function contexto(metodo, { via, perfil }) {
  const um = () => new Proxy({}, {
    get: (_t, k) => {
      if (k === 'findMany') return async () => [linha()]
      if (k === 'findById') return async (id) => Object.assign(linha(), { id: String(id) })
      if (k === 'count') return async () => 1
      if (k === 'create' || k === 'update' || k === 'delete') return async (a, b) => Object.assign(linha(), b || a)
      return undefined
    },
  })
  const Profile = {
    findById: async (id) => {
      if (String(id) !== EU) return null
      if (perfil === 'estoura') throw new Error('leitura falhou')
      return Object.assign({ id: EU, email: 'd@exemplo', full_name: 'Pessoa' }, perfil)
    },
    findMany: async () => (perfil === 'estoura' ? [] : [Object.assign({ id: EU }, perfil)]),
    update: async (id, d) => Object.assign({ id }, d),
  }
  const Sessao = {
    findById: async (id) => (id === 'ses_' + SID
      ? { id, user_id: EU, verificador: VERIF, revogada: false, expira_em: new Date(Date.now() + 864e5).toISOString() }
      : null),
    findMany: async () => [],
    update: async (id, d) => Object.assign({ id }, d),
  }
  const models = new Proxy({}, { get: (_t, k) => (k === 'Profile' ? Profile : k === 'Sessao' ? Sessao : um()) })
  const resposta = () => {
    let s = 200
    const r = { status(c) { s = c; return r }, send(v) { return { status: s, body: v } } }
    return r
  }
  return {
    method: metodo,
    params: new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? 'x1' : undefined) }),
    query: {}, body: {}, rawBody: null, files: null,
    headers: via === 'sessao' ? { 'x-portal-sessao': `${SID}.${VERIF}` } : {},
    user: via === 'jwt' ? { id: EU } : { type: 'apiKey' },
    app: { slug: 'portal-suporte' },
    models,
    secrets: { get: async () => null },
    users: { findByEmail: async () => null },
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    notify: async () => {},
    randomBytes: () => 'ab',
    randomUUID: () => '00000000-0000-4000-8000-000000000000',
    reply: resposta(),
  }
}

async function responde(literal, metodo, cenario) {
  let h
  try {
    const codigo = JSON.parse('"' + literal + '"')
    const mod = { exports: {} }
    const r = new Function(...Object.keys(G), 'module', 'exports', codigo + ';return module.exports;')(
      ...Object.values(G), mod, mod.exports)
    h = r.handler
  } catch (e) { return { erro: String(e.message).slice(0, 80) } }
  if (typeof h !== 'function') return { erro: 'exportação sem handler' }
  try {
    const r = await Promise.race([
      Promise.resolve(h(contexto(metodo, cenario))),
      new Promise((ok_) => setTimeout(() => ok_({ status: 'tempo esgotado' }), 3000)),
    ])
    return { status: (r && r.status) || 200, body: r && r.body }
  } catch (e) {
    return { status: 'estouro: ' + String(e && e.message).slice(0, 60) }
  }
}

const recusouPorDesativado = (r) => r.status === 403 && !!(r.body && r.body.desativado === true)

async function varrer(lista, cenario) {
  const saida = []
  for (const r of lista) saida.push({ ...r, resp: await responde(r.literal, r.chave.split(' ')[0], cenario) })
  return saida
}

;(async () => {
  const lista = rotas(TEXTO)
  const literais = (TEXTO.match(/compileController\(/g) || []).length
  ok('toda entrada do arquivo foi lida', lista.length === literais, { lidas: lista.length, literais })

  const DESATIVADO = { role: 'admin', active: false }

  // (1) Por JWT e por sessão do portal.
  for (const via of ['jwt', 'sessao']) {
    const v = await varrer(lista, { via, perfil: DESATIVADO })
    const quebradas = v.filter((r) => r.resp.erro)
    ok(`${via}: todo literal compila e exporta handler`, quebradas.length === 0,
      quebradas.slice(0, 5).map((r) => `${r.chave}: ${r.resp.erro}`))
    const passam = v.filter((r) => !ABERTAS[r.chave] && !recusouPorDesativado(r.resp))
    ok(`${via}: desativado é recusado em toda rota fora de ABERTAS`, passam.length === 0,
      { quantas: passam.length, exemplos: passam.slice(0, 8).map((r) => `${r.chave} -> ${r.resp.status}`) })

    // (2) A lista não apodrece.
    const chaves = new Set(lista.map((r) => r.chave))
    ok(`${via}: toda rota de ABERTAS existe no arquivo`,
      Object.keys(ABERTAS).every((k) => chaves.has(k)), Object.keys(ABERTAS).filter((k) => !chaves.has(k)))
    const abertasQueRecusam = v.filter((r) => ABERTAS[r.chave] && recusouPorDesativado(r.resp)).map((r) => r.chave)
    ok(`${via}: nenhuma rota de ABERTAS recusa o desativado (as que recusam saem da lista)`,
      abertasQueRecusam.length === 0, abertasQueRecusam)
  }

  // A sessão de sair, especificamente: quem foi desativado consegue sair.
  {
    const enc = lista.find((r) => r.chave === 'POST /auth/sessao/encerrar')
    const r = enc && await responde(enc.literal, 'POST', { via: 'sessao', perfil: DESATIVADO })
    ok('desativado consegue encerrar a própria sessão',
      !!r && typeof r.status === 'number' && r.status < 400, r)
  }

  // (3) O controle: a mesma pessoa, ATIVA.
  {
    const v = await varrer(lista, { via: 'jwt', perfil: { role: 'admin', active: true } })
    const marcadas = v.filter((r) => recusouPorDesativado(r.resp)).map((r) => r.chave)
    ok('ativo: nenhuma rota recusa como desativado', marcadas.length === 0, marcadas.slice(0, 8))
    const passaram = v.filter((r) => r.resp.status !== 401 && r.resp.status !== 403).length
    ok('ativo: a mesma pessoa passa da barreira em centenas de rotas (o cenário morde)',
      passaram >= 400, passaram)
  }

  // (4) `active` ausente é ativo; só `false` literal desativa.
  for (const [nome, perfil] of [
    ['active ausente', { role: 'admin' }],
    ['active "false" (texto)', { role: 'admin', active: 'false' }],
    ['active null', { role: 'admin', active: null }],
  ]) {
    const v = await varrer(lista, { via: 'jwt', perfil })
    const marcadas = v.filter((r) => recusouPorDesativado(r.resp)).map((r) => r.chave)
    ok(`${nome}: ninguém é recusado como desativado`, marcadas.length === 0, marcadas.slice(0, 5))
  }

  // (5) Falha ao ler o Profile, nas rotas da barreira.
  {
    const daBarreira = lista.filter((r) => JSON.parse('"' + r.literal + '"').includes('_dsBarra'))
    ok('as rotas escritas à mão que identificam pessoa têm a barreira', daBarreira.length >= 25, daBarreira.length)
    const v = await varrer(daBarreira, { via: 'jwt', perfil: 'estoura' })
    const errado = v.filter((r) => r.resp.status !== 503).map((r) => `${r.chave} -> ${r.resp.status}`)
    ok('leitura do Profile falhou: a barreira responde 503', errado.length === 0, errado.slice(0, 8))
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
