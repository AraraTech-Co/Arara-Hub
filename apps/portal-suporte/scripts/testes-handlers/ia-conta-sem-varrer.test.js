// O teto de respostas da IA (rota 485, motor `_triagem`) conta os eventos
// `ia_resposta` DA CONVERSA sem varrer a tabela de eventos.
//
// O QUE SE GARANTE:
//   1. CONVERSA NOVA (nenhum evento): duas leituras, ambas filtradas
//      (`conversation_id` e `conversationId`), e NENHUMA leitura da tabela inteira;
//      a IA segue (registra `ia_indisponivel`, que é o rastro de "passou da
//      contagem").
//   2. As duas grafias contam, juntadas por id: 3 respostas em qualquer das duas
//      grafias entregam ao humano; linhas que têm as duas grafias contam uma vez.
//   3. Eventos de outras conversas, mesmo 600 na frente, não escondem os desta.
//   4. SE NÃO DÁ PARA CONTAR (qualquer das leituras falha), a IA NÃO responde esta
//      mensagem: sem texto ao cliente, sem entrega automática, sem registro. Há
//      três saídas e só esta presta: contar 0 faria a IA responder sem teto; contar
//      como teto atingido mandaria ao cliente a mensagem de transferência por
//      causa de uma falha de banco.
//
// O CONTROLE: o bloco de ANTES (uma leitura por `conversation_id` e, se vazia,
// varredura da tabela) é reconstituído e rodado sobre a mesma massa.
//
// Roda com: node ia-conta-sem-varrer.test.js
const fs = require('fs')
const vm = require('vm')
const { ok, fim, ARQ } = require('./_carregar.js')

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}
function compilar(codigo) {
  const c = {
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c._triagem
}

const NOVO = codigoDe('485 whatsapp POST /whatsapp/inbound')
const INI = '      // As DUAS grafias do campo'
const FIM = 'eventos[ev].kind === "ia_resposta") respostasIa++;\n      }\n'
const ANTES = `      var eventos = [];
      try { eventos = (await ctx.models.WaConversationEvents.findMany({ conversation_id: conv.id })) || []; } catch (e2) { eventos = []; }
      if (!eventos.length) {
        try { eventos = (await ctx.models.WaConversationEvents.findMany({})) || []; } catch (e3) { eventos = []; }
      }
      for (var ev = 0; ev < eventos.length; ev++) {
        if (String(eventos[ev].conversation_id) === String(conv.id) &&
            ` + FIM
const ANTIGO = (() => {
  if (NOVO.split(INI).length !== 2 || NOVO.split(FIM).length !== 2) throw new Error('âncoras do bloco novo')
  const i = NOVO.indexOf(INI), j = NOVO.indexOf(FIM) + FIM.length
  return NOVO.slice(0, i) + ANTES + NOVO.slice(j)
})()

async function rodar(codigo, eventos, { falha = null } = {}) {
  const triagem = compilar(codigo)
  const log = { updates: [], evCriados: [], leituras: [], erro: null }
  const conversa = { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', status: 'open', phase: 'novo' }
  const ctx = {
    models: {
      WhatsAppConversation: { findById: async () => conversa, update: async (id, p) => { log.updates.push(Object.keys(p).join(',')); Object.assign(conversa, p); return conversa }, findMany: async () => [conversa] },
      WhatsAppMessage: { findMany: async () => [], create: async (m) => m },
      SystemSettings: { findMany: async () => [{ waIaEnabled: true, waMenuEnabled: true }] },
      WaFlows: { findMany: async () => [] },
      WaConversationEvents: {
        findMany: async (arg) => {
          const ch = Object.keys(arg || {})
          log.leituras.push(ch.join('+') || 'TUDO')
          if (falha && falha(arg)) throw new Error('banco indisponível')
          const todas = eventos.filter((e) => ch.every((k) => String(e[k] ?? '') === String(arg[k])))
          return ch.length ? todas : eventos.slice(0, 500)
        },
        create: async (e) => { log.evCriados.push(e.kind); return e },
      },
      Profile: { findMany: async () => [], findById: async () => null }, SupportSchedule: { findMany: async () => [] },
    },
    secrets: { get: async () => null }, fetch: async () => ({ status: 200, body: '{}' }),
  }
  try { await triagem(ctx, conversa, 'oi') } catch (e) { log.erro = String(e) }
  log.ia = log.evCriados.includes('ia_indisponivel')              // passou da contagem e a IA seguiu
  log.entregou = log.updates.some((u) => u.includes('phase'))     // entrega ao humano (transferência)
  return log
}
const resp = (n, campo, offset = 0, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: 'r' + (offset + i), [campo]: 'c1', kind: 'ia_resposta', ...extra }))
const outras = (n) => Array.from({ length: n }, (_, i) => ({ id: 'o' + i, conversation_id: 'outra' + i, kind: 'ia_resposta' }))
const CENARIOS = {
  nova: () => [],
  tres_snake: () => resp(3, 'conversation_id'),
  tres_camel: () => resp(3, 'conversationId'),
  duas_mais_duas: () => resp(2, 'conversation_id').concat(resp(2, 'conversationId', 10)),
  duas_com_as_duas_grafias: () => resp(2, 'conversation_id', 0, { conversationId: 'c1' }),
  seiscentas_na_frente: () => outras(600).concat(resp(3, 'conversation_id', 0)),
}

