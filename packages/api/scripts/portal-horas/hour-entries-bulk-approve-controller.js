/**
 * POST /hour-entries/bulk-approve
 * Body: { user_id | userId }
 */
async function handler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  var Profile = ctx.models.StaffProfile;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }

  // <mes-fechado> Fechamento de mês (desenho 2026-11-24-desenho-horas-fechamento-mes).
  // Mesmo texto em todas as rotas que gravam lançamentos; a fonte é
  // packages/api/scripts/portal-horas/mes-fechado.js e o teste
  // trava-mes-fechado.test.mjs confere que as cópias são iguais.
  // Sem o model MonthClosures nenhum mês pode ter sido fechado: segue aberto.
  // Falha na leitura propaga; quem chama responde 503 (na dúvida, não grava).
  async function mesFechado(data) {
    var M = ctx.models.MonthClosures;
    if (!M) return false;
    var mes = String(data || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return false;
    var r = await M.findById(mes);
    return !!(r && String(r.status || '') === 'fechado');
  }
  function recusaMesFechado(data) {
    return ctx.reply.status(409).send({ error: 'mes_fechado', month: String(data || '').slice(0, 7) });
  }
  function recusaLeituraFechamento() {
    return ctx.reply.status(503).send({ error: 'leitura_fechamento' });
  }
  // </mes-fechado>

  function pick(obj, snake, camel) {
    if (!obj) return null;
    return obj[snake] != null ? obj[snake] : obj[camel];
  }

  var profile = Profile ? await Profile.findById(String(requester.id)) : null;
  var roles = (requester && requester.roles) || [];
  var role = String(pick(profile, 'role', 'role') || '');
  var managerRole = !!(profile && (pick(profile, 'manager_role', 'managerRole') || false));
  var isAdmin =
    roles.indexOf('admin') >= 0 || role === 'admin' || role === 'master';
  var canReview = isAdmin || managerRole;
  if (!canReview) {
    return ctx.reply.status(403).send({ error: 'Forbidden — manager or admin required' });
  }

  var body = ctx.body || {};
  var userId = body.user_id || body.userId;
  if (!userId) return ctx.reply.status(400).send({ error: 'userId required' });
  userId = String(userId);

  if (managerRole && !isAdmin) {
    if (userId === String(requester.id)) {
      return ctx.reply.status(403).send({ error: 'Managers cannot approve their own entries' });
    }
    if (Profile) {
      var target = await Profile.findById(userId);
      if (!target) return ctx.reply.status(404).send({ error: 'User not found' });
      var tRole = String(pick(target, 'role', 'role') || '');
      var tMgr = !!(pick(target, 'manager_role', 'managerRole') || false);
      if (tRole === 'admin' || tRole === 'master' || tMgr) {
        return ctx.reply
          .status(403)
          .send({ error: 'Managers cannot approve entries of admins/managers' });
      }
    }
  }

  var mgrName =
    (profile && (pick(profile, 'full_name', 'fullName') || profile.name)) ||
    requester.name ||
    requester.email ||
    'Manager';
  var now = new Date().toISOString();
  // Lê todas as páginas (a camada devolve no máximo 500 por chamada) já
  // filtrando pela pessoa e pelo status, em vez dos 500 mais recentes de todos.
  var pending = [];
  var vistos = {};
  var completo = false;
  for (var pg = 0; pg < 40; pg++) {
    var pagina = await Hour.findMany({ user_id: userId, status: 'PENDING', limit: 500, offset: pg * 500 });
    var lista = Array.isArray(pagina) ? pagina : [];
    for (var q = 0; q < lista.length; q++) {
      var rid = String(lista[q].id);
      if (vistos[rid]) continue;
      vistos[rid] = true;
      if (String(pick(lista[q], 'user_id', 'userId') || '') !== userId) continue;
      if (String(lista[q].status || '') !== 'PENDING') continue;
      pending.push(lista[q]);
    }
    if (lista.length < 500) {
      completo = true;
      break;
    }
  }
  if (!completo) return ctx.reply.status(503).send({ error: 'leitura_incompleta' });

  // Situação de cada mês antes de gravar qualquer coisa: se a leitura falhar,
  // nada é aprovado.
  var mesesFechados = {};
  try {
    for (var mi = 0; mi < pending.length; mi++) {
      var mesP = String(pending[mi].date || pending[mi].work_date || '').slice(0, 7);
      if (!(mesP in mesesFechados)) mesesFechados[mesP] = await mesFechado(mesP);
    }
  } catch (e) {
    return recusaLeituraFechamento();
  }

  var approvedCount = 0;
  var skipped = [];
  var closedMonth = [];
  for (var i = 0; i < pending.length; i++) {
    var entry = pending[i];
    var mesEntry = String(entry.date || entry.work_date || '').slice(0, 7);
    if (mesesFechados[mesEntry]) {
      closedMonth.push({ id: entry.id, month: mesEntry });
      continue;
    }
    try {
      var history = Array.isArray(entry.review_history)
        ? entry.review_history.slice()
        : Array.isArray(entry.reviewHistory)
          ? entry.reviewHistory.slice()
          : [];
      history.push({
        at: now,
        actorId: String(requester.id),
        actorName: mgrName,
        actorRole: role || (managerRole ? 'manager' : 'user'),
        action: 'APPROVE',
        message: null,
      });
      await Hour.update(entry.id, {
        status: 'APPROVED',
        manager_id: String(requester.id),
        manager_name: mgrName,
        approval_date: now,
        justification: null,
        review_history: history,
        updated_at: now,
      });
      approvedCount += 1;
    } catch (e) {
      skipped.push(entry.id);
    }
  }

  return ctx.reply.send({
    data: { approvedCount: approvedCount, skipped: skipped, closedMonth: closedMonth },
  });
}
module.exports = { handler };
