/**
 * GET /users/me — StaffProfile for logged-in platform user.
 */
async function handler(ctx) {
  const Profile = ctx.models.StaffProfile;
  if (!Profile) return ctx.reply.status(500).send({ error: 'StaffProfile model missing' });

  const requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }

  const self = await Profile.findById(String(requester.id));
  if (!self) return ctx.reply.status(404).send({ error: 'Staff profile not found' });
  return ctx.reply.send({ data: self });
}
module.exports = { handler };
