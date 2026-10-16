// A fusão MANUAL de conversas duplicadas (490f, só admin, `simular: false`) também
// só apaga a conversa que sobra depois de PROVAR que nada aponta mais para ela.
//
// É a mesma invariante da fusão por LID do webhook (fusao-por-lid-sem-perder-
// mensagem.test.js): move mensagens, eventos, etiquetas e notas da sobra para o
// alvo, repetindo até a leitura filtrada voltar VAZIA, e só então apaga a sobra.
// Sem a prova (leitura que falha, atualização que não pega, teto de rodadas, filtro
// não honrado), a sobra NÃO é apagada e entra em `nao_apagadas` na resposta.
//
// O CONTROLE: o código de ANTES (uma página só por modelo, falha de atualização
// engolida, `Conv.delete` incondicional) é reconstituído e rodado sobre a mesma
// massa para mostrar que o cenário reproduz o defeito.
//
// Roda com: node fusao-manual-sem-perder-mensagem.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ, carregarContexto } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

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

// ── o código de ANTES, reconstituído ────────────────────────────────────────
const MOVER_TUDO_ANTIGO = `
async function moverTudo(Model, campo, deId, paraId) {
  if (!Model) return 0;
  var f = {}; f[campo] = deId;
  var linhas = [];
  try { linhas = (await Model.findMany(f)) || []; } catch (e) { linhas = []; }
  linhas = linhas.filter(function (l) { return String(l[campo] || l.conversationId || "") === String(deId); });
  var n = 0;
  for (var i = 0; i < linhas.length; i++) {
    var p = {}; p[campo] = paraId;
    try { await Model.update(linhas[i].id, p); n++; } catch (e) {}
  }
  return n;
}
`
const LACO_ANTIGO = `      var de = sobras[s3].id;
      movidas.mensagens += await moverTudo(Msg, "conversation_id", de, alvo.id);
      movidas.eventos += await moverTudo(ctx.models.WaConversationEvents, "conversation_id", de, alvo.id);
      movidas.etiquetas += await moverTudo(ctx.models.WaConversationTags, "conversation_id", de, alvo.id);
      movidas.notas += await moverTudo(ctx.models.WaInternalNotes, "conversation_id", de, alvo.id);
      try { await Conv.delete(de); } catch (e) { plano[plano.length - 1].erro_apagar = String(e && e.message || e).slice(0, 120); }
`
const cod = codigoDe('490f whatsapp POST /whatsapp/manutencao/unir-duplicatas')
const INI = '      var de = sobras[s3].id;\n      var CAMPOS_DA_CONVERSA'
// O fim do laço é o `}` que o fecha, logo antes de gravar o alvo: marcador que NÃO
// depende de nenhuma linha do bloco novo (para uma mutação nesse bloco acusar por
// asserção, e não derrubar a montagem do controle).
const FIM = '\n    }\n    await Conv.update(alvo.id, patch);'
const a = cod.indexOf(INI), b = cod.indexOf(FIM)
const blocoOk = a >= 0 && b > a
const NOVO = compilar(cod)
const ANTIGO = blocoOk ? compilar(cod.slice(0, a) + LACO_ANTIGO.replace(/\n$/, '') + cod.slice(b) + MOVER_TUDO_ANTIGO) : null

// ── cenário ─────────────────────────────────────────────────────────────────
const FONE = '5519999990001@s.whatsapp.net'

function loja(linhas, opc = {}) {
  const l = { linhas, leituras: 0, atualizacoes: 0 }
  l.api = {
    findMany: async (a) => {
      l.leituras++
      if (opc.falhaNaLeitura && l.leituras === opc.falhaNaLeitura) throw new Error('falha de leitura')
      if (opc.filtroIgnorado) return camadaFindMany(linhas, {})
      return camadaFindMany(linhas, a)
    },
    findById: async (id) => linhas.find((x) => x.id === id) || null,
    update: async (id, p) => {
      l.atualizacoes++
      if (opc.updateFalha) throw new Error('falha de gravação')
      if (opc.updateIgnorado) return {}
      Object.assign(linhas.find((x) => x.id === id), p); return {}
    },
    create: async (x) => { linhas.push(x); return x },
  }
  return l
}
const doConv = (n, prefixo, conv, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${prefixo}_${i}`, conversation_id: conv, body: 'x ' + i, ...extra }))

function mundo({ msgs = 6, eventos = 0, etiquetas = 0, notas = 0, opMsg = {}, opEv = {}, semModelo = null } = {}) {
  const convs = [
    { id: 'cvT', status: 'open', remote_jid: FONE, updated_at: '2026-02-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
    { id: 'cvS', status: 'open', remote_jid: FONE, updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
  ]
  const w = { convs, apagadas: [] }
  w.msg = loja(doConv(msgs, 'm', 'cvS'), opMsg)
  w.ev = loja(doConv(eventos, 'e', 'cvS'), opEv)
  w.tag = loja(doConv(etiquetas, 't', 'cvS'))
  w.nota = loja(doConv(notas, 'n', 'cvS'))
  w.Conv = {
    findMany: async () => convs.map((c) => ({ ...c })),
    update: async (id, p) => { Object.assign(convs.find((c) => c.id === id), p); return {} },
    delete: async (id) => { w.apagadas.push(id); const i = convs.findIndex((c) => c.id === id); if (i >= 0) convs.splice(i, 1); return {} },
  }
  w.ctx = (body) => {
    const models = {
      Sessao: { findById: async () => null }, Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      WhatsAppConversation: w.Conv, WhatsAppMessage: w.msg.api, WaConversationEvents: w.ev.api,
      WaConversationTags: w.tag.api, WaInternalNotes: w.nota.api,
    }
    if (semModelo) delete models[semModelo]   // o modelo NÃO existe nesta execução
    return { params: {}, query: {}, headers: {}, user: { id: 'u1' }, body: body || {}, models, reply: reply() }
  }
  return w
}
const orfas = (loja, conv = 'cvS') => loja.linhas.filter((x) => x.conversation_id === conv || x.conversationId === conv).length
const noAlvo = (loja) => loja.linhas.filter((x) => x.conversation_id === 'cvT').length
const plano = (r) => (r.body && r.body.data && r.body.data.plano && r.body.data.plano[0]) || {}
const REAL = { simular: false }

;(async () => {
  ok('o laço novo foi localizado e o de antes pôde ser reconstituído', blocoOk && !!ANTIGO, { a, b })

  // ═══ 1. CONTROLE × AGORA: a sobra com mais de 500 mensagens ═══
  {
    const wa = mundo({ msgs: 700 }), wn = mundo({ msgs: 700 })
    const ra = await ANTIGO(wa.ctx(REAL)); const rn = await NOVO(wn.ctx(REAL))
    ok('TRAVA DE MASSA — a sobra tem mais de 500 mensagens (acima do que uma leitura devolve)', wn.msg.linhas.length === 700 && 700 > 500, wn.msg.linhas.length)
    ok('CONTROLE — o código de ANTES movia 500, apagava a sobra e deixava 200 mensagens órfãs',
      wa.apagadas.includes('cvS') && noAlvo(wa.msg) === 500 && orfas(wa.msg) === 200, { apagadas: wa.apagadas, movidas: noAlvo(wa.msg), orfas: orfas(wa.msg) })
    ok('AGORA — as 700 mensagens vão para o alvo, nenhuma órfã, e SÓ ENTÃO a sobra é apagada',
      rn.status === 200 && noAlvo(wn.msg) === 700 && orfas(wn.msg) === 0 && wn.apagadas.join() === 'cvS', { movidas: noAlvo(wn.msg), orfas: orfas(wn.msg), apagadas: wn.apagadas })
    ok('  a resposta conta o que foi movido', plano(rn).movidas && plano(rn).movidas.mensagens === 700 && !plano(rn).nao_apagadas, plano(rn))
  }

  // ═══ 2. eventos, etiquetas e notas: a mesma regra ═══
  {
    const wa = mundo({ msgs: 3, eventos: 600, etiquetas: 4, notas: 2 }), wn = mundo({ msgs: 3, eventos: 600, etiquetas: 4, notas: 2 })
    await ANTIGO(wa.ctx(REAL)); await NOVO(wn.ctx(REAL))
    ok('CONTROLE — antes: 100 eventos ficavam órfãos', orfas(wa.ev) === 100 && wa.apagadas.includes('cvS'), { orfas: orfas(wa.ev) })
    ok('AGORA — 600 eventos, 4 etiquetas e 2 notas movidos, sem órfãos, e só então apaga',
      noAlvo(wn.ev) === 600 && noAlvo(wn.tag) === 4 && noAlvo(wn.nota) === 2 && orfas(wn.ev) + orfas(wn.tag) + orfas(wn.nota) === 0 && wn.apagadas.join() === 'cvS',
      { ev: noAlvo(wn.ev), tag: noAlvo(wn.tag), nota: noAlvo(wn.nota) })
  }

  // ═══ 3. A INVARIANTE: sem a prova, NÃO apaga e DIZ ═══
  const naoApagou = (nome, w, r) => {
    ok(`${nome}: a sobra NÃO é apagada`, w.apagadas.length === 0 && w.convs.some((c) => c.id === 'cvS'), { apagadas: w.apagadas })
    ok(`  e a resposta a lista em \`nao_apagadas\``, JSON.stringify(plano(r).nao_apagadas) === JSON.stringify(['cvS']), plano(r))
  }
  {
    const wa = mundo({ msgs: 6, opMsg: { updateFalha: true } }), wn = mundo({ msgs: 6, opMsg: { updateFalha: true } })
    await ANTIGO(wa.ctx(REAL)); const rn = await NOVO(wn.ctx(REAL))
    ok('CONTROLE — antes: toda atualização falhava em silêncio e a sobra era apagada com as 6 mensagens dentro', wa.apagadas.includes('cvS') && orfas(wa.msg) === 6, { apagadas: wa.apagadas, orfas: orfas(wa.msg) })
    naoApagou('toda atualização de mensagem falha', wn, rn)
    ok('  e as 6 mensagens continuam na sobra, alcançáveis', orfas(wn.msg) === 6, orfas(wn.msg))
    ok('  sem progresso a rodada para: no máximo 2 leituras de mensagens (não gira em falso)', wn.msg.leituras <= 2, wn.msg.leituras)
  }
  {
    const w = mundo({ msgs: 1300, opMsg: { falhaNaLeitura: 2 } })
    const r = await NOVO(w.ctx(REAL))
    naoApagou('leitura que falha na 2ª rodada', w, r)
    ok('  as 500 já movidas ficam movidas e as 800 restantes continuam na sobra', noAlvo(w.msg) === 500 && orfas(w.msg) === 800, { movidas: noAlvo(w.msg), restam: orfas(w.msg) })
  }
  {
    const w = mundo({ msgs: 6, opMsg: { updateIgnorado: true } })
    const r = await NOVO(w.ctx(REAL))
    naoApagou('atualização que resolve mas NÃO pega', w, r)
    ok('  para no teto de 20 rodadas, sem laço infinito', w.msg.leituras === 20, w.msg.leituras)
  }
  {
    const w = mundo({ msgs: 6, opMsg: { filtroIgnorado: true } })
    const r = await NOVO(w.ctx(REAL))
    naoApagou('o filtro não é honrado pela plataforma', w, r)
  }
  {
    // O que falhou foi um modelo que NÃO é de mensagens: a regra vale para os quatro.
    const w = mundo({ msgs: 3, eventos: 5, opEv: { updateFalha: true } })
    const r = await NOVO(w.ctx(REAL))
    naoApagou('atualização de EVENTO falha (as mensagens foram todas movidas)', w, r)
    ok('  as mensagens, essas, foram movidas', noAlvo(w.msg) === 3 && orfas(w.msg) === 0, noAlvo(w.msg))
  }

  // ═══ 3b. MODELO AUSENTE NÃO É PROVA DE VAZIO ═══
  for (const [modelo, opcao, rotulo] of [
    ['WaConversationTags', { etiquetas: 2 }, 'etiquetas'], ['WaInternalNotes', { notas: 2 }, 'notas internas'], ['WaConversationEvents', { eventos: 2 }, 'eventos'],
  ]) {
    const w = mundo({ msgs: 3, ...opcao, semModelo: modelo })
    const r = await NOVO(w.ctx(REAL))
    naoApagou(`o modelo de ${rotulo} (${modelo}) NÃO EXISTE`, w, r)
    ok('  as mensagens, essas, foram movidas', noAlvo(w.msg) === 3 && orfas(w.msg) === 0, noAlvo(w.msg))
  }
  {
    const aux = carregarContexto('490f whatsapp POST /whatsapp/manutencao/unir-duplicatas')._moverTudoEProvar
    for (const ausente of [undefined, null]) {
      const r = await aux(ausente, ['conversation_id', 'conversationId'], 'cvS', 'cvT')
      ok(`o auxiliar com modelo ${String(ausente)} devolve completo: false (ausência não é prova)`, r && r.completo === false && r.movidas === 0, r)
    }
  }

  // ═══ 4. o padrão é SIMULAR: nada é gravado ═══
  {
    const w = mundo({ msgs: 700, eventos: 10 })
    const r = await NOVO(w.ctx({}))
    ok('sem `simular: false` é simulação: nada movido, nada apagado', r.status === 200 && r.body.data.simulado === true && w.apagadas.length === 0 && w.msg.atualizacoes === 0 && w.ev.atualizacoes === 0,
      { simulado: r.body && r.body.data && r.body.data.simulado, atualizacoes: w.msg.atualizacoes })
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
