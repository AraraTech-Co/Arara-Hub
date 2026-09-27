/**
 * PATCH /hour-entries/:id — owner/admin; recomputes duration; never drops user_id.
 */
async function handler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }

  function minutesBetween(start, end, breakMinutes) {
    var s = String(start || '00:00').split(':');
    var e = String(end || '00:00').split(':');
    var startM = Number(s[0] || 0) * 60 + Number(s[1] || 0);
    var endM = Number(e[0] || 0) * 60 + Number(e[1] || 0);
    if (endM < startM) endM += 24 * 60;
    var br = Number(breakMinutes || 0);
    if (!isFinite(br) || br < 0) br = 0;
    return Math.max(0, endM - startM - br);
  }

  var id = ctx.params && ctx.params.id;
  if (!id) return ctx.reply.status(400).send({ error: 'Missing id' });
  var existing = await Hour.findById(id);
  if (!existing) return ctx.reply.status(404).send({ error: 'Entry not found' });

  var Profile = ctx.models.StaffProfile;
  var profile = Profile ? await Profile.findById(String(requester.id)) : null;
  var roles = requester.roles || [];
  var admin =
    roles.indexOf('admin') >= 0 ||
    !!(profile && (profile.role === 'admin' || profile.role === 'master' || profile.manager_role || profile.managerRole));
  var owner = String(existing.user_id || existing.userId || '') === String(requester.id);
  if (!admin && !owner) {
    return ctx.reply.status(403).send({ error: 'Forbidden' });
  }

  // Owner may edit only while not approved / rejection not accepted.
  var status = String(existing.status || '');
  var accepted = existing.rejection_accepted_at || existing.rejectionAcceptedAt;
  if (!admin) {
    if (status === 'APPROVED') {
      return ctx.reply.status(400).send({ error: 'Cannot edit entry in current status' });
    }
    if (accepted) {
      return ctx.reply.status(400).send({ error: 'Cannot edit entry in current status' });
    }
  }

  var body = Object.assign({}, ctx.body || {});
  var patch = { updated_at: new Date().toISOString() };
  if (body.date != null) patch.date = String(body.date).slice(0, 10);
  if (body.start_time != null || body.startTime != null) patch.start_time = body.start_time || body.startTime;
  if (body.end_time != null || body.endTime != null) patch.end_time = body.end_time || body.endTime;
  if (body.break_minutes != null || body.breakMinutes != null) {
    patch.break_minutes = Number(body.break_minutes != null ? body.break_minutes : body.breakMinutes) || 0;
  }
  if (body.hour_type != null || body.hourType != null) patch.hour_type = body.hour_type || body.hourType;
  if (body.client_id != null || body.clientId != null) patch.client_id = body.client_id || body.clientId || null;
  if (body.ticket != null) patch.ticket = body.ticket;
  if (body.description != null) patch.description = body.description;
  if (body.reasons != null || body.motivo_codes != null) {
    var rawReasons = body.reasons != null ? body.reasons : body.motivo_codes;
    if (!Array.isArray(rawReasons)) {
      return ctx.reply.status(400).send({ error: 'reasons must be an array' });
    }
    patch.reasons = rawReasons
      .map(function (x) {
        return String(x || '').trim();
      })
      .filter(Boolean);
  }
  if (body.status != null && admin) patch.status = body.status;

  var start = patch.start_time || existing.start_time || existing.startTime;
  var end = patch.end_time || existing.end_time || existing.endTime;
  var br =
    patch.break_minutes != null
      ? patch.break_minutes
      : existing.break_minutes != null
        ? existing.break_minutes
        : existing.breakMinutes || 0;
  patch.duration_minutes = minutesBetween(start, end, br);

  if (!existing.user_id && !existing.userId) {
    patch.user_id = String(requester.id);
  }

  try {
    var updated = await Hour.update(id, patch);
    return ctx.reply.send({ data: updated });
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };
