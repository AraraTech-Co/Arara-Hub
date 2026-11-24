/**
 * POST /hour-entries/:id/approve
 * Body: { action: approve|adjust|reject, justification? }
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

  var id = ctx.params && ctx.params.id ? String(ctx.params.id) : '';
  if (!id) return ctx.reply.status(400).send({ error: 'id required' });

  var entry = await Hour.findById(id);
  if (!entry) return ctx.reply.status(404).send({ error: 'Not found' });
  var dataEntry = entry.date || entry.work_date;
  try {
    if (await mesFechado(dataEntry)) return recusaMesFechado(dataEntry);
  } catch (e) {
    return recusaLeituraFechamento();
  }

  var body = ctx.body || {};
  var action = String(body.action || '').toLowerCase();
  if (['approve', 'adjust', 'reject'].indexOf(action) < 0) {
    return ctx.reply.status(400).send({ error: 'action must be approve|adjust|reject' });
  }
  var justification =
    typeof body.justification === 'string' && body.justification.trim()
      ? body.justification.trim()
      : null;

  var entryUserId = String(pick(entry, 'user_id', 'userId') || '');
  if (managerRole && !isAdmin) {
    if (entryUserId === String(requester.id)) {
      return ctx.reply.status(403).send({ error: 'Managers cannot approve their own entries' });
    }
    if (Profile && entryUserId) {
      var target = await Profile.findById(entryUserId);
      var tRole = String(pick(target, 'role', 'role') || '');
      var tMgr = !!(target && pick(target, 'manager_role', 'managerRole'));
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
  var history = Array.isArray(entry.review_history)
    ? entry.review_history.slice()
    : Array.isArray(entry.reviewHistory)
      ? entry.reviewHistory.slice()
      : [];

  function pushEvent(act, message) {
    history.push({
      at: now,
      actorId: String(requester.id),
      actorName: mgrName,
      actorRole: role || (managerRole ? 'manager' : 'user'),
      action: act,
      message: message || null,
    });
  }

  var patch = {
    manager_id: String(requester.id),
    manager_name: mgrName,
    approval_date: now,
    updated_at: now,
  };

  if (action === 'approve') {
    patch.status = 'APPROVED';
    patch.justification = null;
    pushEvent('APPROVE', null);
  } else if (action === 'adjust') {
    if (!justification) {
      return ctx.reply.status(400).send({ error: 'Justification required' });
    }
    patch.status = 'ADJUSTED';
    patch.justification = justification;
    pushEvent('ADJUST', justification);
  } else {
    var rejHist = Array.isArray(entry.rejection_history)
      ? entry.rejection_history.slice()
      : Array.isArray(entry.rejectionHistory)
        ? entry.rejectionHistory.slice()
        : [];
    rejHist.push({ date: now, reason: justification, manager: mgrName });
    patch.status = 'REJECTED';
    patch.justification = justification;
    patch.rejection_history = rejHist;
    pushEvent('REJECT', justification);
  }
  patch.review_history = history;

  try {
    var updated = await Hour.update(id, patch);
    return ctx.reply.send({ data: updated });
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };
