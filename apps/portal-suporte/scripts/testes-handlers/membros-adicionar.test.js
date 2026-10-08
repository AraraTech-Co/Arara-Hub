// Adicionar membro da equipe — permissão, idempotência e recusas (07/10/2026).
// Roda com: node membros-adicionar.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const handler = carregarHandler('490b profiles POST /admin/membros')


function mundo({ perfis = {}, contas = {} } = {}) {
  return { perfis, contas, log: { criados: [], atualizados: [], senhas: [] } };
}
function ctxDe(w, { body, quem = "adm", semUsers = false }) {
  return {
    params: {}, query: {}, body, headers: {}, user: quem ? { id: quem } : {},
    models: {
      Sessao: { findById: async () => null },
      Profile: {
        findById: async (id) => w.perfis[id] || null,
        create: async (r) => { w.log.criados.push(r); w.perfis[r.id] = r; return r; },
        update: async (id, p) => { w.log.atualizados.push([id, p]); w.perfis[id] = Object.assign({ id }, w.perfis[id], p); return w.perfis[id]; },
      },
    },
    users: semUsers ? undefined : {
      findByEmail: async (e) => w.contas[e] || null,
      setPassword: async (id, s) => { w.log.senhas.push([id, s.length]); },
    },
    reply: reply(),
  };
}
const ADM = { adm: { id: "adm", role: "admin" } };
const CONTA = { "pessoa@exemplo.test": { id: "u9", status: "active" } };
const corpo = (extra) => Object.assign({ email: "pessoa@exemplo.test", nome: "Pessoa", role: "support" }, extra);

(async () => {
  let w = mundo({ perfis: Object.assign({}, ADM), contas: CONTA });
  let r = await handler(ctxDe(w, { body: corpo() }));
  ok("admin adiciona membro de suporte", r.status === 201 && r.body.data.role === "support", r);
  ok("  perfil criado ativo, com e-mail e nome", w.perfis.u9.active === true && w.perfis.u9.full_name === "Pessoa", w.perfis.u9);

  // Idempotência: repetir depois de falha no passo seguinte não pode quebrar.
  r = await handler(ctxDe(w, { body: corpo() }));
  ok("repetir é seguro (atualiza, não duplica)", r.status === 201 && r.body.data.perfil_existia === true && w.log.criados.length === 1, w.log);

  // Papéis.
  w = mundo({ perfis: Object.assign({}, ADM), contas: CONTA });
  r = await handler(ctxDe(w, { body: corpo({ role: "cliente" }) }));
  ok("papel inválido: 400", r.status === 400, r);
  w = mundo({ perfis: Object.assign({}, ADM), contas: CONTA });
  r = await handler(ctxDe(w, { body: corpo({ role: "agent" }) }));
  ok("apelido 'agent' vira support", r.status === 201 && w.perfis.u9.role === "support", w.perfis.u9);

  // Master não é rebaixado.
  w = mundo({ perfis: Object.assign({ u9: { id: "u9", role: "master" } }, ADM), contas: CONTA });
  r = await handler(ctxDe(w, { body: corpo() }));
  ok("quem é master não é rebaixado a support", w.perfis.u9.role === "master", w.perfis.u9);

  // Permissão.
  w = mundo({ perfis: { sup: { id: "sup", role: "support" } }, contas: CONTA });
  r = await handler(ctxDe(w, { body: corpo(), quem: "sup" }));
  ok("support não adiciona membro: 403", r.status === 403, r);
  w = mundo({ perfis: Object.assign({}, ADM), contas: CONTA });
  r = await handler(ctxDe(w, { body: corpo(), quem: null }));
  ok("sem sessão: 403", r.status === 403, r);

  // Conta inexistente — o 404 QUE É DA CONTA, com código para a tela distinguir
  // do 404 do roteador (rota não publicada).
  w = mundo({ perfis: Object.assign({}, ADM), contas: {} });
  r = await handler(ctxDe(w, { body: corpo() }));
  ok("conta sem registro na plataforma: 404 com codigo 'sem_conta'", r.status === 404 && r.body.codigo === "sem_conta", r);
  ok("  e nada foi gravado", w.log.criados.length === 0 && w.log.atualizados.length === 0, w.log);

  // Conta desativada.
  w = mundo({ perfis: Object.assign({}, ADM), contas: { "pessoa@exemplo.test": { id: "u9", status: "disabled" } } });
  r = await handler(ctxDe(w, { body: corpo() }));
  ok("conta desativada na plataforma: 409 e nada gravado", r.status === 409 && w.log.criados.length === 0, r);

  // Validações de entrada.
  w = mundo({ perfis: Object.assign({}, ADM), contas: CONTA });
  for (const [nome, b] of [
    ["e-mail inválido", corpo({ email: "pessoa" })],
    ["sem nome", corpo({ nome: " " })],
    ["telefone sem DDD", corpo({ phone: "99998888" })],
    ["senha curta", corpo({ senha: "123" })],
  ]) {
    r = await handler(ctxDe(w, { body: b }));
    ok(nome + ": 400 antes de gravar", r.status === 400 && w.log.criados.length === 0, r);
  }

  // A plataforma não expôs a busca de contas.
  w = mundo({ perfis: Object.assign({}, ADM), contas: CONTA });
  r = await handler(ctxDe(w, { body: corpo(), semUsers: true }));
  ok("sem ctx.users: 500 explicando, sem gravar", r.status === 500 && w.log.criados.length === 0, r);
  fim();
})().catch((e) => { console.error("ERRO NO TESTE:", e); process.exit(1); });
