/**
 * Fase 2 — hierarquia Cliente/Servidor → Unidade → ClientUser → Ticket
 *
 * - Model portal-suporte-ClientUser
 * - Ticket.client_user_id (+ schema)
 * - CRUD Units (WhatsApp obrigatório) + ClientUsers
 * - Company context inclui clientUsers
 * - POST/PATCH tickets resolvem client_user_id → company/unit/requester
 *
 * Run: npx tsx scripts/portal-suporte/enrich-phase2-hierarchy.ts
 */
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

type Spec = { method: string; path: string; code: string }

const CLIENT_USER_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    company_id: { type: 'string' },
    unit_id: { type: 'string' },
    name: { type: 'string' },
    cpf: { type: 'string' },
    email: { type: 'string' },
    whatsapp: { type: 'string' },
    role_title: { type: 'string' },
    profile: { type: 'string' },
    notes: { type: 'string' },
    active: { type: 'boolean' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

function normPhone(s: unknown): string {
  return String(s || '').replace(/\D/g, '')
}

const CONTROLLERS: Spec[] = [
  {
    method: 'GET',
    path: '/admin/companies/:id/context',
    code: `async function handler(ctx) {
  const Company = ctx.models.Company;
  const Unit = ctx.models.Unit;
  const Contact = ctx.models.CompanyContact;
  const ClientUser = ctx.models.ClientUser;
  const Ticket = ctx.models.Ticket;
  if (!Company) return ctx.reply.status(500).send({ success: false, error: "Model Company missing" });
  const id = ctx.params.id;
  const company = await Company.findById(id);
  if (!company) return ctx.reply.status(404).send({ success: false, error: "Company not found" });
  var units = [];
  var contacts = [];
  var clientUsers = [];
  var activeTicketsCount = 0;
  try {
    if (Unit) {
      units = (await Unit.findMany({ company_id: id }) || []).filter(function (u) {
        return String(u.company_id || u.companyId || "") === String(id) && u.active !== false;
      }).map(function (u) {
        return {
          id: u.id,
          name: u.name,
          city: u.city || null,
          state: u.state || null,
          whatsapp: u.whatsapp || null,
          code: u.code || null,
        };
      });
    }
  } catch (e) {}
  try {
    if (Contact) {
      contacts = (await Contact.findMany({ company_id: id }) || []).filter(function (c) {
        return String(c.company_id || c.companyId || "") === String(id) && c.active !== false;
      }).map(function (c) {
        return {
          id: c.id,
          name: c.name,
          contactType: c.contact_type || c.contactType || "geral",
          phone: c.phone || null,
          whatsapp: c.whatsapp || null,
          email: c.email || null,
          unitId: c.unit_id || c.unitId || null,
        };
      });
    }
  } catch (e) {}
  try {
    if (ClientUser) {
      clientUsers = (await ClientUser.findMany({}) || []).filter(function (u) {
        return String(u.company_id || u.companyId || "") === String(id) && u.active !== false;
      }).map(function (u) {
        return {
          id: u.id,
          name: u.name,
          whatsapp: u.whatsapp || null,
          email: u.email || null,
          roleTitle: u.role_title || u.roleTitle || null,
          unitId: u.unit_id || u.unitId || null,
          cpf: u.cpf || null,
        };
      });
    }
  } catch (e) {}
  try {
    if (Ticket) {
      var tickets = await Ticket.findMany({});
      var closed = { fechado: 1, cancelado: 1 };
      activeTicketsCount = (tickets || []).filter(function (t) {
        var cn = String(t.company_id || t.companyId || "");
        var nameMatch = String(t.company_name || "").toLowerCase() === String(company.name || "").toLowerCase();
        var ok = cn === String(id) || nameMatch;
        return ok && !closed[String(t.status || "")];
      }).length;
    }
  } catch (e) {}
  return ctx.reply.send({
    success: true,
    data: {
      id: company.id,
      name: company.name,
      tradeName: company.trade_name || company.tradeName || null,
      product: company.product || null,
      hasPdv: !!(company.has_pdv || company.hasPdv),
      serverName: company.server_name || company.serverName || null,
      serverType: company.server_type || company.serverType || null,
      operationType: company.operation_type || company.operationType || null,
      slaContract: null,
      units: units,
      contacts: contacts,
      clientUsers: clientUsers,
      activeTicketsCount: activeTicketsCount,
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/companies/:id/units',
    code: `async function handler(ctx) {
  const Unit = ctx.models.Unit;
  if (!Unit) return ctx.reply.status(500).send({ success: false, error: "Model Unit missing" });
  const companyId = ctx.params.id;
  var rows = await Unit.findMany({ company_id: companyId });
  rows = (rows || []).filter(function (u) {
    return String(u.company_id || u.companyId || "") === String(companyId);
  });
  rows.sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
  var data = rows.map(function (u) {
    return {
      id: u.id,
      companyId: u.company_id || u.companyId || companyId,
      name: u.name,
      city: u.city || null,
      state: u.state || null,
      active: u.active !== false,
      code: u.code || null,
      cnpj: u.cnpj || null,
      address: u.address || null,
      phone: u.phone || null,
      email: u.email || null,
      whatsapp: u.whatsapp || null,
      product: u.product || null,
      pdvCount: u.pdv_count != null ? u.pdv_count : (u.pdvCount != null ? u.pdvCount : null),
      serverRef: u.server_ref || u.serverRef || null,
      notes: u.notes || null,
    };
  });
  return ctx.reply.send({ success: true, data: data });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/admin/companies/:id/units',
    code: `async function handler(ctx) {
  const Unit = ctx.models.Unit;
  const Company = ctx.models.Company;
  if (!Unit) return ctx.reply.status(500).send({ success: false, error: "Model Unit missing" });
  const companyId = ctx.params.id;
  if (Company) {
    var company = await Company.findById(companyId);
    if (!company) return ctx.reply.status(404).send({ success: false, error: "Company not found" });
  }
  const body = ctx.body || {};
  const name = String(body.name || "").trim();
  const whatsapp = String(body.whatsapp || "").trim();
  if (!name) return ctx.reply.status(400).send({ success: false, error: "name required" });
  if (!whatsapp) return ctx.reply.status(400).send({ success: false, error: "WhatsApp da unidade é obrigatório" });
  // Uniqueness: same code or same name within company
  var existing = await Unit.findMany({ company_id: companyId });
  existing = (existing || []).filter(function (u) {
    return String(u.company_id || u.companyId || "") === String(companyId) && u.active !== false;
  });
  var code = body.code ? String(body.code).trim() : "";
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].name || "").toLowerCase() === name.toLowerCase()) {
      return ctx.reply.status(409).send({ success: false, error: "Já existe unidade com este nome neste Cliente/Servidor" });
    }
    if (code && String(existing[i].code || "").toLowerCase() === code.toLowerCase()) {
      return ctx.reply.status(409).send({ success: false, error: "Já existe unidade com este código neste Cliente/Servidor" });
    }
  }
  const now = new Date().toISOString();
  const row = await Unit.create({
    company_id: companyId,
    name: name,
    code: code || null,
    cnpj: body.cnpj || null,
    city: body.city || null,
    state: body.state || null,
    address: body.address || null,
    phone: body.phone || null,
    email: body.email || null,
    whatsapp: whatsapp,
    product: body.product || null,
    pdv_count: body.pdvCount != null ? Number(body.pdvCount) : (body.pdv_count != null ? Number(body.pdv_count) : null),
    server_ref: body.serverRef || body.server_ref || null,
    notes: body.notes || null,
    active: true,
    created_at: now,
    updated_at: now,
  });
  return ctx.reply.status(201).send({
    success: true,
    data: {
      id: row.id,
      companyId: companyId,
      name: row.name,
      city: row.city || null,
      state: row.state || null,
      active: true,
      code: row.code || null,
      cnpj: row.cnpj || null,
      address: row.address || null,
      phone: row.phone || null,
      email: row.email || null,
      whatsapp: row.whatsapp || null,
      product: row.product || null,
      pdvCount: row.pdv_count != null ? row.pdv_count : null,
      serverRef: row.server_ref || null,
      notes: row.notes || null,
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'PUT',
    path: '/admin/companies/:id/units/:unitId',
    code: `async function handler(ctx) {
  const Unit = ctx.models.Unit;
  if (!Unit) return ctx.reply.status(500).send({ success: false, error: "Model Unit missing" });
  const companyId = ctx.params.id;
  const unitId = ctx.params.unitId;
  const unit = await Unit.findById(unitId);
  if (!unit || String(unit.company_id || unit.companyId || "") !== String(companyId)) {
    return ctx.reply.status(404).send({ success: false, error: "Unit not found" });
  }
  const body = ctx.body || {};
  const whatsapp = body.whatsapp !== undefined ? String(body.whatsapp || "").trim() : (unit.whatsapp || "");
  if (!whatsapp) return ctx.reply.status(400).send({ success: false, error: "WhatsApp da unidade é obrigatório" });
  const patch = { updated_at: new Date().toISOString(), whatsapp: whatsapp };
  var fields = ["name", "code", "cnpj", "city", "state", "address", "phone", "email", "product", "notes", "active"];
  for (var i = 0; i < fields.length; i++) {
    if (body[fields[i]] !== undefined) patch[fields[i]] = body[fields[i]];
  }
  if (body.pdvCount !== undefined) patch.pdv_count = body.pdvCount;
  if (body.pdv_count !== undefined) patch.pdv_count = body.pdv_count;
  if (body.serverRef !== undefined) patch.server_ref = body.serverRef;
  if (body.server_ref !== undefined) patch.server_ref = body.server_ref;
  const row = await Unit.update(unitId, patch);
  return ctx.reply.send({
    success: true,
    data: {
      id: row.id,
      companyId: companyId,
      name: row.name,
      city: row.city || null,
      state: row.state || null,
      active: row.active !== false,
      code: row.code || null,
      cnpj: row.cnpj || null,
      address: row.address || null,
      phone: row.phone || null,
      email: row.email || null,
      whatsapp: row.whatsapp || null,
      product: row.product || null,
      pdvCount: row.pdv_count != null ? row.pdv_count : (row.pdvCount != null ? row.pdvCount : null),
      serverRef: row.server_ref || row.serverRef || null,
      notes: row.notes || null,
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'DELETE',
    path: '/admin/companies/:id/units/:unitId',
    code: `async function handler(ctx) {
  const Unit = ctx.models.Unit;
  if (!Unit) return ctx.reply.status(500).send({ success: false, error: "Model Unit missing" });
  const companyId = ctx.params.id;
  const unitId = ctx.params.unitId;
  const unit = await Unit.findById(unitId);
  if (!unit || String(unit.company_id || unit.companyId || "") !== String(companyId)) {
    return ctx.reply.status(404).send({ success: false, error: "Unit not found" });
  }
  await Unit.update(unitId, { active: false, updated_at: new Date().toISOString() });
  return ctx.reply.send({ success: true });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/companies/:id/units/:unitId/client-users',
    code: `async function handler(ctx) {
  const ClientUser = ctx.models.ClientUser;
  const Unit = ctx.models.Unit;
  if (!ClientUser) return ctx.reply.status(500).send({ success: false, error: "Model ClientUser missing" });
  const companyId = ctx.params.id;
  const unitId = ctx.params.unitId;
  if (Unit) {
    var unit = await Unit.findById(unitId);
    if (!unit || String(unit.company_id || unit.companyId || "") !== String(companyId)) {
      return ctx.reply.status(404).send({ success: false, error: "Unit not found" });
    }
  }
  var rows = await ClientUser.findMany({});
  rows = (rows || []).filter(function (u) {
    return String(u.unit_id || u.unitId || "") === String(unitId)
      && String(u.company_id || u.companyId || "") === String(companyId);
  });
  rows.sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
  var data = rows.map(function (u) {
    return {
      id: u.id,
      companyId: u.company_id || u.companyId || companyId,
      unitId: u.unit_id || u.unitId || unitId,
      name: u.name,
      cpf: u.cpf || null,
      email: u.email || null,
      whatsapp: u.whatsapp || "",
      roleTitle: u.role_title || u.roleTitle || null,
      profile: u.profile || null,
      notes: u.notes || null,
      active: u.active !== false,
      createdAt: u.created_at || u.createdAt || null,
      updatedAt: u.updated_at || u.updatedAt || null,
    };
  });
  return ctx.reply.send({ success: true, data: data });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/admin/companies/:id/units/:unitId/client-users',
    code: `async function handler(ctx) {
  const ClientUser = ctx.models.ClientUser;
  const Unit = ctx.models.Unit;
  if (!ClientUser) return ctx.reply.status(500).send({ success: false, error: "Model ClientUser missing" });
  const companyId = ctx.params.id;
  const unitId = ctx.params.unitId;
  if (Unit) {
    var unit = await Unit.findById(unitId);
    if (!unit || String(unit.company_id || unit.companyId || "") !== String(companyId)) {
      return ctx.reply.status(404).send({ success: false, error: "Unit not found" });
    }
  }
  const body = ctx.body || {};
  const name = String(body.name || body.nome || "").trim();
  const whatsapp = String(body.whatsapp || "").trim();
  if (!name) return ctx.reply.status(400).send({ success: false, error: "name required" });
  if (!whatsapp) return ctx.reply.status(400).send({ success: false, error: "WhatsApp do usuário é obrigatório" });
  function digits(s) { return String(s || "").replace(/\\D/g, ""); }
  var waDigits = digits(whatsapp);
  var existing = await ClientUser.findMany({});
  for (var i = 0; i < (existing || []).length; i++) {
    var e = existing[i];
    if (String(e.unit_id || e.unitId || "") !== String(unitId)) continue;
    if (e.active === false) continue;
    if (digits(e.whatsapp) === waDigits && waDigits) {
      return ctx.reply.status(409).send({ success: false, error: "Já existe usuário com este WhatsApp nesta unidade", data: e });
    }
  }
  const now = new Date().toISOString();
  const row = await ClientUser.create({
    company_id: companyId,
    unit_id: unitId,
    name: name,
    cpf: body.cpf || null,
    email: body.email || null,
    whatsapp: whatsapp,
    role_title: body.roleTitle || body.role_title || body.cargo || null,
    profile: body.profile || null,
    notes: body.notes || null,
    active: true,
    created_at: now,
    updated_at: now,
  });
  return ctx.reply.status(201).send({
    success: true,
    data: {
      id: row.id,
      companyId: companyId,
      unitId: unitId,
      name: row.name,
      cpf: row.cpf || null,
      email: row.email || null,
      whatsapp: row.whatsapp,
      roleTitle: row.role_title || null,
      profile: row.profile || null,
      notes: row.notes || null,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'PUT',
    path: '/admin/companies/:id/units/:unitId/client-users/:userId',
    code: `async function handler(ctx) {
  const ClientUser = ctx.models.ClientUser;
  if (!ClientUser) return ctx.reply.status(500).send({ success: false, error: "Model ClientUser missing" });
  const companyId = ctx.params.id;
  const unitId = ctx.params.unitId;
  const userId = ctx.params.userId;
  const row0 = await ClientUser.findById(userId);
  if (!row0
    || String(row0.unit_id || row0.unitId || "") !== String(unitId)
    || String(row0.company_id || row0.companyId || "") !== String(companyId)) {
    return ctx.reply.status(404).send({ success: false, error: "ClientUser not found" });
  }
  const body = ctx.body || {};
  const patch = { updated_at: new Date().toISOString() };
  if (body.name !== undefined || body.nome !== undefined) patch.name = String(body.name || body.nome || "").trim();
  if (body.whatsapp !== undefined) {
    var wa = String(body.whatsapp || "").trim();
    if (!wa) return ctx.reply.status(400).send({ success: false, error: "WhatsApp do usuário é obrigatório" });
    patch.whatsapp = wa;
  }
  if (body.cpf !== undefined) patch.cpf = body.cpf;
  if (body.email !== undefined) patch.email = body.email;
  if (body.roleTitle !== undefined || body.role_title !== undefined || body.cargo !== undefined) {
    patch.role_title = body.roleTitle || body.role_title || body.cargo || null;
  }
  if (body.profile !== undefined) patch.profile = body.profile;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.active !== undefined) patch.active = !!body.active;
  const row = await ClientUser.update(userId, patch);
  return ctx.reply.send({
    success: true,
    data: {
      id: row.id,
      companyId: companyId,
      unitId: unitId,
      name: row.name,
      cpf: row.cpf || null,
      email: row.email || null,
      whatsapp: row.whatsapp || "",
      roleTitle: row.role_title || row.roleTitle || null,
      profile: row.profile || null,
      notes: row.notes || null,
      active: row.active !== false,
      createdAt: row.created_at || row.createdAt || null,
      updatedAt: row.updated_at || row.updatedAt || null,
    },
  });
}
module.exports = { handler };`,
  },
  {
    method: 'DELETE',
    path: '/admin/companies/:id/units/:unitId/client-users/:userId',
    code: `async function handler(ctx) {
  const ClientUser = ctx.models.ClientUser;
  if (!ClientUser) return ctx.reply.status(500).send({ success: false, error: "Model ClientUser missing" });
  const companyId = ctx.params.id;
  const unitId = ctx.params.unitId;
  const userId = ctx.params.userId;
  const row0 = await ClientUser.findById(userId);
  if (!row0
    || String(row0.unit_id || row0.unitId || "") !== String(unitId)
    || String(row0.company_id || row0.companyId || "") !== String(companyId)) {
    return ctx.reply.status(404).send({ success: false, error: "ClientUser not found" });
  }
  await ClientUser.update(userId, { active: false, updated_at: new Date().toISOString() });
  return ctx.reply.send({ success: true });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/client-users',
    code: `async function handler(ctx) {
  const ClientUser = ctx.models.ClientUser;
  const Unit = ctx.models.Unit;
  const Company = ctx.models.Company;
  if (!ClientUser) return ctx.reply.status(500).send({ success: false, error: "Model ClientUser missing" });
  const q = ctx.query || {};
  const search = String(q.search || q.q || "").trim().toLowerCase();
  const companyId = q.companyId || q.company_id || "";
  const unitId = q.unitId || q.unit_id || "";
  const phone = String(q.whatsapp || q.phone || "").replace(/\\D/g, "");
  var rows = await ClientUser.findMany({});
  rows = (rows || []).filter(function (u) { return u.active !== false; });
  if (companyId) {
    rows = rows.filter(function (u) {
      return String(u.company_id || u.companyId || "") === String(companyId);
    });
  }
  if (unitId) {
    rows = rows.filter(function (u) {
      return String(u.unit_id || u.unitId || "") === String(unitId);
    });
  }
  if (phone) {
    rows = rows.filter(function (u) {
      var d = String(u.whatsapp || "").replace(/\\D/g, "");
      return d === phone || d.slice(-11) === phone.slice(-11);
    });
  }
  if (search) {
    rows = rows.filter(function (u) {
      var hay = [u.name, u.email, u.whatsapp, u.cpf, u.role_title || u.roleTitle]
        .map(function (x) { return String(x || "").toLowerCase(); }).join(" ");
      return hay.indexOf(search) >= 0;
    });
  }
  var unitsById = {};
  var companiesById = {};
  try {
    if (Unit) {
      (await Unit.findMany({}) || []).forEach(function (u) { unitsById[String(u.id)] = u; });
    }
  } catch (e) {}
  try {
    if (Company) {
      (await Company.findMany({}) || []).forEach(function (c) { companiesById[String(c.id)] = c; });
    }
  } catch (e) {}
  rows.sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
  var data = rows.map(function (u) {
    var uid = String(u.unit_id || u.unitId || "");
    var cid = String(u.company_id || u.companyId || "");
    var unit = unitsById[uid];
    var company = companiesById[cid];
    return {
      id: u.id,
      companyId: cid || null,
      companyName: company ? company.name : null,
      unitId: uid || null,
      unitName: unit ? unit.name : null,
      name: u.name,
      cpf: u.cpf || null,
      email: u.email || null,
      whatsapp: u.whatsapp || "",
      roleTitle: u.role_title || u.roleTitle || null,
      profile: u.profile || null,
      notes: u.notes || null,
      active: u.active !== false,
    };
  });
  return ctx.reply.send({ success: true, data: data, count: data.length });
}
module.exports = { handler };`,
  },
]

/** Patch POST /tickets to resolve client_user_id — injected into existing handler via replace of create body resolution. */
const TICKET_RESOLVE_SNIPPET = `
  // Fase 2: resolve ClientUser → company/unit/requester
  try {
    var ClientUser = ctx.models.ClientUser;
    var Unit = ctx.models.Unit;
    if (ClientUser && (body.client_user_id || body.clientUserId)) {
      var cuid = String(body.client_user_id || body.clientUserId);
      var cu = await ClientUser.findById(cuid);
      if (cu && cu.active !== false) {
        body.client_user_id = cuid;
        body.unit_id = cu.unit_id || cu.unitId || body.unit_id || null;
        body.company_id = cu.company_id || cu.companyId || body.company_id || null;
        if (!body.requester) body.requester = cu.name || null;
        if (!body.contact_email && cu.email) body.contact_email = cu.email;
        if (Unit && body.unit_id && !body.company_id) {
          var un = await Unit.findById(String(body.unit_id));
          if (un) body.company_id = un.company_id || un.companyId || null;
        }
      }
    }
  } catch (e) {}
`

async function ensureClientUserModel(appId: string) {
  const name = `${APP_SLUG}-ClientUser`
  await prisma.modelDef.upsert({
    where: { appId_name: { appId, name } },
    create: {
      appId,
      name,
      schema: CLIENT_USER_SCHEMA as Prisma.InputJsonValue,
    },
    update: { schema: CLIENT_USER_SCHEMA as Prisma.InputJsonValue },
  })
  console.log('MODEL', name)
}

async function upsertTicketSchema(appId: string) {
  const name = `${APP_SLUG}-Ticket`
  const def = await prisma.modelDef.findUnique({ where: { appId_name: { appId, name } } })
  if (!def) return
  const schema = (def.schema || {}) as {
    type?: string
    properties?: Record<string, { type?: string }>
  }
  if (!schema.properties) schema.properties = {}
  const extras: Record<string, { type: string }> = {
    client_user_id: { type: 'string' },
    occurred_at: { type: 'string' },
    resolved_at: { type: 'string' },
    company_id: { type: 'string' },
    unit_id: { type: 'string' },
    source: { type: 'string' },
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
    console.log('Ticket schema updated with client_user_id')
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
        })) ||
        (await prisma.module.findFirst({
          where: { appId, name: { contains: 'compan' } },
        })) ||
        (await prisma.module.findFirst({ where: { appId } }))
      if (!mod) {
        console.warn('NO MODULE', spec.method, spec.path)
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

async function patchTicketCreateResolve(appId: string) {
  const route = await prisma.moduleRoute.findFirst({
    where: { method: 'POST', path: '/tickets', module: { appId } },
  })
  if (!route?.controllerCode) {
    console.warn('POST /tickets missing')
    return
  }
  let code = route.controllerCode
  if (code.includes('client_user_id') && code.includes('ClientUser')) {
    console.log('POST /tickets already resolves ClientUser')
    return
  }
  // Insert before company resolve or before create loop
  const markers = [
    '// Resolve official company catalog',
    'function norm(s)',
    'var lastErr = null;',
    'for (var attempt = 0;',
  ]
  let inserted = false
  for (const m of markers) {
    if (code.includes(m)) {
      code = code.replace(m, TICKET_RESOLVE_SNIPPET + '\n  ' + m)
      inserted = true
      break
    }
  }
  if (!inserted) {
    code = code.replace(
      'body.updated_at = now;',
      'body.updated_at = now;\n' + TICKET_RESOLVE_SNIPPET,
    )
  }
  // Also allow client_user_id on PATCH/PUT tickets
  await prisma.moduleRoute.update({
    where: { id: route.id },
    data: { controllerCode: code },
  })
  console.log('PATCHED POST /tickets with ClientUser resolve')
}

async function patchTicketUpdateAllowlist(appId: string) {
  for (const method of ['PATCH', 'PUT'] as const) {
    const route = await prisma.moduleRoute.findFirst({
      where: { method, path: '/tickets/:id', module: { appId } },
    })
    if (!route?.controllerCode) continue
    let code = route.controllerCode
    if (code.includes('"client_user_id"')) {
      console.log(method, '/tickets/:id already allows client_user_id')
      continue
    }
    code = code.replace(
      '"unit_id", "occurred_at"',
      '"unit_id", "client_user_id", "occurred_at"',
    )
    if (!code.includes('"client_user_id"')) {
      code = code.replace(
        'const allowed = [',
        'const allowed = [\n    "client_user_id",',
      )
    }
    // Resolve ClientUser on update
    if (!code.includes('ClientUser') || !code.includes('client_user_id')) {
      const resolve = `
  if (patch.client_user_id) {
    try {
      var ClientUser = ctx.models.ClientUser;
      if (ClientUser) {
        var cu = await ClientUser.findById(String(patch.client_user_id));
        if (cu) {
          patch.unit_id = cu.unit_id || cu.unitId || patch.unit_id;
          patch.company_id = cu.company_id || cu.companyId || patch.company_id;
          if (!patch.requester) patch.requester = cu.name;
        }
      }
    } catch (e) {}
  }
`
      code = code.replace(
        'const row = await Ticket.update(id, patch);',
        resolve + '  const row = await Ticket.update(id, patch);',
      )
    }
    await prisma.moduleRoute.update({
      where: { id: route.id },
      data: { controllerCode: code },
    })
    console.log('UPDATED', method, '/tickets/:id allowlist')
  }
}

async function migrateFromLegacy(appId: string) {
  const clientUserModel = `${APP_SLUG}-ClientUser`
  const unitWaModel = `${APP_SLUG}-UnitWhatsapp`
  const contactModel = `${APP_SLUG}-CompanyContact`
  const unitModel = `${APP_SLUG}-Unit`

  const existing = await prisma.modelRecord.findMany({
    where: { appId, modelName: clientUserModel },
  })
  const byKey = new Set<string>()
  for (const r of existing) {
    const d = r.data as { unit_id?: string; whatsapp?: string }
    const key = `${d.unit_id || ''}|${normPhone(d.whatsapp).slice(-11)}`
    if (key !== '|') byKey.add(key)
  }

  const units = await prisma.modelRecord.findMany({
    where: { appId, modelName: unitModel },
  })
  const unitById = new Map<string, { company_id?: string; id?: string }>()
  for (const u of units) {
    const d = u.data as { id?: string; company_id?: string; companyId?: string }
    const id = (typeof d.id === 'string' && d.id) || u.id
    unitById.set(id, {
      id,
      company_id: d.company_id || d.companyId,
    })
  }

  let created = 0

  const whatsapps = await prisma.modelRecord.findMany({
    where: { appId, modelName: unitWaModel },
  })
  for (const w of whatsapps) {
    const d = w.data as {
      unit_id?: string
      unitId?: string
      nome?: string
      name?: string
      cargo?: string
      whatsapp?: string
      phone?: string
    }
    const unitId = String(d.unit_id || d.unitId || '')
    const wa = String(d.whatsapp || d.phone || '').trim()
    const name = String(d.nome || d.name || '').trim()
    if (!unitId || !wa || !name) continue
    const key = `${unitId}|${normPhone(wa).slice(-11)}`
    if (byKey.has(key)) continue
    const unit = unitById.get(unitId)
    const companyId = unit?.company_id
    if (!companyId) continue
    const now = new Date().toISOString()
    const id = `cu_wa_${w.id}`
    await prisma.modelRecord.create({
      data: {
        id,
        appId,
        modelName: clientUserModel,
        data: {
          id,
          company_id: companyId,
          unit_id: unitId,
          name,
          whatsapp: wa,
          role_title: d.cargo || null,
          email: null,
          cpf: null,
          profile: null,
          notes: 'Migrado de UnitWhatsapp',
          active: true,
          created_at: now,
          updated_at: now,
        },
      },
    })
    byKey.add(key)
    created++
  }

  const contacts = await prisma.modelRecord.findMany({
    where: { appId, modelName: contactModel },
  })
  for (const c of contacts) {
    const d = c.data as {
      company_id?: string
      companyId?: string
      unit_id?: string
      unitId?: string
      name?: string
      whatsapp?: string
      phone?: string
      email?: string
      role_title?: string
      roleTitle?: string
      active?: boolean
    }
    if (d.active === false) continue
    const unitId = String(d.unit_id || d.unitId || '')
    const companyId = String(d.company_id || d.companyId || '')
    const wa = String(d.whatsapp || d.phone || '').trim()
    const name = String(d.name || '').trim()
    if (!unitId || !companyId || !wa || !name) continue
    const key = `${unitId}|${normPhone(wa).slice(-11)}`
    if (byKey.has(key)) continue
    const now = new Date().toISOString()
    const id = `cu_cc_${c.id}`
    await prisma.modelRecord.create({
      data: {
        id,
        appId,
        modelName: clientUserModel,
        data: {
          id,
          company_id: companyId,
          unit_id: unitId,
          name,
          whatsapp: wa,
          email: d.email || null,
          role_title: d.role_title || d.roleTitle || null,
          cpf: null,
          profile: null,
          notes: 'Migrado de CompanyContact',
          active: true,
          created_at: now,
          updated_at: now,
        },
      },
    })
    byKey.add(key)
    created++
  }

  console.log({ migratedClientUsers: created, catalogSize: byKey.size })
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  await ensureClientUserModel(app.id)
  await upsertTicketSchema(app.id)
  const n = await upsertControllers(app.id)
  await patchTicketCreateResolve(app.id)
  await patchTicketUpdateAllowlist(app.id)
  await migrateFromLegacy(app.id)
  console.log({ updatedControllers: n })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
