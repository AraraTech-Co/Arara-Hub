/**
 * Enrich GET /admin/companies (+ search) and ensure success/camelCase for CompanySelector.
 * Also POST create with unique normalized name.
 * Run: npx tsx scripts/portal-suporte/enrich-companies-controllers.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

type Spec = { method: string; path: string; code: string }

const CONTROLLERS: Spec[] = [
  {
    method: 'GET',
    path: '/admin/companies',
    code: `async function handler(ctx) {
  const Company = ctx.models.Company;
  if (!Company) return ctx.reply.status(500).send({ success: false, error: "Model Company missing" });
  const q = ctx.query || {};
  const search = String(q.search || q.q || "").trim().toLowerCase();
  const limit = Math.min(Number(q.limit || 50), 200);
  var rows = await Company.findMany({});
  rows = (rows || []).filter(function (c) { return c.active !== false; });
  if (search) {
    rows = rows.filter(function (c) {
      var hay = [
        c.name, c.trade_name, c.tradeName, c.cnpj, c.city, c.state
      ].map(function (x) { return String(x || "").toLowerCase(); }).join(" ");
      return hay.indexOf(search) >= 0;
    });
  }
  rows.sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
  if (limit) rows = rows.slice(0, limit);
  var data = rows.map(function (c) {
    return Object.assign({}, c, {
      tradeName: c.trade_name || c.tradeName || null,
      contactEmail: c.contact_email || c.contactEmail || null,
      operationType: c.operation_type || c.operationType || null,
      hasPdv: !!(c.has_pdv || c.hasPdv),
      serverName: c.server_name || c.serverName || null,
      serverType: c.server_type || c.serverType || null,
      group: null,
      _count: { tickets: 0, profiles: 0, units: 0 },
    });
  });
  return ctx.reply.send({ success: true, data: data, count: data.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/admin/companies',
    code: `async function handler(ctx) {
  const Company = ctx.models.Company;
  if (!Company) return ctx.reply.status(500).send({ success: false, error: "Model Company missing" });
  const body = ctx.body || {};
  const name = String(body.name || "").trim();
  if (!name) return ctx.reply.status(400).send({ success: false, error: "name required" });
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/\\s+/g, " ").trim();
  }
  const target = norm(name);
  var existing = await Company.findMany({});
  for (var i = 0; i < (existing || []).length; i++) {
    if (norm(existing[i].name) === target) {
      return ctx.reply.status(409).send({
        success: false,
        error: "Já existe uma loja com este nome",
        data: existing[i],
      });
    }
  }
  const now = new Date().toISOString();
  const row = await Company.create({
    name: name,
    trade_name: body.trade_name || body.tradeName || null,
    cnpj: body.cnpj || null,
    city: body.city || null,
    state: body.state || null,
    phone: body.phone || null,
    whatsapp: body.whatsapp || null,
    contact_email: body.contact_email || body.contactEmail || null,
    active: true,
    created_at: now,
    updated_at: now,
  });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/admin/companies/:id/context',
    code: `async function handler(ctx) {
  const Company = ctx.models.Company;
  const Unit = ctx.models.Unit;
  const Contact = ctx.models.CompanyContact;
  const Ticket = ctx.models.Ticket;
  if (!Company) return ctx.reply.status(500).send({ success: false, error: "Model Company missing" });
  const id = ctx.params.id;
  const company = await Company.findById(id);
  if (!company) return ctx.reply.status(404).send({ success: false, error: "Company not found" });
  var units = [];
  var contacts = [];
  var activeTicketsCount = 0;
  try {
    if (Unit) {
      units = (await Unit.findMany({ company_id: id }) || []).filter(function (u) {
        return String(u.company_id || u.companyId || "") === String(id) && u.active !== false;
      }).map(function (u) {
        return { id: u.id, name: u.name, city: u.city || null, state: u.state || null };
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
      activeTicketsCount: activeTicketsCount,
    },
  });
}
module.exports = { handler };`,
  },
  // POST /tickets moved to enrich-phase1-bugs.ts (sequential number + RN09 dates).
  // Do not redefine here — last enrich run would overwrite Phase 1.
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
          where: { appId: app.id, name: { contains: spec.path.includes('compan') ? 'compan' : 'ticket' } },
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
