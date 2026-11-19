// PATCH /cartoes/:id — edita campo a campo. O corpo traz a `versao` que a tela leu;
// se o cartão mudou desde então, responde 409 com o cartão atual e não grava.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.Cartao) return _erro(ctx, 503, 'nao_configurado', 'A Central de Gestão ainda não foi configurada.');
  var id = _idParam(ctx);
  if (!id) return _erro(ctx, 404, 'nao_encontrado', 'Cartão não encontrado.');
  var b = _corpo(ctx);
  if (!b) return _erro(ctx, 400, 'corpo_invalido', 'Corpo da requisição inválido.');
  if (typeof b.versao !== 'number' || !Number.isInteger(b.versao) || b.versao < 1) {
    return _erro(ctx, 400, 'versao_invalida', 'versao ausente ou inválida.');
  }

  var hoje = _hojeSP();
  var cur = await _cartaoOuNada(ctx, id);
  if (!cur) return _erro(ctx, 404, 'nao_encontrado', 'Cartão não encontrado.');
  if (cur.arquivado === true) {
    return _erro(ctx, 409, 'arquivado', 'Cartão arquivado: restaure antes de editar.', { atual: _publico(cur, hoje) });
  }
  if (cur.versao !== b.versao) {
    return _erro(ctx, 409, 'conflito', 'Outra pessoa alterou este cartão. Recarregue para ver a versão atual.', { atual: _publico(cur, hoje) });
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
  t = _texto(b.decisao, 'Decisão', LIMITE.decisao, true);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'decisao' });
  if (t.valor !== undefined) novos.decisao = t.valor;
  t = _texto(b.origem_texto, 'Origem', LIMITE.origem_texto, false);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'origem_texto' });
  if (t.valor !== undefined) novos.origem_texto = t.valor;
  t = _opcao(b.origem_tipo, ORIGENS, 'Tipo de origem');
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'origem_tipo' });
  if (t.valor !== undefined) novos.origem_tipo = t.valor;
  if (b.status !== undefined) {
    t = _opcao(b.status, STATUS, 'Status');
    if (t.erro || t.valor == null) return _erro(ctx, 400, 'campo_invalido', t.erro || 'Status inválido.', { campo: 'status' });
    novos.status = t.valor;
  }
  t = _prazo(b.prazo);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'prazo' });
  if (t.valor !== undefined) novos.prazo = t.valor;
  t = _url(b.referencia_url);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'referencia_url' });
  if (t.valor !== undefined) novos.referencia_url = t.valor;
  t = await _responsavel(ctx, b.responsavel_id);
  if (t.erro) return _erro(ctx, 400, 'campo_invalido', t.erro, { campo: 'responsavel_id' });
  if (t.valor !== undefined) novos.responsavel_id = t.valor;

  var agora = _agora();
  var antes = {};
  var depois = {};
  var mudou = false;
  for (var k in novos) {
    if (!Object.prototype.hasOwnProperty.call(novos, k)) continue;
    var velho = cur[k] == null ? null : cur[k];
    if (velho !== novos[k]) {
      antes[k] = velho;
      depois[k] = novos[k];
      mudou = true;
    }
  }
  if (!mudou) return ctx.reply.status(200).send({ cartao: _publico(cur, hoje) });

  if (depois.status !== undefined) {
    if (depois.status === 'concluido') {
      antes.concluido_em = cur.concluido_em == null ? null : cur.concluido_em;
      depois.concluido_em = agora;
    } else if (antes.status === 'concluido') {
      antes.concluido_em = cur.concluido_em == null ? null : cur.concluido_em;
      depois.concluido_em = null;
    }
  }

  var grava = { alterado_por: g.pessoa.id, alterado_em: agora, versao: cur.versao + 1 };
  for (var k2 in depois) {
    if (Object.prototype.hasOwnProperty.call(depois, k2)) grava[k2] = depois[k2];
  }
  var salvo = await ctx.models.Cartao.update(cur.id, grava);
  var tipo = 'edicao';
  var chaves = Object.keys(depois);
  var soStatus = true;
  for (var i = 0; i < chaves.length; i++) {
    if (chaves[i] !== 'status' && chaves[i] !== 'concluido_em') soStatus = false;
  }
  if (soStatus) tipo = 'status';
  var ok = await _evento(ctx, cur.id, tipo, antes, depois, g.pessoa.id, agora);
  var corpo = { cartao: _publico(salvo || cur, hoje) };
  if (!ok) corpo.historico_incompleto = true;
  return ctx.reply.status(200).send(corpo);
}
