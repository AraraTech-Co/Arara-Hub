// Lista de conversas (rota 432): as tabelas ESTÁVEIS são lidas uma vez por
// minuto, não a cada chamada.
//
// A tela consulta esta rota a cada 10 s, por pessoa. `loadDeps` lia 8 tabelas
// inteiras a cada chamada — com 5 atendentes com a inbox aberta, 240 leituras
// de tabela por minuto para devolver dados que praticamente não mudam.
//
// O que este teste fixa, e é a parte que mais importa: QUAIS tabelas podem ser
// cacheadas. Equipe, setores, empresas, motivos de encerramento e etiquetas,
// sim. Contact, Ticket e ConvTag, NÃO — crescem e são por conversa, e servir
// essas do cache devolveria vínculo errado para a conversa de outra pessoa.
//
// O relógio não é injetável (o handler usa `Date.now()`), então o
// envelhecimento é simulado empurrando o carimbo guardado para trás. É o mesmo
// efeito, e deixa claro que a expiração é por tempo, não por contagem.
//
// Roda com: node deps-cache-estaveis.test.js
const { carregarHandlerEContexto, reply, ok, fim } = require('./_carregar.js')

const { handler: lista, contexto } = carregarHandlerEContexto('432 whatsapp GET /whatsapp')

const AGORA = Date.now()
const iso = (h) => new Date(AGORA - h * 3600000).toISOString()
const CONV = { id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', status: 'open', updated_at: iso(1), created_at: iso(2) }

const ESTAVEIS = ['Profile', 'WaDepartment', 'Company', 'WaCloseReason', 'WaTag']
const VOLATEIS = ['CompanyContact', 'Ticket', 'WaConversationTag']

function cenario({ slug = 'portal-suporte' } = {}) {
  const lidas = {}
  const contar = (nome) => { lidas[nome] = (lidas[nome] || 0) + 1 }
  const tabela = (nome) => ({
    findMany: async () => { contar(nome); return [] },
    findById: async () => null,
  })
  const models = {
    Sessao: { findById: async () => null },
    Profile: {
      findById: async () => ({ id: 'u1', role: 'admin' }),
      findMany: async () => { contar('Profile'); return [] },
    },
    WhatsAppConversation: { findMany: async () => [CONV], update: async () => {} },
    WhatsAppMessage: { findMany: async () => [] },
    SystemSettings: { findMany: async () => [], findById: async () => null },
    WaConversationEvents: { findMany: async () => [], create: async (e) => e },
  }
  for (const n of ESTAVEIS) if (!models[n]) models[n] = tabela(n)
  for (const n of VOLATEIS) models[n] = tabela(n)

  const ctx = {
    params: {}, query: {}, body: {}, headers: {},
    user: { id: 'u1' },
    app: slug ? { slug } : undefined,
    models,
    reply: reply(),
  }
  return { lidas, ctx: () => Object.assign({}, ctx, { reply: reply() }) }
}

/** Esvazia o cache entre cenários: ele vive no globalThis do contexto da vm. */
function limparCache() {
  if (contexto.__araraDepsCache) {
    for (const k of Object.keys(contexto.__araraDepsCache)) delete contexto.__araraDepsCache[k]
  }
}

/** Empurra os carimbos para trás, simulando a passagem do tempo. */
function envelhecer(slug, ms) {
  const caixa = (contexto.__araraDepsCache || {})[slug]
  if (!caixa) return 0
  let n = 0
  for (const k of Object.keys(caixa)) { caixa[k].em -= ms; n++ }
  return n
}

;(async () => {
  // ══ duas chamadas seguidas: uma leitura de cada estável ════════════════
  {
    limparCache()
    const c = cenario()
    await lista(c.ctx())
    const depoisDa1a = Object.assign({}, c.lidas)
    await lista(c.ctx())

    ok('o cache existe depois da 1ª chamada', !!contexto.__araraDepsCache, Object.keys(contexto.__araraDepsCache || {}))
    for (const n of ESTAVEIS) {
      ok(`  ${n}: lida UMA vez em duas chamadas`, c.lidas[n] === 1, { depois1: depoisDa1a[n], depois2: c.lidas[n] })
    }
    // A propriedade é "cresce com o número de chamadas", não um número fixo:
    // `CompanyContact` é lida DUAS vezes por chamada (linha 82, o mapa de
    // nomes por JID, e de novo no `loadDeps`) — duplicata que já existia e que
    // este PR não mexe. Fixar "=== 2" aqui esconderia isso e quebraria o teste
    // por um motivo que não é o do teste.
    for (const n of VOLATEIS) {
      ok(`  ${n}: lida de novo na 2ª chamada, como hoje`,
        c.lidas[n] === depoisDa1a[n] * 2, { depois1: depoisDa1a[n], depois2: c.lidas[n] })
    }
    ok('  e CompanyContact segue com as 2 leituras por chamada que já tinha',
      depoisDa1a.CompanyContact === 2, depoisDa1a.CompanyContact)
  }

  // ══ passados 60 s, relê ════════════════════════════════════════════════
  {
    limparCache()
    const c = cenario()
    await lista(c.ctx())
    const quantas = envelhecer('portal-suporte', 61 * 1000)
    ok('as 5 estáveis foram guardadas com carimbo', quantas === 5, quantas)
    await lista(c.ctx())
    for (const n of ESTAVEIS) {
      ok(`  ${n}: depois de 60 s, lida de novo`, c.lidas[n] === 2, c.lidas[n])
    }
  }

  // ══ dentro dos 60 s, não relê ══════════════════════════════════════════
  {
    limparCache()
    const c = cenario()
    await lista(c.ctx())
    envelhecer('portal-suporte', 59 * 1000)
    await lista(c.ctx())
    ok('aos 59 s ainda serve do cache', c.lidas.Profile === 1, c.lidas.Profile)
  }

  // ══ sem slug, não cacheia ══════════════════════════════════════════════
  //
  // A chave é o inquilino. Sem ela, dois apps dividiriam a mesma equipe e a
  // mesma lista de empresas — e o nome que aparece na conversa seria de outra
  // instalação. Melhor ler sempre que errar assim.
  {
    limparCache()
    const c = cenario({ slug: null })
    await lista(c.ctx())
    await lista(c.ctx())
    for (const n of ESTAVEIS) {
      ok(`  sem slug, ${n} é lida nas duas chamadas`, c.lidas[n] === 2, c.lidas[n])
    }
    ok('  e nada foi guardado', Object.keys(contexto.__araraDepsCache || {}).length === 0,
      Object.keys(contexto.__araraDepsCache || {}))
  }

  // ══ apps diferentes não dividem cache ══════════════════════════════════
  {
    limparCache()
    const a = cenario({ slug: 'app-a' })
    const b = cenario({ slug: 'app-b' })
    await lista(a.ctx())
    await lista(b.ctx())
    ok('cada app lê a sua equipe', a.lidas.Profile === 1 && b.lidas.Profile === 1,
      { a: a.lidas.Profile, b: b.lidas.Profile })
    ok('  e há uma caixa por app', Object.keys(contexto.__araraDepsCache).sort().join(',') === 'app-a,app-b',
      Object.keys(contexto.__araraDepsCache))
  }

  limparCache()
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
