/**
 * Fase 4 — múltiplos clientes/unidades por ticket (doc §3.1, RN12, critério de aceite
 * "for possível vincular mais de um cliente/unidade quando necessário").
 *
 * O Cliente/Servidor + Unidade + Usuário principais continuam no próprio Ticket
 * (responsável principal). Participantes extras ficam em TicketParticipant.
 *
 * - Model portal-suporte-TicketParticipant
 * - GET/POST /tickets/:id/participants, DELETE /tickets/:id/participants/:participantId
 * - ActivityLog participant_added / participant_removed (link_type unit|company|client_user)
 *
 * node scripts/portal-suporte/enrich-phase4-participants.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const MODEL = `${APP_SLUG}-TicketParticipant`
const MAX_PARTICIPANTS = 20

/** Shared resolver: expands ids into names for display. */
const RESOLVE_HELPER = `
async function expandParticipants(ctx, rows) {
  var Company = ctx.models.Company;
  var Unit = ctx.models.Unit;
  var ClientUser = ctx.models.ClientUser;
  var companyCache = {};
  var unitCache = {};
  var userCache = {};
  async function look(cache, model, id) {
    if (!model || !id) return null;
    var key = String(id);
    if (cache[key] !== undefined) return cache[key];
    try {
      cache[key] = await model.findById(key);
    } catch (e) {
      cache[key] = null;
    }
    return cache[key];
  }
  var out = [];
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i];
    var companyId = r.company_id || r.companyId || null;
    var unitId = r.unit_id || r.unitId || null;
    var clientUserId = r.client_user_id || r.clientUserId || null;
    var company = await look(companyCache, Company, companyId);
    var unit = await look(unitCache, Unit, unitId);
    var clientUser = await look(userCache, ClientUser, clientUserId);
    out.push({
      id: r.id,
      ticket_id: r.ticket_id || r.ticketId || null,
      link_type: r.link_type || r.linkType || "unit",
      company_id: companyId,
      company_name: company ? (company.name || null) : null,
      unit_id: unitId,
      unit_name: unit ? (unit.name || null) : null,
      client_user_id: clientUserId,
      client_user_name: clientUser ? (clientUser.name || null) : null,
      note: r.note || null,
      added_by: r.added_by || r.addedBy || null,
      created_at: r.created_at || r.createdAt || null,
    });
  }
  return out;
}
`.trim()

const LIST_CODE = `async function handler(ctx) {
  ${RESOLVE_HELPER}
  var Part = ctx.models.TicketParticipant;
  if (!Part) return ctx.reply.status(500).send({ error: "Model TicketParticipant missing" });
  var ticketId = String(ctx.params.id || "");
  var rows = await Part.findMany({ ticket_id: ticketId });
  rows = (rows || []).filter(function (r) {
    return String(r.ticket_id || r.ticketId) === ticketId;
  });
  rows.sort(function (a, b) {
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
  var data = await expandParticipants(ctx, rows);
  return ctx.reply.send({ success: true, data: data, count: data.length });
}
module.exports = { handler };`

