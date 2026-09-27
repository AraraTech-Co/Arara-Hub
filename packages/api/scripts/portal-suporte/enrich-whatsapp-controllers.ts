/**
 * Register + enrich WhatsApp inbox/flow controllers for portal-suporte on Arara.
 *
 * Run (from platform/):
 *   npx tsx scripts/portal-suporte/enrich-whatsapp-controllers.ts
 *
 * Creates missing ModelDefs (WaCloseReasons, WaFlows) and ModuleRoutes, then
 * upserts controllerCode so the client-only UI can call /v1/r/portal-suporte/whatsapp/*.
 *
 * Limitations (sandbox): no real BotConversa/Avisa outbound, no SSE long-poll —
 * stream routes return a short JSON hint; UI still works via REST + polling.
 */
import { PrismaClient, type Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const MODULE_NAME = 'whatsapp'

type Spec = { method: string; path: string; code: string }

const STARTER_GRAPH = {
  root: 'inicio',
  nodes: [
    {
      id: 'inicio',
      type: 'menu',
      position: { x: 0, y: 0 },
      data: {
        label: 'Início',
        text: 'Olá! Como podemos ajudar?',
        options: [{ id: 'atendente', label: 'Falar com um atendente' }],
      },
    },
    {
      id: 'atendente',
      type: 'handoff',
      position: { x: 280, y: 0 },
      data: {
        label: 'Atendente — suporte',
        text: 'Certo! Já estou chamando um atendente para continuar com você.',
        area: 'suporte',
      },
    },
  ],
  edges: [
    {
      id: 'inicio--opt:atendente--atendente',
      source: 'inicio',
      target: 'atendente',
      sourceHandle: 'opt:atendente',
      label: 'Falar com um atendente',
    },
  ],
}

/** Shared helpers inlined into every handler (sandbox has no imports). */
const HELPERS = `
function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function nowIso() { return new Date().toISOString(); }
function userId(ctx) {
  var u = ctx.user || {};
  return u.id || u.userId || null;
}
function pick(obj, keys) {
  var out = {};
  if (!obj) return out;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}
function model(ctx) {
  // Prefer exact prod names; fall back to singular variants.
  return {
    Conv: ctx.models.WhatsAppConversation,
    Msg: ctx.models.WhatsAppMessage,
    Group: ctx.models.WhatsAppGroup,
    Close: ctx.models.WaCloseReasons || ctx.models.WACloseReason || ctx.models.WaCloseReason,
    Flow: ctx.models.WaFlows || ctx.models.WAFlow || ctx.models.WaFlow,
    Tag: ctx.models.WaTags || ctx.models.WATag || ctx.models.WaTag,
    ConvTag: ctx.models.WaConversationTags || ctx.models.WAConversationTag || ctx.models.WaConversationTag,
    Dept: ctx.models.WaDepartments || ctx.models.Department || ctx.models.WaDepartment,
    Agent: ctx.models.WaAgentProfiles || ctx.models.WAAgentProfile || ctx.models.WaAgentProfile,
    Note: ctx.models.WaInternalNotes || ctx.models.WAInternalNote || ctx.models.WaInternalNote,
    Quick: ctx.models.WaQuickReplies || ctx.models.WAQuickReply || ctx.models.WaQuickReply,
    Auto: ctx.models.WaAutomationRules || ctx.models.WAAutomationRule || ctx.models.WaAutomationRule,
    Event: ctx.models.WaConversationEvents || ctx.models.WAConversationEvent || ctx.models.WaConversationEvent,
    Profile: ctx.models.Profile,
    Company: ctx.models.Company,
    Contact: ctx.models.CompanyContact,
    Ticket: ctx.models.Ticket,
  };
}
function ok(ctx, data, status) {
  return ctx.reply.status(status || 200).send({ success: true, data: data });
}
function fail(ctx, status, error) {
  return ctx.reply.status(status).send({ success: false, error: error });
}
async function indexById(rows) {
  var map = {};
  for (var i = 0; i < (rows || []).length; i++) map[rows[i].id] = rows[i];
  return map;
}
async function lastMessagesByConv(Msg) {
  if (!Msg) return {};
  var all = await Msg.findMany({});
  var best = {};
  for (var i = 0; i < all.length; i++) {
    var m = all[i];
    var cid = m.conversation_id || m.conversationId;
    if (!cid) continue;
    var ts = m.timestamp || m.created_at || m.createdAt || "";
    var prev = best[cid];
    if (!prev || String(ts) > String(prev.timestamp || prev.created_at || "")) best[cid] = m;
  }
  return best;
}
function serializeMsg(m) {
  if (!m) return null;
  return {
    id: m.id,
    from_me: !!(m.from_me != null ? m.from_me : m.fromMe),
    sender_name: m.sender_name != null ? m.sender_name : (m.senderName || null),
    body: m.body || "",
    media_type: m.media_type != null ? m.media_type : (m.mediaType || null),
    timestamp: m.timestamp || m.created_at || m.createdAt || nowIso(),
  };
}
async function serializeConv(c, deps) {
  var last = deps.lastByConv[c.id];
  var assigneeId = c.assigned_to_id || c.assignedToId || null;
  var profile = assigneeId ? deps.profiles[assigneeId] : null;
  var deptId = c.department_id || c.departmentId || null;
  var dept = deptId ? deps.depts[deptId] : null;
  var companyId = c.company_id || c.companyId || null;
  var company = companyId ? deps.companies[companyId] : null;
  var contactId = c.company_contact_id || c.companyContactId || null;
  var contact = contactId ? deps.contacts[contactId] : null;
  var ticketId = c.ticket_id || c.ticketId || null;
  var ticket = ticketId ? deps.tickets[ticketId] : null;
  var closeId = c.close_reason_id || c.closeReasonId || null;
  var close = closeId ? deps.closes[closeId] : null;
  var tagLinks = (deps.convTags || []).filter(function (t) {
    return (t.conversation_id || t.conversationId) === c.id;
  });
  var tags = tagLinks.map(function (link) {
    var tag = deps.tags[link.tag_id || link.tagId];
    return tag ? { id: tag.id, name: tag.name, color: tag.color || null } : null;
  }).filter(Boolean);
  return {
    id: c.id,
    remote_jid: c.remote_jid || c.remoteJid || "",
    contact_name: c.contact_name != null ? c.contact_name : (c.contactName || null),
    status: c.status || "open",
    phase: c.phase || "novo",
    priority: c.priority || "medium",
    unread_count: Number(c.unread_count != null ? c.unread_count : (c.unreadCount || 0)),
    updated_at: c.updated_at || c.updatedAt || nowIso(),
    created_at: c.created_at || c.createdAt || null,
    assigned_to: profile
      ? { id: profile.id, name: profile.full_name || profile.fullName || profile.name || profile.email || null }
      : null,
    department: dept
      ? { id: dept.id, name: dept.name, color: dept.color || null }
      : null,
    company: company ? { id: company.id, name: company.name || company.trade_name || null } : null,
    contact: contact ? { id: contact.id, name: contact.name || null } : null,
    ticket: ticket
      ? {
          id: ticket.id,
          title: ticket.title || null,
          status: ticket.status || null,
          priority: ticket.priority || null,
          ticket_number: ticket.ticket_number || ticket.ticketNumber || null,
          company_name: ticket.company_name || ticket.companyName || null,
          assignee: null,
          sla: null,
        }
      : null,
    tags: tags,
    close_reason: close ? { id: close.id, name: close.name } : null,
    last_message: serializeMsg(last),
    assigned_to_id: assigneeId,
    department_id: deptId,
    company_id: companyId,
    ticket_id: ticketId,
    close_reason_id: closeId,
    resolved_at: c.resolved_at || c.resolvedAt || null,
    provider_contact_id: c.provider_contact_id || c.providerContactId || null,
  };
}
async function loadDeps(m) {
  var lastByConv = await lastMessagesByConv(m.Msg);
  var profiles = m.Profile ? await indexById(await m.Profile.findMany({})) : {};
  var depts = m.Dept ? await indexById(await m.Dept.findMany({})) : {};
  var companies = m.Company ? await indexById(await m.Company.findMany({})) : {};
  var contacts = m.Contact ? await indexById(await m.Contact.findMany({})) : {};
  var tickets = m.Ticket ? await indexById(await m.Ticket.findMany({})) : {};
  var closes = m.Close ? await indexById(await m.Close.findMany({})) : {};
  var tags = m.Tag ? await indexById(await m.Tag.findMany({})) : {};
  var convTags = m.ConvTag ? await m.ConvTag.findMany({}) : [];
  return { lastByConv: lastByConv, profiles: profiles, depts: depts, companies: companies, contacts: contacts, tickets: tickets, closes: closes, tags: tags, convTags: convTags };
}
`

function handler(body: string): string {
  return `${HELPERS}
async function handler(ctx) {
${body}
}
module.exports = { handler };`
}

const CONTROLLERS: Spec[] = [
  {
    method: 'GET',
    path: '/whatsapp',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var rows = await m.Conv.findMany({});
  rows.sort(function (a, b) {
    return String(b.updated_at || b.updatedAt || "").localeCompare(String(a.updated_at || a.updatedAt || ""));
  });
  var deps = await loadDeps(m);
  var data = [];
  for (var i = 0; i < rows.length; i++) data.push(await serializeConv(rows[i], deps));
  return ok(ctx, data);
`),
  },
  {
    method: 'POST',
    path: '/whatsapp',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv || !m.Msg) return fail(ctx, 500, "WhatsApp models missing");
  var body = ctx.body || {};
  var conversationId = body.conversationId || body.conversation_id;
  var message = String(body.message || "").trim();
  if (!conversationId || !message) return fail(ctx, 400, "conversationId e message obrigatórios");
  var conv = await m.Conv.findById(conversationId);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  var uidActor = userId(ctx);
  var profile = uidActor && m.Profile ? await m.Profile.findById(uidActor) : null;
  var sender = profile
    ? (profile.full_name || profile.fullName || profile.name || profile.email || "Atendente")
    : "Atendente";
  var ts = nowIso();
  var saved = await m.Msg.create({
    id: uid("wam"),
    conversation_id: conversationId,
    message_id: "local_" + Date.now(),
    from_me: true,
    sender_name: sender,
    body: message,
    media_url: null,
    media_type: null,
    timestamp: ts,
    created_at: ts,
  });
  var patch = {
    updated_at: ts,
    last_outbound_at: ts,
    unread_count: 0,
  };
  if (!conv.first_response_at && !conv.firstResponseAt) patch.first_response_at = ts;
  await m.Conv.update(conversationId, patch);
  return ok(ctx, serializeMsg(saved), 201);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  var deps = await loadDeps(m);
  var data = await serializeConv(conv, deps);
  // Detalhe CRM: espelha campos camelCase usados pela inbox.
  data.remoteJid = data.remote_jid;
  data.contactName = data.contact_name;
  data.unreadCount = data.unread_count;
  data.assignedToId = data.assigned_to_id;
  data.departmentId = data.department_id;
  data.companyId = data.company_id;
  data.ticketId = data.ticket_id;
  data.closeReasonId = data.close_reason_id;
  return ok(ctx, data);
`),
  },
  {
    method: 'PATCH',
    path: '/whatsapp/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  var body = ctx.body || {};
  var patch = { updated_at: nowIso() };
  if (body.phase !== undefined) {
    patch.phase = body.phase;
    if (body.phase === "resolvido") {
      if (!body.closeReasonId && !body.close_reason_id && !(conv.close_reason_id || conv.closeReasonId)) {
        return fail(ctx, 400, "closeReasonId obrigatório ao resolver");
      }
      patch.resolved_at = nowIso();
      patch.status = "closed";
    }
  }
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.departmentId !== undefined) patch.department_id = body.departmentId;
  if (body.closeReasonId !== undefined) patch.close_reason_id = body.closeReasonId;
  if (body.close_reason_id !== undefined) patch.close_reason_id = body.close_reason_id;
  await m.Conv.update(id, patch);
  var updated = await m.Conv.findById(id);
  var deps = await loadDeps(m);
  return ok(ctx, await serializeConv(updated, deps));
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/:id/messages',
    code: handler(`
  var m = model(ctx);
  if (!m.Msg) return fail(ctx, 500, "Model WhatsAppMessage missing");
  var id = ctx.params.id;
  var all = await m.Msg.findMany({});
  var rows = all.filter(function (x) {
    return (x.conversation_id || x.conversationId) === id;
  }).sort(function (a, b) {
    return String(a.timestamp || a.created_at || "").localeCompare(String(b.timestamp || b.created_at || ""));
  }).map(serializeMsg);
  return ok(ctx, rows);
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/assign',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  var current = conv.assigned_to_id || conv.assignedToId;
  var me = userId(ctx);
  if (!me) return fail(ctx, 401, "Não autenticado");
  if (current && current !== me) return fail(ctx, 409, "Conversa já atribuída");
  await m.Conv.update(id, {
    assigned_to_id: me,
    assigned_at: nowIso(),
    phase: conv.phase === "novo" ? "em_atendimento" : conv.phase,
    updated_at: nowIso(),
    menu_node: null,
  });
  if (m.Event) {
    await m.Event.create({
      id: uid("wae"),
      conversation_id: id,
      type: "assigned",
      from_value: current || null,
      to_value: me,
      actor_id: me,
      created_at: nowIso(),
    });
  }
  return ok(ctx, { ok: true });
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/reassign',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var body = ctx.body || {};
  var agentId = body.agentId || body.agent_id;
  if (!agentId) return fail(ctx, 400, "agentId obrigatório");
  var conv = await m.Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  var prev = conv.assigned_to_id || conv.assignedToId || null;
  await m.Conv.update(id, {
    assigned_to_id: agentId,
    assigned_at: nowIso(),
    phase: "em_atendimento",
    updated_at: nowIso(),
  });
  if (m.Event) {
    await m.Event.create({
      id: uid("wae"),
      conversation_id: id,
      type: "assigned",
      from_value: prev,
      to_value: agentId,
      actor_id: userId(ctx),
      created_at: nowIso(),
    });
  }
  return ok(ctx, { ok: true });
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/unassign',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  var prev = conv.assigned_to_id || conv.assignedToId || null;
  await m.Conv.update(id, {
    assigned_to_id: null,
    assigned_at: null,
    phase: "novo",
    updated_at: nowIso(),
  });
  if (m.Event) {
    await m.Event.create({
      id: uid("wae"),
      conversation_id: id,
      type: "unassigned",
      from_value: prev,
      to_value: null,
      actor_id: userId(ctx),
      created_at: nowIso(),
    });
  }
  return ok(ctx, { ok: true });
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/resolve',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var body = ctx.body || {};
  var closeReasonId = body.closeReasonId || body.close_reason_id;
  if (!closeReasonId) return fail(ctx, 400, "closeReasonId obrigatório");
  var conv = await m.Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  await m.Conv.update(id, {
    phase: "resolvido",
    status: "closed",
    resolved_at: nowIso(),
    close_reason_id: closeReasonId,
    updated_at: nowIso(),
  });
  if (m.Event) {
    await m.Event.create({
      id: uid("wae"),
      conversation_id: id,
      type: "resolved",
      from_value: conv.phase || null,
      to_value: "resolvido",
      actor_id: userId(ctx),
      created_at: nowIso(),
    });
  }
  return ok(ctx, { ok: true });
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/ticket',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv || !m.Ticket) return fail(ctx, 500, "Models missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  if (conv.ticket_id || conv.ticketId) {
    return fail(ctx, 409, "Conversa já possui chamado");
  }
  var body = ctx.body || {};
  var title = String(body.title || "").trim();
  var description = String(body.description || "").trim();
  if (!title || !description) return fail(ctx, 400, "title e description obrigatórios");
  var ts = nowIso();
  var me = userId(ctx);
  var ticket = await m.Ticket.create({
    id: uid("tck"),
    title: title,
    description: description,
    category: body.category || null,
    priority: body.priority || "medium",
    status: "novos_chamados",
    source: "whatsapp",
    ticket_number: "WA" + String(Date.now()).slice(-6),
    company_id: conv.company_id || conv.companyId || null,
    assigned_to: conv.assigned_to_id || conv.assignedToId || me,
    user_id: me,
    contact_email: null,
    company_name: null,
    created_at: ts,
    updated_at: ts,
    is_public: false,
    position: 0,
  });
  await m.Conv.update(id, {
    ticket_id: ticket.id,
    updated_at: ts,
  });
  return ok(ctx, { id: ticket.id, ticket_number: ticket.ticket_number }, 201);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/:id/notes',
    code: handler(`
  var m = model(ctx);
  if (!m.Note) return ok(ctx, []);
  var id = ctx.params.id;
  var rows = (await m.Note.findMany({})).filter(function (n) {
    return (n.conversation_id || n.conversationId) === id;
  }).sort(function (a, b) {
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
  var profiles = m.Profile ? await indexById(await m.Profile.findMany({})) : {};
  var data = rows.map(function (n) {
    var author = profiles[n.author_id || n.authorId] || {};
    return {
      id: n.id,
      body: n.body,
      created_at: n.created_at || n.createdAt,
      author: {
        id: author.id || n.author_id || n.authorId,
        name: author.full_name || author.fullName || author.name || author.email || "Agente",
      },
    };
  });
  return ok(ctx, data);
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/notes',
    code: handler(`
  var m = model(ctx);
  if (!m.Note) return fail(ctx, 500, "Model WaInternalNotes missing");
  var id = ctx.params.id;
  var me = userId(ctx);
  if (!me) return fail(ctx, 401, "Não autenticado");
  var body = String((ctx.body || {}).body || "").trim();
  if (!body) return fail(ctx, 400, "Nota vazia");
  var row = await m.Note.create({
    id: uid("wan"),
    conversation_id: id,
    author_id: me,
    body: body,
    created_at: nowIso(),
  });
  return ok(ctx, {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    author: { id: me, name: "Você" },
  }, 201);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/:id/tags',
    code: handler(`
  var m = model(ctx);
  if (!m.ConvTag || !m.Tag) return ok(ctx, []);
  var id = ctx.params.id;
  var tags = await indexById(await m.Tag.findMany({}));
  var data = (await m.ConvTag.findMany({})).filter(function (t) {
    return (t.conversation_id || t.conversationId) === id;
  }).map(function (link) {
    var tag = tags[link.tag_id || link.tagId];
    return tag ? { id: tag.id, name: tag.name, color: tag.color || null } : null;
  }).filter(Boolean);
  return ok(ctx, data);
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/tags',
    code: handler(`
  var m = model(ctx);
  if (!m.ConvTag) return fail(ctx, 500, "Model WaConversationTags missing");
  var id = ctx.params.id;
  var tagId = (ctx.body || {}).tagId || (ctx.body || {}).tag_id;
  if (!tagId) return fail(ctx, 400, "tagId obrigatório");
  var existing = (await m.ConvTag.findMany({})).find(function (t) {
    return (t.conversation_id || t.conversationId) === id && (t.tag_id || t.tagId) === tagId;
  });
  if (!existing) {
    await m.ConvTag.create({
      id: uid("wct"),
      conversation_id: id,
      tag_id: tagId,
      created_at: nowIso(),
    });
  }
  return ok(ctx, { ok: true });
`),
  },
  {
    method: 'DELETE',
    path: '/whatsapp/:id/tags',
    code: handler(`
  var m = model(ctx);
  if (!m.ConvTag) return fail(ctx, 500, "Model WaConversationTags missing");
  var id = ctx.params.id;
  var tagId = (ctx.query || {}).tagId || (ctx.query || {}).tag_id;
  if (!tagId) return fail(ctx, 400, "tagId obrigatório");
  var rows = await m.ConvTag.findMany({});
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i];
    if ((t.conversation_id || t.conversationId) === id && (t.tag_id || t.tagId) === tagId) {
      await m.ConvTag.delete(t.id);
    }
  }
  return ok(ctx, { ok: true });
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/groups',
    code: handler(`
  var m = model(ctx);
  if (!m.Group) return ok(ctx, []);
  return ok(ctx, await m.Group.findMany({}));
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/close-reasons',
    code: handler(`
  var m = model(ctx);
  if (!m.Close) return ok(ctx, []);
  var rows = (await m.Close.findMany({})).filter(function (r) {
    return r.active !== false;
  }).sort(function (a, b) {
    return Number(a.position || 0) - Number(b.position || 0);
  }).map(function (r) { return { id: r.id, name: r.name }; });
  return ok(ctx, rows);
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/close-reasons',
    code: handler(`
  var m = model(ctx);
  if (!m.Close) return fail(ctx, 500, "Model WaCloseReasons missing");
  var name = String((ctx.body || {}).name || "").trim();
  if (!name) return fail(ctx, 400, "name obrigatório");
  var all = await m.Close.findMany({});
  var row = await m.Close.create({
    id: uid("wcr"),
    name: name,
    active: true,
    position: all.length,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return ok(ctx, { id: row.id, name: row.name }, 201);
`),
  },
  {
    method: 'PATCH',
    path: '/whatsapp/close-reasons/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Close) return fail(ctx, 500, "Model WaCloseReasons missing");
  var id = ctx.params.id;
  var row = await m.Close.findById(id);
  if (!row) return fail(ctx, 404, "Motivo não encontrado");
  var body = ctx.body || {};
  var patch = { updated_at: nowIso() };
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.active !== undefined) patch.active = !!body.active;
  if (body.position !== undefined) patch.position = Number(body.position);
  await m.Close.update(id, patch);
  return ok(ctx, await m.Close.findById(id));
`),
  },
  {
    method: 'DELETE',
    path: '/whatsapp/close-reasons/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Close) return fail(ctx, 500, "Model WaCloseReasons missing");
  var id = ctx.params.id;
  await m.Close.delete(id);
  return ok(ctx, { deleted: true });
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/agents',
    code: handler(`
  var m = model(ctx);
  var profiles = m.Profile ? await m.Profile.findMany({}) : [];
  var agents = m.Agent ? await indexById(await m.Agent.findMany({})) : {};
  var staff = profiles.filter(function (p) {
    var role = String(p.role || p.role_title || "");
    return ["developer", "admin", "master"].indexOf(role) >= 0;
  }).map(function (p) {
    var ap = null;
    var keys = Object.keys(agents);
    for (var i = 0; i < keys.length; i++) {
      var a = agents[keys[i]];
      if ((a.profile_id || a.profileId) === p.id) { ap = a; break; }
    }
    return {
      id: p.id,
      name: p.full_name || p.fullName || p.name || p.email || "Agente",
      online: ap ? !!ap.online : false,
    };
  });
  return ok(ctx, staff);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/tags',
    code: handler(`
  var m = model(ctx);
  if (!m.Tag) return ok(ctx, []);
  var rows = (await m.Tag.findMany({})).filter(function (t) { return t.active !== false; });
  return ok(ctx, rows.map(function (t) {
    return { id: t.id, name: t.name, color: t.color || "#6366f1", active: t.active !== false };
  }));
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/tags',
    code: handler(`
  var m = model(ctx);
  if (!m.Tag) return fail(ctx, 500, "Model WaTags missing");
  var body = ctx.body || {};
  var name = String(body.name || "").trim();
  if (!name) return fail(ctx, 400, "name obrigatório");
  var row = await m.Tag.create({
    id: uid("wat"),
    name: name,
    color: body.color || "#6366f1",
    active: true,
    created_at: nowIso(),
  });
  return ok(ctx, { id: row.id, name: row.name, color: row.color, active: true }, 201);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/departments',
    code: handler(`
  var m = model(ctx);
  if (!m.Dept) return ok(ctx, []);
  var rows = (await m.Dept.findMany({})).filter(function (d) { return d.active !== false; });
  return ok(ctx, rows.map(function (d) {
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      color: d.color || null,
      menuKey: d.menu_key || d.menuKey || null,
    };
  }));
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/departments',
    code: handler(`
  var m = model(ctx);
  if (!m.Dept) return fail(ctx, 500, "Model WaDepartments missing");
  var body = ctx.body || {};
  var name = String(body.name || "").trim();
  var slug = String(body.slug || "").trim();
  if (!name || !slug) return fail(ctx, 400, "name e slug obrigatórios");
  var row = await m.Dept.create({
    id: uid("wad"),
    name: name,
    slug: slug,
    menu_key: body.menuKey || body.menu_key || null,
    color: body.color || null,
    active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return ok(ctx, row, 201);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/presence',
    code: handler(`
  var m = model(ctx);
  var me = userId(ctx);
  if (!me || !m.Agent) return ok(ctx, { online: false });
  var all = await m.Agent.findMany({});
  var mine = all.find(function (a) { return (a.profile_id || a.profileId) === me; });
  return ok(ctx, { online: !!(mine && mine.online) });
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/presence',
    code: handler(`
  var m = model(ctx);
  var me = userId(ctx);
  if (!me) return fail(ctx, 401, "Não autenticado");
  if (!m.Agent) return ok(ctx, { online: !!(ctx.body || {}).online });
  var online = !!(ctx.body || {}).online;
  var all = await m.Agent.findMany({});
  var mine = all.find(function (a) { return (a.profile_id || a.profileId) === me; });
  if (mine) {
    await m.Agent.update(mine.id, { online: online, last_seen_at: nowIso(), updated_at: nowIso() });
  } else {
    await m.Agent.create({
      id: uid("wap"),
      profile_id: me,
      online: online,
      max_concurrent: 5,
      signature: null,
      last_seen_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }
  return ok(ctx, { online: online });
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/quick-replies',
    code: handler(`
  var m = model(ctx);
  if (!m.Quick) return ok(ctx, []);
  var rows = (await m.Quick.findMany({})).filter(function (r) { return r.active !== false; });
  return ok(ctx, rows);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/automations',
    code: handler(`
  var m = model(ctx);
  if (!m.Auto) return ok(ctx, []);
  return ok(ctx, await m.Auto.findMany({}));
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/automations',
    code: handler(`
  var m = model(ctx);
  if (!m.Auto) return fail(ctx, 500, "Model WaAutomationRules missing");
  var body = ctx.body || {};
  var row = await m.Auto.create({
    id: uid("waa"),
    name: String(body.name || "Regra").trim(),
    trigger: body.trigger || "entered_queue",
    action: body.action || "notify_agents",
    conditions: body.conditions || null,
    action_params: body.actionParams || body.action_params || null,
    active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return ok(ctx, row, 201);
`),
  },
  {
    method: 'PATCH',
    path: '/whatsapp/automations/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Auto) return fail(ctx, 500, "Model WaAutomationRules missing");
  var id = ctx.params.id;
  var row = await m.Auto.findById(id);
  if (!row) return fail(ctx, 404, "Regra não encontrada");
  var body = ctx.body || {};
  var patch = { updated_at: nowIso() };
  if (body.active !== undefined) patch.active = !!body.active;
  if (body.name !== undefined) patch.name = String(body.name).trim();
  await m.Auto.update(id, patch);
  return ok(ctx, await m.Auto.findById(id));
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/metrics',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return ok(ctx, { open: 0, queue: 0, slaAtRisk: 0, byPhase: {} });
  var rows = await m.Conv.findMany({});
  var open = 0, queue = 0, slaAtRisk = 0;
  var byPhase = {};
  var now = Date.now();
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    var status = c.status || "open";
    var phase = c.phase || "novo";
    if (status === "closed" || phase === "resolvido") continue;
    open++;
    byPhase[phase] = (byPhase[phase] || 0) + 1;
    var assigned = c.assigned_to_id || c.assignedToId;
    if (!assigned && phase !== "resolvido") queue++;
    var first = c.first_response_at || c.firstResponseAt;
    var due = c.sla_due_at || c.slaDueAt;
    if (!first && due && new Date(due).getTime() < now) slaAtRisk++;
  }
  return ok(ctx, { open: open, queue: queue, slaAtRisk: slaAtRisk, byPhase: byPhase });
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/analytics',
    code: handler(`
  var m = model(ctx);
  if (!m.Conv) return ok(ctx, {
    series: [], totals: { novos_contatos: 0, conversas_unicas: 0, conversas_abertas: 0, conversas_encerradas: 0 },
    closeReasons: [], agents: [],
  });
  var rows = await m.Conv.findMany({});
  var q = ctx.query || {};
  var from = q.from ? new Date(String(q.from)).getTime() : 0;
  var to = q.to ? new Date(String(q.to)).getTime() : Date.now();
  var abertas = 0, encerradas = 0, novos = 0;
  var reasonCount = {};
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    var created = new Date(c.created_at || c.createdAt || 0).getTime();
    if (created >= from && created <= to) novos++;
    var phase = c.phase || "novo";
    var status = c.status || "open";
    if (status !== "closed" && phase !== "resolvido") abertas++;
    else {
      var resolved = new Date(c.resolved_at || c.resolvedAt || c.updated_at || 0).getTime();
      if (resolved >= from && resolved <= to) {
        encerradas++;
        var rid = c.close_reason_id || c.closeReasonId || "_none";
        reasonCount[rid] = (reasonCount[rid] || 0) + 1;
      }
    }
  }
  var closes = m.Close ? await indexById(await m.Close.findMany({})) : {};
  var closeReasons = Object.keys(reasonCount).map(function (id) {
    var name = id === "_none" ? "Sem motivo informado" : ((closes[id] && closes[id].name) || id);
    return { id: id, name: name, count: reasonCount[id] };
  });
  return ok(ctx, {
    series: [],
    totals: {
      novos_contatos: novos,
      conversas_unicas: novos,
      conversas_abertas: abertas,
      conversas_encerradas: encerradas,
    },
    closeReasons: closeReasons,
    agents: [],
  });
`),
  },
  // Streams: sandbox can't keep SSE open — return a clear JSON payload.
  {
    method: 'GET',
    path: '/whatsapp/stream',
    code: handler(`
  return ctx.reply.status(200).send({
    success: true,
    data: [],
    stream: false,
    hint: "SSE não suportado no runtime Arara; use polling REST.",
  });
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/:id/stream',
    code: handler(`
  return ctx.reply.status(200).send({
    success: true,
    data: [],
    stream: false,
    hint: "SSE não suportado no runtime Arara; use polling REST.",
  });
`),
  },
  // ── Flows ────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/whatsapp/flows',
    code: handler(`
  var m = model(ctx);
  if (!m.Flow) return fail(ctx, 500, "Model WaFlows missing");
  var rows = await m.Flow.findMany({});
  if (rows.length === 0) {
    var seed = await m.Flow.create({
      id: uid("waf"),
      name: "Atendimento padrão",
      enabled: true,
      priority: 0,
      entry: null,
      draft: ${JSON.stringify(STARTER_GRAPH)},
      published: ${JSON.stringify(STARTER_GRAPH)},
      version: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    rows = [seed];
  }
  var data = rows.map(function (f) {
    var published = !!f.published;
    var draftStr = JSON.stringify(f.draft || null);
    var pubStr = JSON.stringify(f.published || null);
    return {
      id: f.id,
      name: f.name,
      enabled: f.enabled !== false,
      priority: Number(f.priority || 0),
      version: Number(f.version || 0),
      updatedAt: f.updated_at || f.updatedAt || nowIso(),
      published: published,
      hasUnpublished: published ? draftStr !== pubStr : true,
    };
  }).sort(function (a, b) { return a.priority - b.priority; });
  return ok(ctx, data);
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/flows',
    code: handler(`
  var m = model(ctx);
  if (!m.Flow) return fail(ctx, 500, "Model WaFlows missing");
  var name = String((ctx.body || {}).name || "").trim();
  if (!name) return fail(ctx, 400, "name obrigatório");
  var row = await m.Flow.create({
    id: uid("waf"),
    name: name,
    enabled: false,
    priority: 0,
    entry: null,
    draft: ${JSON.stringify(STARTER_GRAPH)},
    published: null,
    version: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return ok(ctx, { id: row.id }, 201);
`),
  },
  {
    method: 'GET',
    path: '/whatsapp/flows/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Flow) return fail(ctx, 500, "Model WaFlows missing");
  var f = await m.Flow.findById(ctx.params.id);
  if (!f) return fail(ctx, 404, "Fluxo não encontrado");
  var draftStr = JSON.stringify(f.draft || null);
  var pubStr = JSON.stringify(f.published || null);
  return ok(ctx, {
    id: f.id,
    name: f.name,
    version: Number(f.version || 0),
    graph: f.draft || ${JSON.stringify(STARTER_GRAPH)},
    hasUnpublished: f.published ? draftStr !== pubStr : true,
  });
`),
  },
  {
    method: 'PATCH',
    path: '/whatsapp/flows/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Flow) return fail(ctx, 500, "Model WaFlows missing");
  var id = ctx.params.id;
  var f = await m.Flow.findById(id);
  if (!f) return fail(ctx, 404, "Fluxo não encontrado");
  var graph = (ctx.body || {}).graph;
  if (!graph) return fail(ctx, 400, "graph obrigatório");
  await m.Flow.update(id, { draft: graph, updated_at: nowIso() });
  return ok(ctx, { saved: true });
`),
  },
  {
    method: 'PATCH',
    path: '/whatsapp/flows/:id/settings',
    code: handler(`
  var m = model(ctx);
  if (!m.Flow) return fail(ctx, 500, "Model WaFlows missing");
  var id = ctx.params.id;
  var f = await m.Flow.findById(id);
  if (!f) return fail(ctx, 404, "Fluxo não encontrado");
  var body = ctx.body || {};
  var patch = { updated_at: nowIso() };
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.enabled !== undefined) patch.enabled = !!body.enabled;
  if (body.priority !== undefined) patch.priority = Number(body.priority);
  await m.Flow.update(id, patch);
  return ok(ctx, { updated: true });
`),
  },
  {
    method: 'POST',
    path: '/whatsapp/flows/:id/publish',
    code: handler(`
  var m = model(ctx);
  if (!m.Flow) return fail(ctx, 500, "Model WaFlows missing");
  var id = ctx.params.id;
  var f = await m.Flow.findById(id);
  if (!f) return fail(ctx, 404, "Fluxo não encontrado");
  var version = Number(f.version || 0) + 1;
  await m.Flow.update(id, {
    published: f.draft,
    version: version,
    updated_at: nowIso(),
  });
  return ok(ctx, { published: true, version: version });
`),
  },
  {
    method: 'DELETE',
    path: '/whatsapp/flows/:id',
    code: handler(`
  var m = model(ctx);
  if (!m.Flow) return fail(ctx, 500, "Model WaFlows missing");
  await m.Flow.delete(ctx.params.id);
  return ok(ctx, { deleted: true });
`),
  },
]

const MODEL_SCHEMAS: Array<{ name: string; schema: Record<string, unknown> }> = [
  {
    name: `${APP_SLUG}-WaCloseReasons`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        active: { type: 'boolean' },
        position: { type: 'number' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' },
      },
    },
  },
  {
    name: `${APP_SLUG}-WaFlows`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        priority: { type: 'number' },
        entry: { type: 'object' },
        draft: { type: 'object' },
        published: { type: 'object' },
        version: { type: 'number' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' },
      },
    },
  },
]

async function ensureModels(appId: string) {
  for (const def of MODEL_SCHEMAS) {
    await prisma.modelDef.upsert({
      where: { appId_name: { appId, name: def.name } },
      create: {
        appId,
        name: def.name,
        schema: def.schema as Prisma.InputJsonValue,
      },
      update: { schema: def.schema as Prisma.InputJsonValue },
    })
    console.log('MODEL', def.name)
  }
}

async function ensureModule(appId: string) {
  let mod = await prisma.module.findFirst({ where: { appId, name: MODULE_NAME } })
  if (!mod) {
    mod = await prisma.module.create({
      data: {
        appId,
        name: MODULE_NAME,
        status: 'published',
        description: 'WhatsApp inbox, métricas e fluxos (Arara runtime)',
      },
    })
    console.log('CREATED module', MODULE_NAME)
  } else if (mod.status !== 'published') {
    mod = await prisma.module.update({
      where: { id: mod.id },
      data: { status: 'published' },
    })
  }
  return mod
}

async function seedCloseReasons(appId: string) {
  const modelName = `${APP_SLUG}-WaCloseReasons`
  const existing = await prisma.modelRecord.count({ where: { appId, modelName } })
  if (existing > 0) return
  const seeds = ['Resolvido', 'Sem resposta do cliente', 'Spam', 'Transferido']
  const now = new Date()
  for (let i = 0; i < seeds.length; i++) {
    const id = `wcr_seed_${i + 1}`
    await prisma.modelRecord.create({
      data: {
        id,
        appId,
        modelName,
        data: {
          id,
          name: seeds[i],
          active: true,
          position: i,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      },
    })
  }
  console.log('SEEDED', seeds.length, 'close reasons')
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  await ensureModels(app.id)
  const mod = await ensureModule(app.id)
  await seedCloseReasons(app.id)

  let updated = 0
  for (const spec of CONTROLLERS) {
    const route = await prisma.moduleRoute.findFirst({
      where: {
        method: spec.method,
        path: spec.path,
        module: { appId: app.id },
      },
    })
    if (!route) {
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
    } else {
      await prisma.moduleRoute.update({
        where: { id: route.id },
        data: { controllerCode: spec.code, moduleId: mod.id },
      })
      console.log('UPDATED', spec.method, spec.path)
    }
    updated++
  }
  console.log({ updated, routes: CONTROLLERS.length })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
