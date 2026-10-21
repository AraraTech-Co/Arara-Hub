// Dev responsável e prazo visíveis para o SUPORTE (spec 21/10/2026, entrega A) e ASAP com data.
//
// O QUE SE GARANTE:
//  Kanban de Suporte (GET /tickets/kanban) e detalhe do chamado (GET /tickets/:id):
//   - card Dev de CHAMADO, aberto e com responsável: o chamado traz `dev` {nome, prazo, card};
//   - card criado SEM dev (critério 1), card já encerrado (aplicado/descartado) e chamado sem card:
//     nada muda (`dev: null`);
//   - demanda INTERNA (card Dev sem origem) não aparece em chamado nenhum (critério 7) e o quadro Dev
//     não ganha a chave;
//   - outro dev reassume (critério 6): o nome muda nos dois lugares, sem nada para sincronizar;
//   - reestimar muda o prazo mostrado ao suporte;
//   - com dois cards abertos para o mesmo chamado vale o atualizado por último;
//   - nível abaixo de suporte não recebe a chave `dev` (o nome do dev não sai dali).
//  ASAP (POST /dev/tickets/:id/mover, entrando em Aguardando Início): exige data explícita NO SERVIDOR
//   (sem data, data inválida e data passada são recusadas), grava a data informada, e os demais
//   esforços seguem como eram.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node dev-responsavel-no-suporte.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

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
    setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const KANBAN = codigoDe('GET /tickets/kanban')
const DETALHE = codigoDe('GET /tickets/:id (')
const MOVER = codigoDe('POST /dev/tickets/:id/mover')

const PERFIS = [
  { id: 'p-ana', user_id: 'u-ana', full_name: 'Ana Dev', role: 'developer', email: 'ana@x.com' },
  { id: 'p-bia', user_id: 'u-bia', full_name: 'Bia Dev', role: 'developer', email: 'bia@x.com' },
  { id: 'p-sup', user_id: 'u-sup', full_name: 'Sueli Suporte', role: 'support', email: 'sue@x.com' },
  { id: 'p-usr', user_id: 'u-usr', full_name: 'Vitor User', role: 'user', email: 'v@x.com' },
]
const t = (id, extra) => ({ id, ticket_number: 'TCK' + id, title: 'Chamado ' + id, status: 'pendencia_dev', quadro: 'suporte', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...extra })
const card = (id, origem, extra) => ({ id, ticket_number: 'DEV' + id, dev_ticket_number: 'DEV' + id, quadro: 'dev', status: 'em_desenvolvimento', origem_ticket_id: origem, assigned_to: 'p-ana', previsao_entrega: '2026-10-30T12:00:00', updated_at: '2026-10-10T10:00:00Z', created_at: '2026-10-05T10:00:00Z', ...extra })

function mundo(tickets) {
  const linhas = tickets.map((x) => ({ ...x }))
  const vazio = { findMany: async () => [], findById: async () => null }
  const casa = (r, f) => Object.entries(f || {}).every(([k, v]) => ['limit', 'offset', 'mascararCampos'].includes(k) || String(r[k] ?? '') === String(v))
  const gravacoes = []
  return {
    linhas, gravacoes,
    models: {
      Ticket: {
        findMany: async (f) => linhas.filter((r) => casa(r, f)).map((r) => ({ ...r })),
        findById: async (id) => { const r = linhas.find((x) => x.id === id); return r ? { ...r } : null },
        update: async (id, p) => { gravacoes.push({ id, ...p }); const r = linhas.find((x) => x.id === id); if (r) Object.assign(r, p); return r },
      },
      Profile: { findMany: async () => PERFIS.map((p) => ({ ...p })), findById: async (id) => { const p = PERFIS.find((x) => x.id === id || x.user_id === id); return p ? { ...p } : null } },
      Sessao: vazio, SLATracking: vazio, TicketCoAssignee: vazio, TicketMessage: vazio, Unit: vazio, ActivityLog: { create: async (e) => e, findMany: async () => [] },
      TicketParticipant: vazio, Company: vazio, ClientUser: vazio,
    },
  }
}
const ctxDe = (m, quem, extra) => Object.assign({ params: {}, query: {}, body: {}, headers: {}, user: { id: quem }, models: m.models, reply: reply(), secrets: { get: async () => null }, fetch: async () => ({ status: 200, body: '{}' }) }, extra)

