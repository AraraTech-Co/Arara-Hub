/**
 * Fase 1 — correções de bugs do Portal de Suporte (doc).
 * - Numeração sequencial TCK000001 via TicketSequence
 * - created_at (cadastro) ≠ occurred_at (atendimento)
 * - Status unificado com resolved_at + Notification + ActivityLog
 * - Histórico co-assignees / escalate
 * - Evidências com MIME whitelist + ActivityLog
 *
 * Run (prod container): npx tsx scripts/portal-suporte/enrich-phase1-bugs.ts
 */
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

type Spec = { method: string; path: string; code: string }

/** Shared allocator embedded in create handlers (document store, retry-safe). */
const ALLOC_HELPER = `
async function allocateTicketNumber(Ticket, Seq) {
  var PREFIX = "TCK";
  var PAD = 6;
  var tickets = await Ticket.findMany({});
  var max = 0;
  var used = {};
  for (var j = 0; j < (tickets || []).length; j++) {
    var tn = String(tickets[j].ticket_number || tickets[j].ticketNumber || "");
    used[tn] = 1;
    if (tn.indexOf(PREFIX) === 0) {
      var n = parseInt(tn.slice(PREFIX.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var next = max + 1;
  if (Seq) {
    try {
      var rows = await Seq.findMany({});
      for (var i = 0; i < (rows || []).length; i++) {
        if (String(rows[i].key || "") === "ticket_number") {
          var sn = Number(rows[i].next || 0);
          if (sn > next) next = sn;
        }
      }
    } catch (e) {}
  }
  for (var attempt = 0; attempt < 80; attempt++) {
    var candidate = next + attempt;
    var num = PREFIX + String(candidate).padStart(PAD, "0");
    if (used[num]) continue;
    // Atomic claim via unique ModelRecord id — second writer fails
    if (Seq) {
      try {
        await Seq.create({
          id: "tnclaim_" + num,
          key: "claim:" + num,
          next: candidate + 1,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        continue;
      }
      try {
        var seqRows = await Seq.findMany({});
        var seq = null;
        for (var k = 0; k < (seqRows || []).length; k++) {
          if (String(seqRows[k].key || "") === "ticket_number") { seq = seqRows[k]; break; }
        }
        if (seq) {
          var cur = Number(seq.next || 0);
          if (candidate + 1 > cur) {
            await Seq.update(seq.id, { next: candidate + 1, updated_at: new Date().toISOString() });
          }
        } else {
          await Seq.create({
            id: "ticket_number_seq",
            key: "ticket_number",
            next: candidate + 1,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (e) {}
    }
    return num;
  }
  throw new Error("Não foi possível alocar ticket_number");
}
`.trim()

const STATUS_HELPER = `
var RESOLVED = {
  resolvido: 1, resolvido_com_manual: 1, resolvido_sem_manual: 1,
  post_mortem: 1, migracao_concluida: 1, fechado: 1
};
async function applyTicketStatusChange(ctx, Ticket, Log, Co, id, body) {
  if (!body.status) return { error: "status required", status: 400 };
  var ticket = await Ticket.findById(id);
  if (!ticket) return { error: "Ticket not found", status: 404 };
  var fromStatus = ticket.status;
  var toStatus = String(body.status);
  if (fromStatus === toStatus) {
    return { data: ticket, status: 200 };
  }
  var now = new Date().toISOString();
  var actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  var patch = {
    status: toStatus,
    updated_at: now,
  };
  if (body.pendency_reason !== undefined) patch.pendency_reason = body.pendency_reason;
  if (body.pendency_type !== undefined) patch.pendency_type = body.pendency_type;
  if (body.follow_up_date !== undefined) patch.follow_up_date = body.follow_up_date;
  var isResolved = !!RESOLVED[toStatus];
  var wasResolved = !!RESOLVED[String(fromStatus || "")];
  if (isResolved && !ticket.resolved_at && !ticket.resolvedAt) {
    patch.resolved_at = now;
  }
  if (!isResolved && wasResolved) {
    patch.resolved_at = null;
  }
  var row = await Ticket.update(id, patch);
  try {
    if (Log) {
      await Log.create({
        ticket_id: id,
        user_id: actor,
        action: isResolved ? "ticket_completed" : "status_changed",
        details: {
          from: fromStatus,
          to: toStatus,
          resolved_at: patch.resolved_at || null,
          completed_by: isResolved ? actor : null,
        },
        created_at: now,
        visible_to_client: true,
      });
    }
  } catch (e) {}
  try {
    var recipients = {};
    if (ticket.assigned_to || ticket.assignedTo) recipients[String(ticket.assigned_to || ticket.assignedTo)] = 1;
    if (ticket.user_id || ticket.userId) recipients[String(ticket.user_id || ticket.userId)] = 1;
    if (Co) {
      try {
        var cos = await Co.findMany({ ticket_id: id });
        (cos || []).forEach(function (c) {
          if (String(c.ticket_id || c.ticketId) === String(id)) {
            recipients[String(c.user_id || c.userId)] = 1;
          }
        });
      } catch (e2) {}
    }
    if (actor) delete recipients[String(actor)];
    var num = ticket.ticket_number || ticket.ticketNumber || id;
    var title = isResolved ? "Ticket concluído" : "Ticket movido";
    var bodyText = isResolved
      ? ("O ticket " + num + " foi marcado como " + toStatus + ".")
      : ("O ticket " + num + " mudou de " + fromStatus + " para " + toStatus + ".");
    var href = "https://suporte.arara-tech.com/admin/tickets/view?id=" + encodeURIComponent(id);
    var ids = Object.keys(recipients).filter(Boolean);
    if (typeof ctx.notify === "function") {
      for (var i = 0; i < ids.length; i++) {
        try {
          await ctx.notify({
            userId: ids[i],
            title: title,
            body: bodyText,
            severity: isResolved ? "success" : "info",
            href: href,
            sourceApp: "portal-suporte",
          });
        } catch (e3) {}
      }
    }
  } catch (e) {}
  return { data: row, status: 200 };
}
`.trim()

