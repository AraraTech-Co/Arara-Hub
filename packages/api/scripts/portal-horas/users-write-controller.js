/**
 * POST /users — create StaffProfile linked to a platform User id
 * PATCH /users/:id — update StaffProfile fields (+ password → platform users)
 *
 * Password is applied via ctx.users.setPassword (host bridge → users.password_hash).
 * HTTP fallback to POST /v1/users/:id/password is kept only as secondary path.
 */
var PLATFORM_USER_MAP = __PLATFORM_USER_MAP__;

async function handler(ctx) {
  var Profile = ctx.models.StaffProfile;
  if (!Profile) return ctx.reply.status(500).send({ error: 'StaffProfile model missing' });

  function pick(obj, snake, camel) {
    if (!obj) return null;
    return obj[snake] != null ? obj[snake] : obj[camel];
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function readPassword(obj) {
    if (!obj) return '';
    if (obj.initial_password != null) return String(obj.initial_password);
    if (obj.initialPassword != null) return String(obj.initialPassword);
    if (obj.password != null) return String(obj.password);
    return '';
  }

  function platformIdByEmail(email) {
    if (!email) return '';
    return String(
      PLATFORM_USER_MAP['time-management:email:' + email] ||
      PLATFORM_USER_MAP[email] ||
      '',
    );
  }

  async function resolvePlatformUserId(email, explicitId) {
    if (explicitId) return String(explicitId);
    var mapped = platformIdByEmail(email);
    if (mapped) return mapped;
    if (ctx.users && typeof ctx.users.findByEmail === 'function') {
      try {
        var found = await ctx.users.findByEmail(email);
        if (found && found.id) return String(found.id);
      } catch (e) {}
    }
    return '';
  }

  /**
   * Apply login password on shared platform User.
   * Prefer host bridge (no allowlist / JWT-self restriction).
   * Never return success without actually setting the hash.
   */
  async function setPlatformPassword(userId, password) {
    if (!password) {
      return {
        ok: false,
        status: 400,
        error: 'password required to set platform login credentials',
      };
    }
    if (password.length < 8) {
      return { ok: false, status: 400, error: 'password must have at least 8 characters' };
    }

    if (ctx.users && typeof ctx.users.setPassword === 'function') {
      try {
        await ctx.users.setPassword(String(userId), password);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          status: 400,
          error: String((e && e.message) || e || 'failed to set platform password'),
        };
      }
    }

    // Fallback: POST /v1/users/:id/password (needs API key or admin JWT + fetch allowlist)
    if (!ctx.fetch) {
      return {
        ok: false,
        status: 500,
        error:
          'Platform password bridge unavailable (users.setPassword). Redeploy platform runtime.',
      };
    }

    var apiKey =
      ctx.headers && typeof ctx.headers['x-api-key'] === 'string'
        ? String(ctx.headers['x-api-key'])
        : '';
    var authHeader =
      ctx.headers && typeof ctx.headers.authorization === 'string'
        ? String(ctx.headers.authorization)
        : '';
    if (!apiKey && !authHeader) {
      return {
        ok: false,
        status: 409,
        error:
          'Nao foi possivel alterar a senha na plataforma (sem credencial). Use API key ou JWT admin.',
      };
    }

    var baseUrl = 'https://api.arara-tech.com';
    if (ctx.headers && typeof ctx.headers.host === 'string') {
      var host = String(ctx.headers.host).replace(/\/$/, '');
      if (/api\.arara-tech\.com/i.test(host)) {
        var proto = String(ctx.headers['x-forwarded-proto'] || 'https');
        baseUrl = proto + '://' + host;
      }
    }

    var headers = { 'content-type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;
    else headers.authorization = authHeader;

    try {
      var res = await ctx.fetch(
        baseUrl + '/v1/users/' + encodeURIComponent(String(userId)) + '/password',
        {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ password: password }),
        },
      );
      if (res && res.status >= 200 && res.status < 300) return { ok: true };

      var detail = '';
      try {
        var parsed = res && res.body ? JSON.parse(res.body) : null;
        detail = parsed && (parsed.error || parsed.message) ? String(parsed.error || parsed.message) : '';
      } catch (e) {}
      return {
        ok: false,
        status: res && res.status ? res.status : 409,
        error:
          detail ||
          'Falha ao gravar senha em POST /v1/users/:id/password. Senha NAO foi aplicada.',
      };
    } catch (e) {
      return {
        ok: false,
        status: 409,
        error:
          'Falha ao gravar senha na plataforma (' +
          String((e && e.message) || e) +
          '). Senha NAO foi aplicada.',
      };
    }
  }

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }
  var self = await Profile.findById(String(requester.id));
  var roles = requester.roles || [];
  var selfRole = String(pick(self, 'role', 'role') || '');
  var isAdmin =
    roles.indexOf('admin') >= 0 || selfRole === 'admin' || selfRole === 'master';
  if (!isAdmin) {
    return ctx.reply.status(403).send({ error: 'Admin required' });
  }

  var method = String(ctx.method || 'POST').toUpperCase();
  if (method === 'POST' && ctx.params && ctx.params.id) method = 'PATCH';
  var id = ctx.params && ctx.params.id ? String(ctx.params.id) : '';
  var body = ctx.body || {};
  var now = new Date().toISOString();

  if (method === 'POST') {
    var email = normalizeEmail(body.email);
    var fullName = String(body.full_name || body.fullName || '').trim();
    var password = readPassword(body).trim();
    if (!email || !fullName) {
      return ctx.reply.status(400).send({ error: 'email and fullName required' });
    }
    if (!password) {
      return ctx.reply.status(400).send({
        error: 'password required (min 8 chars) — define a senha de login da plataforma',
      });
    }
    var all = await Profile.findMany({});
    for (var i = 0; i < (all || []).length; i++) {
      if (String(pick(all[i], 'email', 'email') || '').toLowerCase() === email) {
        return ctx.reply.status(409).send({ error: 'Email already registered' });
      }
    }

    var newId = await resolvePlatformUserId(
      email,
      body.id || body.user_id || body.userId || null,
    );
    if (!newId) {
      return ctx.reply.status(409).send({
        error:
          'Usuario ainda nao existe na plataforma (users). Crie a conta na plataforma primeiro ou informe userId/id; esta rota so vincula StaffProfile e define senha.',
      });
    }

    var pwResult = await setPlatformPassword(newId, password);
    if (!pwResult.ok) {
      return ctx.reply.status(pwResult.status || 409).send({ error: pwResult.error });
    }

    var row = {
      id: String(newId),
      email: email,
      full_name: fullName,
      role: body.role || 'user',
      manager_role: !!(body.manager_role != null ? body.manager_role : body.managerRole),
      active: body.active !== false,
      squad_id: body.squad_id || body.squadId || null,
      rate_type: body.rate_type || body.rateType || null,
      hourly_rate:
        body.hourly_rate != null
          ? Number(body.hourly_rate)
          : body.hourlyRate != null
            ? Number(body.hourlyRate)
            : null,
      monthly_rate:
        body.monthly_rate != null
          ? Number(body.monthly_rate)
          : body.monthlyRate != null
            ? Number(body.monthlyRate)
            : null,
      can_log_project: body.can_log_project != null ? !!body.can_log_project : body.canLogProject !== false,
      can_log_support: !!(body.can_log_support != null ? body.can_log_support : body.canLogSupport),
      can_log_bip: !!(body.can_log_bip != null ? body.can_log_bip : body.canLogBip),
      can_log_backup: !!(body.can_log_backup != null ? body.can_log_backup : body.canLogBackup),
      email_notifications:
        body.email_notifications != null
          ? !!body.email_notifications
          : body.emailNotifications !== false,
      created_at: now,
      updated_at: now,
    };
    try {
      var created = await Profile.create(row);
      return ctx.reply.status(201).send({ data: created, passwordSet: true });
    } catch (e) {
      return ctx.reply.status(400).send({ error: String(e.message || e) });
    }
  }

  if (method === 'PATCH' && id) {
    var existing = await Profile.findById(id);
    if (!existing) return ctx.reply.status(404).send({ error: 'not found' });

    // StaffProfile may still carry a legacy sp_* id; login password always
    // belongs to platform users.id (resolve by email when needed).
    var profileEmail = normalizeEmail(pick(existing, 'email', 'email') || body.email);
    var platformUserId = id;
    if (ctx.users && typeof ctx.users.findByEmail === 'function' && profileEmail) {
      try {
        var existingPlatform = await ctx.users.findByEmail(profileEmail);
        if (existingPlatform && existingPlatform.id) {
          platformUserId = String(existingPlatform.id);
        }
      } catch (e) {}
    }

    var nextPassword = readPassword(body).trim();
    var passwordSet = false;
    if (nextPassword) {
      var updatePwResult = await setPlatformPassword(platformUserId, nextPassword);
      if (!updatePwResult.ok) {
        return ctx.reply.status(updatePwResult.status || 409).send({ error: updatePwResult.error });
      }
      passwordSet = true;
    }

    var patch = { updated_at: now };
    // Heal legacy sp_* / mismatched data.id → shared platform User.id
    if (platformUserId && String(pick(existing, 'id', 'id') || id) !== platformUserId) {
      patch.id = platformUserId;
    }
    var map = [
      ['full_name', 'fullName'],
      ['role', 'role'],
      ['manager_role', 'managerRole'],
      ['active', 'active'],
      ['squad_id', 'squadId'],
      ['rate_type', 'rateType'],
      ['hourly_rate', 'hourlyRate'],
      ['monthly_rate', 'monthlyRate'],
      ['can_log_project', 'canLogProject'],
      ['can_log_support', 'canLogSupport'],
      ['can_log_bip', 'canLogBip'],
      ['can_log_backup', 'canLogBackup'],
      ['email_notifications', 'emailNotifications'],
      ['email', 'email'],
    ];
    for (var j = 0; j < map.length; j++) {
      var snake = map[j][0];
      var camel = map[j][1];
      if (body[snake] !== undefined) patch[snake] = body[snake];
      else if (body[camel] !== undefined) patch[snake] = body[camel];
    }
    try {
      var updated = await Profile.update(id, patch);
      return ctx.reply.send({ data: updated, passwordSet: passwordSet });
    } catch (e) {
      return ctx.reply.status(400).send({ error: String(e.message || e) });
    }
  }

  return ctx.reply.status(405).send({ error: 'Method not allowed' });
}
module.exports = { handler };
