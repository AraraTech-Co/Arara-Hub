// A lista de conversas (rota 432, `GET /whatsapp`) guarda a prévia das conversas abertas que
// ficaram FORA da janela das 500 mensagens mais recentes (laço `_faltam`).
//
// A tela consulta a lista a cada 10 s por pessoa. Cada consulta lia de novo a última mensagem de
// cada conversa aberta fora da janela. Agora a prévia achada fica na memória do processo e vale
// enquanto o `updated_at` da conversa não muda, por até 10 min.
//
// O QUE SE GARANTE (o MESMO handler compilado, chamado várias vezes, como no servidor):
//   - 1ª consulta: lê a conversa de fora (1 leitura) e responde IDÊNTICO ao handler de antes;
//   - 2ª consulta igual: NÃO lê, e responde idêntico à 1ª (inclusive a menção resolvida na prévia);
//   - a conversa mudou (`updated_at`): lê de novo e mostra a prévia nova;
//   - passados 10 min: lê de novo;
//   - leitura que falha não é guardada: a consulta seguinte tenta de novo;
//   - conversa aberta sem mensagem nenhuma: a falta também é guardada, e segue sem prévia;
//   - conversa que sai da lista de fora (ex.: encerrada) perde a guarda.
//
// MUTAÇÕES: cada uma aplicada uma vez e reprovada na asserção que a nomeia.
//
// Roda com: node lista-guarda-previa.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}

