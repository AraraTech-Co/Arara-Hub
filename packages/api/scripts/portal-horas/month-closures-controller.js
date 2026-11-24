/**
 * Fechamento de mês (desenho 2026-11-24-desenho-horas-fechamento-mes).
 *   GET  /month-closures             → { data: [fechamento] }
 *   GET  /month-closures/:month      → { data: fechamento }  (sem registro = aberto)
 *   POST /month-closures/:month/:acao  acao = close | reopen
 * Fechar e reabrir: só admin. Fechar: só mês que já terminou e sem lançamento
 * pendente no mês. Reabrir: motivo obrigatório. O registro nunca é apagado; a
 * trilha (history) só cresce. Um registro por mês, com id = 'AAAA-MM'.
 */
async function handler(ctx) {
  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }
  var M = ctx.models.MonthClosures;
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  var Profile = ctx.models.StaffProfile;

  function view(r, mes) {
    if (!r) return { month: mes, status: 'aberto', closedAt: null, closedBy: null, closedByName: null, history: [] };
    return {
      month: String(r.month || mes),
      status: String(r.status || 'aberto') === 'fechado' ? 'fechado' : 'aberto',
      closedAt: r.closed_at || null,
      closedBy: r.closed_by || null,
      closedByName: r.closed_by_name || null,
      history: Array.isArray(r.history) ? r.history : [],
    };
  }
  function mesValido(m) {
    if (!/^\d{4}-\d{2}$/.test(m)) return false;
    var n = Number(m.slice(5, 7));
    return n >= 1 && n <= 12;
  }
  // Mês corrente no fuso de São Paulo (o servidor roda em UTC).
  function mesAtual() {
    var p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    var y = '';
    var mo = '';
    for (var i = 0; i < p.length; i++) {
      if (p[i].type === 'year') y = p[i].value;
      if (p[i].type === 'month') mo = p[i].value;
    }
    return y + '-' + mo;
  }

  var method = String(ctx.method || 'GET').toUpperCase();
  var mes = ctx.params && ctx.params.month ? String(ctx.params.month) : '';

  // ── Leitura: qualquer pessoa logada (as telas usam para travar botões) ──
  if (method === 'GET') {
    if (!M) {
      if (mes) return ctx.reply.send({ data: view(null, mes) });
      return ctx.reply.send({ data: [] });
    }
    try {
      if (mes) {
        if (!mesValido(mes)) return ctx.reply.status(400).send({ error: 'mes_invalido' });
        return ctx.reply.send({ data: view(await M.findById(mes), mes) });
      }
      var todos = [];
      for (var pg = 0; pg < 40; pg++) {
        var pag = await M.findMany({ limit: 500, offset: pg * 500 });
        var l = Array.isArray(pag) ? pag : [];
        for (var k = 0; k < l.length; k++) todos.push(view(l[k], l[k].month));
        if (l.length < 500) break;
      }
      todos.sort(function (a, b) {
        return a.month < b.month ? 1 : a.month > b.month ? -1 : 0;
      });
      return ctx.reply.send({ data: todos });
    } catch (e) {
      return ctx.reply.status(503).send({ error: 'leitura_fechamento' });
    }
  }

  // ── Fechar / reabrir: só admin ──
  var acao = ctx.params && ctx.params.acao ? String(ctx.params.acao) : '';
  if (method !== 'POST' || (acao !== 'close' && acao !== 'reopen')) {
    return ctx.reply.status(404).send({ error: 'Not found' });
  }
  var profile = Profile ? await Profile.findById(String(requester.id)) : null;
  var roles = requester.roles || [];
  var papel = String((profile && profile.role) || '');
  var isAdmin = roles.indexOf('admin') >= 0 || papel === 'admin' || papel === 'master';
  if (!isAdmin) return ctx.reply.status(403).send({ error: 'Forbidden — admin required' });
  if (!mesValido(mes)) return ctx.reply.status(400).send({ error: 'mes_invalido' });
  if (!M) return ctx.reply.status(503).send({ error: 'modelo_ausente' });

  var body = ctx.body || {};
  var motivo = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  var nome =
    (profile && (profile.full_name || profile.fullName || profile.name)) ||
    requester.name ||
    requester.email ||
    'Admin';
  var agora = new Date().toISOString();

  var existente;
  try {
    existente = await M.findById(mes);
  } catch (e) {
    return ctx.reply.status(503).send({ error: 'leitura_fechamento' });
  }
  var fechado = !!(existente && String(existente.status || '') === 'fechado');
  var trilha = existente && Array.isArray(existente.history) ? existente.history.slice() : [];

  if (acao === 'close') {
    if (mes >= mesAtual()) return ctx.reply.status(400).send({ error: 'mes_nao_terminou' });
    if (fechado) return ctx.reply.status(409).send({ error: 'ja_fechado' });
    if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });
    // Pendentes do mês: todas as páginas de PENDING (a camada devolve 500 por vez).
    var pendentes = 0;
    var completo = false;
    var vistos = {};
    try {
      for (var p2 = 0; p2 < 40; p2++) {
        var pagina = await Hour.findMany({ status: 'PENDING', limit: 500, offset: p2 * 500 });
        var lista = Array.isArray(pagina) ? pagina : [];
        for (var j = 0; j < lista.length; j++) {
          var e = lista[j];
          var eid = String(e.id);
          if (vistos[eid]) continue;
          vistos[eid] = true;
          if (String(e.status || '') !== 'PENDING') continue;
          if (String(e.date || e.work_date || '').slice(0, 7) === mes) pendentes++;
        }
        if (lista.length < 500) {
          completo = true;
          break;
        }
      }
    } catch (e2) {
      return ctx.reply.status(503).send({ error: 'leitura_incompleta' });
    }
    if (!completo) return ctx.reply.status(503).send({ error: 'leitura_incompleta' });
    if (pendentes > 0) return ctx.reply.status(409).send({ error: 'pendentes', count: pendentes });

    trilha.push({ action: 'FECHAR', at: agora, actorId: String(requester.id), actorName: nome, reason: motivo });
    var dadosFechar = {
      month: mes,
      status: 'fechado',
      closed_at: agora,
      closed_by: String(requester.id),
      closed_by_name: nome,
      history: trilha,
    };
    try {
      var salvo = existente
        ? await M.update(mes, dadosFechar)
        : await M.create(Object.assign({ id: mes }, dadosFechar));
      return ctx.reply.send({ data: view(salvo, mes) });
    } catch (e3) {
      return ctx.reply.status(400).send({ error: String(e3.message || e3) });
    }
  }

  // reopen
  if (!motivo) return ctx.reply.status(400).send({ error: 'motivo_obrigatorio' });
  if (!fechado) return ctx.reply.status(409).send({ error: 'nao_fechado' });
  trilha.push({ action: 'REABRIR', at: agora, actorId: String(requester.id), actorName: nome, reason: motivo });
  try {
    var reaberto = await M.update(mes, { status: 'aberto', history: trilha });
    return ctx.reply.send({ data: view(reaberto, mes) });
  } catch (e4) {
    return ctx.reply.status(400).send({ error: String(e4.message || e4) });
  }
}
module.exports = { handler };