const CREATE_CODE = `async function handler(ctx) {
  ${RESOLVE_HELPER}
  var Part = ctx.models.TicketParticipant;
  var Ticket = ctx.models.Ticket;
  var Unit = ctx.models.Unit;
  var ClientUser = ctx.models.ClientUser;
  var Log = ctx.models.ActivityLog;
  if (!Part) return ctx.reply.status(500).send({ error: "Model TicketParticipant missing" });

  var ticketId = String(ctx.params.id || "");
  var ticket = Ticket ? await Ticket.findById(ticketId) : null;
  if (Ticket && !ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });

  var body = ctx.body || {};
  var companyId = body.company_id || body.companyId || null;
  var unitId = body.unit_id || body.unitId || null;
  var clientUserId = body.client_user_id || body.clientUserId || null;

  // RN03/RN06: a partir do usuário ou da unidade resolvemos a estrutura acima.
  if (clientUserId && ClientUser) {
    var cu = await ClientUser.findById(String(clientUserId));
    if (!cu) return ctx.reply.status(400).send({ error: "Usuário do cliente não encontrado" });
    if (cu.active === false) return ctx.reply.status(400).send({ error: "Usuário do cliente inativo" });
    unitId = unitId || cu.unit_id || cu.unitId || null;
    companyId = companyId || cu.company_id || cu.companyId || null;
  }
  if (unitId && Unit) {
    var un = await Unit.findById(String(unitId));
    if (!un) return ctx.reply.status(400).send({ error: "Unidade não encontrada" });
    companyId = companyId || un.company_id || un.companyId || null;
  }
  if (!companyId && !unitId && !clientUserId) {
    return ctx.reply
      .status(400)
      .send({ error: "Informe company_id, unit_id ou client_user_id" });
  }

  var linkType = clientUserId ? "client_user" : unitId ? "unit" : "company";

  var all = await Part.findMany({ ticket_id: ticketId });
  all = (all || []).filter(function (r) {
    return String(r.ticket_id || r.ticketId) === ticketId;
  });

  // Já é o principal do ticket? Não duplicar.
  var mainUnit = ticket ? String(ticket.unit_id || ticket.unitId || "") : "";
  var mainUser = ticket ? String(ticket.client_user_id || ticket.clientUserId || "") : "";
  var mainCompany = ticket ? String(ticket.company_id || ticket.companyId || "") : "";
  if (clientUserId && String(clientUserId) === mainUser) {
    return ctx.reply.status(409).send({ error: "Este usuário já é o principal do ticket" });
  }
  if (!clientUserId && unitId && String(unitId) === mainUnit) {
    return ctx.reply.status(409).send({ error: "Esta unidade já é a principal do ticket" });
  }
  if (!clientUserId && !unitId && companyId && String(companyId) === mainCompany) {
    return ctx.reply.status(409).send({ error: "Este cliente já é o principal do ticket" });
  }

  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    var sameUser = String(r.client_user_id || r.clientUserId || "") === String(clientUserId || "");
    var sameUnit = String(r.unit_id || r.unitId || "") === String(unitId || "");
    var sameCompany = String(r.company_id || r.companyId || "") === String(companyId || "");
    if (sameUser && sameUnit && sameCompany) {
      return ctx.reply.send({ success: true, data: (await expandParticipants(ctx, [r]))[0] });
    }
  }
  if (all.length >= ${MAX_PARTICIPANTS}) {
    return ctx.reply.status(400).send({ error: "Máximo de ${MAX_PARTICIPANTS} participantes" });
  }

  var now = new Date().toISOString();
  var actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  var row = await Part.create({
    ticket_id: ticketId,
    link_type: linkType,
    company_id: companyId || null,
    unit_id: unitId || null,
    client_user_id: clientUserId || null,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    added_by: actor,
    created_at: now,
  });
  try {
    if (Log) {
      await Log.create({
        ticket_id: ticketId,
        user_id: actor,
        action: "participant_added",
        details: {
          link_type: linkType,
          company_id: companyId || null,
          unit_id: unitId || null,
          client_user_id: clientUserId || null,
          action: "add",
        },
        created_at: now,
        visible_to_client: false,
      });
    }
  } catch (e) {}
  var data = await expandParticipants(ctx, [row]);
  return ctx.reply.status(201).send({ success: true, data: data[0] });
}
module.exports = { handler };`

const DELETE_CODE = `async function handler(ctx) {
  var Part = ctx.models.TicketParticipant;
  var Log = ctx.models.ActivityLog;
  if (!Part) return ctx.reply.status(500).send({ error: "Model TicketParticipant missing" });
  var ticketId = String(ctx.params.id || "");
  var participantId = String(ctx.params.participantId || "");
  if (!participantId) return ctx.reply.status(400).send({ error: "participantId required" });

  var row = await Part.findById(participantId);
  if (!row || String(row.ticket_id || row.ticketId) !== ticketId) {
    return ctx.reply.status(404).send({ error: "Participante não encontrado" });
  }
  await Part.delete(participantId);
  var now = new Date().toISOString();
  var actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  try {
    if (Log) {
      await Log.create({
        ticket_id: ticketId,
        user_id: actor,
        action: "participant_removed",
        details: {
          link_type: row.link_type || row.linkType || "unit",
          company_id: row.company_id || row.companyId || null,
          unit_id: row.unit_id || row.unitId || null,
          client_user_id: row.client_user_id || row.clientUserId || null,
          action: "remove",
        },
        created_at: now,
        visible_to_client: false,
      });
    }
  } catch (e) {}
  return ctx.reply.send({ success: true });
}
module.exports = { handler };`

