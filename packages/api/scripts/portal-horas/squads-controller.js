/**
 * Squads CRUD for time-management (Staff admin).
 * GET/POST /squads, PATCH /squads/:id, GET /squads/screen-keys
 */
async function handler(ctx) {
  var Squad = ctx.models.Squad || ctx.models.Squads;
  var Profile = ctx.models.StaffProfile;
  var method = String(ctx.method || ctx.req && ctx.req.method || 'GET').toUpperCase();
  var path = String(ctx.path || (ctx.req && ctx.req.url) || '');

  function pick(obj, snake, camel) {
    if (!obj) return null;
    return obj[snake] != null ? obj[snake] : obj[camel];
  }

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }
  var self = Profile ? await Profile.findById(String(requester.id)) : null;
  var roles = (requester && requester.roles) || [];
  var role = String(pick(self, 'role', 'role') || '');
  var isAdmin =
    roles.indexOf('admin') >= 0 || role === 'admin' || role === 'master';
  if (!isAdmin) {
    return ctx.reply.status(403).send({ error: 'Admin required' });
  }

  if (!Squad) {
    // Soft empty — unblock Users UI even without Squad model
    if (method === 'GET' && path.indexOf('screen-keys') >= 0) {
      return ctx.reply.send({
        data: {
          screenKeys: [
            'dashboard',
            'calendar',
            'approvals',
            'finance',
            'users',
            'settings',
            'escala',
            'insights',
          ],
        },
      });
    }
    if (method === 'GET') return ctx.reply.send({ data: [], count: 0 });
    return ctx.reply.status(500).send({ error: 'Squad model missing' });
  }

  var id = ctx.params && ctx.params.id ? String(ctx.params.id) : '';

  if (method === 'GET' && !id) {
    if (String(ctx.path || '').indexOf('screen-keys') >= 0) {
      return ctx.reply.send({
        data: {
          screenKeys: [
            'dashboard',
            'calendar',
            'approvals',
            'finance',
            'users',
            'settings',
            'escala',
            'insights',
          ],
        },
      });
    }
    var rows = await Squad.findMany({});
    rows = (rows || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
    return ctx.reply.send({ data: rows, count: rows.length });
  }

  if (method === 'POST') {
    var body = ctx.body || {};
    var name = String(body.name || '').trim();
    if (!name) return ctx.reply.status(400).send({ error: 'name required' });
    var existing = await Squad.findMany({});
    for (var i = 0; i < (existing || []).length; i++) {
      if (String(existing[i].name || '').toLowerCase() === name.toLowerCase()) {
        return ctx.reply.status(409).send({ error: 'Squad name already exists' });
      }
    }
    var now = new Date().toISOString();
    var created = await Squad.create({
      id: 'sq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name,
      active: body.active !== false,
      screen_permissions: body.screen_permissions || body.screenPermissions || [],
      created_at: now,
      updated_at: now,
    });
    return ctx.reply.status(201).send({ data: created });
  }

  if (method === 'PATCH' && id) {
    var squad = await Squad.findById(id);
    if (!squad) return ctx.reply.status(404).send({ error: 'Not found' });
    var b = ctx.body || {};
    var patch = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.screen_permissions !== undefined || b.screenPermissions !== undefined) {
      patch.screen_permissions = b.screen_permissions || b.screenPermissions || [];
    }
    var updated = await Squad.update(id, patch);
    return ctx.reply.send({ data: updated });
  }

  return ctx.reply.status(405).send({ error: 'Method not allowed' });
}
module.exports = { handler };
