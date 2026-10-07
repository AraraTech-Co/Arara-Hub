/**
 * Ticket detail + kanban board enrichment for portal-suporte.
 * Covers: events, owner-history, escalate, attachments, co-assignees, board-meta.
 *
 * Run: npx tsx scripts/portal-suporte/enrich-ticket-detail-controllers.ts
 * Or deploy by copying into the platform container and running there.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

type Spec = { method: string; path: string; code: string }

const CONTROLLERS: Spec[] = [
  {
    method: 'GET',
    path: '/tickets/board-meta',
    code: `async function handler(ctx) {
  const Co = ctx.models.TicketCoAssignee;
  const Sla = ctx.models.SLATracking;
  var coAssignees = [];
  var sla = [];
  try {
    if (Co) coAssignees = await Co.findMany({});
  } catch (e) {}
  try {
    if (Sla) sla = await Sla.findMany({});
  } catch (e) {}
  var now = Date.now();
  var slaSummaries = (sla || []).map(function (tr) {
    var deadline = tr.resolution_deadline || tr.resolutionDeadline;
    var resolved = tr.resolved_at || tr.resolvedAt;
    var pausedAt = tr.paused_at || tr.pausedAt;
    var pausedMs = Number(tr.paused_duration_ms || tr.pausedDurationMs || 0);
    var met = tr.resolution_sla_met != null ? tr.resolution_sla_met : tr.resolutionSlaMet;
    var breached = false;
    var minutes_remaining = 0;
    if (deadline) {
      var dl = new Date(deadline).getTime();
      if (resolved) {
        breached = met === false;
        minutes_remaining = 0;
      } else {
        var currentPause = pausedAt ? (now - new Date(pausedAt).getTime()) : 0;
        var effective = dl - now + pausedMs + currentPause;
        minutes_remaining = Math.max(0, Math.floor(effective / 60000));
        breached = now > dl;
      }
    }
    return {
      ticket_id: tr.ticket_id || tr.ticketId,
      breached: breached,
      minutes_remaining: minutes_remaining,
      paused: !!pausedAt,
      escalated: !!(tr.escalated),
      severity: tr.severity || null,
      response_deadline: tr.response_deadline || tr.responseDeadline || null,
      resolution_deadline: deadline || null,
      first_response_at: tr.first_response_at || tr.firstResponseAt || null,
      resolved_at: resolved || null,
    };
  });
  return ctx.reply.send({
    coAssignees: (coAssignees || []).map(function (c) {
      return { ticket_id: c.ticket_id || c.ticketId, user_id: c.user_id || c.userId };
    }),
    sla: slaSummaries,
  });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/tickets/:id/events',
    code: `async function handler(ctx) {
  const Log = ctx.models.ActivityLog;
  const Profile = ctx.models.Profile;
  if (!Log) return ctx.reply.status(500).send({ error: "Model ActivityLog missing" });
  const id = ctx.params.id;
  const q = ctx.query || {};
  const skip = Math.max(0, Number(q.skip || 0));
  const limit = Math.min(Number(q.limit || 3), 50);
  const ACTION_LABELS = {
    ticket_created: "Ticket criado",
    ticket_updated: "Ticket atualizado",
    status_changed: "Status alterado",
    ticket_assigned: "Responsável atribuído",
    ticket_unassigned: "Responsável removido",
    message_added: "Mensagem adicionada",
    internal_note_added: "Nota interna adicionada",
    ticket_archived: "Ticket arquivado",
    ticket_restored: "Ticket restaurado",
    ticket_deleted: "Ticket excluído",
    priority_changed: "Prioridade alterada",
    esforco_reestimado: "Prazo reestimado",
    severity_changed: "Severidade alterada",
    time_logged: "Horas registradas",
    ticket_escalated: "Ticket escalado",
  };
  const ACTION_ICONS = {
    ticket_created: "🎫", ticket_updated: "✏️", status_changed: "🔄",
    esforco_reestimado: "📅",
    ticket_assigned: "👤", ticket_unassigned: "➖", message_added: "💬",
    internal_note_added: "📝", ticket_archived: "📦", ticket_restored: "♻️",
    ticket_deleted: "🗑️", priority_changed: "🔺", severity_changed: "⚠️",
    time_logged: "⏱️", ticket_escalated: "⬆️",
  };
  var all = await Log.findMany({ ticket_id: id });
  all = (all || []).filter(function (r) {
    return String(r.ticket_id || r.ticketId || "") === String(id);
  });
  all.sort(function (a, b) {
    var ta = new Date(a.created_at || a.createdAt || 0).getTime();
    var tb = new Date(b.created_at || b.createdAt || 0).getTime();
    return tb - ta;
  });
  var total = all.length;
  var slice = all.slice(skip, skip + limit);
  var profiles = [];
  try { if (Profile) profiles = await Profile.findMany({}); } catch (e) {}
  var byId = {};
  for (var i = 0; i < profiles.length; i++) {
    byId[String(profiles[i].id)] = profiles[i];
  }
  var events = slice.map(function (logEntry) {
    var uid = logEntry.user_id || logEntry.userId;
    var pr = uid ? byId[String(uid)] : null;
    var action = String(logEntry.action || "");
    return {
      id: logEntry.id,
      action: action,
      label: ACTION_LABELS[action] || action,
      icon: ACTION_ICONS[action] || "•",
      details: logEntry.details || null,
      actor: pr
        ? {
            id: String(pr.id),
            name: pr.full_name || pr.fullName || pr.name || pr.email || null,
            avatar_url: pr.avatar_url || pr.avatarUrl || null,
          }
        : (uid ? { id: String(uid), name: null, avatar_url: null } : null),
      created_at: logEntry.created_at || logEntry.createdAt || new Date().toISOString(),
    };
  });
  return ctx.reply.send({
    success: true,
    data: { data: events, total: total, hasMore: skip + events.length < total },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/tickets/:id/owner-history',
    code: `async function handler(ctx) {
  const OH = ctx.models.OwnerHistory;
  const Profile = ctx.models.Profile;
  if (!OH) return ctx.reply.status(500).send({ error: "Model OwnerHistory missing" });
  const id = ctx.params.id;
  var rows = await OH.findMany({ ticket_id: id });
  rows = (rows || []).filter(function (r) {
    return String(r.ticket_id || r.ticketId || "") === String(id);
  });
  rows.sort(function (a, b) {
    var ta = new Date(a.changed_at || a.changedAt || 0).getTime();
    var tb = new Date(b.changed_at || b.changedAt || 0).getTime();
    return tb - ta;
  });
  var profiles = [];
  try { if (Profile) profiles = await Profile.findMany({}); } catch (e) {}
  var byId = {};
  for (var i = 0; i < profiles.length; i++) {
    byId[String(profiles[i].id)] = profiles[i];
  }
  function person(uid) {
    if (!uid) return null;
    var pr = byId[String(uid)];
    if (!pr) return { id: String(uid), name: "Agente", email: "" };
    return {
      id: String(pr.id),
      name: pr.full_name || pr.fullName || pr.name || pr.email || "Agente",
      email: pr.email || "",
    };
  }
  var data = rows.map(function (h) {
    return {
      id: h.id,
      changed_at: h.changed_at || h.changedAt || new Date().toISOString(),
      reason: h.reason || null,
      from_user: person(h.from_user_id || h.fromUserId),
      to_user: person(h.to_user_id || h.toUserId),
      changed_by: person(h.changed_by_id || h.changedById),
    };
  });
  return ctx.reply.send({ success: true, data: data });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/escalate',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const OH = ctx.models.OwnerHistory;
  const Log = ctx.models.ActivityLog;
  const Sla = ctx.models.SLATracking;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const toUserId = body.to_user_id || body.toUserId || body.assignee_id;
  if (!toUserId) return ctx.reply.status(400).send({ error: "to_user_id required" });
  const reason = body.reason ? String(body.reason).trim() : null;
  const ticket = await Ticket.findById(id);
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const fromUserId = ticket.assigned_to || ticket.assignedTo || null;
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || toUserId;
  const now = new Date().toISOString();
  const updated = await Ticket.update(id, {
    assigned_to: toUserId,
    updated_at: now,
  });
  try {
    if (OH) {
      await OH.create({
        ticket_id: id,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        changed_by_id: actor,
        reason: reason,
        changed_at: now,
      });
    }
  } catch (e) {}
  try {
    if (Log) {
      await Log.create({
        ticket_id: id,
        user_id: actor,
        action: "ticket_escalated",
        details: { escalated_to: toUserId, reason: reason, link_type: "primary", action: "escalate" },
        created_at: now,
        visible_to_client: true,
      });
    }
  } catch (e) {}
  try {
    if (Sla) {
      var trackings = await Sla.findMany({ ticket_id: id });
      trackings = (trackings || []).filter(function (t) {
        return String(t.ticket_id || t.ticketId || "") === String(id);
      });
      if (trackings[0]) {
        await Sla.update(trackings[0].id, {
          escalated: true,
          escalated_at: now,
          escalated_to: toUserId,
          updated_at: now,
        });
      }
    }
  } catch (e) {}
  return ctx.reply.send({ success: true, data: updated });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/tickets/:id/attachments',
    code: `async function handler(ctx) {
  const Att = ctx.models.Attachment;
  if (!Att) return ctx.reply.status(500).send({ error: "Model Attachment missing" });
  const id = ctx.params.id;
  var rows = await Att.findMany({ ticket_id: id });
  rows = (rows || []).filter(function (r) {
    return String(r.ticket_id || r.ticketId || "") === String(id)
      && !(r.message_id || r.messageId);
  });
  rows.sort(function (a, b) {
    var ta = new Date(a.created_at || a.createdAt || 0).getTime();
    var tb = new Date(b.created_at || b.createdAt || 0).getTime();
    return tb - ta;
  });
  var data = rows.map(function (a) {
    return {
      id: a.id,
      fileName: a.file_name || a.fileName || "arquivo",
      fileUrl: a.file_url || a.fileUrl || "",
      fileSize: Number(a.file_size || a.fileSize || 0),
      fileType: a.file_type || a.fileType || "application/octet-stream",
      createdAt: a.created_at || a.createdAt || new Date().toISOString(),
      uploaderName: null,
      uploaded_by: a.uploaded_by || a.uploadedBy || null,
    };
  });
  return ctx.reply.send({ success: true, data: data });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/attachments',
    code: `async function handler(ctx) {
  const Att = ctx.models.Attachment;
  const Ticket = ctx.models.Ticket;
  if (!Att) return ctx.reply.status(500).send({ error: "Model Attachment missing" });
  const id = ctx.params.id;
  if (Ticket) {
    const t = await Ticket.findById(id);
    if (!t) return ctx.reply.status(404).send({ error: "Ticket not found" });
  }
  const body = ctx.body || {};
  const fileName = body.file_name || body.fileName || body.name;
  const fileType = body.file_type || body.fileType || body.mime || "application/octet-stream";
  const contentBase64 = body.content_base64 || body.contentBase64 || body.data;
  var fileUrl = body.file_url || body.fileUrl || null;
  if (!fileName) return ctx.reply.status(400).send({ error: "file_name required" });
  if (!fileUrl && contentBase64) {
    var raw = String(contentBase64);
    // ~5MB base64 limit
    if (raw.length > 7 * 1024 * 1024) {
      return ctx.reply.status(400).send({ error: "Arquivo muito grande (máx. ~5MB neste ambiente)" });
    }
    if (raw.indexOf("data:") === 0) fileUrl = raw;
    else fileUrl = "data:" + fileType + ";base64," + raw;
  }
  if (!fileUrl) return ctx.reply.status(400).send({ error: "file_url or content_base64 required" });
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  const now = new Date().toISOString();
  const row = await Att.create({
    ticket_id: id,
    file_name: fileName,
    file_url: fileUrl,
    file_size: Number(body.file_size || body.fileSize || 0),
    file_type: fileType,
    uploaded_by: actor,
    message_id: null,
    position: 0,
    created_at: now,
  });
  return ctx.reply.status(201).send({
    success: true,
    data: {
      id: row.id,
      fileName: row.file_name || fileName,
      fileUrl: row.file_url || fileUrl,
      fileSize: Number(row.file_size || 0),
      fileType: row.file_type || fileType,
      createdAt: row.created_at || now,
      uploaderName: null,
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'DELETE',
    path: '/attachments/:id',
    code: `async function handler(ctx) {
  const Att = ctx.models.Attachment;
  if (!Att) return ctx.reply.status(500).send({ error: "Model Attachment missing" });
  const id = ctx.params.id;
  try {
    await Att.delete(id);
    return ctx.reply.send({ success: true });
  } catch (e) {
    return ctx.reply.status(404).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/co-assignees',
    code: `async function handler(ctx) {
  const Co = ctx.models.TicketCoAssignee;
  if (!Co) return ctx.reply.status(500).send({ error: "Model TicketCoAssignee missing" });
  const ticketId = ctx.params.id;
  const body = ctx.body || {};
  const userId = body.user_id || body.userId || body.id;
  if (!userId) return ctx.reply.status(400).send({ error: "userId required" });
  var existing = await Co.findMany({ ticket_id: ticketId });
  existing = (existing || []).filter(function (c) {
    return String(c.ticket_id || c.ticketId) === String(ticketId)
      && String(c.user_id || c.userId) === String(userId);
  });
  if (existing[0]) return ctx.reply.send({ success: true, data: existing[0] });
  var all = await Co.findMany({ ticket_id: ticketId });
  all = (all || []).filter(function (c) {
    return String(c.ticket_id || c.ticketId) === String(ticketId);
  });
  if (all.length >= 4) {
    return ctx.reply.status(400).send({ error: "Máximo de 4 co-responsáveis" });
  }
  const row = await Co.create({
    ticket_id: ticketId,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };`,
  },
  {
    method: 'DELETE',
    path: '/tickets/:id/co-assignees/:userId',
    code: `async function handler(ctx) {
  const Co = ctx.models.TicketCoAssignee;
  if (!Co) return ctx.reply.status(500).send({ error: "Model TicketCoAssignee missing" });
  const ticketId = ctx.params.id;
  const userId = ctx.params.userId;
  var rows = await Co.findMany({ ticket_id: ticketId });
  rows = (rows || []).filter(function (c) {
    return String(c.ticket_id || c.ticketId) === String(ticketId)
      && String(c.user_id || c.userId) === String(userId);
  });
  if (!rows[0]) return ctx.reply.status(404).send({ error: "Co-responsável não encontrado" });
  await Co.delete(rows[0].id);
  return ctx.reply.send({ success: true });
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/tickets/:id/assign',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const OH = ctx.models.OwnerHistory;
  const Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const assignee = body.assignee_id !== undefined ? body.assignee_id
    : (body.assigned_to !== undefined ? body.assigned_to : body.userId);
  const ticket = await Ticket.findById(id);
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const fromUserId = ticket.assigned_to || ticket.assignedTo || null;
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || assignee;
  const now = new Date().toISOString();
  var RESOLVED = {
    resolvido: 1, resolvido_com_manual: 1, resolvido_sem_manual: 1,
    post_mortem: 1, migracao_concluida: 1, fechado: 1
  };
  var force = body.force === true || body.takeover === true;
  var st = String(ticket.status || "");
  if (assignee && fromUserId && String(fromUserId) !== String(assignee) && !force && !RESOLVED[st]) {
    return ctx.reply.status(409).send({
      error: "Chamado já atribuído a outro atendente. Use assumir com confirmação.",
      assigned_to: fromUserId,
    });
  }
  const row = await Ticket.update(id, {
    assigned_to: assignee,
    updated_at: now,
  });
  try {
    if (OH) {
      await OH.create({
        ticket_id: id,
        from_user_id: fromUserId,
        to_user_id: assignee,
        changed_by_id: actor,
        reason: force ? "takeover" : null,
        changed_at: now,
      });
    }
  } catch (e) {}
  try {
    if (Log) {
      var takeover = assignee && fromUserId && String(fromUserId) !== String(assignee);
      await Log.create({
        ticket_id: id,
        user_id: actor,
        action: takeover ? "ticket_takeover" : (assignee ? "ticket_assigned" : "ticket_unassigned"),
        details: { assigned_to: assignee, from: fromUserId, force: !!force },
        created_at: now,
        visible_to_client: true,
      });
    }
  } catch (e) {}
  return ctx.reply.send(row);
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/assign',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const OH = ctx.models.OwnerHistory;
  const Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const assignee = body.assignee_id !== undefined ? body.assignee_id
    : (body.assigned_to !== undefined ? body.assigned_to : body.userId);
  const ticket = await Ticket.findById(id);
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const fromUserId = ticket.assigned_to || ticket.assignedTo || null;
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || assignee;
  const now = new Date().toISOString();
  var RESOLVED = {
    resolvido: 1, resolvido_com_manual: 1, resolvido_sem_manual: 1,
    post_mortem: 1, migracao_concluida: 1, fechado: 1
  };
  var force = body.force === true || body.takeover === true;
  var st = String(ticket.status || "");
  if (assignee && fromUserId && String(fromUserId) !== String(assignee) && !force && !RESOLVED[st]) {
    return ctx.reply.status(409).send({
      error: "Chamado já atribuído a outro atendente. Use assumir com confirmação.",
      assigned_to: fromUserId,
    });
  }
  const row = await Ticket.update(id, {
    assigned_to: assignee,
    updated_at: now,
  });
  try {
    if (OH) {
      await OH.create({
        ticket_id: id,
        from_user_id: fromUserId,
        to_user_id: assignee,
        changed_by_id: actor,
        reason: force ? "takeover" : null,
        changed_at: now,
      });
    }
  } catch (e) {}
  try {
    if (Log) {
      var takeover = assignee && fromUserId && String(fromUserId) !== String(assignee);
      await Log.create({
        ticket_id: id,
        user_id: actor,
        action: takeover ? "ticket_takeover" : (assignee ? "ticket_assigned" : "ticket_unassigned"),
        details: { assigned_to: assignee, from: fromUserId, force: !!force },
        created_at: now,
        visible_to_client: true,
      });
    }
  } catch (e) {}
  return ctx.reply.send(row);
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/tickets/:id/status',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  if (!body.status) return ctx.reply.status(400).send({ error: "status required" });
  const ticket = await Ticket.findById(id);
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const fromStatus = ticket.status;
  const now = new Date().toISOString();
  const patch = {
    status: body.status,
    updated_at: now,
  };
  if (body.pendency_reason !== undefined) patch.pendency_reason = body.pendency_reason;
  if (body.pendency_type !== undefined) patch.pendency_type = body.pendency_type;
  if (body.follow_up_date !== undefined) patch.follow_up_date = body.follow_up_date;
  const row = await Ticket.update(id, patch);
  try {
    if (Log) {
      const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
      await Log.create({
        ticket_id: id,
        user_id: actor,
        action: "status_changed",
        details: { from: fromStatus, to: body.status },
        created_at: now,
        visible_to_client: true,
      });
    }
  } catch (e) {}
  return ctx.reply.send({ success: true, data: row });
}
module.exports = { handler };`,
  },
]

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  let updated = 0
  let missing = 0
  for (const spec of CONTROLLERS) {
    const route = await prisma.moduleRoute.findFirst({
      where: {
        method: spec.method,
        path: spec.path,
        module: { appId: app.id },
      },
    })
    if (!route) {
      console.warn('MISSING — creating', spec.method, spec.path)
      const mod =
        (await prisma.module.findFirst({
          where: { appId: app.id, name: { contains: 'ticket' } },
        })) ||
        (await prisma.module.findFirst({ where: { appId: app.id } }))
      if (!mod) {
        missing++
        continue
      }
      await prisma.moduleRoute.create({
        data: {
          moduleId: mod.id,
          method: spec.method,
          path: spec.path,
          controllerCode: spec.code,
          requiredPermissions: [],
        },
      })
      updated++
      console.log('CREATED', spec.method, spec.path)
      continue
    }
    await prisma.moduleRoute.update({
      where: { id: route.id },
      data: { controllerCode: spec.code },
    })
    updated++
    console.log('UPDATED', spec.method, spec.path)
  }
  console.log({ updated, missing, total: CONTROLLERS.length })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