/**
 * GET /tickets/:id devolvia o registro cru: sem unit_name/client_user_name a UI
 * não conseguia mostrar Cliente/Servidor → Unidade → Usuário (doc §14).
 */
const DETAIL_CODE = `async function handler(ctx) {
  var model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  var row = await model.findById(ctx.params.id);
  if (!row) return ctx.reply.status(404).send({ error: "Not found" });

  var out = Object.assign({}, row);
  async function nameOf(model, id) {
    if (!model || !id) return null;
    try {
      var rec = await model.findById(String(id));
      return rec ? (rec.name || null) : null;
    } catch (e) {
      return null;
    }
  }
  try {
    var companyId = out.company_id || out.companyId || null;
    var unitId = out.unit_id || out.unitId || null;
    var clientUserId = out.client_user_id || out.clientUserId || null;
    if (!out.company_name && companyId) {
      out.company_name = await nameOf(ctx.models.Company, companyId);
    }
    if (unitId) out.unit_name = await nameOf(ctx.models.Unit, unitId);
    if (clientUserId) out.client_user_name = await nameOf(ctx.models.ClientUser, clientUserId);
  } catch (e) {}
  try {
    var Part = ctx.models.TicketParticipant;
    if (Part) {
      var ticketId = String(ctx.params.id || "");
      var rows = await Part.findMany({ ticket_id: ticketId });
      out.participants = (rows || []).filter(function (r) {
        return String(r.ticket_id || r.ticketId) === ticketId;
      });
    }
  } catch (e) {}
  return ctx.reply.send(out);
}
module.exports = { handler };`

async function ensureModule(appId, name, description) {
  let mod = await prisma.module.findFirst({ where: { appId, name } })
  if (!mod) {
    mod = await prisma.module.create({
      data: { appId, name, description, status: 'published' },
    })
    console.log('→ módulo criado', name)
  } else {
    await prisma.module.update({ where: { id: mod.id }, data: { status: 'published' } })
  }
  return mod
}

async function upsertRoute(appId, moduleId, method, path, controllerCode) {
  const existing = await prisma.moduleRoute.findFirst({
    where: { method, path, module: { appId } },
  })
  if (existing) {
    await prisma.moduleRoute.update({
      where: { id: existing.id },
      data: { controllerCode, moduleId },
    })
    console.log('→ atualizado', method, path)
  } else {
    await prisma.moduleRoute.create({ data: { moduleId, method, path, controllerCode } })
    console.log('→ criado', method, path)
  }
}

async function ensureModel(appId) {
  await prisma.modelDef.upsert({
    where: { appId_name: { appId, name: MODEL } },
    create: {
      appId,
      name: MODEL,
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ticket_id: { type: 'string' },
          link_type: { type: 'string' },
          company_id: { type: 'string' },
          unit_id: { type: 'string' },
          client_user_id: { type: 'string' },
          note: { type: 'string' },
          added_by: { type: 'string' },
          created_at: { type: 'string' },
        },
      },
    },
    update: {},
  })
  console.log('→ model', MODEL)
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  await ensureModel(app.id)
  const mod = await ensureModule(app.id, 'tickets', 'Tickets')

  await upsertRoute(app.id, mod.id, 'GET', '/tickets/:id/participants', LIST_CODE)
  await upsertRoute(app.id, mod.id, 'POST', '/tickets/:id/participants', CREATE_CODE)
  await upsertRoute(
    app.id,
    mod.id,
    'DELETE',
    '/tickets/:id/participants/:participantId',
    DELETE_CODE,
  )
  await upsertRoute(app.id, mod.id, 'GET', '/tickets/:id', DETAIL_CODE)

  console.log('✓ Fase 4 publicada')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
