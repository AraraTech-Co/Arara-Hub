// GET /cartoes?status=&responsavel=&vencidos=1&q=&arquivados=1&offset=
// Lê todos os cartões do recorte (arquivados ou não), filtra e pagina de 200 em 200.
// Ordem: prazo mais próximo primeiro (sem prazo no fim), depois o mais novo.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.Cartao) return _erro(ctx, 503, 'nao_configurado', 'A Central de Gestão ainda não foi configurada.');
  var q = ctx.query || {};

  var status = q.status;
  if (status !== undefined && status !== '' && (typeof status !== 'string' || STATUS.indexOf(status) < 0)) {
    return _erro(ctx, 400, 'filtro_invalido', 'Status inválido.');
  }
  var responsavel = q.responsavel;
  if (responsavel !== undefined && (typeof responsavel !== 'string' || responsavel.length > 100)) {
    return _erro(ctx, 400, 'filtro_invalido', 'Responsável inválido.');
  }
  var busca = q.q;
  if (busca !== undefined && (typeof busca !== 'string' || busca.length > LIMITE.q)) {
    return _erro(ctx, 400, 'filtro_invalido', 'Busca inválida.');
  }
  var offset = 0;
  if (q.offset !== undefined && q.offset !== '') {
    if (typeof q.offset !== 'string' || !/^\d{1,6}$/.test(q.offset)) {
      return _erro(ctx, 400, 'filtro_invalido', 'Offset inválido.');
    }
    offset = Number(q.offset);
  }
  var arquivados = q.arquivados === '1';
  var soVencidos = q.vencidos === '1';

  function _norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  var termo = busca ? _norm(busca.trim()) : '';

  var hoje = _hojeSP();
  var r = await _lerTodos(ctx.models.Cartao, { arquivado: arquivados });
  var lista = [];
  for (var i = 0; i < r.itens.length; i++) {
    var c = r.itens[i];
    if ((c.arquivado === true) !== arquivados) continue;
    if (status && c.status !== status) continue;
    if (responsavel === 'nenhum') {
      if (c.responsavel_id) continue;
    } else if (responsavel && c.responsavel_id !== responsavel) continue;
    if (soVencidos && !_vencido(c, hoje)) continue;
    if (termo && _norm(c.titulo).indexOf(termo) < 0) continue;
    lista.push(c);
  }
  lista.sort(function (a, b) {
    if (a.prazo && b.prazo && a.prazo !== b.prazo) return a.prazo < b.prazo ? -1 : 1;
    if (a.prazo && !b.prazo) return -1;
    if (!a.prazo && b.prazo) return 1;
    return String(b.criado_em || '').localeCompare(String(a.criado_em || ''));
  });
  var pagina = lista.slice(offset, offset + PAGINA);
  var itens = [];
  for (var j = 0; j < pagina.length; j++) itens.push(_publico(pagina[j], hoje));
  var corpo = {
    itens: itens,
    total: lista.length,
    proximo_offset: offset + PAGINA < lista.length ? offset + PAGINA : null,
  };
  if (!r.completo) corpo.incompleto = true;
  return ctx.reply.status(200).send(corpo);
}
