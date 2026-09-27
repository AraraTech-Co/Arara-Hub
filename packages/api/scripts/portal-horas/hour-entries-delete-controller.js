/**
 * DELETE /hour-entries/:id — owner may delete own entry while not APPROVED
 * (and not after accepting a rejection). Admins may delete any.
 */
async function handler(ctx) {
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

  var Profile = ctx.models.StaffProfile;
  var profile = Profile ? await Profile.findById(String(requester.id)) : null;
  var roles = requester.roles || [];
  var admin =
    roles.indexOf('admin') >= 0 ||
    !!(profile && (profile.role === 'admin' || profile.role === 'master'));
  var owner = String(existing.user_id || existing.userId || '') === String(requester.id);
  if (!admin && !owner) {
    return ctx.reply.status(403).send({ error: 'Forbidden' });
  }

  var status = String(existing.status || '');
  var accepted = existing.rejection_accepted_at || existing.rejectionAcceptedAt;
  if (!admin) {
    if (status === 'APPROVED') {
      return ctx.reply.status(400).send({ error: 'Cannot delete entry in current status' });
    }
    if (accepted) {
      return ctx.reply.status(400).send({ error: 'Cannot delete entry in current status' });
    }
  }

  try {
    await Hour.delete(id);
    return ctx.reply.status(204).send();
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };
