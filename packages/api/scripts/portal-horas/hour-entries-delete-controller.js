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

  var dataAtual = existing.date || existing.work_date;
  try {
    if (await mesFechado(dataAtual)) return recusaMesFechado(dataAtual);
  } catch (e) {
    return recusaLeituraFechamento();
  }

  try {
    await Hour.delete(id);
    return ctx.reply.status(204).send();
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };
