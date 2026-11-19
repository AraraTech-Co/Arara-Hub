// GET /marketing?status=&q=&offset= — registros de marketing, de 200 em 200, mais novos primeiro.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  if (!ctx.models.RegistroMarketing) return _erro(ctx, 503, 'nao_configurado', 'A base de marketing ainda não foi configurada.');
  var q = ctx.query || {};
  var status = q.status;
  if (status !== undefined && status !== '' && (typeof status !== 'string' || STATUS_MKT.indexOf(status) < 0)) {
    return _erro(ctx, 400, 'filtro_invalido', 'Status inválido.');
  }
  var busca = q.q;
  if (busca !== undefined && (typeof busca !== 'string' || busca.length > LIMITE.q)) {
    return _erro(ctx, 400, 'filtro_invalido', 'Busca inválida.');
  }
  var offset = 0;
  if (q.offset !== undefined && q.offset !== '') {
    if (typeof q.offset !== 'string' || !/^\d{1,6}$/.test(q.offset)) return _erro(ctx, 400, 'filtro_invalido', 'Offset inválido.');
    offset = Number(q.offset);
  }
  function _norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  var termo = busca ? _norm(busca.trim()) : '';
  var r = await _lerTodos(ctx.models.RegistroMarketing, {});
  var lista = [];
  for (var i = 0; i < r.itens.length; i++) {
    var x = r.itens[i];
    if (typeof x.titulo !== 'string') continue;
    if (status && x.status !== status) continue;
    if (termo && _norm(x.titulo).indexOf(termo) < 0) continue;
    lista.push(x);
  }
  lista.sort(function (a, b) { return String(b.criado_em || '').localeCompare(String(a.criado_em || '')); });
  var pagina = lista.slice(offset, offset + PAGINA);
  var itens = [];
  for (var j = 0; j < pagina.length; j++) itens.push(_mktPublico(pagina[j]));
  var corpo = { itens: itens, total: lista.length, proximo_offset: offset + PAGINA < lista.length ? offset + PAGINA : null };
  if (!r.completo) corpo.incompleto = true;
  return ctx.reply.status(200).send(corpo);
}
