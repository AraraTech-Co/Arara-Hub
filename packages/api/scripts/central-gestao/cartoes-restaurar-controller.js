// POST /cartoes/:id/restaurar — volta ao quadro com o status que tinha.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.Cartao) return _erro(ctx, 503, 'nao_configurado', 'A Central de Gestão ainda não foi configurada.');
  var id = _idParam(ctx);
  if (!id) return _erro(ctx, 404, 'nao_encontrado', 'Cartão não encontrado.');
  var hoje = _hojeSP();
  var cur = await _cartaoOuNada(ctx, id);
  if (!cur) return _erro(ctx, 404, 'nao_encontrado', 'Cartão não encontrado.');
  if (cur.arquivado !== true) return ctx.reply.status(200).send({ cartao: _publico(cur, hoje) });
  var agora = _agora();
  var salvo = await ctx.models.Cartao.update(cur.id, {
    arquivado: false,
    arquivado_em: null,
    alterado_por: g.pessoa.id,
    alterado_em: agora,
    versao: cur.versao + 1,
  });
  var ok = await _evento(ctx, cur.id, 'restaurado', { arquivado: true }, { arquivado: false }, g.pessoa.id, agora);
  var corpo = { cartao: _publico(salvo || cur, hoje) };
  if (!ok) corpo.historico_incompleto = true;
  return ctx.reply.status(200).send(corpo);
}
