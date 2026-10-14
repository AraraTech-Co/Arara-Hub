// Fase 3a — o dado das contas por setor.
//
// O que importa aqui é UMA frase: conversa sem `conta_id` é da conta default,
// e a conta default funciona sem nenhuma configuração nova. Se isso falhar, a
// Fase 3 tira a inbox de todo mundo no instante em que subir.
//
// Três coisas são testadas:
//  1. `contaDaConversa` e companhia (app/lib/wa-conta.ts);
//  2. a gêmea do nome do segredo dentro do handler, comparada com a do front;
//  3. o script de schema: SEM `--aplicar` ele não envia escrita nenhuma —
//     conferido lendo o próprio arquivo, porque rodar o script de verdade
//     falaria com produção.
//
// Roda com: node wa-conta.test.js
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { carregarContexto, reply, carregarHandler, ok, fim } = require('./_carregar.js')

const dentro = carregarContexto('490n whatsapp POST /whatsapp/conversa/nova')
const nova = carregarHandler('490n whatsapp POST /whatsapp/conversa/nova')

;(async () => {
  const mod = await import(
    pathToFileURL(path.resolve(__dirname, '../../app/lib/wa-conta.ts')).href
  )

  // ══ 1. a regra do default ══════════════════════════════════════════════
  ok('sem conta_id: default', mod.contaDaConversa({}) === 'default', mod.contaDaConversa({}))
  ok('conta_id nulo: default', mod.contaDaConversa({ conta_id: null }) === 'default', null)
  ok('conta_id vazio: default', mod.contaDaConversa({ conta_id: '' }) === 'default', null)
  ok('conta_id com espaços: default', mod.contaDaConversa({ conta_id: '   ' }) === 'default', null)
  ok('conversa nula não estoura', mod.contaDaConversa(null) === 'default', null)
  ok('conversa indefinida não estoura', mod.contaDaConversa(undefined) === 'default', null)
  ok('camelCase também vale', mod.contaDaConversa({ contaId: 'vendas' }) === 'vendas',
    mod.contaDaConversa({ contaId: 'vendas' }))
  ok('conta nomeada é respeitada', mod.contaDaConversa({ conta_id: 'vendas' }) === 'vendas', null)
  ok('ehContaDefault concorda', mod.ehContaDefault({}) === true
    && mod.ehContaDefault({ conta_id: 'vendas' }) === false, null)

  // A default NÃO exige grant: exigir tiraria a inbox de todos ao subir.
  ok('default não exige grant', mod.grantDaConta(null) === null, mod.grantDaConta(null))
  ok('  e conta nomeada exige', mod.grantDaConta('vendas') === 'wa_conta_vendas',
    mod.grantDaConta('vendas'))

  // ══ 2. a gêmea do nome do segredo ══════════════════════════════════════
  // O handler monta "whatsapp_token_" + id; o front tem a mesma regra. Se as
  // duas divergirem, a conta lê o segredo errado e manda pela conta errada.
  const chamados = []
  const ctxFalso = {
    secrets: { get: async (nome) => { chamados.push(nome); return nome === 'whatsapp_token' ? 'tok-geral' : null } },
  }
  ok('conta default lê o token de SEMPRE (sem config nova)',
    (await dentro._tokenDaConta(ctxFalso, 'default')) === 'tok-geral', chamados.slice())
  ok('  e não procura segredo por conta para a default',
    chamados.length === 1 && chamados[0] === 'whatsapp_token', chamados.slice())

  chamados.length = 0
  ok('conta sem conta_id também cai no de sempre',
    (await dentro._tokenDaConta(ctxFalso, null)) === 'tok-geral', chamados.slice())

  chamados.length = 0
  const comProprio = {
    secrets: { get: async (nome) => { chamados.push(nome); return nome === 'whatsapp_token_vendas' ? 'tok-vendas' : 'tok-geral' } },
  }
  ok('conta com segredo próprio usa o dela',
    (await dentro._tokenDaConta(comProprio, 'vendas')) === 'tok-vendas', chamados.slice())
  ok('  tendo procurado pelo nome que o front monta',
    chamados[0] === mod.nomeDoSegredoDaConta('vendas'),
    { handler: chamados[0], front: mod.nomeDoSegredoDaConta('vendas') })

  chamados.length = 0
  const semProprio = {
    secrets: { get: async (nome) => { chamados.push(nome); return nome === 'whatsapp_token' ? 'tok-geral' : null } },
  }
  ok('conta nova SEM segredo ainda cai no de sempre (não fica muda)',
    (await dentro._tokenDaConta(semProprio, 'vendas')) === 'tok-geral', chamados.slice())
  ok('  tendo tentado o próprio primeiro',
    chamados.join(',') === 'whatsapp_token_vendas,whatsapp_token', chamados.slice())

  const explode = { secrets: { get: async () => { throw new Error('secret store fora') } } }
  ok('secret store indisponível devolve null, não estoura',
    (await dentro._tokenDaConta(explode, 'vendas')) === null, null)

  // ══ o comportamento da rota não mudou para quem não manda conta ════════
  const estado = { conversas: [], enviadas: [], segredos: [] }
  const c = {
    models: {
      WhatsAppConversation: {
        findMany: async (arg) => (Object.keys(arg || {}).length ? [] : []),
        create: async (x) => { estado.conversas.push(x); return x },
      },
      WhatsAppMessage: { create: async () => ({}) },
      Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Ana' }) },
      SystemSettings: { findMany: async () => [{}] },
      WaConversationEvents: { create: async () => ({}) },
      Sessao: { findById: async () => null },
    },
    secrets: { get: async (n) => { estado.segredos.push(n); return n === 'whatsapp_token' ? 'tok' : null } },
    fetch: async (url, o) => { estado.enviadas.push(JSON.parse(o.body)); return { status: 200, body: '{}' } },
  }
  const r = await nova({
    params: {}, query: {}, headers: {}, body: { telefone: '19999990001', message: 'oi' },
    user: { id: 'u1' }, models: c.models, secrets: c.secrets, fetch: c.fetch, reply: reply(),
  })
  ok('rota sem conta_id no payload: segue funcionando', r.status === 200, { status: r.status, body: r.body })
  ok('  gravando a conta default', estado.conversas[0]?.conta_id === 'default',
    estado.conversas[0]?.conta_id)
  ok('  e lendo só o token de sempre',
    estado.segredos.filter((n) => n.startsWith('whatsapp_token_')).length === 0, estado.segredos)

  // ══ 3. o script de schema não escreve sem --aplicar ════════════════════
  const script = fs.readFileSync(path.resolve(__dirname, '../wa-contas-modelo.py'), 'utf8')
  ok('o script existe e fala de simulação', script.includes('simulação'), null)
  // A ordem importa: todo `req(..., "POST"|"PATCH"|"DELETE")` tem de estar
  // DEPOIS do ponto em que o script sai quando não há `--aplicar`.
  const corte = script.indexOf('if not aplicar:\n        print("\\n   (simulação')
  ok('  tem a saída antecipada da simulação', corte > 0, corte)
  const escritas = [...script.matchAll(/req\([^)]*"(POST|PATCH|DELETE)"/g)]
  ok('  e existem escritas no script (senão o teste acima é vazio)',
    escritas.length >= 2, escritas.length)
  ok('  TODAS as escritas vêm depois da saída da simulação',
    escritas.every((m) => m.index > corte),
    escritas.filter((m) => m.index <= corte).map((m) => m[0]))
  ok('  e o caminho de volta está escrito no próprio script',
    script.includes('CAMINHO DE VOLTA'), null)
  ok('  dizendo que remover propriedade com dado gravado apaga o valor',
    /APAGA esse valor/.test(script), null)
  ok('  o token NÃO entra no model', !/"token"\s*:/.test(script.split('def req')[0]), null)

  fim()
})()
