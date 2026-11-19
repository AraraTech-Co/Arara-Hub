/**
 * GET /hour-entries/resumo?month=YYYY-MM — totais do mês da equipe, sem nomes nem valores
 * individuais. Reproduz o topo do Dashboard (visão admin), mas lendo TODOS os lançamentos
 * (de 500 em 500) em vez dos 500 mais recentes:
 *   - horas aprovadas = soma de duration_minutes com status APPROVED ou ADJUSTED;
 *   - pendentes       = soma de duration_minutes com status PENDING;
 *   - analistas       = distintos (user_id, senão analyst_email) com lançamento no mês;
 *   - média           = aprovadas / analistas (minutos, arredondado).
 * Lançamentos de quem tem perfil ativo com role "admin" ficam fora, como no Dashboard.
 * Só para quem já pode ler todos os lançamentos (mesma regra de GET /hour-entries); os demais: 403.
 */
async function handler(ctx) {
  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  var Profile = ctx.models.StaffProfile;
  if (!Hour || !Profile) return ctx.reply.status(503).send({ error: 'HourEntries or StaffProfile model missing' });

  var profile = await Profile.findById(String(requester.id));
  var roles = requester.roles || [];
  var admin =
    roles.indexOf('admin') >= 0 ||
    !!(profile && (profile.role === 'admin' || profile.role === 'master' || profile.manager_role || profile.managerRole));
  if (!admin) return ctx.reply.status(403).send({ error: 'Admin only' });

  var q = ctx.query || {};
  var month = q.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return ctx.reply.status(400).send({ error: 'month must be YYYY-MM' });
  }

  var LOTE = 500;
  var TETO = 40;
  async function lerTodos(Model) {
    var vistos = {};
    var itens = [];
    for (var i = 0; i < TETO; i++) {
      var linhas = (await Model.findMany({ limit: LOTE, offset: i * LOTE })) || [];
      for (var j = 0; j < linhas.length; j++) {
        var id = String(linhas[j].id);
        if (!vistos[id]) {
          vistos[id] = true;
          itens.push(linhas[j]);
        }
      }
      if (linhas.length < LOTE) return { itens: itens, completo: true };
    }
    return { itens: itens, completo: false };
  }

  var perfis = await lerTodos(Profile);
  var lanc = await lerTodos(Hour);
  if (!perfis.completo || !lanc.completo) {
    return ctx.reply.status(200).send({ month: month, complete: false });
  }

  var adminIds = {};
  for (var p = 0; p < perfis.itens.length; p++) {
    var pf = perfis.itens[p];
    if (pf.active !== false && pf.role === 'admin') adminIds[String(pf.id)] = true;
  }

  var aprovados = 0;
  var pendentes = 0;
  var analistas = {};
  var contados = 0;
  for (var k = 0; k < lanc.itens.length; k++) {
    var e = lanc.itens[k];
    if (String(e.date || '').indexOf(month) !== 0) continue;
    var uid = e.user_id || e.userId || '';
    if (uid && adminIds[String(uid)]) continue;
    contados += 1;
    analistas[String(uid || e.analyst_email || e.analystEmail || '?')] = true;
    var min = Number(e.duration_minutes != null ? e.duration_minutes : e.durationMinutes) || 0;
    var st = String(e.status || '');
    if (st === 'APPROVED' || st === 'ADJUSTED') aprovados += min;
    else if (st === 'PENDING') pendentes += min;
  }
  var nAnalistas = Object.keys(analistas).length;
  return ctx.reply.status(200).send({
    month: month,
    complete: true,
    approved_minutes: aprovados,
    pending_minutes: pendentes,
    analysts: nAnalistas,
    avg_approved_minutes_per_analyst: nAnalistas ? Math.round(aprovados / nAnalistas) : null,
    entries_counted: contados,
  });
}
module.exports = { handler };
