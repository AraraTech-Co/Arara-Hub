// Reabrir conversa concluída (PRD 06b) — POST /whatsapp/:id/reopen.
//
// Conversa concluída com chamado pendente não tinha como voltar: abrir outra chegava sem ticket.
//
// O QUE SE GARANTE (handler EXECUTADO, carregado do literal gerado):
//   - reabre: status "open", fase e dono de quem reabriu, `resolved_at`/`close_reason_id`/`menu_node` nulos;
//     os DOIS campos de conclusão saem juntos, senão a conversa fica aberta e presa na aba Concluídas;
//   - `ticket_id` NÃO é tocado — é o pedido do PRD;
//   - evento `reopened` com o autor;
//   - recusa sem gravar: conversa aberta (409), inexistente (404), outra conta (403), outra conversa
//     aberta do mesmo contato (409, pelo MESMO predicado da entrada) e lista de abertas no teto (503);
//   - identidade só pela sessão do portal ainda vira dono;
//   - grupo não ganha dono.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node reabrir-conversa.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const handler = carregarHandler('whatsapp POST /whatsapp/:id/reopen')

const CONCLUIDA = {
  id: 'c1',
  remote_jid: '5519999998888@s.whatsapp.net',
  remote_lid: null,
  contact_name: 'Cliente',
  status: 'closed',
  phase: 'resolvido',
  resolved_at: '2026-10-20T12:00:00Z',
  close_reason_id: 'cr1',
  menu_node: 'n3',
  assigned_to_id: null,
  ticket_id: 'tck_123',
  conta_id: null,
}

function mundo(over = {}) {
  const conv = Object.assign({}, CONCLUIDA, over.conv || {})
  return {
    conv,
    outras: over.outras || [],
    perfil: over.perfil !== undefined ? over.perfil : { id: 'u1', role: 'support' },
    sessao: over.sessao || null,
    user: over.user !== undefined ? over.user : { id: 'u1' },
    updates: [],
    eventos: [],
  }
}

function ctxDe(w) {
  const abertas = () => w.outras.filter((c) => String(c.status || 'open') === 'open')
  return {
    params: { id: 'c1' },
    body: {},
    headers: w.sessao ? { 'x-portal-sessao': w.sessao } : {},
    user: w.user,
    reply: reply(),
    models: {
      WhatsAppConversation: {
        findById: async (id) => (String(id) === String(w.conv.id) ? w.conv : null),
        // A camada filtra por igualdade; o resto é peneirado em memória.
        findMany: async (f) => {
          const todas = [w.conv].concat(w.outras)
          if (f && f.status !== undefined) return todas.filter((c) => String(c.status || 'open') === f.status)
          return todas
        },
        update: async (id, patch) => { w.updates.push({ id, patch }); return Object.assign(w.conv, patch) },
      },
      WaConversationEvents: {
        create: async (row) => { w.eventos.push(row); return row },
      },
      Profile: { findById: async (id) => (w.perfil && String(w.perfil.id) === String(id) ? w.perfil : null) },
      Sessao: {
        findById: async (id) => (id === 'ses_abc' ? { user_id: 'u9', verificador: 'xyz', revogada: false } : null),
      },
    },
  }
}

async function chamar(w) {
  const r = await handler(ctxDe(w))
  return { status: r.status || 200, body: r.body }
}

// ─── Caminho feliz ──────────────────────────────────────────────────────────
async function bateriaFeliz(h) {
  const f = []
  const w = mundo()
  const r = await h(ctxDe(w))
  if ((r.status || 200) !== 200) f.push('status:' + r.status)
  if (w.updates.length !== 1) { f.push('gravou ' + w.updates.length + 'x'); return f }
  const p = w.updates[0].patch
  if (p.status !== 'open') f.push('status-nao-abriu:' + p.status)
  if (p.phase !== 'em_atendimento') f.push('fase:' + p.phase)
  if (p.assigned_to_id !== 'u1') f.push('dono:' + p.assigned_to_id)
  if (p.resolved_at !== null) f.push('resolved_at:' + p.resolved_at)
  if (p.close_reason_id !== null) f.push('close_reason_id:' + p.close_reason_id)
  if (p.menu_node !== null) f.push('menu_node:' + p.menu_node)
  if (!p.updated_at) f.push('sem-updated_at')
  if ('ticket_id' in p) f.push('mexeu-no-ticket')
  if (w.conv.ticket_id !== 'tck_123') f.push('perdeu-o-ticket:' + w.conv.ticket_id)
  const ev = w.eventos[0]
  if (!ev || ev.type !== 'reopened') f.push('sem-evento')
  else {
    if (String(ev.conversation_id) !== 'c1') f.push('evento-de-outra-conversa')
    if (ev.actor_id !== 'u1') f.push('evento-sem-autor:' + ev.actor_id)
  }
  return f
}