// Relógio controlado: o handler vê `Date.now()` andar só quando o teste manda.
let AGORA = Date.parse('2026-11-16T14:00:00Z')
class DataFalsa extends Date {
  constructor(...a) { super(...(a.length ? a : [AGORA])) }
  static now() { return AGORA }
}
function compilar(codigo) {
  const c = {
    console, Date: DataFalsa, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const COD = codigoDe('432 whatsapp GET /whatsapp ')
// O handler de antes: as três trocas do aplicador desfeitas.
const TROCAS = [
  [
    '// Prévia guardada (16/11/2026): prévia das conversas abertas fora da janela,\n' +
    '// por conversa, entre uma consulta e outra (ver o laço `_faltam`).\n' +
    'var _previaGuardada = {};\nvar _PREVIA_VALIDADE_MS = 10 * 60 * 1000;\n',
    '',
  ],
  [
    COD.slice(COD.indexOf('  // A prévia achada vale enquanto'), COD.indexOf('    try {\n', COD.indexOf('  // A prévia achada vale enquanto'))),
    '  for (var _q = 0; _q < _faltam.length && _q < 40; _q++) {\n',
  ],
  ['      _guardaNova[_faltam[_q]] = { chave: _chavePrevia[_faltam[_q]], em: _agoraPrevia, msg: _ult };\n', ''],
  ['  _previaGuardada = _guardaNova;\n', ''],
]
const ANTES = TROCAS.reduce((c, [de, para]) => {
  if (!de || c.split(de).length - 1 !== 1) throw new Error('âncora do controle: ' + String(de).slice(0, 50))
  return c.replace(de, () => para)
}, COD)

const BASE = Date.parse('2026-11-16T13:00:00Z')
const ts = (n) => new Date(BASE - (10000 - n) * 1000).toISOString()

// 520 mensagens recentes de cB empurram cA para fora da janela. cZ está aberta e não tem mensagem.
function massa() {
  const msgs = []
  msgs.push({ id: 'a1', conversation_id: 'cA', from_me: false, body: 'primeira de A', timestamp: ts(1), created_at: ts(1) })
  msgs.push({ id: 'a2', conversation_id: 'cA', from_me: false, sender_jid: '5511988887777@s.whatsapp.net', sender_name: 'Bia', body: '@5511988887777 ultima de A', timestamp: ts(3), created_at: ts(3) })
  for (let i = 0; i < 520; i++) msgs.push({ id: 'o' + i, conversation_id: 'cB', from_me: false, body: 'b' + i, timestamp: ts(100 + i), created_at: ts(100 + i) })
  return msgs
}
function novoServidor(cod) {
  const estado = { msgs: massa(), upd: { cA: ts(50), cB: ts(60), cZ: ts(40) }, status: { cA: 'open', cB: 'open', cZ: 'open' }, falhar: false, leituras: [] }
  const conv = (id) => ({ id, remote_jid: id + '@s.whatsapp.net', status: estado.status[id], phase: 'em_atendimento', updated_at: estado.upd[id], created_at: ts(0), unread_count: 0, conta_id: 'default' })
  const vazio = { findMany: async () => [], findById: async () => null }
  const handler = compilar(cod)
  const chamar = async () => {
    estado.leituras = []
    const ctx = {
      params: {}, query: {}, body: {}, headers: {}, user: { id: 'u1' },
      models: {
        Sessao: { findById: async () => null },
        Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
        WhatsAppConversation: { findById: async (i) => conv(i), findMany: async (f) => ['cA', 'cB', 'cZ'].map(conv).filter((c) => !f || !f.status || c.status === f.status), update: async () => ({}) },
        WhatsAppMessage: {
          findMany: async (f) => {
            if (f && f.conversation_id) {
              estado.leituras.push(f.conversation_id)
              if (estado.falhar) throw new Error('banco ocupado')
            }
            return camadaFindMany(estado.msgs, f)
          },
          findById: async () => null,
        },
        SystemSettings: { findMany: async () => [{}] },
        CompanyContact: vazio, WaDepartment: vazio, Company: vazio, Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio, WaConversationEvents: vazio,
      },
      reply: reply(),
    }
    let r
    try { r = await handler(ctx) } catch (e) { r = { status: 'estouro: ' + String(e && e.message).slice(0, 60), body: null } }
    const lista = (r.body && (r.body.data || r.body)) || []
    const de = (id) => (Array.isArray(lista) ? lista : []).find((x) => x.id === id) || null
    return { status: r.status, corpo: JSON.stringify(r.body), leituras: estado.leituras.slice(), de }
  }
  return { estado, chamar }
}
const previa = (c) => (c && c.last_message && c.last_message.body) || null

const NOMES = [
  'TRAVA: a lista respondeu 200 com cA, cB e cZ',
  'controle: o handler de antes lê cA em toda consulta',
  '1ª consulta: lê cA e cZ uma vez cada',
  '1ª consulta: resposta idêntica à do handler de antes',
  'TRAVA DE MASSA: a prévia de cA é a última, com a menção resolvida',
  '2ª consulta igual: não lê nada fora da janela',
  '2ª consulta igual: resposta idêntica à 1ª',
  'conversa mudou (updated_at): lê cA de novo e mostra a prévia nova',
  'passados 10 min: lê de novo',
  'antes de 10 min: ainda não lê',
  'leitura que falhou não é guardada: a consulta seguinte tenta de novo',
  'conversa sem mensagem: segue sem prévia, e a falta também é guardada',
  'conversa que sai de fora da janela perde a guarda',
]

async function bateria(cod) {
  const f = []
  AGORA = Date.parse('2026-11-16T14:00:00Z')
  const s = novoServidor(cod)
  const c1 = await s.chamar()
  const antesSrv = novoServidor(ANTES)
  const a1 = await antesSrv.chamar()
  const a2 = await antesSrv.chamar()
  if (!(c1.status === 200 && c1.de('cA') && c1.de('cB') && c1.de('cZ'))) f.push(NOMES[0])
  if (!(a1.leituras.includes('cA') && a2.leituras.includes('cA'))) f.push(NOMES[1])
  if (!(c1.leituras.filter((x) => x === 'cA').length === 1 && c1.leituras.filter((x) => x === 'cZ').length === 1)) f.push(NOMES[2])
  if (c1.corpo !== a1.corpo) f.push(NOMES[3])
  if (previa(c1.de('cA')) !== '@Bia ultima de A') f.push(NOMES[4])

  const c2 = await s.chamar()
  if (c2.leituras.length !== 0) f.push(NOMES[5])
  if (c2.corpo !== c1.corpo) f.push(NOMES[6])

  // a conversa muda: uma mensagem nova de cA, ainda mais velha que as 500 de cB (a camada ordena
  // pela gravação), e o updated_at anda
  s.estado.msgs.splice(2, 0, { id: 'a3', conversation_id: 'cA', from_me: true, body: 'mais nova de A', timestamp: ts(5), created_at: ts(5) })
  s.estado.upd.cA = ts(70)
  const c3 = await s.chamar()
  if (!(c3.leituras.includes('cA') && previa(c3.de('cA')) === 'mais nova de A')) f.push(NOMES[7])

  AGORA += 9 * 60 * 1000
  const c4 = await s.chamar()
  if (c4.leituras.length !== 0) f.push(NOMES[9])
  AGORA += 2 * 60 * 1000
  const c5 = await s.chamar()
  if (!c5.leituras.includes('cA')) f.push(NOMES[8])

  // leitura falha: nada guardado, e a seguinte tenta de novo
  s.estado.upd.cA = ts(80)
  s.estado.falhar = true
  const c6 = await s.chamar()
  s.estado.falhar = false
  const c7 = await s.chamar()
  if (!(c6.leituras.includes('cA') && c7.leituras.includes('cA') && previa(c7.de('cA')) === 'mais nova de A')) f.push(NOMES[10])

  const c8 = await s.chamar()
  if (!(previa(c7.de('cZ')) === null && previa(c8.de('cZ')) === null && !c8.leituras.includes('cZ'))) f.push(NOMES[11])

  // cZ encerra (sai de `_faltam`) e reabre com o mesmo updated_at: tem de ler de novo
  s.estado.status.cZ = 'closed'
  await s.chamar()
  s.estado.status.cZ = 'open'
  const c9 = await s.chamar()
  if (!c9.leituras.includes('cZ')) f.push(NOMES[12])
  return f
}

;(async () => {
  const f = await bateria(COD)
  for (const n of NOMES) ok(n, !f.includes(n), f)

  const MUTS = [
    ['sem guardar a prévia achada', '      _guardaNova[_faltam[_q]] = { chave: _chavePrevia[_faltam[_q]], em: _agoraPrevia, msg: _ult };\n', '', '2ª consulta igual: não lê nada fora da janela'],
    ['a guarda não passa para a consulta seguinte', '  _previaGuardada = _guardaNova;\n', '', '2ª consulta igual: não lê nada fora da janela'],
    ['ignora o updated_at', '_g.chave === _chavePrevia[_faltam[_q]] && ', '', 'conversa mudou (updated_at): lê cA de novo e mostra a prévia nova'],
    ['sem prazo de validade', ' && _agoraPrevia - _g.em < _PREVIA_VALIDADE_MS', '', 'passados 10 min: lê de novo'],
    ['prazo de 1 min', 'var _PREVIA_VALIDADE_MS = 10 * 60 * 1000;', 'var _PREVIA_VALIDADE_MS = 1 * 60 * 1000;', 'antes de 10 min: ainda não lê'],
    ['guarda a falha da leitura', '    } catch (e) {}\n  }\n  _previaGuardada = _guardaNova;\n', '    } catch (e) { _guardaNova[_faltam[_q]] = { chave: _chavePrevia[_faltam[_q]], em: _agoraPrevia, msg: null }; }\n  }\n  _previaGuardada = _guardaNova;\n', 'leitura que falhou não é guardada: a consulta seguinte tenta de novo'],
    ['prévia guardada fora das menções', '        _todasMsgs.push(_g.msg);\n', '', '2ª consulta igual: resposta idêntica à 1ª'],
    ['guarda acumula entre consultas', '  _previaGuardada = _guardaNova;\n', '  _previaGuardada = Object.assign(_previaGuardada, _guardaNova);\n', 'conversa que sai de fora da janela perde a guarda'],
    ['guarda sem a falta (msg null vira nova leitura)', '    if (_g && _g.chave', '    if (_g && _g.msg && _g.chave', 'conversa sem mensagem: segue sem prévia, e a falta também é guardada'],
  ]
  for (const [nome, de, para, assercao] of MUTS) {
    const n = COD.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(COD.replace(de, () => para)) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" morre em "${assercao}"`, fm.includes(assercao), fm)
  }
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