async function bateria(cod = { kanban: KANBAN, detalhe: DETALHE, mover: MOVER }) {
  const falhas = []
  const x = (nome, cond, det) => { if (!cond) falhas.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 240) : '')) }
  const kanban = compilar(cod.kanban), detalhe = compilar(cod.detalhe), mover = compilar(cod.mover)
  const base = () => [
    t('T1'), t('T2'), t('T3'), t('T4'), t('T5', { status: 'em_atendimento' }), t('T6'),
    t('T7', { origem_ticket_id: 'T1', assigned_to: 'p-bia', status: 'em_atendimento', updated_at: '2026-10-20T10:00:00Z' }),   // chamado de SUPORTE que aponta para T1: não é card Dev
    card('D1', 'T1'),
    card('D2', 'T2', { assigned_to: null, status: 'no_status' }),
    card('D3', 'T3', { status: 'aplicado_no_cliente' }),
    card('D4', null),                      // demanda INTERNA (origem nula)
    card('D10', undefined),                // demanda INTERNA (sem o campo)
    t('undefined'), t('null'),             // chamados cujo id COINCIDE com a chave de uma origem ausente
    card('D5', 'T4', { assigned_to: 'p-ana', updated_at: '2026-10-11T10:00:00Z', previsao_entrega: '2026-11-05T12:00:00' }),
    card('D7', 'T6', { assigned_to: 'p-ana', updated_at: '2026-10-10T10:00:00Z' }),
    card('D8', 'T6', { assigned_to: null, status: 'no_status', updated_at: '2026-10-14T10:00:00Z' }),
    card('D6', 'T4', { assigned_to: 'p-bia', updated_at: '2026-10-12T10:00:00Z', previsao_entrega: '2026-11-09T12:00:00' }),
  ]
  const lerKanban = async (m, quem = 'u-sup', query) => { const r = await kanban(ctxDe(m, quem, { query: query || {} })); return r }
  const porId = (r) => Object.fromEntries(((r.body && r.body.tickets) || []).map((tt) => [tt.id, tt]))

  let m = mundo(base())
  let r = await lerKanban(m)
  let k = porId(r)
  x('kanban: responde 200 com os chamados do suporte', r.status === 200 && ['T1', 'T2', 'T3', 'T4', 'T5'].every((id) => k[id]), r.status)
  x('kanban: card de chamado, aberto e com dev → nome, prazo e card', k.T1.dev && k.T1.dev.responsavel.nome === 'Ana Dev' && k.T1.dev.previsao_entrega === '2026-10-30T12:00:00' && k.T1.dev.ticket_id === 'D1', k.T1.dev)
  x('kanban: card criado SEM dev → nada muda (dev nulo)', k.T2.dev === null, k.T2.dev)
  x('kanban: card já encerrado → nada muda', k.T3.dev === null, k.T3.dev)
  x('kanban: chamado sem card Dev → nulo', k.T5.dev === null, k.T5.dev)
  x('kanban: demanda INTERNA é excluída pela guarda (e não por a chave lixo nunca casar): chamados com id "undefined" e "null" não ganham dev', k.undefined && k.null && k.undefined.dev === null && k.null.dev === null && Object.values(k).every((tt) => !tt.dev || (tt.dev.ticket_id !== 'D4' && tt.dev.ticket_id !== 'D10')), { u: k.undefined && k.undefined.dev, n: k.null && k.null.dev })
  x('kanban: dois cards abertos no mesmo chamado → vale o atualizado por último', k.T4.dev && k.T4.dev.ticket_id === 'D6' && k.T4.dev.responsavel.nome === 'Bia Dev', k.T4.dev)
  x('kanban: card mais novo SEM dev não esconde o card com dev', k.T6.dev && k.T6.dev.ticket_id === 'D7', k.T6.dev)
  x('kanban: chamado de suporte com origem_ticket_id não vira dev de ninguém', k.T1.dev && k.T1.dev.ticket_id === 'D1', k.T1.dev)
  x('kanban: o responsável tem só id e nome (nada de e-mail ou perfil)', k.T1.dev && Object.keys(k.T1.dev.responsavel).sort().join() === 'id,nome', k.T1.dev && k.T1.dev.responsavel)
  // reatribuição e reestimativa (critério 6 e 5)
  m.linhas.find((c) => c.id === 'D1').assigned_to = 'p-bia'
  m.linhas.find((c) => c.id === 'D1').previsao_entrega = '2026-11-20T12:00:00'
  k = porId(await lerKanban(m))
  x('kanban: outro dev reassume → nome e prazo novos', k.T1.dev.responsavel.nome === 'Bia Dev' && k.T1.dev.previsao_entrega === '2026-11-20T12:00:00', k.T1.dev)
  // quadro Dev
  r = await lerKanban(mundo(base()), 'u-sup', { quadro: 'dev' })
  x('quadro Dev: não ganha a chave `dev`', ((r.body && r.body.tickets) || []).length > 0 && r.body.tickets.every((tt) => tt.dev === undefined), r.status)
  // nível
  r = await lerKanban(mundo(base()), 'u-usr')
  x('kanban: nível abaixo de suporte não recebe a chave `dev`', r.status === 200 && ((r.body && r.body.tickets) || []).length > 0 && r.body.tickets.every((tt) => tt.dev === undefined), r.status)

  // detalhe do chamado
  const ver = (m2, id, quem) => detalhe(ctxDe(m2, quem || 'u-sup', { params: { id } }))
  m = mundo(base())
  let d = await ver(m, 'T1')
  x('detalhe: card de chamado aberto e com dev → nome, prazo e card', d.status === 200 && d.body.dev && d.body.dev.responsavel.nome === 'Ana Dev' && d.body.dev.previsao_entrega === '2026-10-30T12:00:00' && d.body.dev.ticket_id === 'D1', d.body && d.body.dev)
  x('detalhe: sem dev, encerrado ou sem card → dev nulo', (await ver(m, 'T2')).body.dev === null && (await ver(m, 'T3')).body.dev === null && (await ver(m, 'T5')).body.dev === null)
  x('detalhe: dois abertos → o atualizado por último', (await ver(m, 'T4')).body.dev.ticket_id === 'D6')
  x('detalhe: card mais novo SEM dev não esconde o card com dev', (await ver(m, 'T6')).body.dev.ticket_id === 'D7')
  m.linhas.find((c) => c.id === 'D1').assigned_to = 'p-bia'
  x('detalhe: outro dev reassume → nome novo', (await ver(m, 'T1')).body.dev.responsavel.nome === 'Bia Dev')
  d = await ver(mundo(base()), 'T1', 'u-usr')
  x('detalhe: nível abaixo de suporte não recebe a chave `dev`', d.status === 200 && !('dev' in d.body), d.body && Object.keys(d.body))
  d = await ver(mundo(base()), 'D4')
  x('detalhe do card Dev interno: sem a chave `dev`', d.status === 200 && !('dev' in d.body), d.body && Object.keys(d.body))

  // ASAP
  const cardNo = () => mundo([card('D9', null, { status: 'no_status', assigned_to: null, migrado: false, description: 'x' })])
  const mover1 = async (corpo, status = 'backlog') => { const mm = cardNo(); const rr = await mover(ctxDe(mm, 'u-ana', { params: { id: 'D9' }, body: { status, ...corpo } })); return { rr, mm } }
  const amanha = new Date(Date.now() + 86400000), ymd = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
  let a = await mover1({ esforco_entrega: 'asap' })
  x('ASAP sem data: recusado pelo servidor, com a mensagem pedindo a data', a.rr.status === 400 && /ASAP exige uma data/.test(a.rr.body.error) && a.mm.gravacoes.length === 0, a.rr.body)
  a = await mover1({ esforco_entrega: 'asap', previsao_entrega: 'amanhã' })
  x('ASAP com data inválida: recusado', a.rr.status === 400 && a.mm.gravacoes.length === 0, a.rr.body)
  a = await mover1({ esforco_entrega: 'asap', previsao_entrega: '2020-01-01' })
  x('ASAP com data passada: recusado', a.rr.status === 400 && /já passou/.test(a.rr.body.error) && a.mm.gravacoes.length === 0, a.rr.body)
  a = await mover1({ esforco_entrega: 'asap', previsao_entrega: ymd(amanha) })
  const g = a.mm.gravacoes[0]
  x('ASAP com data futura: aceito e grava a data informada', a.rr.status === 200 && g && g.previsao_entrega === ymd(amanha) && g.esforco_entrega === 'asap', { s: a.rr.status, g })
  a = await mover1({ esforco_entrega: 'asap', previsao_entrega: ymd(amanha) + 'T09:30:00' })
  x('ASAP com data e hora: aceito', a.rr.status === 200 && a.mm.gravacoes[0] && a.mm.gravacoes[0].previsao_entrega === ymd(amanha) + 'T09:30:00', a.rr.body)
  a = await mover1({ esforco_entrega: 'um_sprint' })
  x('outro esforço (1 sprint) segue como antes: sexta ao meio-dia, sem pedir data', a.rr.status === 200 && /T12:00:00$/.test(a.mm.gravacoes[0].previsao_entrega), a.mm.gravacoes[0])
  a = await mover1({ esforco_entrega: 'indeterminado' })
  x('indeterminado segue sem data', a.rr.status === 200 && a.mm.gravacoes[0].previsao_entrega === null, a.mm.gravacoes[0])
  return falhas
}

;(async () => {
  const f0 = await bateria()
  ok('a bateria passa limpa', f0.length === 0, f0)
  const muts = [
    ['kanban: encerrado também mostra', 'kanban', '    var _encerrado = { aplicado_no_cliente: 1, descartado: 1 };\n    for (var _d = 0;', '    var _encerrado = {};\n    for (var _d = 0;'],
    ['kanban: card sem responsável também mostra', 'kanban', '      if (!_dr) continue;\n', ''],
    ['kanban: card de outro quadro entra', 'kanban', 'if (String(dc.quadro || "suporte") !== "dev" || !dc.origem_ticket_id) continue;', ''],
    ['kanban: demanda interna entra (sem a guarda da origem)', 'kanban', 'if (String(dc.quadro || "suporte") !== "dev" || !dc.origem_ticket_id) continue;', 'if (String(dc.quadro || "suporte") !== "dev") continue;'],
    ['kanban: vale o mais antigo', 'kanban', '_devAtualizado[_chave] >= _quando', '_devAtualizado[_chave] <= _quando'],
    ['kanban: nível não filtra', 'kanban', '_veDev = !!(_euDev && _euDev.nivel >= _gsRANK.support);', '_veDev = true;'],
    ['kanban: responsável com e-mail', 'kanban', 'responsavel: { id: _dr.id, nome: _dr.full_name || _dr.email || null },', 'responsavel: { id: _dr.id, nome: _dr.full_name || _dr.email || null, email: _dr.email },'],
    ['kanban: o quadro Dev ganha a chave', 'kanban', '_veDev && _quadro !== "dev" ? (_devPorOrigem[id] || null) : undefined', '_veDev ? (_devPorOrigem[id] || null) : undefined'],
    ['detalhe: nível não filtra', 'detalhe', 'if (_eu && _eu.nivel >= _gsRANK.support && String(out.quadro || "suporte") !== "dev") {', 'if (String(out.quadro || "suporte") !== "dev") {'],
    ['detalhe: encerrado também mostra', 'detalhe', 'var _encerrado = { aplicado_no_cliente: 1, descartado: 1 };\n      var _cards', 'var _encerrado = {};\n      var _cards'],
    ['detalhe: card sem responsável', 'detalhe', '        if (!(_cards[_c].assigned_to || _cards[_c].assignedTo)) continue;\n', ''],
    ['detalhe: vale o mais antigo', 'detalhe', 'String(_cards[_c].updated_at || "") > String(_melhor.updated_at || "")', 'String(_cards[_c].updated_at || "") < String(_melhor.updated_at || "")'],
    ['ASAP sem exigir data', 'mover', 'if (!_textoPrevisao || _limitePrevisao === null) {', 'if (false) {'],
    ['ASAP aceita data passada', 'mover', 'if (_limitePrevisao <= Date.now()) {', 'if (false) {'],
    ['ASAP não grava a data', 'mover', '        _previsao = _textoPrevisao;\n', ''],
    ['ASAP exige data em qualquer esforço', 'mover', 'if (esforco === "asap") {\n        // ASAP', 'if (true) {\n        // ASAP'],
  ]
  for (const [nome, qual, de, para] of muts) {
    const base = { kanban: KANBAN, detalhe: DETALHE, mover: MOVER }
    const n = base[qual].split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria({ ...base, [qual]: base[qual].replace(de, () => para) }) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('').slice(0, 70)})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