// ─── Recusas: cada uma responde o código certo E não grava ──────────────────
async function bateriaRecusas(h) {
  const f = []
  async function recusa(nome, w, esperado) {
    const r = await h(ctxDe(w))
    if ((r.status || 200) !== esperado) f.push(nome + ':status=' + (r.status || 200))
    if (w.updates.length) f.push(nome + ':gravou')
    if (w.eventos.length) f.push(nome + ':evento')
  }
  // Conversa que não está concluída não se reabre.
  await recusa('aberta', mundo({ conv: { status: 'open', phase: 'em_atendimento' } }), 409)

  // "Concluída" é status OU fase: cada uma sozinha basta para reabrir.
  async function aceita(nome, w) {
    const r = await h(ctxDe(w))
    if ((r.status || 200) !== 200) f.push(nome + ':status=' + (r.status || 200))
    if (w.updates.length !== 1) f.push(nome + ':gravou ' + w.updates.length + 'x')
    else if (w.updates[0].patch.status !== 'open') f.push(nome + ':nao-abriu')
  }
  await aceita('so-fase-resolvido', mundo({ conv: { status: 'open', phase: 'resolvido' } }))
  await aceita('so-status-closed', mundo({ conv: { status: 'closed', phase: 'novo' } }))

  // 403: conversa de conta nomeada, sem o grant da conta. Vem ANTES do 404 de propósito: as duas
  // saem da mesma trava, e assim o que falha primeiro nomeia a conta.
  await recusa('outra-conta', mundo({ conv: { conta_id: 'setor9' } }), 403)

  // 404: id que não existe.
  const w404 = mundo()
  const ctx404 = ctxDe(w404); ctx404.params.id = 'nao-existe'
  const r404 = await h(ctx404)
  if ((r404.status || 200) !== 404) f.push('inexistente:status=' + r404.status)
  if (w404.updates.length) f.push('inexistente:gravou')

  // 401: sem pessoa (nem JWT, nem sessão do portal).
  await recusa('sem-pessoa', mundo({ user: null }), 401)

  // 403: nível abaixo de support.
  await recusa('nivel-baixo', mundo({ perfil: { id: 'u1', role: 'user' } }), 403)
  return f
}

// ─── Duplicata: o MESMO predicado da entrada (POST /whatsapp/inbound) ───────
async function bateriaDuplicata(h) {
  const f = []
  async function caso(nome, outras, esperado, convOver) {
    const w = mundo({ outras, conv: convOver })
    const r = await h(ctxDe(w))
    const st = r.status || 200
    if (st !== esperado) f.push(nome + ':status=' + st)
    if (esperado === 409 && w.updates.length) f.push(nome + ':gravou-mesmo-assim')
    if (esperado === 200 && !w.updates.length) f.push(nome + ':nao-gravou')
  }
  const outra = (over) => Object.assign({ id: 'c2', status: 'open', remote_jid: '', remote_lid: null }, over)

  // Bloqueia: mesmo jid, mesmos dígitos (com e sem máscara) e mesma cauda (nono dígito).
  await caso('jid-igual', [outra({ remote_jid: '5519999998888@s.whatsapp.net' })], 409)
  await caso('mesmos-digitos', [outra({ remote_jid: '55 (19) 99999-8888@s.whatsapp.net' })], 409)
  await caso('mesma-cauda', [outra({ remote_jid: '5119999998888@s.whatsapp.net' })], 409)
  await caso('por-lid', [outra({ remote_jid: '551100000000@s.whatsapp.net', remote_lid: '12345678901234' })],
    409, { remote_lid: '12345678901234' })

  // Não bloqueia: outro contato, conversa fechada, e a PRÓPRIA conversa.
  await caso('outro-contato', [outra({ remote_jid: '5531988887777@s.whatsapp.net' })], 200)
  await caso('fechada-nao-conta', [outra({ remote_jid: '5519999998888@s.whatsapp.net', status: 'closed' })], 200)
  await caso('ela-mesma', [], 200)

  // LID salvo no remote_jid NUNCA casa por telefone — é a regra da entrada. Os dígitos aqui são os
  // MESMOS do telefone: sem a guarda do LID, esta conversa casaria e bloquearia a reabertura.
  await caso('lid-salvo-nao-bloqueia', [outra({ remote_jid: '5519999998888@lid' })], 200)

  // Teto de 500 por leitura: a duplicata pode ser a que ficou de fora.
  const cheio = []
  for (let i = 0; i < 500; i++) cheio.push(outra({ id: 'x' + i, remote_jid: '553100000' + i + '@s.whatsapp.net' }))
  await caso('teto-500', cheio, 503)
  return f
}

