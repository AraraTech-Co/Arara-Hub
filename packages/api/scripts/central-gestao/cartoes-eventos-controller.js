// GET /cartoes/:id/eventos — histórico do cartão, do mais antigo ao mais novo.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.Cartao) return _erro(ctx, 503, 'nao_configurado', 'A Central de Gestão ainda não foi configurada.');
  var id = _idParam(ctx);
  if (!id) return _erro(ctx, 404, 'nao_encontrado', 'Cartão não encontrado.');
  var cur = await _cartaoOuNada(ctx, id);
  if (!cur) return _erro(ctx, 404, 'nao_encontrado', 'Cartão não encontrado.');
  if (!ctx.models.CartaoEvento) return ctx.reply.status(200).send({ itens: [], incompleto: true });
  var r = await _lerTodos(ctx.models.CartaoEvento, { cartao_id: id });
  var itens = [];
  // A camada devolve do mais novo ao mais antigo: percorre ao contrário para que o
  // empate no mesmo milissegundo fique na ordem de gravação (o sort é estável).
  for (var i = r.itens.length - 1; i >= 0; i--) {
    var e = r.itens[i];
    if (e.cartao_id !== id) continue;
    itens.push({
      id: e.id,
      tipo: e.tipo,
      antes: e.antes == null ? null : e.antes,
      depois: e.depois == null ? null : e.depois,
      autor_id: e.autor_id,
      em: e.em,
    });
  }
  itens.sort(function (a, b) { return String(a.em).localeCompare(String(b.em)); });
  var corpo = { itens: itens };
  if (!r.completo) corpo.incompleto = true;
  return ctx.reply.status(200).send(corpo);
}
