// Resgate de convite — o código não pode queimar por erro de digitação (07/10/2026).
// Roda com: node convite-resgatar.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const handler = carregarHandler('163 auth POST /auth/convite/resgatar')


const CONV = () => ({ id: "inv1", code: "ABC123", role: "support", used_at: null, expires_at: null });
function mundo({ convite = CONV(), perfil = null } = {}) {
  return { convite, perfis: perfil ? { u1: perfil } : {}, log: { codeUpdates: [], criados: [], atualizados: [] } };
}
function ctxDe(w, { body, quem = "u1" }) {
  const ctx = {
    params: {}, query: {}, body, headers: {},
    user: quem ? { id: quem, email: "pessoa@exemplo.test", name: "Pessoa" } : {},
    models: {
      Sessao: { findById: async () => null },
      InviteCode: {
        findMany: async () => (w.convite ? [w.convite] : []),
        update: async (id, p) => { w.log.codeUpdates.push([id, p]); Object.assign(w.convite, p); return w.convite; },
      },
      Profile: {
        findById: async (id) => w.perfis[id] || null,
        create: async (r) => { w.log.criados.push(r); w.perfis[r.id] = r; return r; },
        update: async (id, p) => { w.log.atualizados.push([id, p]); w.perfis[id] = Object.assign({ id }, w.perfis[id], p); return w.perfis[id]; },
      },
    },
    reply: reply(),
  };
  return ctx;
}

(async () => {
  // O bug relatado: telefone sem DDD não pode gastar o convite.
  let w = mundo();
  let r = await handler(ctxDe(w, { body: { code: "ABC123", phone: "99998888" } }));
  ok("telefone curto é recusado", r.status === 400 && /DDD/.test(r.body.error), r);
  ok("  e o convite NÃO foi queimado", w.convite.used_at === null && w.log.codeUpdates.length === 0, w.log);

  // Segunda tentativa, agora com o número certo: tem de funcionar.
  r = await handler(ctxDe(w, { body: { code: "ABC123", phone: "19999998888" } }));
  ok("tentativa seguinte com o número certo entra", r.status === 201 && r.body.data.role === "support", r);
  ok("  agora sim o convite é marcado como usado", w.convite.used_at && w.log.codeUpdates.length === 1, w.log);
  ok("  perfil criado com papel e telefone", w.perfis.u1.role === "support" && w.perfis.u1.phone === "19999998888", w.perfis);

  // Perfil já existente SEM papel: completa em vez de estourar por id repetido.
  w = mundo({ perfil: { id: "u1", email: "pessoa@exemplo.test", role: null, full_name: "Pessoa Cadastrada" } });
  r = await handler(ctxDe(w, { body: { code: "ABC123", phone: "19999998888" } }));
  ok("perfil preexistente sem papel é completado, não recriado",
     r.status === 201 && w.log.atualizados.length === 1 && w.log.criados.length === 0, { r, log: w.log });
  ok("  o nome que já existia é preservado", w.perfis.u1.full_name === "Pessoa Cadastrada", w.perfis.u1);

  // Quem já tem papel continua barrado, sem gastar convite.
  w = mundo({ perfil: { id: "u1", role: "support" } });
  r = await handler(ctxDe(w, { body: { code: "ABC123", phone: "19999998888" } }));
  ok("conta que já tem acesso: 409 e convite intacto", r.status === 409 && w.convite.used_at === null, r);

  // Código errado não queima nada.
  w = mundo();
  r = await handler(ctxDe(w, { body: { code: "ZZZ999", phone: "19999998888" } }));
  ok("código inexistente: 400 e convite intacto", r.status === 400 && w.convite.used_at === null, r);

  // Código já usado continua recusado.
  w = mundo({ convite: Object.assign(CONV(), { used_at: "2026-10-01T00:00:00Z" }) });
  r = await handler(ctxDe(w, { body: { code: "ABC123", phone: "19999998888" } }));
  ok("código já usado: 400", r.status === 400, r);

  // Expirado idem.
  w = mundo({ convite: Object.assign(CONV(), { expires_at: "2020-01-01T00:00:00Z" }) });
  r = await handler(ctxDe(w, { body: { code: "ABC123", phone: "19999998888" } }));
  ok("código expirado: 400", r.status === 400, r);

  // Sem telefone continua passando (o campo é opcional).
  w = mundo();
  r = await handler(ctxDe(w, { body: { code: "ABC123" } }));
  ok("sem telefone: entra, com phone nulo", r.status === 201 && w.perfis.u1.phone === null, w.perfis);

  // Sem login, nada.
  w = mundo();
  r = await handler(ctxDe(w, { body: { code: "ABC123", phone: "19999998888" }, quem: null }));
  ok("sem login: 403 e convite intacto", r.status === 403 && w.convite.used_at === null, r);
  fim();
})().catch((e) => { console.error("ERRO NO TESTE:", e); process.exit(1); });