// ─── Identidade pela sessão, e grupo sem dono ───────────────────────────────
async function bateriaDonoEGrupo(h) {
  const f = []
  // JWT expirado: a pessoa vem da sessão do portal e mesmo assim fica com a conversa.
  const ws = mundo({ user: null, sessao: 'abc.xyz', perfil: { id: 'u9', role: 'support' } })
  const rs = await h(ctxDe(ws))
  if ((rs.status || 200) !== 200) f.push('sessao:status=' + rs.status)
  else {
    const p = ws.updates[0] ? ws.updates[0].patch : {}
    if (p.assigned_to_id !== 'u9') f.push('sessao-sem-dono:' + p.assigned_to_id)
    if (p.phase !== 'em_atendimento') f.push('sessao-fase:' + p.phase)
    if (!ws.eventos[0] || ws.eventos[0].actor_id !== 'u9') f.push('sessao-evento-sem-autor')
  }
  // Grupo não tem dono; sem dono, a fase é a da entrada para conversa sem dono.
  const wg = mundo({ conv: { remote_jid: '120363000000000000@g.us', remote_lid: null } })
  const rg = await h(ctxDe(wg))
  if ((rg.status || 200) !== 200) f.push('grupo:status=' + rg.status)
  else {
    const p = wg.updates[0] ? wg.updates[0].patch : {}
    if (p.assigned_to_id !== null) f.push('grupo-ganhou-dono:' + p.assigned_to_id)
    if (p.phase !== 'novo') f.push('grupo-fase:' + p.phase)
    if (p.status !== 'open') f.push('grupo-nao-abriu')
  }
  return f
}

async function baterias(h) {
  return [].concat(
    (await bateriaFeliz(h)).map((x) => 'feliz/' + x),
    (await bateriaRecusas(h)).map((x) => 'recusa/' + x),
    (await bateriaDuplicata(h)).map((x) => 'dup/' + x),
    (await bateriaDonoEGrupo(h)).map((x) => 'dono/' + x),
  )
}

// ─── Mutações: o handler reescrito no literal, recompilado e reexecutado ────
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { ARQ } = require('./_carregar.js')

