// PATCH /marketing/:id — edita campo a campo, com `versao` (409 se mudou). Sem exclusão: usar "cancelado".
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.RegistroMarketing) return _erro(ctx, 503, 'nao_configurado', 'A base de marketing ainda não foi configurada.');
  var id = _idParam(ctx);
  if (!id) return _erro(ctx, 404, 'nao_encontrado', 'Registro não encontrado.');
  var b = _corpo(ctx);
  if (!b) return _erro(ctx, 400, 'corpo_invalido', 'Corpo da requisição inválido.');
  if (typeof b.versao !== 'number' || !Number.isInteger(b.versao) || b.versao < 1) {
    return _erro(ctx, 400, 'versao_invalida', 'versao ausente ou inválida.');
  }
  var cur = await _mktOuNada(ctx, id);
  if (!cur) return _erro(ctx, 404, 'nao_encontrado', 'Registro não encontrado.');
  if (cur.versao !== b.versao) {
    return _erro(ctx, 409, 'conflito', 'Outra pessoa alterou este registro. Recarregue para ver a versão atual.', { atual: _mktPublico(cur) });
  }
  var novos = {};
  var t;
  if (b.titulo !== undefined) {
    t = _texto(b.titulo, 'Título', LIMITE.titulo, false);
    if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'titulo' });
    if (t.valor == null || t.valor.length < 1) return _erro(ctx, 400, 'campo_invalido', 'Título é obrigatório.', { campo: 'titulo' });
    novos.titulo = t.valor;
  }
  t = _texto(b.descricao, 'Descrição', LIMITE.descricao, true);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'descricao' });
  if (t.valor !== undefined) novos.descricao = t.valor;
  if (b.status !== undefined) {
    t = _opcao(b.status, STATUS_MKT, 'Status');
    if (t.erro || t.valor == null) return _erro(ctx, 400, 'campo_invalido', t.erro || 'Status inválido.', { campo: 'status' });
    novos.status = t.valor;
  }
  t = _prazo(b.data_referencia);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', 'Data de referência deve ser AAAA-MM-DD válida.', { campo: 'data_referencia' });
  if (t.valor !== undefined) novos.data_referencia = t.valor;
  t = await _responsavel(ctx, b.responsavel_id);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'responsavel_id' });
  if (t.valor !== undefined) novos.responsavel_id = t.valor;

  var grava = {};
  var mudou = false;
  for (var k in novos) {
    if (!Object.prototype.hasOwnProperty.call(novos, k)) continue;
    var velho = cur[k] == null ? null : cur[k];
    if (velho !== novos[k]) {
      grava[k] = novos[k];
      mudou = true;
    }
  }
  if (!mudou) return ctx.reply.status(200).send({ registro: _mktPublico(cur) });
  grava.alterado_por = g.pessoa.id;
  grava.alterado_em = _agora();
  grava.versao = cur.versao + 1;
  var salvo = await ctx.models.RegistroMarketing.update(cur.id, grava);
  return ctx.reply.status(200).send({ registro: _mktPublico(salvo || cur) });
}
