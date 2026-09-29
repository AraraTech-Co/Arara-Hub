/**
 * Enrich portal-suporte runtime controllers beyond generic CRUD stubs.
 * Run: npx tsx scripts/portal-suporte/enrich-controllers.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

type Spec = { method: string; path: string; code: string }

const CONTROLLERS: Spec[] = [
  // POST /tickets: see enrich-phase1-bugs.ts (sequential TCK + created_at/occurred_at).
  {
    method: 'POST',
    path: '/tickets/check-duplicates',
    code: `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const body = ctx.body || {};
  const title = String(body.title || "").trim().toLowerCase();
  if (title.length < 4) return ctx.reply.send({ duplicates: [] });
  const company = String(body.company_name || body.companyName || "").trim().toLowerCase();
  const cnpj = String(body.company_cnpj || body.companyCnpj || "").replace(/\\D/g, "");
  const all = await model.findMany({ limit: 500 });
  const tokens = title.split(/\\s+/).filter(function (t) { return t.length >= 3; }).slice(0, 6);
  const duplicates = [];
  for (var i = 0; i < all.length; i++) {
    var t = all[i];
    var tt = String(t.title || "").toLowerCase();
    if (!tt) continue;
    var score = 0;
    if (tt === title) score = 1;
    else if (tt.indexOf(title) >= 0 || title.indexOf(tt) >= 0) score = 0.85;
    else {
      var hits = 0;
      for (var k = 0; k < tokens.length; k++) if (tt.indexOf(tokens[k]) >= 0) hits++;
      score = tokens.length ? hits / tokens.length : 0;
    }
    if (score < 0.55) continue;
    if (company) {
      var cn = String(t.company_name || t.companyName || "").toLowerCase();
      if (cn && cn.indexOf(company) < 0 && company.indexOf(cn) < 0) score *= 0.7;
    }
    if (cnpj) {
      var tc = String(t.company_cnpj || t.companyCnpj || "").replace(/\\D/g, "");
      if (tc && tc !== cnpj) score *= 0.75;
    }
    if (score < 0.55) continue;
    duplicates.push({
      id: t.id,
      title: t.title,
      status: t.status || "novos_chamados",
      similarity_score: Math.round(score * 100) / 100,
    });
  }
  duplicates.sort(function (a, b) { return b.similarity_score - a.similarity_score; });
  return ctx.reply.send({ duplicates: duplicates.slice(0, 8) });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/tickets/track',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const Message = ctx.models.TicketMessage;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const q = ctx.query || {};
  const token = String(q.token || q.id || "").trim();
  if (!token) return ctx.reply.status(400).send({ error: "Missing token" });
  const all = await Ticket.findMany({});
  const ticket = all.find(function (t) {
    return t.id === token
      || String(t.ticket_number || "") === token
      || String(t.tracking_token || "") === token
      || String(t.id).indexOf(token) === 0;
  });
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket não encontrado" });
  let messages = [];
  if (Message) {
    messages = await Message.findMany({ ticket_id: ticket.id });
    messages = messages.map(function (m) {
      return {
        id: m.id,
        message: m.message,
        created_at: m.created_at || m.createdAt,
        sender_name: m.guest_name || m.user_id || "Usuário",
        is_support: !m.guest_name && !m.is_ai_message,
        is_guest: !!m.guest_name,
        is_internal: !!m.is_internal,
      };
    }).filter(function (m) { return !m.is_internal; });
  }
  return ctx.reply.send(Object.assign({}, ticket, { messages: messages, timeline: [] }));
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/tickets/public',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  const Message = ctx.models.TicketMessage;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const q = ctx.query || {};
  const id = String(q.id || "").trim();
  const email = String(q.email || "").trim().toLowerCase();
  if (!id) return ctx.reply.status(400).send({ error: "Missing id" });
  const all = await Ticket.findMany({});
  const ticket = all.find(function (t) {
    return t.id === id
      || String(t.ticket_number || "") === id
      || String(t.ticket_number || "").toUpperCase() === id.toUpperCase()
      || String(t.id).indexOf(id) === 0;
  });
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket não encontrado" });
  if (email) {
    const contact = String(ticket.contact_email || "").toLowerCase();
    if (contact && contact !== email) {
      return ctx.reply.status(403).send({ error: "E-mail não corresponde ao ticket" });
    }
  }
  let messages = [];
  if (Message) {
    messages = (await Message.findMany({ ticket_id: ticket.id }))
      .filter(function (m) { return !m.is_internal; })
      .map(function (m) {
        return {
          id: m.id,
          message: m.message,
          created_at: m.created_at || m.createdAt,
          sender_name: m.guest_name || "Suporte",
          is_support: !m.guest_name,
          is_guest: !!m.guest_name,
        };
      });
  }
  return ctx.reply.send(Object.assign({}, ticket, { messages: messages }));
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/public/reply',
    code: `async function handler(ctx) {
  const Message = ctx.models.TicketMessage;
  const Ticket = ctx.models.Ticket;
  if (!Message || !Ticket) return ctx.reply.status(500).send({ error: "Models missing" });
  const body = ctx.body || {};
  const ticketId = body.ticket_id || body.ticketId;
  if (!ticketId || !body.message) {
    return ctx.reply.status(400).send({ error: "ticket_id and message required" });
  }
  const ticket = await Ticket.findById(String(ticketId));
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const now = new Date().toISOString();
  const row = await Message.create({
    ticket_id: ticket.id,
    message: String(body.message),
    guest_name: body.name || body.guest_name || "Cliente",
    guest_email: body.email || body.guest_email || ticket.contact_email || null,
    is_internal: false,
    is_ai_message: false,
    created_at: now,
  });
  return ctx.reply.status(201).send(row);
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/rate/:token',
    code: `async function handler(ctx) {
  const Rating = ctx.models.TicketRating;
  const Ticket = ctx.models.Ticket;
  if (!Rating) return ctx.reply.status(500).send({ error: "Model TicketRating missing" });
  const token = ctx.params.token;
  const ratings = await Rating.findMany({});
  const rating = ratings.find(function (r) { return r.token === token || r.id === token; });
  if (!rating) return ctx.reply.status(404).send({ error: "Link de avaliação inválido" });
  let ticket = null;
  if (Ticket && rating.ticket_id) ticket = await Ticket.findById(String(rating.ticket_id));
  return ctx.reply.send({
    ticket_number: ticket && ticket.ticket_number || null,
    title: ticket && ticket.title || "Ticket",
    company_name: ticket && ticket.company_name || null,
    already_rated: rating.score != null || !!rating.submitted_at,
    score: rating.score,
    comment: rating.comment,
  });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/rate/:token',
    code: `async function handler(ctx) {
  const Rating = ctx.models.TicketRating;
  if (!Rating) return ctx.reply.status(500).send({ error: "Model TicketRating missing" });
  const token = ctx.params.token;
  const body = ctx.body || {};
  const ratings = await Rating.findMany({});
  const rating = ratings.find(function (r) { return r.token === token || r.id === token; });
  if (!rating) return ctx.reply.status(404).send({ error: "Link de avaliação inválido" });
  if (rating.score != null || rating.submitted_at) {
    return ctx.reply.status(400).send({ error: "Já avaliado" });
  }
  const score = Number(body.score);
  if (!(score >= 1 && score <= 5)) {
    return ctx.reply.status(400).send({ error: "score must be 1-5" });
  }
  const updated = await Rating.update(rating.id, {
    score: score,
    comment: body.comment || null,
    submitted_at: new Date().toISOString(),
  });
  return ctx.reply.send(updated);
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/move',
    code: `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const before = await model.findById(id);
  if (!before) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const patch = { updated_at: new Date().toISOString() };
  if (body.status != null) patch.status = body.status;
  if (body.position != null) patch.position = body.position;
  if (body.column != null && body.status == null) patch.status = body.column;
  try {
    const row = await model.update(id, patch);
    const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
    const fromStatus = before.status;
    const toStatus = row.status;
    if (fromStatus !== toStatus && typeof ctx.notify === "function") {
      var recipients = {};
      if (row.assigned_to || row.assignedTo) recipients[String(row.assigned_to || row.assignedTo)] = 1;
      if (row.user_id || row.userId) recipients[String(row.user_id || row.userId)] = 1;
      if (actor) delete recipients[String(actor)];
      var num = row.ticket_number || row.ticketNumber || id;
      var href = "https://suporte.arara-tech.com/admin/tickets/view?id=" + encodeURIComponent(id);
      var ids = Object.keys(recipients).filter(Boolean);
      for (var i = 0; i < ids.length; i++) {
        try {
          await ctx.notify({
            userId: ids[i],
            title: "Ticket movido",
            body: "O ticket " + num + " mudou de " + fromStatus + " para " + toStatus + ".",
            severity: "info",
            href: href,
            sourceApp: "portal-suporte",
          });
        } catch (e) {}
      }
    }
    return ctx.reply.send(row);
  } catch (e) {
    return ctx.reply.status(404).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/tickets/:id/assign',
    code: `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const assignee = body.assignee_id !== undefined ? body.assignee_id
    : (body.assigned_to !== undefined ? body.assigned_to : body.userId);
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  try {
    const ticket = await model.findById(id);
    if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
    const fromUserId = ticket.assigned_to || ticket.assignedTo || null;
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
    const row = await model.update(id, {
      assigned_to: assignee,
      updated_at: new Date().toISOString(),
    });
    if (assignee && String(assignee) !== String(actor || "") && typeof ctx.notify === "function") {
      var num = row.ticket_number || row.ticketNumber || id;
      try {
        await ctx.notify({
          userId: String(assignee),
          title: "Card atribuído a você",
          body: "O chamado " + num + " \\"" + (row.title || "") + "\\" foi atribuído para você.",
          severity: "info",
          href: "https://suporte.arara-tech.com/admin/tickets/view?id=" + encodeURIComponent(id),
          sourceApp: "portal-suporte",
        });
      } catch (e) {}
    }
    return ctx.reply.send(row);
  } catch (e) {
    return ctx.reply.status(404).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/:id/assign',
    code: `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  const body = ctx.body || {};
  const assignee = body.assignee_id !== undefined ? body.assignee_id
    : (body.assigned_to !== undefined ? body.assigned_to : body.userId);
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  try {
    const ticket = await model.findById(id);
    if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
    const fromUserId = ticket.assigned_to || ticket.assignedTo || null;
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
    const row = await model.update(id, {
      assigned_to: assignee,
      updated_at: new Date().toISOString(),
    });
    if (assignee && String(assignee) !== String(actor || "") && typeof ctx.notify === "function") {
      var num = row.ticket_number || row.ticketNumber || id;
      try {
        await ctx.notify({
          userId: String(assignee),
          title: "Card atribuído a você",
          body: "O chamado " + num + " \\"" + (row.title || "") + "\\" foi atribuído para você.",
          severity: "info",
          href: "https://suporte.arara-tech.com/admin/tickets/view?id=" + encodeURIComponent(id),
          sourceApp: "portal-suporte",
        });
      } catch (e) {}
    }
    return ctx.reply.send(row);
  } catch (e) {
    return ctx.reply.status(404).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  // PATCH/POST /tickets/:id/status: see enrich-phase1-bugs.ts (resolved_at + notifications).
  {
    method: 'GET',
    path: '/tickets/kanban',
    code: `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const rows = await model.findMany({});
  const columns = {};
  for (const t of rows) {
    const status = String(t.status || "novos_chamados");
    if (!columns[status]) columns[status] = [];
    columns[status].push(t);
  }
  // UI expects data as map status -> tickets[]; also expose flat list
  return ctx.reply.send({ data: columns, tickets: rows, columns: columns, count: rows.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/tickets/reorder',
    code: `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const body = ctx.body || {};
  const ids = body.ticketIds || body.ids || [];
  const status = body.status;
  let i = 0;
  for (const id of ids) {
    const patch = { position: i++, updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    try { await model.update(String(id), patch); } catch (e) { /* skip missing */ }
  }
  return ctx.reply.send({ ok: true, updated: ids.length });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/emails',
    code: `async function handler(ctx) {
  const model = ctx.models.Email;
  if (!model) return ctx.reply.send({ data: [], count: 0 });
  const rows = await model.findMany(ctx.query || {});
  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/units',
    code: `async function handler(ctx) {
  const Unit = ctx.models.Unit;
  const Company = ctx.models.Company;
  if (!Unit) return ctx.reply.status(500).send({ success: false, error: "Model Unit missing" });
  const q = ctx.query || {};
  const units = await Unit.findMany({});
  const companies = Company ? await Company.findMany({}) : [];
  const byId = {};
  for (const c of companies) byId[c.id] = c;
  const companyIdFilter = q.companyId || q.company_id || "";
  const search = String(q.search || "").toLowerCase();
  const data = [];
  for (const u of units) {
    if (u.active === false) continue;
    const companyId = u.company_id || u.companyId || "";
    if (companyIdFilter && companyId !== companyIdFilter) continue;
    const company = byId[companyId] || { id: companyId, name: "—" };
    const row = Object.assign({}, u, {
      companyId: companyId,
      company: { id: company.id, name: company.name || "—" },
      pdvCount: u.pdv_count != null ? u.pdv_count : u.pdvCount,
    });
    if (search) {
      const hay = ((row.name || "") + " " + (row.company.name || "")).toLowerCase();
      if (hay.indexOf(search) < 0) continue;
    }
    data.push(row);
  }
  data.sort(function (a, b) {
    const an = (a.company && a.company.name) || "";
    const bn = (b.company && b.company.name) || "";
    if (an !== bn) return an.localeCompare(bn);
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  return ctx.reply.send({ success: true, data: data, count: data.length });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/unit-contacts',
    code: `async function handler(ctx) {
  const UnitWhatsapp = ctx.models.UnitWhatsapp;
  const Unit = ctx.models.Unit;
  const Company = ctx.models.Company;
  const q = ctx.query || {};
  const units = Unit ? await Unit.findMany({}) : [];
  const companies = Company ? await Company.findMany({}) : [];
  const byCompany = {};
  for (const c of companies) byCompany[c.id] = c;
  const byUnit = {};
  for (const u of units) {
    const companyId = u.company_id || u.companyId || "";
    byUnit[u.id] = {
      id: u.id,
      name: u.name,
      city: u.city || null,
      state: u.state || null,
      company: { id: companyId, name: (byCompany[companyId] && byCompany[companyId].name) || "—" },
    };
  }
  const data = [];
  const whatsapps = UnitWhatsapp ? await UnitWhatsapp.findMany({}) : [];
  for (const w of whatsapps) {
    const unitId = w.unit_id || w.unitId;
    const unit = byUnit[unitId];
    if (!unit) continue;
    if (q.unitId && unitId !== q.unitId) continue;
    if (q.companyId && unit.company.id !== q.companyId) continue;
    data.push({
      id: w.id,
      unitId: unitId,
      nome: w.nome || w.name || "Contato",
      cargo: w.cargo || null,
      whatsapp: w.whatsapp || w.phone || "",
      unit: unit,
    });
  }
  // Fallback: units with a whatsapp field
  for (const u of units) {
    const wa = u.whatsapp || u.phone;
    if (!wa) continue;
    const unit = byUnit[u.id];
    if (!unit) continue;
    if (q.unitId && u.id !== q.unitId) continue;
    if (q.companyId && unit.company.id !== q.companyId) continue;
    const already = data.some(function (d) { return d.unitId === u.id && d.whatsapp === wa; });
    if (already) continue;
    data.push({
      id: "unit-wa-" + u.id,
      unitId: u.id,
      nome: (u.name || "Unidade") + " (unidade)",
      cargo: null,
      whatsapp: String(wa),
      unit: unit,
    });
  }
  return ctx.reply.send({ success: true, data: data, count: data.length });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/analytics/heatmap',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const days = Math.max(1, parseInt(String((ctx.query || {}).days || "90"), 10) || 90);
  const since = Date.now() - days * 86400000;
  const tickets = await Ticket.findMany({});
  const byCategoryMap = {};
  const byTypeMap = {};
  const byStatusMap = {};
  const resolutionMap = {};
  function weekKey(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  }
  for (const t of tickets) {
    const created = t.created_at || t.createdAt;
    const ts = created ? new Date(created).getTime() : 0;
    if (ts && ts < since) continue;
    const category = t.category || t.ai_category || "Sem categoria";
    const type = t.ticket_type || t.type || "outros";
    const status = t.status || "unknown";
    const wk = weekKey(created || new Date().toISOString());
    if (wk) {
      const ck = category + "|" + wk;
      if (!byCategoryMap[ck]) byCategoryMap[ck] = { category: category, week: wk, count: 0 };
      byCategoryMap[ck].count++;
    }
    byTypeMap[type] = (byTypeMap[type] || 0) + 1;
    byStatusMap[status] = (byStatusMap[status] || 0) + 1;
    const resolved = t.resolved_at || t.resolvedAt || t.closed_at || t.closedAt;
    if (resolved && created) {
      const hours = (new Date(resolved).getTime() - new Date(created).getTime()) / 3600000;
      if (hours >= 0 && hours < 24 * 90) {
        if (!resolutionMap[category]) resolutionMap[category] = { sum: 0, n: 0 };
        resolutionMap[category].sum += hours;
        resolutionMap[category].n++;
      }
    }
  }
  const typeTotal = Object.keys(byTypeMap).reduce(function (s, k) { return s + byTypeMap[k]; }, 0) || 1;
  const byType = Object.keys(byTypeMap).map(function (type) {
    return { type: type, count: byTypeMap[type], pct: Math.round((byTypeMap[type] / typeTotal) * 1000) / 10 };
  }).sort(function (a, b) { return b.count - a.count; });
  const byStatus = Object.keys(byStatusMap).map(function (status) {
    return { status: status, count: byStatusMap[status] };
  }).sort(function (a, b) { return b.count - a.count; });
  const byCategory = Object.keys(byCategoryMap).map(function (k) { return byCategoryMap[k]; });
  const resolutionByCategory = Object.keys(resolutionMap).map(function (category) {
    const r = resolutionMap[category];
    return { category: category, avg_hours: Math.round((r.sum / r.n) * 10) / 10, ticket_count: r.n };
  }).sort(function (a, b) { return b.avg_hours - a.avg_hours; });
  return ctx.reply.send({
    data: {
      byCategory: byCategory,
      byType: byType,
      byStatus: byStatus,
      resolutionByCategory: resolutionByCategory,
      period_days: days,
      generated_at: new Date().toISOString(),
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/analytics/column-times',
    code: `async function handler(ctx) {
  const Hist = ctx.models.TicketColumnHistory;
  if (!Hist) return ctx.reply.send({ data: [] });
  const since = Date.now() - 30 * 86400000;
  const rows = await Hist.findMany({});
  const byStatus = {};
  for (const h of rows) {
    const entered = h.entered_at || h.enteredAt;
    if (entered && new Date(entered).getTime() < since) continue;
    const dur = h.duration_ms != null ? Number(h.duration_ms) : null;
    if (dur == null || isNaN(dur)) continue;
    const status = h.status || "unknown";
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(dur);
  }
  function percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort(function (a, b) { return a - b; });
    const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
    return sorted[idx];
  }
  const data = Object.keys(byStatus).map(function (status) {
    const arr = byStatus[status];
    const avg = arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
    return {
      status: status,
      avg_duration_hours: Math.round((avg / 3600000) * 10) / 10,
      p50_hours: Math.round((percentile(arr, 0.5) / 3600000) * 10) / 10,
      p90_hours: Math.round((percentile(arr, 0.9) / 3600000) * 10) / 10,
      count: arr.length,
    };
  }).sort(function (a, b) { return b.avg_duration_hours - a.avg_duration_hours; });
  return ctx.reply.send({ data: data });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/root-cause',
    code: `async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const q = ctx.query || {};
  const days = Math.max(1, parseInt(String(q.days || "90"), 10) || 90);
  const since = Date.now() - days * 86400000;
  const categoryFilter = q.category ? String(q.category) : "";
  const tickets = await Ticket.findMany({});
  const counts = {};
  const drill = [];
  for (const t of tickets) {
    const created = t.created_at || t.createdAt;
    const ts = created ? new Date(created).getTime() : 0;
    if (ts && ts < since) continue;
    const category = t.root_cause_category || t.category || t.ai_category || "Sem causa";
    counts[category] = (counts[category] || 0) + 1;
    if (!categoryFilter || category === categoryFilter) {
      drill.push({
        id: t.id,
        ticketNumber: t.ticket_number || t.ticketNumber || null,
        title: t.title || "",
        companyName: t.company_name || t.companyName || null,
        resolvedAt: t.resolved_at || t.resolvedAt || null,
      });
    }
  }
  const total = Object.keys(counts).reduce(function (s, k) { return s + counts[k]; }, 0) || 1;
  const top10 = Object.keys(counts).map(function (category) {
    return {
      category: category,
      label: category,
      count: counts[category],
      pct: Math.round((counts[category] / total) * 1000) / 10,
    };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);
  return ctx.reply.send({
    data: {
      top10: top10,
      total: total,
      period_days: days,
      drill: drill.slice(0, 50),
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/post-mortems',
    code: `async function handler(ctx) {
  const PostMortem = ctx.models.PostMortem;
  const Ticket = ctx.models.Ticket;
  if (!PostMortem) return ctx.reply.send({ data: [], count: 0 });
  const pms = await PostMortem.findMany({});
  const tickets = Ticket ? await Ticket.findMany({}) : [];
  const byTicket = {};
  for (const t of tickets) byTicket[t.id] = t;
  const data = pms.map(function (pm) {
    const ticketId = pm.ticket_id || pm.ticketId;
    const t = byTicket[ticketId] || {};
    return Object.assign({}, pm, {
      ticketId: ticketId,
      createdBy: pm.created_by || pm.createdBy || "",
      whatHappened: pm.what_happened || pm.whatHappened || "",
      impact: pm.impact || "",
      rootCause: pm.root_cause || pm.rootCause || "",
      correctiveActions: pm.corrective_actions || pm.correctiveActions || "",
      preventiveActions: pm.preventive_actions || pm.preventiveActions || "",
      timeline: pm.timeline || [],
      responsible: pm.responsible || null,
      createdAt: pm.created_at || pm.createdAt,
      updatedAt: pm.updated_at || pm.updatedAt,
      ticket: {
        id: t.id || ticketId,
        title: t.title || "Ticket",
        ticketNumber: t.ticket_number || t.ticketNumber || "",
        status: t.status || "",
      },
      creator: {
        fullName: pm.creator_name || null,
        email: pm.creator_email || pm.created_by_email || "—",
      },
    });
  }).sort(function (a, b) {
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return ctx.reply.send({ data: data, count: data.length });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/tickets/:id/post-mortem',
    code: `async function handler(ctx) {
  const PostMortem = ctx.models.PostMortem;
  if (!PostMortem) return ctx.reply.send({ data: null });
  const id = ctx.params && ctx.params.id;
  const rows = await PostMortem.findMany({});
  const pm = rows.find(function (r) {
    return String(r.ticket_id || r.ticketId) === String(id) || String(r.id) === String(id);
  });
  if (!pm) return ctx.reply.status(404).send({ error: "not found" });
  return ctx.reply.send({ data: pm });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/sped-validations',
    code: `async function handler(ctx) {
  const model = ctx.models.SpedValidation;
  if (!model) return ctx.reply.send({ data: [], count: 0 });
  const q = ctx.query || {};
  const limit = Math.min(100, parseInt(String(q.limit || "20"), 10) || 20);
  const offset = Math.max(0, parseInt(String(q.offset || "0"), 10) || 0);
  const cnpj = String(q.cnpj || "").replace(/\\D/g, "");
  let rows = await model.findMany({});
  if (cnpj) {
    rows = rows.filter(function (r) {
      return String(r.cnpj || "").replace(/\\D/g, "").indexOf(cnpj) >= 0;
    });
  }
  rows.sort(function (a, b) {
    return String(b.created_at || b.createdAt || "").localeCompare(String(a.created_at || a.createdAt || ""));
  });
  const sliced = rows.slice(offset, offset + limit);
  const data = sliced.map(function (r) {
    return {
      id: r.id,
      cnpj: r.cnpj || "",
      periodo: r.periodo || "",
      cod_ver: r.cod_ver || r.codVer || "",
      status: r.status || "",
      total_erros: r.error_count != null ? r.error_count : (r.errorCount || 0),
      total_avisos: r.warn_count != null ? r.warn_count : (r.warnCount || 0),
      file_name: r.file_name || r.fileName || "",
      created_at: r.created_at || r.createdAt || null,
    };
  });
  return ctx.reply.send({ data: data, count: rows.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/sped-validations',
    code: `async function handler(ctx) {
  const model = ctx.models.SpedValidation;
  if (!model) return ctx.reply.status(500).send({ error: "Model SpedValidation missing" });
  const body = Object.assign({}, ctx.body || {});
  const now = new Date().toISOString();
  if (!body.id) body.id = "sped_" + Date.now().toString(36);
  if (!body.created_at) body.created_at = now;
  if (!body.updated_at) body.updated_at = now;
  try {
    const row = await model.create(body);
    return ctx.reply.status(201).send({ data: row });
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/sped-validations/:id',
    code: `async function handler(ctx) {
  const model = ctx.models.SpedValidation;
  if (!model) return ctx.reply.status(500).send({ error: "Model SpedValidation missing" });
  const id = ctx.params && ctx.params.id;
  const row = await model.findById(String(id));
  if (!row) return ctx.reply.status(404).send({ error: "not found" });
  return ctx.reply.send({ data: row, result: row.result || row });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/ssh-servers',
    code: `async function handler(ctx) {
  const model = ctx.models.SshServer;
  if (!model) return ctx.reply.send({ data: [], count: 0 });
  const rows = await model.findMany({});
  const data = rows.map(function (s) {
    return Object.assign({}, s, {
      nome: s.nome || s.name || s.host,
      name: s.nome || s.name || s.host,
      usuario: s.usuario || s.username || s.user || "",
      username: s.usuario || s.username || s.user || "",
      port: s.port || 22,
      active: s.active !== false,
    });
  });
  return ctx.reply.send({ data: data, count: data.length, success: true });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/admin/ssh-servers',
    code: `async function handler(ctx) {
  const model = ctx.models.SshServer;
  if (!model) return ctx.reply.status(500).send({ success: false, error: "Model SshServer missing" });
  const body = Object.assign({}, ctx.body || {});
  const now = new Date().toISOString();
  if (!body.id) body.id = "ssh_" + Date.now().toString(36);
  if (!body.created_at) body.created_at = now;
  if (!body.updated_at) body.updated_at = now;
  if (body.active === undefined) body.active = true;
  try {
    const row = await model.create(body);
    return ctx.reply.status(201).send({ success: true, data: row });
  } catch (e) {
    return ctx.reply.status(400).send({ success: false, error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/admin/ssh-servers/:id',
    code: `async function handler(ctx) {
  const model = ctx.models.SshServer;
  if (!model) return ctx.reply.status(500).send({ success: false, error: "Model SshServer missing" });
  const id = ctx.params && ctx.params.id;
  const body = Object.assign({}, ctx.body || {}, { updated_at: new Date().toISOString() });
  try {
    const row = await model.update(String(id), body);
    return ctx.reply.send({ success: true, data: row });
  } catch (e) {
    return ctx.reply.status(404).send({ success: false, error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'DELETE',
    path: '/admin/ssh-servers',
    code: `async function handler(ctx) {
  const model = ctx.models.SshServer;
  if (!model) return ctx.reply.status(500).send({ success: false, error: "Model SshServer missing" });
  const id = (ctx.query && (ctx.query.id || ctx.query.serverId)) || (ctx.body && ctx.body.id);
  if (!id) return ctx.reply.status(400).send({ success: false, error: "Missing id" });
  try {
    await model.delete(String(id));
    return ctx.reply.send({ success: true, ok: true });
  } catch (e) {
    return ctx.reply.status(404).send({ success: false, error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/devops/ping',
    code: `async function handler(ctx) {
  const host = String((ctx.query || {}).host || "");
  // Static export / Arara cannot ICMP; mark unknown host as online=false with null latency.
  return ctx.reply.send({
    host: host,
    online: false,
    latency: null,
    timestamp: new Date().toISOString(),
    note: "ICMP ping not available on Arara runtime; use server metrics when SSH bridge is configured.",
  });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/devops/ping-log',
    code: `async function handler(ctx) {
  const Log = ctx.models.SshPingLog;
  const Server = ctx.models.SshServer;
  const servers = Server ? await Server.findMany({}) : [];
  const logs = Log ? await Log.findMany({}) : [];
  const since = Date.now() - 24 * 3600000;
  const byServer = {};
  for (const s of servers) {
    byServer[s.id] = {
      id: s.id,
      nome: s.nome || s.name || s.host,
      host: s.host,
      avgLatency: null,
      offlineCount: 0,
      totalCount: 0,
      uptime: 100,
      severity: "saudavel",
      _latSum: 0,
      _latN: 0,
    };
  }
  for (const l of logs) {
    const ts = new Date(l.created_at || l.createdAt || l.checked_at || 0).getTime();
    if (ts && ts < since) continue;
    const sid = l.server_id || l.serverId;
    if (!byServer[sid]) continue;
    const row = byServer[sid];
    row.totalCount++;
    const online = l.online === true || l.online === "true" || l.online === 1;
    if (!online) row.offlineCount++;
    const lat = l.latency_ms != null ? Number(l.latency_ms) : (l.latencyMs != null ? Number(l.latencyMs) : null);
    if (lat != null && !isNaN(lat)) { row._latSum += lat; row._latN++; }
  }
  const list = Object.keys(byServer).map(function (id) {
    const r = byServer[id];
    r.avgLatency = r._latN ? Math.round(r._latSum / r._latN) : null;
    r.uptime = r.totalCount ? Math.round(((r.totalCount - r.offlineCount) / r.totalCount) * 1000) / 10 : 100;
    if (r.uptime < 90) r.severity = "critico";
    else if (r.uptime < 97) r.severity = "alto";
    else if (r.uptime < 99.5) r.severity = "moderado";
    else r.severity = "saudavel";
    delete r._latSum; delete r._latN;
    return r;
  });
  const totalQuedas = list.reduce(function (s, r) { return s + r.offlineCount; }, 0);
  const avgUptime = list.length ? Math.round((list.reduce(function (s, r) { return s + r.uptime; }, 0) / list.length) * 10) / 10 : 100;
  return ctx.reply.send({
    success: true,
    data: {
      servers: list,
      summary: {
        totalServers: list.length,
        avgUptime: avgUptime,
        criticalCount: list.filter(function (r) { return r.severity === "critico"; }).length,
        totalQuedas: totalQuedas,
      },
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/devops/ping-log',
    code: `async function handler(ctx) {
  const Log = ctx.models.SshPingLog;
  if (!Log) return ctx.reply.send({ success: true, skipped: true });
  const body = Object.assign({}, ctx.body || {});
  const now = new Date().toISOString();
  const row = {
    id: "ping_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    server_id: body.serverId || body.server_id,
    online: body.online === true,
    latency_ms: body.latencyMs != null ? body.latencyMs : body.latency_ms,
    created_at: now,
    checked_at: now,
  };
  try {
    await Log.create(row);
    return ctx.reply.status(201).send({ success: true });
  } catch (e) {
    return ctx.reply.send({ success: false, error: String(e.message || e) });
  }
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
          where: { appId: app.id, name: { contains: spec.path.split('/')[1] || 'tickets' } },
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
  console.log({ updated, missing })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