function fonteDaRota() {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf('whatsapp POST /whatsapp/:id/reopen')
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  const m = re.exec(s)
  return JSON.parse('"' + m[1] + '"')
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

const MUTACOES = [
  ['limpa só o status', [['status: "open",\n    phase:', 'status: "open",\n    _phase:']]],
  ['não limpa resolved_at', [['resolved_at: null,', 'resolved_at: "2026-10-20T12:00:00Z",']]],
  ['não limpa o motivo', [['close_reason_id: null,\n    menu_node', 'close_reason_id: "cr1",\n    menu_node']]],
  ['apaga o ticket ao reabrir', [['    status: "open",\n', '    status: "open",\n    ticket_id: null,\n']]],
  ['aceita conversa já aberta', [['if (!_fechada) return fail(ctx, 409, "Esta conversa não está concluída");', '']]],
  ['só olha o status ao decidir se está concluída',
    [['|| String(conv.phase || "") === "resolvido";', '|| false;']]],
  ['só olha a fase ao decidir se está concluída',
    [['String(conv.status || "open") === "closed"\n    ||', 'false\n    ||']]],
  ['sem a checagem de duplicata', [['if (_abertaPorTelefone(_c) || _abertaPorLid(_c)) _outra = _c;', '']]],
  ['duplicata só por jid igual',
    [['return rj === _phone || _phoneDigits(rj) === _dig || _phoneTail(rj) === _phoneTail(_phone);',
      'return rj === _phone;']]],
  ['LID salvo passa a casar por telefone', [['if (_ehLidSalvo(rj)) return false;\n', '']]],
  ['a própria conversa conta como duplicata', [['if (String(_c.id) === String(id)) continue;\n', '']]],
  ['teto de 500 ignorado', [['if (_abertas.length >= 500) {', 'if (false) {']]],
  ['grupo ganha dono', [['var _eu = _ehGrupo ? null : (_quem || null);', 'var _eu = _quem || null;']]],
  ['dono só pelo JWT', [['var _quem = userId(ctx) || (await _sessaoDoPortal(ctx));', 'var _quem = userId(ctx);']]],
  ['não grava o evento', [['      type: "reopened",', '      type: "outro",']]],
  ['grava antes de conferir a conta',
    [['  var _barrado = await _barrarPorConta(ctx, conv);\n  if (_barrado) return _barrado;\n',
      '  var _barrado = await _barrarPorConta(ctx, conv);\n  if (_barrado) { await m.Conv.update(id, { status: "open" }); return _barrado; }\n']]],
]

// ─── A tela: o botão espelha o de concluir e chama a rota ──────────────────
const PAINEL = fs.readFileSync(
  path.resolve(__dirname, '../../app/_components/inbox/crm-context-panel.tsx'), 'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function bateriaTela(c) {
  const f = []
  if (!/\{isResolved && \(/.test(c)) f.push('botao-nao-depende-de-isResolved')
  if (!/\{!isResolved && \(/.test(c)) f.push('concluir-sumiu')
  if (!/whatsappApi\.reopenConversation\(detail\.id\)/.test(c)) f.push('nao-chama-a-rota')
  const iRe = c.indexOf('{isResolved && (')
  const iBt = c.indexOf('reopenConversation')
  const iFim = c.indexOf('{!isResolved && (')
  if (iRe < 0 || iBt < 0 || iFim < 0 || !(iRe < iBt && iBt < iFim)) f.push('botao-fora-do-bloco-de-concluido')
  if (!/Reabrir conversa/.test(c)) f.push('sem-rotulo')
  return f
}

;(async () => {
  const base = fonteDaRota()
  const ft = bateriaTela(PAINEL)
  ok('a tela mostra "Reabrir conversa" só na conversa concluída e chama a rota', ft.length === 0, ft)
  const mutsTela = [
    ['botão aparece na conversa aberta', [['{isResolved && (', '{true && (']]],
    ['botão não chama a rota', [['whatsappApi.reopenConversation(detail.id)', 'Promise.resolve()']]],
    ['some o de concluir', [['{!isResolved && (', '{false && (']]],
  ]
  for (const [nome, pares] of mutsTela) {
    let mut = PAINEL
    let aplicou = true
    for (const [de, para] of pares) {
      if (mut.split(de).length - 1 !== 1) { aplicou = false; break }
      mut = mut.replace(de, () => para)
    }
    if (!aplicou || mut === PAINEL) { ok(`mutação "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora'); continue }
    const fm = bateriaTela(mut)
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }
  const f = await baterias(handler)
  ok('reabre mantendo o chamado, limpa a conclusão, registra o evento e recusa o que não pode', f.length === 0, f)

  for (const [nome, pares] of MUTACOES) {
    let mut = base
    let aplicou = true
    for (const [de, para] of pares) {
      if (mut.split(de).length - 1 !== 1) { aplicou = false; break }
      mut = mut.replace(de, () => para)
    }
    if (!aplicou || mut === base) { ok(`mutação "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora'); continue }
    let fm
    try { fm = await baterias(compilar(mut)) } catch (e) { fm = ['erro: ' + e.message] }
    const morreu = fm.length > 0 && !String(fm[0]).startsWith('erro')
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, morreu, fm.length ? fm[0] : 'sobreviveu')
  }
  fim()
})()
