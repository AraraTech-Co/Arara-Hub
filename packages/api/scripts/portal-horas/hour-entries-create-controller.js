/**
 * POST /hour-entries — JWT required; injects user_id, duration, status.
 */
async function handler(ctx) {
  var Hour = ctx.models.HourEntries || ctx.models.HourEntry;
  if (!Hour) return ctx.reply.status(500).send({ error: 'HourEntries model missing' });

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required to save hour entries' });
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

  var Profile = ctx.models.StaffProfile;
  var profile = Profile ? await Profile.findById(String(requester.id)) : null;
  var body = Object.assign({}, ctx.body || {});
  var date = body.date || body.work_date;
  var startTime = body.start_time || body.startTime;
  var endTime = body.end_time || body.endTime;
  if (!date || !startTime || !endTime) {
    return ctx.reply.status(400).send({ error: 'date, start_time and end_time are required' });
  }
  try {
    if (await mesFechado(date)) return recusaMesFechado(date);
  } catch (e) {
    return recusaLeituraFechamento();
  }

  var breakMinutes = body.break_minutes != null ? body.break_minutes : body.breakMinutes;
  if (breakMinutes == null) breakMinutes = 0;
  var duration = minutesBetween(startTime, endTime, breakMinutes);
  var ts = new Date().toISOString();
  var row = {
    id: 'he_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
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
    analyst_email: (profile && profile.email) || requester.email || null,
    analyst_name:
      (profile && (profile.full_name || profile.fullName || profile.name)) ||
      requester.name ||
      null,
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
module.exports = { handler };