async function bateria(codigo) {
  const f = []
  const n = await rodar(codigo, CENARIOS.nova())
  if (n.leituras.includes('TUDO') || n.leituras.length !== 2 || !n.ia || n.entregou) f.push('nova')
  const a = await rodar(codigo, CENARIOS.tres_snake()); if (!a.entregou || a.ia) f.push('tres_snake')
  const b = await rodar(codigo, CENARIOS.tres_camel()); if (!b.entregou || b.ia) f.push('tres_camel')
  const c = await rodar(codigo, CENARIOS.duas_mais_duas()); if (!c.entregou) f.push('duas_mais_duas')
  const d = await rodar(codigo, CENARIOS.duas_com_as_duas_grafias()); if (d.entregou || !d.ia) f.push('dedupe')
  const e = await rodar(codigo, CENARIOS.seiscentas_na_frente()); if (!e.entregou) f.push('seiscentas')
  for (const [nome, falha] of [['falha_snake', (x) => 'conversation_id' in x], ['falha_camel', (x) => 'conversationId' in x], ['falha_as_duas', () => true]]) {
    const g = await rodar(codigo, CENARIOS.nova(), { falha })
    if (g.ia || g.entregou || g.evCriados.length || g.updates.length || g.erro) f.push(nome)
  }
  return f
}

