/**
 * StaffProfile-backed routes for Horas.
 * Identity = platform User (ctx.user.id). No email aliases.
 *
 * GET /users      — admin: all profiles; user: self only
 * GET /users/me   — self profile
 * GET /users/:id  — admin any; user only self
 */
async function handler(ctx) {
  const SENSITIVE = new Set([
    'monthly_rate',
    'monthlyRate',
    'hourly_rate',
    'hourlyRate',
    'rate_type',
    'rateType',
    'password_hash',
    'passwordHash',
  ]);

  function pick(obj, snake, camel) {
    return obj[snake] != null ? obj[snake] : obj[camel];
  }

  function stripSensitive(row, keepRates) {
    if (keepRates) return row;
    const out = Object.assign({}, row);
    for (const key of Object.keys(out)) {
      if (SENSITIVE.has(key)) delete out[key];
    }
    return out;
  }

  const Profile = ctx.models.StaffProfile;
  if (!Profile) {
    return ctx.reply.status(500).send({ error: 'StaffProfile model missing' });
  }

  const requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }

  const self = await Profile.findById(String(requester.id));
  const roles = (requester && requester.roles) || [];
  const role = String((self && pick(self, 'role', 'role')) || '');
  const isAdmin =
    roles.indexOf('admin') >= 0 ||
    role === 'admin' ||
    role === 'master' ||
    !!(self && (pick(self, 'manager_role', 'managerRole') || false));

  const pathId = ctx.params && ctx.params.id ? String(ctx.params.id) : '';

  // GET /users/me is a separate route; this handler is shared by /users and /users/:id.
  // Only treat explicit "me" as self — empty pathId means LIST.
  if (pathId === 'me') {
    if (!self) return ctx.reply.status(404).send({ error: 'Staff profile not found' });
    return ctx.reply.send({ data: self });
  }

  if (pathId) {
    if (!isAdmin && pathId !== String(requester.id)) {
      return ctx.reply.status(403).send({ error: 'Forbidden' });
    }
    const row = await Profile.findById(pathId);
    if (!row) return ctx.reply.status(404).send({ error: 'not found' });
    return ctx.reply.send({ data: stripSensitive(row, isAdmin || pathId === String(requester.id)) });
  }

  // GET /users — list
  if (isAdmin) {
    const rows = await Profile.findMany({ limit: 500 });
    const active = rows.filter((u) => pick(u, 'active', 'active') !== false);
    return ctx.reply.send({ data: active, count: active.length });
  }

  if (!self) return ctx.reply.status(404).send({ error: 'Staff profile not found' });
  return ctx.reply.send({ data: [self], count: 1 });
}
module.exports = { handler };
