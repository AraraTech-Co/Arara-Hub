/**
 * POST /hour-entries — create with JWT identity + duration/status.
 * GET /hour-entries — list sorted by date (newest first); non-admin scoped to self.
 * PATCH /hour-entries/:id — update + recompute duration.
 */
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

function uid() {
  return 'he_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

function isAdminUser(user, profile) {
  if (!user) return false;
  var roles = user.roles || [];
  if (roles.indexOf('admin') >= 0 || roles.indexOf('developer') >= 0) return true;
  if (profile && (profile.role === 'admin' || profile.manager_role || profile.managerRole)) return true;
  return false;
}

async function loadProfile(ctx, userId) {
  var Profile = ctx.models.StaffProfile;
  if (!Profile || !userId) return null;
  return Profile.findById(String(userId));
}

function sortByDateDesc(rows) {
  return (rows || []).slice().sort(function (a, b) {
    var da = String(a.date || '');
    var db = String(b.date || '');
    if (da !== db) return db.localeCompare(da);
    return String(b.start_time || b.startTime || '').localeCompare(String(a.start_time || a.startTime || ''));
  });
}

async function handler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var method = String((ctx.method || ctx.req && ctx.req.method || 'GET')).toUpperCase();
  // Runtime may not pass method on ctx — infer from route registration; we publish separate codes.
  // This file is split per method below via wrappers in publish script.
  return ctx.reply.status(500).send({ error: 'Use method-specific handlers' });
}

async function createHandler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required to save hour entries' });
  }

  var body = Object.assign({}, ctx.body || {});
  var profile = await loadProfile(ctx, requester.id);
  var date = body.date || body.work_date;
  var startTime = body.start_time || body.startTime;
  var endTime = body.end_time || body.endTime;
  if (!date || !startTime || !endTime) {
    return ctx.reply.status(400).send({ error: 'date, start_time and end_time are required' });
  }

  var breakMinutes = body.break_minutes != null ? body.break_minutes : body.breakMinutes;
  if (breakMinutes == null) breakMinutes = 0;
  var duration = minutesBetween(startTime, endTime, breakMinutes);
  var ts = nowIso();
  var row = {
    id: uid(),
    user_id: String(requester.id),
    date: String(date).slice(0, 10),
    start_time: startTime,
    end_time: endTime,
    break_minutes: Number(breakMinutes) || 0,
    duration_minutes: duration,
    hour_type: body.hour_type || body.hourType || 'NORMAL',
    client_id: body.client_id || body.clientId || null,
    ticket: body.ticket || null,
    description: body.description || '',
    force_normal: !!(body.force_normal != null ? body.force_normal : body.forceNormal),
    status: 'PENDING',
    analyst_email: (profile && (profile.email || profile.analyst_email)) || requester.email || null,
    analyst_name: (profile && (profile.name || profile.full_name || profile.fullName)) || requester.name || null,
    reasons: (function () {
      var raw = body.reasons != null ? body.reasons : body.motivo_codes;
      if (!Array.isArray(raw)) return [];
      return raw
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(Boolean);
    })(),
    created_at: ts,
    updated_at: ts,
  };

  try {
    var created = await Hour.create(row);
    return ctx.reply.status(201).send({ data: created, entries: [created] });
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}

async function listHandler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var requester = ctx.user;
  var q = ctx.query || {};
  var all = await Hour.findMany({});
  var profile = requester && requester.id ? await loadProfile(ctx, requester.id) : null;
  var admin = isAdminUser(requester, profile);

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
    if (q.status) {
      if (String(r.status || '') !== String(q.status)) return false;
    }
    if (q.date) {
      if (String(r.date || '').slice(0, 10) !== String(q.date).slice(0, 10)) return false;
    }
    if (q.month) {
      if (String(r.date || '').indexOf(String(q.month)) !== 0) return false;
    }
    return true;
  });

  rows = sortByDateDesc(rows);
  var limit = Number(q.limit || 500);
  if (isFinite(limit) && limit > 0) rows = rows.slice(0, limit);

  return ctx.reply.send({ data: rows, count: rows.length });
}

async function patchHandler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }

  var id = ctx.params && ctx.params.id;
  if (!id) return ctx.reply.status(400).send({ error: 'Missing id' });
  var existing = await Hour.findById(id);
  if (!existing) return ctx.reply.status(404).send({ error: 'Entry not found' });

  var profile = await loadProfile(ctx, requester.id);
  var admin = isAdminUser(requester, profile);
  var owner = String(existing.user_id || existing.userId || '') === String(requester.id);
  if (!admin && !owner) {
    return ctx.reply.status(403).send({ error: 'Forbidden' });
  }

  var body = Object.assign({}, ctx.body || {});
  var patch = { updated_at: nowIso() };
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
  var br = patch.break_minutes != null ? patch.break_minutes : (existing.break_minutes || existing.breakMinutes || 0);
  patch.duration_minutes = minutesBetween(start, end, br);

  // Never allow clearing user_id on update
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

module.exports = {
  handler: createHandler,
  createHandler: createHandler,
  listHandler: listHandler,
  patchHandler: patchHandler,
};
