// A lista de agentes da inbox (rota 438, `GET /whatsapp/agents`) traz a EQUIPE inteira.
//
// Quem pode receber uma conversa é a equipe, de nível `support` para cima. A lista só
// aceitava developer, admin e master: o atendente de nível `support` (o que mais responde no
// WhatsApp) não aparecia nos menus de atribuir e transferir.
//
// O QUE SE GARANTE:
//   - entram `support`, `developer`, `admin` e os apelidos (`master`, `gerente`, `member`,
//     `agent`), sem diferença de caixa; ficam de fora `user` (cliente), papel vazio e papel
//     desconhecido;
//   - o nome vem do nome completo, senão nome, senão e-mail; `online` vem do perfil de agente;
//   - o formato da resposta não mudou: `{ success: true, data: [{ id, name, online }] }`;
//   - a guarda de acesso segue: sem identidade 401; cliente 403.
//
// O CONTROLE: o filtro de antes é reconstituído e deixa de fora quem é `support`.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node lista-de-agentes-inclui-suporte.test.js
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
    RegExp, Buffer, Error, TypeError, setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const NOVO = codigoDe('438 whatsapp GET /whatsapp/agents')
const FILTRO_NOVO = /  \/\/ Quem pode receber uma conversa[\s\S]*?\.filter\(function \(p\) \{\n    return \(_RANK\[_canonico\(p\.role \|\| p\.role_title\)\] \|\| 0\) >= _RANK\.support;\n  \}\)/
const ANTIGO = (() => {
  if (!FILTRO_NOVO.test(NOVO)) throw new Error('âncora do filtro novo')
  return NOVO.replace(FILTRO_NOVO, `  var staff = profiles.filter(function (p) {
    var role = String(p.role || p.role_title || "");
    return ["developer", "admin", "master"].indexOf(role) >= 0;
  })`)
})()

const PERFIS = [
  { id: 'p_support', full_name: 'Alexandre Ferreira', email: 'alexandre@arara.com', role: 'support' },
  { id: 'p_dev', name: 'Thiago', email: 'thiago@arara.com', role: 'developer' },
  { id: 'p_admin', email: 'leo@arara.com', role: 'admin' },
  { id: 'p_master', full_name: 'Master', role: 'master' },
  { id: 'p_gerente', full_name: 'Gerente', role: 'gerente' },
  { id: 'p_member', full_name: 'Membro', role: 'member' },
  { id: 'p_agent', full_name: 'Agente', role: 'agent' },
  { id: 'p_caixa', full_name: 'Support Maiúsculo', role: 'SUPPORT' },
  { id: 'p_titulo', full_name: 'Só role_title', role_title: 'support' },
  { id: 'p_user', full_name: 'Cliente', role: 'user' },
  { id: 'p_vazio', full_name: 'Sem papel' },
  { id: 'p_estranho', full_name: 'Estranho', role: 'visitante' },
]
const DEVEM = ['p_titulo', 'p_support', 'p_dev', 'p_admin', 'p_master', 'p_gerente', 'p_member', 'p_agent', 'p_caixa']
const NAO_DEVEM = ['p_user', 'p_vazio', 'p_estranho']

async function rodar(codigo, { quem = 'p_admin', identidade = true } = {}) {
  const handler = compilar(codigo)
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    Profile: { findById: async (id) => PERFIS.find((p) => p.id === id) || null, findMany: async () => PERFIS.map((p) => ({ ...p })) },
    WaAgentProfiles: { findMany: async () => [{ id: 'a1', profile_id: 'p_support', online: true }, { id: 'a2', profileId: 'p_dev', online: false }] },
    Sessao: vazio,
  }
  const r = await handler({ params: {}, query: {}, headers: {}, body: {}, user: identidade ? { id: quem } : undefined, models, reply: reply() })
  return { status: r.status, corpo: r.body }
}
const ids = (r) => ((r.corpo && r.corpo.data) || []).map((x) => x.id).sort()

async function bateria(codigo) {
  const f = []
  const a = await rodar(codigo)
  const ia = ids(a)
  for (const id of DEVEM) if (!ia.includes(id)) f.push('falta:' + id)
  for (const id of NAO_DEVEM) if (ia.includes(id)) f.push('sobra:' + id)
  const sup = ((a.corpo && a.corpo.data) || []).find((x) => x.id === 'p_support')
  if (!sup || sup.name !== 'Alexandre Ferreira' || sup.online !== true) f.push('nome-ou-online')
  const dev = ((a.corpo && a.corpo.data) || []).find((x) => x.id === 'p_dev')
  if (!dev || dev.name !== 'Thiago' || dev.online !== false) f.push('nome-por-name-e-offline')
  const adm = ((a.corpo && a.corpo.data) || []).find((x) => x.id === 'p_admin')
  if (!adm || adm.name !== 'leo@arara.com') f.push('cai-no-email')
  const b = await rodar(codigo, { identidade: false })
  if (b.status !== 401) f.push('sem-identidade')
  const c = await rodar(codigo, { quem: 'p_user' })
  if (c.status !== 403) f.push('cliente')
  return f
}

;(async () => {
  const a = await rodar(NOVO)
  ok('TRAVA: a lista foi devolvida (200, success)', a.status === 200 && a.corpo.success === true && Array.isArray(a.corpo.data), a)
  ok('o atendente de nível `support` (Alexandre) aparece na lista', ids(a).includes('p_support'), ids(a))
  ok('entram developer, admin e os apelidos (master, gerente, member, agent) e `SUPPORT` em maiúsculas', DEVEM.every((id) => ids(a).includes(id)), ids(a))
  ok('ficam de fora o cliente (`user`), o papel vazio e o papel desconhecido', NAO_DEVEM.every((id) => !ids(a).includes(id)), ids(a))
  const sup = a.corpo.data.find((x) => x.id === 'p_support')
  ok('nome completo e `online` vêm do perfil e do perfil de agente', sup.name === 'Alexandre Ferreira' && sup.online === true, sup)
  ok('sem nome completo usa o nome; sem nome usa o e-mail; sem perfil de agente fica offline', a.corpo.data.find((x) => x.id === 'p_dev').name === 'Thiago' && a.corpo.data.find((x) => x.id === 'p_admin').name === 'leo@arara.com' && a.corpo.data.find((x) => x.id === 'p_admin').online === false, a.corpo.data)
  const b = await rodar(NOVO, { identidade: false }); ok('sem identidade: 401', b.status === 401, b.status)
  const c = await rodar(NOVO, { quem: 'p_user' }); ok('cliente (nível user): 403', c.status === 403, c.status)
  const an = await rodar(ANTIGO)
  ok('CONTROLE: o filtro de antes deixava o `support` (Alexandre) de fora, e também gerente, member e agent', !ids(an).includes('p_support') && !ids(an).includes('p_member') && ids(an).includes('p_dev') && ids(an).includes('p_admin'), ids(an))
  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))

  const muts = [
    ['volta ao filtro de antes (sem support)', '>= _RANK.support;', '>= _RANK.developer;'],
    ['inclui o cliente (nível user)', '>= _RANK.support;', '>= _RANK.user;'],
    ['não normaliza o papel', '_RANK[_canonico(p.role || p.role_title)]', '_RANK[String(p.role || p.role_title || "")]'],
    ['ignora role_title', '_canonico(p.role || p.role_title)', '_canonico(p.role)'],
    ['online sempre verdadeiro', 'online: ap ? !!ap.online : false,', 'online: true,'],
    ['nome sem o e-mail de reserva', 'p.full_name || p.fullName || p.name || p.email || "Agente"', 'p.full_name || p.fullName || p.name || "Agente"'],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(NOVO.replace(de, () => para)) } catch (err) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(err)); continue }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 3).join(',')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
