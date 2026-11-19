// GET /membros — pessoas ativas da Central, para escolher o responsável.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  var r = await _lerTodos(ctx.models.Profile, { active: true });
  var lista = [];
  for (var i = 0; i < r.itens.length; i++) {
    var p = r.itens[i];
    if (p.active !== true) continue;
    lista.push({ id: String(p.id), name: typeof p.name === 'string' ? p.name : '' });
  }
  lista.sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
  return ctx.reply.status(200).send(lista);
}