const CONTROLLERS: Spec[] = [
  {
    method: 'POST',
    path: '/tickets',
    code: `async function handler(ctx) {
  ${ALLOC_HELPER}
  const model = ctx.models.Ticket;
  const Company = ctx.models.Company;
  const Seq = ctx.models.TicketSequence;
  const Log = ctx.models.ActivityLog;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const body = Object.assign({}, ctx.body || {});
  const now = new Date().toISOString();
  if (!body.title || !String(body.title).trim()) {
    return ctx.reply.status(400).send({ error: "title is required" });
  }
  // RN09: created_at = cadastro (now); occurred_at = atendimento (optional)
  delete body.created_at;
  delete body.createdAt;
  body.created_at = now;
  if (body.occurred_at || body.occurredAt) {
    body.occurred_at = body.occurred_at || body.occurredAt;
  }
  if (!body.status) body.status = "novos_chamados";
  if (!body.priority) body.priority = "medium";
  if (body.is_public === undefined) body.is_public = false;
  if (body.position == null) body.position = 0;
  body.updated_at = now;
  if (!body.source || body.source === "internal") body.source = "portal";

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/\\s+/g, " ").trim();
  }
  try {
    if (Company && body.company_name && !body.company_id) {
      var companies = await Company.findMany({});
      var target = norm(body.company_name);
      for (var i = 0; i < (companies || []).length; i++) {
        if (norm(companies[i].name) === target) {
          body.company_id = companies[i].id;
          body.company_name = companies[i].name;
          if (!body.company_cnpj && companies[i].cnpj) body.company_cnpj = companies[i].cnpj;
          break;
        }
      }
    } else if (Company && body.company_id) {
      var c = await Company.findById(String(body.company_id));
      if (c) {
        body.company_name = c.name;
        if (!body.company_cnpj && c.cnpj) body.company_cnpj = c.cnpj;
      }
    }
  } catch (e) {}

  var lastErr = null;
  for (var attempt = 0; attempt < 5; attempt++) {
    try {
      body.ticket_number = await allocateTicketNumber(model, Seq);
      const row = await model.create(body);
      try {
        if (Log) {
          var actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || body.user_id || null;
          await Log.create({
            ticket_id: row.id,
            user_id: actor,
            action: "ticket_created",
            details: { ticket_number: body.ticket_number, occurred_at: body.occurred_at || null },
            created_at: now,
            visible_to_client: true,
          });
        }
      } catch (e) {}
      return ctx.reply.status(201).send({ data: row });
    } catch (e) {
      lastErr = e;
    }
  }
  return ctx.reply.status(400).send({ error: String((lastErr && lastErr.message) || lastErr || "create failed") });
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/tickets/:id',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const ticket = await Ticket.findById(id);
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const now = new Date().toISOString();
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  const patch = { updated_at: now };
  // Never allow rewriting created_at via PATCH
  const allowed = [
    "title", "description", "priority", "category", "tags", "severity",
    "ticket_type", "requester", "contact_email", "company_id", "company_name",
    "company_cnpj", "unit_id", "occurred_at", "impact", "urgency", "team_id",
    "pendency_reason", "pendency_type", "follow_up_date", "is_public"
  ];
  for (var i = 0; i < allowed.length; i++) {
    var key = allowed[i];
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.occurredAt !== undefined && body.occurred_at === undefined) {
    patch.occurred_at = body.occurredAt;
  }
  const fromOccurred = ticket.occurred_at || ticket.occurredAt || null;
  const row = await Ticket.update(id, patch);
  if (patch.occurred_at !== undefined && String(patch.occurred_at || "") !== String(fromOccurred || "")) {
    try {
      if (Log) {
        await Log.create({
          ticket_id: id,
          user_id: actor,
          action: "occurred_at_changed",
          details: { from: fromOccurred, to: patch.occurred_at },
          created_at: now,
          visible_to_client: false,
        });
      }
    } catch (e) {}
  }
  return ctx.reply.send({ success: true, data: row });
}
module.exports = { handler };`,
  },
  {
    method: 'PUT',
    path: '/tickets/:id',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const ticket = await Ticket.findById(id);
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const now = new Date().toISOString();
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  const patch = { updated_at: now };
  const allowed = [
    "title", "description", "priority", "category", "tags", "severity",
    "ticket_type", "requester", "contact_email", "company_id", "company_name",
    "company_cnpj", "unit_id", "occurred_at", "impact", "urgency", "team_id",
    "pendency_reason", "pendency_type", "follow_up_date", "is_public"
  ];
  for (var i = 0; i < allowed.length; i++) {
    var key = allowed[i];
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.occurredAt !== undefined && body.occurred_at === undefined) {
    patch.occurred_at = body.occurredAt;
  }
  const fromOccurred = ticket.occurred_at || ticket.occurredAt || null;
  const row = await Ticket.update(id, patch);
  if (patch.occurred_at !== undefined && String(patch.occurred_at || "") !== String(fromOccurred || "")) {
    try {
      if (Log) {
        await Log.create({
          ticket_id: id,
          user_id: actor,
          action: "occurred_at_changed",
          details: { from: fromOccurred, to: patch.occurred_at },
          created_at: now,
          visible_to_client: false,
        });
      }
    } catch (e) {}
  }
  return ctx.reply.send({ success: true, data: row });
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/tickets/:id/status',
    code: `async function handler(ctx) {
  ${STATUS_HELPER}
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  const Co = ctx.models.TicketCoAssignee;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const result = await applyTicketStatusChange(ctx, Ticket, Log, Co, ctx.params.id, ctx.body || {});
  if (result.error) return ctx.reply.status(result.status).send({ error: result.error });
  return ctx.reply.send({ success: true, data: result.data });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/status',
    code: `async function handler(ctx) {
  ${STATUS_HELPER}
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  const Co = ctx.models.TicketCoAssignee;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const result = await applyTicketStatusChange(ctx, Ticket, Log, Co, ctx.params.id, ctx.body || {});
  if (result.error) return ctx.reply.status(result.status).send({ error: result.error });
  return ctx.reply.send({ success: true, data: result.data });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/co-assignees',
    code: `async function handler(ctx) {
  const Co = ctx.models.TicketCoAssignee;
  const Log = ctx.models.ActivityLog;
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
  if (all.length >= 10) {
    return ctx.reply.status(400).send({ error: "Máximo de 10 co-responsáveis" });
  }
  const now = new Date().toISOString();
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  const row = await Co.create({
    ticket_id: ticketId,
    user_id: userId,
    created_at: now,
  });
  try {
    if (Log) {
      await Log.create({
        ticket_id: ticketId,
        user_id: actor,
        action: "participant_added",
        details: { link_type: "co_assignee", person_id: userId, action: "add" },
        created_at: now,
        visible_to_client: false,
      });
    }
  } catch (e) {}
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };`,
  },
  {
    method: 'DELETE',
    path: '/tickets/:id/co-assignees/:userId',
    code: `async function handler(ctx) {
  const Co = ctx.models.TicketCoAssignee;
  const Log = ctx.models.ActivityLog;
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
  const now = new Date().toISOString();
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  try {
    if (Log) {
      await Log.create({
        ticket_id: ticketId,
        user_id: actor,
        action: "participant_removed",
        details: { link_type: "co_assignee", person_id: userId, action: "remove" },
        created_at: now,
        visible_to_client: false,
      });
    }
  } catch (e) {}
  return ctx.reply.send({ success: true });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/attachments',
    code: `async function handler(ctx) {
  const Att = ctx.models.Attachment;
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  if (!Att) return ctx.reply.status(500).send({ error: "Model Attachment missing" });
  const id = ctx.params.id;
  if (Ticket) {
    const t = await Ticket.findById(id);
    if (!t) return ctx.reply.status(404).send({ error: "Ticket not found" });
  }
  const body = ctx.body || {};
  const fileName = String(body.file_name || body.fileName || body.name || "");
  var fileType = String(body.file_type || body.fileType || body.mime || "application/octet-stream");
  const contentBase64 = body.content_base64 || body.contentBase64 || body.data;
  var fileUrl = body.file_url || body.fileUrl || null;
  if (!fileName) return ctx.reply.status(400).send({ error: "file_name required" });

  var ALLOWED = {
    "image/jpeg": 1, "image/jpg": 1, "image/png": 1, "image/gif": 1, "image/webp": 1,
    "video/mp4": 1, "video/webm": 1, "video/quicktime": 1,
    "audio/mpeg": 1, "audio/mp3": 1, "audio/wav": 1, "audio/ogg": 1, "audio/webm": 1, "audio/mp4": 1, "audio/x-m4a": 1,
    "application/pdf": 1
  };
  var ext = (fileName.split(".").pop() || "").toLowerCase();
  var EXT_MIME = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
    pdf: "application/pdf"
  };
  if ((!fileType || fileType === "application/octet-stream") && EXT_MIME[ext]) {
    fileType = EXT_MIME[ext];
  }
  if (!ALLOWED[fileType]) {
    return ctx.reply.status(400).send({
      error: "Tipo de arquivo não permitido. Use imagem, vídeo, áudio ou PDF.",
    });
  }
  if (!fileUrl && contentBase64) {
    var raw = String(contentBase64);
    // ~100MB binary ≈ 140MB base64 data-URL; reject above that.
    if (raw.length > 145 * 1024 * 1024) {
      return ctx.reply.status(400).send({ error: "Arquivo muito grande (máx. 100MB)" });
    }
    if (raw.indexOf("data:") === 0) fileUrl = raw;
    else fileUrl = "data:" + fileType + ";base64," + raw;
  }
  if (!fileUrl) return ctx.reply.status(400).send({ error: "file_url or content_base64 required" });
  // Prefer data: URLs (only returned via authenticated API) — reject bare public http without auth gate
  if (String(fileUrl).indexOf("http://") === 0 || String(fileUrl).indexOf("https://") === 0) {
    if (String(fileUrl).indexOf("/v1/r/") < 0 && String(fileUrl).indexOf("data:") !== 0) {
      // allow only if already our API path; otherwise force clients to send base64
      return ctx.reply.status(400).send({ error: "Envie o arquivo como content_base64 (acesso autenticado)" });
    }
  }
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  const now = new Date().toISOString();
  const fileSize = Number(body.file_size || body.fileSize || 0);
  const row = await Att.create({
    ticket_id: id,
    file_name: fileName,
    file_url: fileUrl,
    file_size: fileSize,
    file_type: fileType,
    uploaded_by: actor,
    message_id: null,
    position: 0,
    created_at: now,
  });
  try {
    if (Log) {
      await Log.create({
        ticket_id: id,
        user_id: actor,
        action: "evidence_added",
        details: { attachment_id: row.id, file_name: fileName, file_type: fileType, file_size: fileSize },
        created_at: now,
        visible_to_client: false,
      });
    }
  } catch (e) {}
  return ctx.reply.status(201).send({
    success: true,
    data: {
      id: row.id,
      fileName: row.file_name || fileName,
      fileUrl: row.file_url || fileUrl,
      fileSize: Number(row.file_size || 0),
      fileType: row.file_type || fileType,
      createdAt: row.created_at || now,
      uploaded_by: actor,
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
  const Log = ctx.models.ActivityLog;
  if (!Att) return ctx.reply.status(500).send({ error: "Model Attachment missing" });
  const id = ctx.params.id;
  const row = await Att.findById(id);
  if (!row) return ctx.reply.status(404).send({ error: "Attachment not found" });
  const ticketId = row.ticket_id || row.ticketId;
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  const now = new Date().toISOString();
  try {
    await Att.delete(id);
  } catch (e) {
    return ctx.reply.status(404).send({ error: String(e.message || e) });
  }
  try {
    if (Log && ticketId) {
      await Log.create({
        ticket_id: ticketId,
        user_id: actor,
        action: "evidence_removed",
        details: {
          attachment_id: id,
          file_name: row.file_name || row.fileName || null,
          file_type: row.file_type || row.fileType || null,
        },
        created_at: now,
        visible_to_client: false,
      });
    }
  } catch (e) {}
  return ctx.reply.send({ success: true });
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
    ticket_completed: "Ticket concluído",
    ticket_assigned: "Responsável atribuído",
    ticket_unassigned: "Responsável removido",
    message_added: "Mensagem adicionada",
    internal_note_added: "Nota interna adicionada",
    ticket_archived: "Ticket arquivado",
    ticket_restored: "Ticket restaurado",
    ticket_deleted: "Ticket excluído",
    priority_changed: "Prioridade alterada",
    severity_changed: "Severidade alterada",
    time_logged: "Horas registradas",
    ticket_escalated: "Ticket escalado",
    participant_added: "Participante adicionado",
    participant_removed: "Participante removido",
    evidence_added: "Evidência anexada",
    evidence_removed: "Evidência removida",
    occurred_at_changed: "Data do atendimento alterada",
  };
  const ACTION_ICONS = {
    ticket_created: "🎫", ticket_updated: "✏️", status_changed: "🔄", ticket_completed: "✅",
    ticket_assigned: "👤", ticket_unassigned: "➖", message_added: "💬",
    internal_note_added: "📝", ticket_archived: "📦", ticket_restored: "♻️",
    ticket_deleted: "🗑️", priority_changed: "🔺", severity_changed: "⚠️",
    time_logged: "⏱️", ticket_escalated: "⬆️",
    participant_added: "➕", participant_removed: "➖",
    evidence_added: "📎", evidence_removed: "🗑️", occurred_at_changed: "📅",
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
  var data = slice.map(function (logEntry) {
    var uid = logEntry.user_id || logEntry.userId;
    var pr = uid ? byId[String(uid)] : null;
    var action = String(logEntry.action || "");
    return {
      id: logEntry.id,
      action: action,
      label: ACTION_LABELS[action] || action,
      icon: ACTION_ICONS[action] || "•",
      details: logEntry.details || null,
      actor: pr ? {
        id: String(pr.id),
        name: pr.full_name || pr.fullName || pr.name || pr.email || "Agente",
        avatar_url: pr.avatar_url || pr.avatarUrl || null,
      } : (uid ? { id: String(uid), name: "Agente", avatar_url: null } : null),
      created_at: logEntry.created_at || logEntry.createdAt || new Date().toISOString(),
    };
  });
  return ctx.reply.send({ success: true, data: { data: data, total: total } });
}
module.exports = { handler };`,
  },
]

async function ensureTicketSequence(appId: string) {
  const name = `${APP_SLUG}-TicketSequence`
  await prisma.modelDef.upsert({
    where: { appId_name: { appId, name } },
    create: {
      appId,
      name,
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          key: { type: 'string' },
          next: { type: 'number' },
          updated_at: { type: 'string' },
        },
      } as Prisma.InputJsonValue,
    },
    update: {},
  })
  console.log('MODEL', name)

  const existing = await prisma.modelRecord.findFirst({
    where: { appId, modelName: name, data: { path: ['key'], equals: 'ticket_number' } },
  })
  if (existing) {
    console.log('SEQ exists', (existing.data as { next?: number }).next)
    return
  }

  const tickets = await prisma.modelRecord.findMany({
    where: { appId, modelName: `${APP_SLUG}-Ticket` },
  })
  let max = 0
  for (const t of tickets) {
    const data = t.data as { ticket_number?: string; ticketNumber?: string }
    const tn = String(data.ticket_number || data.ticketNumber || '')
    if (tn.startsWith('TCK')) {
      const n = parseInt(tn.slice(3), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  const next = max + 1
  await prisma.modelRecord.create({
    data: {
      id: 'ticket_number_seq',
      appId,
      modelName: name,
      data: {
        id: 'ticket_number_seq',
        key: 'ticket_number',
        next,
        updated_at: new Date().toISOString(),
      },
    },
  })
  console.log('SEQ seeded next=', next, 'from max=', max)
}

async function upsertTicketSchemaFields(appId: string) {
  const name = `${APP_SLUG}-Ticket`
  const def = await prisma.modelDef.findUnique({ where: { appId_name: { appId, name } } })
  if (!def) return
  const schema = (def.schema || {}) as {
    type?: string
    properties?: Record<string, { type?: string }>
  }
  if (!schema.properties) schema.properties = {}
  const extras: Record<string, { type: string }> = {
    occurred_at: { type: 'string' },
    resolved_at: { type: 'string' },
    company_id: { type: 'string' },
    unit_id: { type: 'string' },
    source: { type: 'string' },
    impact: { type: 'string' },
    urgency: { type: 'string' },
  }
  let changed = false
  for (const [k, v] of Object.entries(extras)) {
    if (!schema.properties[k]) {
      schema.properties[k] = v
      changed = true
    }
  }
  if (changed) {
    await prisma.modelDef.update({
      where: { id: def.id },
      data: { schema: schema as Prisma.InputJsonValue },
    })
    console.log('Ticket schema fields updated')
  }
}

async function upsertControllers(appId: string) {
  let updated = 0
  for (const spec of CONTROLLERS) {
    const route = await prisma.moduleRoute.findFirst({
      where: { method: spec.method, path: spec.path, module: { appId } },
    })
    if (!route) {
      const mod =
        (await prisma.module.findFirst({
          where: { appId, name: { contains: 'ticket' } },
        })) || (await prisma.module.findFirst({ where: { appId } }))
      if (!mod) {
        console.warn('NO MODULE for', spec.method, spec.path)
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
  return updated
}

async function patchWhatsAppTicketCreate(appId: string) {
  const route = await prisma.moduleRoute.findFirst({
    where: { method: 'POST', path: '/whatsapp/:id/ticket', module: { appId } },
  })
  if (!route?.controllerCode) {
    console.warn('WhatsApp ticket create route missing — skip')
    return
  }
  const claimAlloc = `await (async function(){ var Seq = ctx.models.TicketSequence; var Ticket = m.Ticket; var PREFIX="TCK"; var PAD=6; var tickets=await Ticket.findMany({}); var max=0; var used={}; for(var j=0;j<(tickets||[]).length;j++){ var tn=String(tickets[j].ticket_number||tickets[j].ticketNumber||""); used[tn]=1; if(tn.indexOf(PREFIX)===0){ var n=parseInt(tn.slice(PREFIX.length),10); if(!isNaN(n)&&n>max) max=n; } } var next=max+1; for(var attempt=0;attempt<80;attempt++){ var candidate=next+attempt; var num=PREFIX+String(candidate).padStart(PAD,"0"); if(used[num]) continue; if(Seq){ try{ await Seq.create({id:"tnclaim_"+num,key:"claim:"+num,next:candidate+1,updated_at:new Date().toISOString()}); }catch(e){ continue; } } return num; } throw new Error("ticket_number alloc failed"); })()`

  let code = route.controllerCode
  // Replace any previous ticket_number assignment patterns
  const patterns = [
    /ticket_number:\s*"WA"\s*\+\s*String\(Date\.now\(\)\)\.slice\(-6\)/,
    /ticket_number:\s*await allocateTicketNumber\([^)]+\)/,
    /ticket_number:\s*await \(async function\(\)\{[\s\S]*?\}\)\(\)/,
  ]
  let replaced = false
  for (const re of patterns) {
    if (re.test(code)) {
      code = code.replace(re, `ticket_number: ${claimAlloc}`)
      replaced = true
      break
    }
  }
  if (!replaced) {
    console.warn('Could not patch WhatsApp ticket_number — manual check needed')
    return
  }
  await prisma.moduleRoute.update({
    where: { id: route.id },
    data: { controllerCode: code },
  })
  console.log('UPDATED POST /whatsapp/:id/ticket (sequential claim number)')
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  await ensureTicketSequence(app.id)
  await upsertTicketSchemaFields(app.id)
  const n = await upsertControllers(app.id)
  await patchWhatsAppTicketCreate(app.id)
  console.log({ updatedControllers: n })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
