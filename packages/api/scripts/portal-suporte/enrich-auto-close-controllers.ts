/**
 * Auto-close resolved tickets (portal-suporte).
 * Original Next cron: daily 02:17 America/Sao_Paulo, after 72h in resolvido*.
 *
 * Controllers:
 *   POST /jobs/auto-close-tickets  — run the job
 *   GET  /jobs/auto-close-tickets  — dry-run / status (lists candidates)
 *
 * Run: npx tsx scripts/portal-suporte/enrich-auto-close-controllers.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

const DRY_RUN_HANDLER = `async function handler(ctx) {
  var Ticket = ctx.models.Ticket;
  var Log = ctx.models.ActivityLog;
  if (!Ticket || !Log) {
    return ctx.reply.status(500).send({ error: "Ticket or ActivityLog model missing" });
  }
  var RESOLVED = ["resolvido", "resolvido_com_manual", "resolvido_sem_manual"];
  var HOURS = 72;
  if (ctx.query && ctx.query.hours) HOURS = Number(ctx.query.hours) || HOURS;
  var cutoffMs = Date.now() - HOURS * 3600000;
  var tickets = await Ticket.findMany({});
  tickets = (tickets || []).filter(function (t) {
    return RESOLVED.indexOf(String(t.status || "")) >= 0;
  });
  if (!tickets.length) {
    return ctx.reply.send({ closed: 0, candidates: [], hours: HOURS, dryRun: true, note: "nenhum resolvido" });
  }
  var logs = await Log.findMany({});
  logs = (logs || []).filter(function (l) {
    return String(l.action || "") === "status_changed" && (l.ticket_id || l.ticketId);
  });
  logs.sort(function (a, b) {
    var ta = new Date(a.created_at || a.createdAt || 0).getTime();
    var tb = new Date(b.created_at || b.createdAt || 0).getTime();
    return tb - ta;
  });
  var latestByTicket = {};
  for (var i = 0; i < logs.length; i++) {
    var tid = String(logs[i].ticket_id || logs[i].ticketId);
    if (!latestByTicket[tid]) latestByTicket[tid] = logs[i];
  }
  var candidates = [];
  for (var j = 0; j < tickets.length; j++) {
    var t = tickets[j];
    var id = String(t.id);
    var last = latestByTicket[id];
    var toStatus = null;
    var whenMs = 0;
    if (last) {
      var details = last.details || {};
      toStatus = details.to || details.to_status || null;
      whenMs = new Date(last.created_at || last.createdAt || 0).getTime();
    } else {
      whenMs = new Date(t.updated_at || t.updatedAt || t.created_at || t.createdAt || 0).getTime();
      toStatus = t.status;
    }
    if (RESOLVED.indexOf(String(toStatus || "")) < 0) continue;
    if (!whenMs || whenMs > cutoffMs) continue;
    candidates.push({
      id: id,
      title: t.title || null,
      status: t.status,
      resolved_at: new Date(whenMs).toISOString(),
      age_hours: Math.round((Date.now() - whenMs) / 3600000),
    });
  }
  return ctx.reply.send({
    closed: 0,
    candidates: candidates,
    count: candidates.length,
    hours: HOURS,
    dryRun: true,
  });
}
module.exports = { handler };`

const RUN_HANDLER = `async function handler(ctx) {
  var Ticket = ctx.models.Ticket;
  var Log = ctx.models.ActivityLog;
  if (!Ticket || !Log) {
    return ctx.reply.status(500).send({ error: "Ticket or ActivityLog model missing" });
  }
  var RESOLVED = ["resolvido", "resolvido_com_manual", "resolvido_sem_manual"];
  var HOURS = 72;
  var dryRun = false;
  if (ctx.body && ctx.body.hours) HOURS = Number(ctx.body.hours) || HOURS;
  if (ctx.query && ctx.query.hours) HOURS = Number(ctx.query.hours) || HOURS;
  if (ctx.body && (ctx.body.dry_run || ctx.body.dryRun)) dryRun = true;
  if (ctx.query && (ctx.query.dry_run === "1" || ctx.query.dryRun === "1")) dryRun = true;

  var cutoffMs = Date.now() - HOURS * 3600000;
  var tickets = await Ticket.findMany({});
  tickets = (tickets || []).filter(function (t) {
    return RESOLVED.indexOf(String(t.status || "")) >= 0;
  });
  if (!tickets.length) {
    return ctx.reply.send({ closed: 0, ids: [], hours: HOURS, dryRun: dryRun, note: "nenhum resolvido" });
  }
  var logs = await Log.findMany({});
  logs = (logs || []).filter(function (l) {
    return String(l.action || "") === "status_changed" && (l.ticket_id || l.ticketId);
  });
  logs.sort(function (a, b) {
    var ta = new Date(a.created_at || a.createdAt || 0).getTime();
    var tb = new Date(b.created_at || b.createdAt || 0).getTime();
    return tb - ta;
  });
  var latestByTicket = {};
  for (var i = 0; i < logs.length; i++) {
    var tid = String(logs[i].ticket_id || logs[i].ticketId);
    if (!latestByTicket[tid]) latestByTicket[tid] = logs[i];
  }
  var candidates = [];
  for (var j = 0; j < tickets.length; j++) {
    var t = tickets[j];
    var id = String(t.id);
    var last = latestByTicket[id];
    var toStatus = null;
    var whenMs = 0;
    if (last) {
      var details = last.details || {};
      toStatus = details.to || details.to_status || null;
      whenMs = new Date(last.created_at || last.createdAt || 0).getTime();
    } else {
      whenMs = new Date(t.updated_at || t.updatedAt || t.created_at || t.createdAt || 0).getTime();
      toStatus = t.status;
    }
    if (RESOLVED.indexOf(String(toStatus || "")) < 0) continue;
    if (!whenMs || whenMs > cutoffMs) continue;
    candidates.push({ id: id, status: t.status, title: t.title || null, age_hours: Math.round((Date.now() - whenMs) / 3600000) });
  }

  if (dryRun) {
    return ctx.reply.send({ closed: 0, candidates: candidates, count: candidates.length, hours: HOURS, dryRun: true });
  }

  var closed = [];
  var now = new Date().toISOString();
  for (var k = 0; k < candidates.length; k++) {
    var c = candidates[k];
    try {
      await Ticket.update(c.id, { status: "fechado", updated_at: now });
      try {
        await Log.create({
          ticket_id: c.id,
          user_id: null,
          action: "status_changed",
          details: { from: c.status, to: "fechado", auto_close: true, after_hours: HOURS },
          created_at: now,
          visible_to_client: true,
        });
      } catch (e2) {}
      closed.push(c.id);
    } catch (e) {}
  }
  return ctx.reply.send({ closed: closed.length, ids: closed, hours: HOURS, dryRun: false });
}
module.exports = { handler };`

type Spec = { method: string; path: string; code: string }

const CONTROLLERS: Spec[] = [
  { method: 'GET', path: '/jobs/auto-close-tickets', code: DRY_RUN_HANDLER },
  { method: 'POST', path: '/jobs/auto-close-tickets', code: RUN_HANDLER },
]

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  let updated = 0
  for (const spec of CONTROLLERS) {
    const route = await prisma.moduleRoute.findFirst({
      where: { method: spec.method, path: spec.path, module: { appId: app.id } },
    })
    if (!route) {
      const mod =
        (await prisma.module.findFirst({
          where: { appId: app.id, name: { contains: 'ticket' } },
        })) || (await prisma.module.findFirst({ where: { appId: app.id } }))
      if (!mod) continue
      await prisma.moduleRoute.create({
        data: {
          moduleId: mod.id,
          method: spec.method,
          path: spec.path,
          controllerCode: spec.code,
          requiredPermissions: [],
        },
      })
      console.log('CREATED', spec.method, spec.path)
      updated++
      continue
    }
    await prisma.moduleRoute.update({
      where: { id: route.id },
      data: { controllerCode: spec.code },
    })
    console.log('UPDATED', spec.method, spec.path)
    updated++
  }
  console.log({ updated })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
