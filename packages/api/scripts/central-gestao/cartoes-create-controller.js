// POST /cartoes — cria um cartão. A tela manda `chave_criacao` (UUID) e a repete ao
// tentar de novo: se a chave já foi gravada, devolve o cartão existente (200).
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.Cartao) return _erro(ctx, 503, 'nao_configurado', 'A Central de Gestão ainda não foi configurada.');
  var b = _corpo(ctx);
  if (!b) return _erro(ctx, 400, 'corpo_invalido', 'Corpo da requisição inválido.');

  var chave = b.chave_criacao;
  if (typeof chave !== 'string' || !/^[A-Za-z0-9-]{8,100}$/.test(chave)) {
    return _erro(ctx, 400, 'chave_invalida', 'chave_criacao ausente ou inválida.');
  }
  var hoje = _hojeSP();
  var existentes = (await ctx.models.Cartao.findMany({ chave_criacao: chave, limit: 1 })) || [];
  if (existentes.length > 0) {
    return ctx.reply.status(200).send({ cartao: _publico(existentes[0], hoje), repetido: true });
  }

  var titulo = _texto(b.titulo, 'Título', LIMITE.titulo, false);
  if (titulo.erro) return _erro(ctx, 400, 'campo_invalido', titulo.erro, { campo: 'titulo' });
  if (titulo.valor == null || titulo.valor.length < 1) {
    return _erro(ctx, 400, 'campo_invalido', 'Título é obrigatório.', { campo: 'titulo' });
  }
  var descricao = _texto(b.descricao, 'Descrição', LIMITE.descricao, true);
  if (descricao.erro) return _erro(ctx, 400, 'campo_invalido', descricao.erro, { campo: 'descricao' });
  var decisao = _texto(b.decisao, 'Decisão', LIMITE.decisao, true);
  if (decisao.erro) return _erro(ctx, 400, 'campo_invalido', decisao.erro, { campo: 'decisao' });
  var origemTexto = _texto(b.origem_texto, 'Origem', LIMITE.origem_texto, false);
  if (origemTexto.erro) return _erro(ctx, 400, 'campo_invalido', origemTexto.erro, { campo: 'origem_texto' });
  var origemTipo = _opcao(b.origem_tipo, ORIGENS, 'Tipo de origem');
  if (origemTipo.erro) return _erro(ctx, 400, 'campo_invalido', origemTipo.erro, { campo: 'origem_tipo' });
  var status = _opcao(b.status, STATUS, 'Status');
  if (status.erro) return _erro(ctx, 400, 'campo_invalido', status.erro, { campo: 'status' });
  var prazo = _prazo(b.prazo);
  if (prazo.erro) return _erro(ctx, 400, 'campo_invalido', prazo.erro, { campo: 'prazo' });
  var url = _url(b.referencia_url);
  if (url.erro) return _erro(ctx, 400, 'campo_invalido', url.erro, { campo: 'referencia_url' });
  var resp = await _responsavel(ctx, b.responsavel_id);
  if (resp.erro) return _erro(ctx, 400, 'campo_invalido', resp.erro, { campo: 'responsavel_id' });

  var agora = _agora();
  var st = status.valor || 'para_decidir';
  var novo = {
    id: ctx.randomUUID(),
    chave_criacao: chave,
    titulo: titulo.valor,
    descricao: descricao.valor == null ? null : descricao.valor,
    status: st,
    responsavel_id: resp.valor == null ? null : resp.valor,
    prazo: prazo.valor == null ? null : prazo.valor,
    origem_tipo: origemTipo.valor == null ? null : origemTipo.valor,
    origem_texto: origemTexto.valor == null ? null : origemTexto.valor,
    referencia_url: url.valor == null ? null : url.valor,
    decisao: decisao.valor == null ? null : decisao.valor,
    criado_por: g.pessoa.id,
    criado_em: agora,
    alterado_por: g.pessoa.id,
    alterado_em: agora,
    concluido_em: st === 'concluido' ? agora : null,
    arquivado: false,
    arquivado_em: null,
    versao: 1,
  };
  var criado = await ctx.models.Cartao.create(novo);
  var c = criado && criado.id === novo.id ? criado : novo;
  var depois = {
    titulo: novo.titulo,
    status: novo.status,
    responsavel_id: novo.responsavel_id,
    prazo: novo.prazo,
  };
  var ok = await _evento(ctx, novo.id, 'criado', null, depois, g.pessoa.id, agora);
  var corpo = { cartao: _publico(c, hoje) };
  if (!ok) corpo.historico_incompleto = true;
  return ctx.reply.status(201).send(corpo);
}