;(async () => {
  const n = await rodar(NOVO, CENARIOS.nova())
  ok('conversa nova: duas leituras, ambas filtradas, nenhuma da tabela inteira', n.leituras.length === 2 && n.leituras.includes('conversation_id') && n.leituras.includes('conversationId') && !n.leituras.includes('TUDO'), n.leituras)
  ok('TRAVA: conversa nova — a IA passou da contagem (ia_indisponivel) e não entregou ao humano', n.ia && !n.entregou && !n.erro, n)
  const a = await rodar(NOVO, CENARIOS.tres_snake())
  ok('3 respostas em conversation_id: entrega ao humano e a IA não segue', a.entregou && !a.ia, a)
  const b = await rodar(NOVO, CENARIOS.tres_camel())
  ok('3 respostas em conversationId (grafia antiga): entrega ao humano', b.entregou && !b.ia, b)
  const c = await rodar(NOVO, CENARIOS.duas_mais_duas())
  ok('2 em cada grafia, ids distintos (4): as duas contam, entrega', c.entregou, c)
  const d = await rodar(NOVO, CENARIOS.duas_com_as_duas_grafias())
  ok('2 linhas que têm as duas grafias contam UMA vez cada (2): não entrega, a IA segue', !d.entregou && d.ia, d)
  const e = await rodar(NOVO, CENARIOS.seiscentas_na_frente())
  ok('600 eventos de outras conversas na frente: os 3 desta contam, entrega', e.entregou, e)
  ok('nenhum cenário leu a tabela inteira', [n, a, b, c, d, e].every((x) => !x.leituras.includes('TUDO')), [n, a, b, c, d, e].map((x) => x.leituras))

  for (const [rotulo, falha] of [['a leitura de conversation_id falha', (x) => 'conversation_id' in x], ['a leitura de conversationId falha', (x) => 'conversationId' in x], ['as duas leituras falham', () => true]]) {
    const g = await rodar(NOVO, CENARIOS.nova(), { falha })
    ok(`${rotulo}: a IA não responde, não entrega ao humano, não registra nada e não quebra`, !g.ia && !g.entregou && g.evCriados.length === 0 && g.updates.length === 0 && !g.erro, g)
    ok(`  TRAVA: as leituras aconteceram (${g.leituras.length})`, g.leituras.length >= 1, g.leituras)
  }

  // ── controle: o bloco de antes, sobre a mesma massa ──
  const an = await rodar(ANTIGO, CENARIOS.nova())
  ok('CONTROLE: o bloco de antes varria a tabela inteira numa conversa nova', an.leituras.includes('TUDO'), an.leituras)
  const ac = await rodar(ANTIGO, CENARIOS.tres_camel())
  ok('CONTROLE: o bloco de antes não contava a grafia conversationId (a IA seguia)', ac.ia && !ac.entregou, ac)
  const af = await rodar(ANTIGO, CENARIOS.nova(), { falha: () => true })
  ok('CONTROLE: o bloco de antes, com a leitura falhando, deixava a IA seguir sem contar', af.ia, af)

  // ── mutações: cada uma se aplica uma vez e é pega por asserção ──
  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  const muts = [
    ['consulta só conversation_id', 'var _camposEv = ["conversation_id", "conversationId"];', 'var _camposEv = ["conversation_id"];'],
    ['consulta só conversationId', 'var _camposEv = ["conversation_id", "conversationId"];', 'var _camposEv = ["conversationId"];'],
    ['conta só conversation_id', 'String(eventos[ev].conversation_id || eventos[ev].conversationId || "")', 'String(eventos[ev].conversation_id || "")'],
    ['sem junção por id (conta em dobro)', 'if (_chaveIa && _vistosIa[_chaveIa]) continue;', ''],
    ['falha conta 0 e a IA responde', 'if (_leituraIaFalhou) {\n      return;\n    }', 'if (false) {\n      return;\n    }'],
    ['falha conta teto e entrega ao humano', 'if (_leituraIaFalhou) {\n      return;\n    }', 'if (_leituraIaFalhou) {\n      respostasIa = 3;\n    }'],
    ['a varredura de reserva volta', '      for (var ev = 0; ev < eventos.length; ev++) {', '      if (!eventos.length) { try { eventos = (await ctx.models.WaConversationEvents.findMany({})) || []; } catch (e4) {} }\n      for (var ev = 0; ev < eventos.length; ev++) {'],
    ['a falha de uma leitura não é anotada', 'catch (e2) { _lidosIa = []; _leituraIaFalhou = true; }', 'catch (e2) { _lidosIa = []; }'],
  ]
  for (const [nome, de, para] of muts) {
    const k = NOVO.split(de).length - 1
    if (k !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, k); continue }
    let f
    try { f = await bateria(NOVO.replace(de, () => para)) } catch (err) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(err)); continue }
    ok(`mutação "${nome}" é pega (${f.join(',')})`, f.length > 0, 'sobreviveu')
  }
  fim()
})()
