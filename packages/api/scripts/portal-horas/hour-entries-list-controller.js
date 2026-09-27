/**
 * GET /hour-entries — sorted by date desc; non-admin scoped to JWT user.
 */
async function handler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var requester = ctx.user;
  var q = ctx.query || {};
  var all = await Hour.findMany({});
  var Profile = ctx.models.StaffProfile;
  var profile = requester && requester.id && Profile ? await Profile.findById(String(requester.id)) : null;
  var roles = (requester && requester.roles) || [];
  var admin =
    roles.indexOf('admin') >= 0 ||
    !!(profile && (profile.role === 'admin' || profile.role === 'master' || profile.manager_role || profile.managerRole));

  var filterUser = q.user_id || q.userId || null;
  if (!admin) {
    if (!requester || !requester.id) {
      return ctx.reply.status(401).send({ error: 'Login required' });
    }
    filterUser = String(requester.id);
  }

  var rows = all.filter(function (r) {
    if (filterUser) {
      var uid = r.user_id || r.userId || '';
      if (String(uid) !== String(filterUser)) return false;
    }
    if (q.status && String(r.status || '') !== String(q.status)) return false;
    if (q.date && String(r.date || '').slice(0, 10) !== String(q.date).slice(0, 10)) return false;
    if (q.month && String(r.date || '').indexOf(String(q.month)) !== 0) return false;
    return true;
  });

  rows.sort(function (a, b) {
    var da = String(a.date || '');
    var db = String(b.date || '');
    if (da !== db) return db.localeCompare(da);
    return String(b.start_time || b.startTime || '').localeCompare(
      String(a.start_time || a.startTime || ''),
    );
  });

  var limit = Number(q.limit || 500);
  if (isFinite(limit) && limit > 0) rows = rows.slice(0, limit);

  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };
