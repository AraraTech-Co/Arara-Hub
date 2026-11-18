// GET /me — quem sou eu na Central.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  return ctx.reply.status(200).send({ id: g.pessoa.id, name: g.pessoa.name, role: g.pessoa.role });
}
