// POST /marketing — cria um registro. Mesma regra de chave_criacao dos cartões.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.RegistroMarketing) return _erro(ctx, 503, 'nao_configurado', 'A base de marketing ainda não foi configurada.');
  var b = _corpo(ctx);
  if (!b) return _erro(ctx, 400, 'corpo_invalido', 'Corpo da requisição inválido.');
  var chave = b.chave_criacao;
  if (typeof chave !== 'string' || !/^[A-Za-z0-9-]{8,100}$/.test(chave)) {
    return _erro(ctx, 400, 'chave_invalida', 'chave_criacao ausente ou inválida.');
  }
  var existentes = (await ctx.models.RegistroMarketing.findMany({ chave_criacao: chave, limit: 1 })) || [];
  if (existentes.length > 0) {
    if (existentes[0].criado_por !== g.pessoa.id) {
      return _erro(ctx, 409, 'chave_em_uso', 'Esta chave de criação já foi usada. Gere outra e tente de novo.');
    }
    return ctx.reply.status(200).send({ registro: _mktPublico(existentes[0]), repetido: true });
  }
  var titulo = _texto(b.titulo, 'Título', LIMITE.titulo, false);
  if (titulo.erro) return _erro(ctx, 400, 'campo_invalido', titulo.erro, { campo: 'titulo' });
  if (titulo.valor == null || titulo.valor.length < 1) return _erro(ctx, 400, 'campo_invalido', 'Título é obrigatório.', { campo: 'titulo' });
  var descricao = _texto(b.descricao, 'Descrição', LIMITE.descricao, true);
  if (descricao.erro) return _erro(ctx, 400, 'campo_invalido', descricao.erro, { campo: 'descricao' });
  var status = _opcao(b.status, STATUS_MKT, 'Status');
  if (status.erro) return _erro(ctx, 400, 'campo_invalido', status.erro, { campo: 'status' });
  var data = _prazo(b.data_referencia);
  if (data.erro) return _erro(ctx, 400, 'campo_invalido', 'Data de referência deve ser AAAA-MM-DD válida.', { campo: 'data_referencia' });
  var resp = await _responsavel(ctx, b.responsavel_id);
  if (resp.erro) return _erro(ctx, 400, 'campo_invalido', resp.erro, { campo: 'responsavel_id' });
  var agora = _agora();
  var novo = {
    id: ctx.randomUUID(),
    chave_criacao: chave,
    titulo: titulo.valor,
    descricao: descricao.valor == null ? null : descricao.valor,
    status: status.valor || 'planejado',
    responsavel_id: resp.valor == null ? null : resp.valor,
    data_referencia: data.valor == null ? null : data.valor,
    criado_por: g.pessoa.id,
    criado_em: agora,
    alterado_por: g.pessoa.id,
    alterado_em: agora,
    versao: 1,
  };
  var criado = await ctx.models.RegistroMarketing.create(novo);
  var r = criado && criado.id === novo.id ? criado : novo;
  return ctx.reply.status(201).send({ registro: _mktPublico(r) });
}
