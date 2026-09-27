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
  var all = await Hour.findMany({});
  var pending = (all || []).filter(function (r) {
    return (
      String(pick(r, 'user_id', 'userId') || '') === userId &&
      String(r.status || '') === 'PENDING'
    );
  });

  var approvedCount = 0;
  var skipped = [];
  for (var i = 0; i < pending.length; i++) {
    var entry = pending[i];
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

  return ctx.reply.send({ data: { approvedCount: approvedCount, skipped: skipped } });
}
module.exports = { handler };
