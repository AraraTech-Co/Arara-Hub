/**
 * Fase 3 — identificação WhatsApp → ClientUser → Unidade → Cliente/Servidor
 *
 * - Campos client_user_id / unit_id em WhatsAppConversation
 * - POST /whatsapp/inbound — cria/atualiza conversa com lookup automático
 * - POST /whatsapp/:id/identify — reprocessa identificação pelo remote_jid
 * - GET detalhe/lista enriquecidos com identification + clientUser + unit
 * - POST /whatsapp/:id/ticket usa client_user_id da conversa
 *
 * Run: npx tsx scripts/portal-suporte/enrich-phase3-whatsapp-identify.ts
 */
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

type Spec = { method: string; path: string; code: string }

const IDENTIFY_HELPERS = `
function phoneDigits(s) {
  return String(s || "").replace(/\\D/g, "");
}
function phoneTail(s) {
  var d = phoneDigits(s);
  if (d.length < 10) return "";
  return d.slice(-11);
}
async function resolveClientUserByPhone(ctx, phone) {
  var ClientUser = ctx.models.ClientUser;
  var Unit = ctx.models.Unit;
  var Company = ctx.models.Company;
  var Contact = ctx.models.CompanyContact;
  var tail = phoneTail(phone);
  if (!tail) {
    return { identified: false, client_user_id: null, unit_id: null, company_id: null, company_contact_id: null, clientUser: null, unit: null, company: null };
  }
  // 1) ClientUser (oficial Fase 2)
  if (ClientUser) {
    var users = await ClientUser.findMany({});
    for (var i = 0; i < (users || []).length; i++) {
      var u = users[i];
      if (u.active === false) continue;
      var ut = phoneTail(u.whatsapp);
      if (!ut) continue;
      if (ut === tail || phoneDigits(u.whatsapp).slice(-11) === tail) {
        var unitId = u.unit_id || u.unitId || null;
        var companyId = u.company_id || u.companyId || null;
        var unit = null;
        var company = null;
        if (Unit && unitId) {
          try { unit = await Unit.findById(String(unitId)); } catch (e) {}
          if (unit && !companyId) companyId = unit.company_id || unit.companyId || null;
        }
        if (Company && companyId) {
          try { company = await Company.findById(String(companyId)); } catch (e) {}
        }
        return {
          identified: true,
          client_user_id: u.id,
          unit_id: unitId,
          company_id: companyId,
          company_contact_id: null,
          clientUser: {
            id: u.id,
            name: u.name || null,
            whatsapp: u.whatsapp || null,
            email: u.email || null,
            roleTitle: u.role_title || u.roleTitle || null,
          },
          unit: unit ? { id: unit.id, name: unit.name || null, whatsapp: unit.whatsapp || null } : null,
          company: company ? { id: company.id, name: company.name || null } : null,
        };
      }
    }
  }
  // 2) Fallback CompanyContact (legado)
  if (Contact) {
    var contacts = await Contact.findMany({});
    for (var j = 0; j < (contacts || []).length; j++) {
      var c = contacts[j];
      if (c.active === false) continue;
      var ct = phoneTail(c.whatsapp || c.phone);
      if (!ct || ct !== tail) continue;
      var cid = c.company_id || c.companyId || null;
      var uid2 = c.unit_id || c.unitId || null;
      var company2 = null;
      var unit2 = null;
      if (Company && cid) { try { company2 = await Company.findById(String(cid)); } catch (e) {} }
      if (Unit && uid2) { try { unit2 = await Unit.findById(String(uid2)); } catch (e) {} }
      return {
        identified: true,
        client_user_id: null,
        unit_id: uid2,
        company_id: cid,
        company_contact_id: c.id,
        clientUser: null,
        unit: unit2 ? { id: unit2.id, name: unit2.name || null, whatsapp: unit2.whatsapp || null } : null,
        company: company2 ? { id: company2.id, name: company2.name || null } : null,
        legacyContact: { id: c.id, name: c.name || null, whatsapp: c.whatsapp || c.phone || null },
      };
    }
  }
  return {
    identified: false,
    client_user_id: null,
    unit_id: null,
    company_id: null,
    company_contact_id: null,
    clientUser: null,
    unit: null,
    company: null,
  };
}
function applyIdentificationLabels(data, idResult, conv) {
  data.client_user_id = (conv && (conv.client_user_id || conv.clientUserId)) || (idResult && idResult.client_user_id) || null;
  data.clientUserId = data.client_user_id;
  data.unit_id = (conv && (conv.unit_id || conv.unitId)) || (idResult && idResult.unit_id) || null;
  data.unitId = data.unit_id;
  data.clientUser = (idResult && idResult.clientUser) || null;
  data.unit = (idResult && idResult.unit) || null;
  if (!data.company && idResult && idResult.company) data.company = idResult.company;
  var identified = !!(data.client_user_id || data.company_id || (idResult && idResult.identified));
  data.identification = {
    identified: identified,
    status: identified ? "identified" : "unidentified",
    labelUser: identified
      ? ((data.clientUser && data.clientUser.name) || (data.contact && data.contact.name) || data.contact_name || "Identificado")
      : "Não identificado",
    labelUnit: identified
      ? ((data.unit && data.unit.name) || "—")
      : "Não identificada",
    labelCompany: identified
      ? ((data.company && data.company.name) || "—")
      : "Não identificado",
  };
  return data;
}
`

const CONTROLLERS: Spec[] = [
  {
    method: 'POST',
    path: '/whatsapp/inbound',
    code: `async function handler(ctx) {
${IDENTIFY_HELPERS}
  function nowIso() { return new Date().toISOString(); }
  function uid(p) { return (p || "wa") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function ok(ctx, data, status) { return ctx.reply.status(status || 200).send({ success: true, data: data }); }
  function fail(ctx, status, error) { return ctx.reply.status(status).send({ success: false, error: error }); }
  var Conv = ctx.models.WhatsAppConversation || ctx.models.Conversation;
  var Msg = ctx.models.WhatsAppMessage || ctx.models.Message;
  if (!Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var body = ctx.body || {};
  var phone = String(body.phone || body.remote_jid || body.remoteJid || "").trim();
  if (!phone) return fail(ctx, 400, "phone required");
  var contactName = body.name || body.contact_name || body.contactName || null;
  var message = String(body.message || body.body || "").trim();
  var ts = nowIso();
  var idResult = await resolveClientUserByPhone(ctx, phone);
  // Find open conversation by phone
  var all = await Conv.findMany({});
  var open = null;
  var dig = phoneDigits(phone);
  for (var i = 0; i < (all || []).length; i++) {
    var c = all[i];
    if (String(c.status || "open") === "closed") continue;
    var rj = String(c.remote_jid || c.remoteJid || "");
    if (rj === phone || phoneDigits(rj) === dig || phoneTail(rj) === phoneTail(phone)) {
      open = c;
      break;
    }
  }
  var conv;
  if (!open) {
    conv = await Conv.create({
      id: uid("wac"),
      remote_jid: phone,
      contact_name: contactName,
      status: "open",
      phase: "novo",
      priority: "medium",
      unread_count: message ? 1 : 0,
      instance: body.instance || "webhook",
      company_id: idResult.company_id,
      company_contact_id: idResult.company_contact_id,
      client_user_id: idResult.client_user_id,
      unit_id: idResult.unit_id,
      last_inbound_at: ts,
      created_at: ts,
      updated_at: ts,
    });
  } else {
    var patch = {
      updated_at: ts,
      last_inbound_at: ts,
      unread_count: Number(open.unread_count || open.unreadCount || 0) + (message ? 1 : 0),
    };
    if (contactName && !(open.contact_name || open.contactName)) patch.contact_name = contactName;
    // Re-identify if still blank
    if (!(open.client_user_id || open.clientUserId) && idResult.client_user_id) {
      patch.client_user_id = idResult.client_user_id;
      patch.unit_id = idResult.unit_id;
      patch.company_id = idResult.company_id || open.company_id || open.companyId;
      if (idResult.company_contact_id) patch.company_contact_id = idResult.company_contact_id;
    } else if (!(open.company_id || open.companyId) && idResult.company_id) {
      patch.company_id = idResult.company_id;
      patch.unit_id = idResult.unit_id || open.unit_id || open.unitId;
      patch.client_user_id = idResult.client_user_id;
    }
    conv = await Conv.update(open.id, patch);
  }
  if (Msg && message) {
    await Msg.create({
      id: uid("wam"),
      conversation_id: conv.id,
      message_id: body.message_id || ("in_" + Date.now()),
      from_me: false,
      sender_name: contactName,
      body: message,
      media_url: body.media_url || body.mediaUrl || null,
      media_type: body.media_type || body.mediaType || null,
      timestamp: ts,
      created_at: ts,
    });
  }
  return ok(ctx, {
    id: conv.id,
    remote_jid: conv.remote_jid || phone,
    identified: idResult.identified,
    client_user_id: conv.client_user_id || idResult.client_user_id,
    unit_id: conv.unit_id || idResult.unit_id,
    company_id: conv.company_id || idResult.company_id,
    identification: {
      identified: idResult.identified,
      labelUser: idResult.identified
        ? ((idResult.clientUser && idResult.clientUser.name) || "Identificado")
        : "Não identificado",
      labelUnit: idResult.identified
        ? ((idResult.unit && idResult.unit.name) || "—")
        : "Não identificada",
      labelCompany: idResult.identified
        ? ((idResult.company && idResult.company.name) || "—")
        : "Não identificado",
    },
    clientUser: idResult.clientUser,
    unit: idResult.unit,
    company: idResult.company,
  }, open ? 200 : 201);
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/whatsapp/:id/identify',
    code: `async function handler(ctx) {
${IDENTIFY_HELPERS}
  function nowIso() { return new Date().toISOString(); }
  function ok(ctx, data, status) { return ctx.reply.status(status || 200).send({ success: true, data: data }); }
  function fail(ctx, status, error) { return ctx.reply.status(status).send({ success: false, error: error }); }
  var Conv = ctx.models.WhatsAppConversation;
  if (!Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var conv = await Conv.findById(id);
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  var phone = conv.remote_jid || conv.remoteJid || "";
  var body = ctx.body || {};
  // Manual override: link existing ClientUser
  if (body.client_user_id || body.clientUserId) {
    var ClientUser = ctx.models.ClientUser;
    var cuid = String(body.client_user_id || body.clientUserId);
    var cu = ClientUser ? await ClientUser.findById(cuid) : null;
    if (!cu) return fail(ctx, 404, "ClientUser not found");
    var unitId = cu.unit_id || cu.unitId || null;
    var companyId = cu.company_id || cu.companyId || null;
    var updated = await Conv.update(id, {
      client_user_id: cuid,
      unit_id: unitId,
      company_id: companyId,
      contact_name: cu.name || conv.contact_name || conv.contactName,
      updated_at: nowIso(),
    });
    var idResult = await resolveClientUserByPhone(ctx, cu.whatsapp || phone);
    return ok(ctx, {
      id: updated.id,
      identified: true,
      client_user_id: cuid,
      unit_id: unitId,
      company_id: companyId,
      identification: {
        identified: true,
        labelUser: cu.name || "Identificado",
        labelUnit: (idResult.unit && idResult.unit.name) || "—",
        labelCompany: (idResult.company && idResult.company.name) || "—",
      },
      clientUser: idResult.clientUser || { id: cuid, name: cu.name, whatsapp: cu.whatsapp },
      unit: idResult.unit,
      company: idResult.company,
    });
  }
  var result = await resolveClientUserByPhone(ctx, phone);
  var patch = { updated_at: nowIso() };
  if (result.client_user_id) patch.client_user_id = result.client_user_id;
  if (result.unit_id) patch.unit_id = result.unit_id;
  if (result.company_id) patch.company_id = result.company_id;
  if (result.company_contact_id) patch.company_contact_id = result.company_contact_id;
  if (result.clientUser && result.clientUser.name) patch.contact_name = result.clientUser.name;
  var row = await Conv.update(id, patch);
  return ok(ctx, {
    id: row.id,
    identified: result.identified,
    client_user_id: result.client_user_id,
    unit_id: result.unit_id,
    company_id: result.company_id,
    identification: {
      identified: result.identified,
      labelUser: result.identified
        ? ((result.clientUser && result.clientUser.name) || "Identificado")
        : "Não identificado",
      labelUnit: result.identified
        ? ((result.unit && result.unit.name) || "—")
        : "Não identificada",
      labelCompany: result.identified
        ? ((result.company && result.company.name) || "—")
        : "Não identificado",
    },
    clientUser: result.clientUser,
    unit: result.unit,
    company: result.company,
  });
}
module.exports = { handler };`,
  },
]

async function ensureConversationFields(appId: string) {
  const name = `${APP_SLUG}-WhatsAppConversation`
  const def = await prisma.modelDef.findUnique({ where: { appId_name: { appId, name } } })
  if (!def) {
    console.warn('WhatsAppConversation modelDef missing')
    return
  }
  const schema = (def.schema || {}) as {
    type?: string
    properties?: Record<string, { type?: string }>
  }
  if (!schema.properties) schema.properties = {}
  let changed = false
  for (const k of ['client_user_id', 'unit_id']) {
    if (!schema.properties[k]) {
      schema.properties[k] = { type: 'string' }
      changed = true
    }
  }
  if (changed) {
    await prisma.modelDef.update({
      where: { id: def.id },
      data: { schema: schema as Prisma.InputJsonValue },
    })
    console.log('WhatsAppConversation schema +client_user_id/unit_id')
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
          where: { appId, name: { contains: 'whatsapp' } },
        })) || (await prisma.module.findFirst({ where: { appId } }))
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
  return updated
}

async function patchGetConversationDetail(appId: string) {
  const route = await prisma.moduleRoute.findFirst({
    where: { method: 'GET', path: '/whatsapp/:id', module: { appId } },
  })
  if (!route?.controllerCode) return
  let code = route.controllerCode
  if (code.includes('resolveClientUserByPhone') && code.includes('identification')) {
    console.log('GET /whatsapp/:id already enriched')
    return
  }
  // Inject helpers before handler if missing
  if (!code.includes('function resolveClientUserByPhone')) {
    code = IDENTIFY_HELPERS + '\n' + code
  }
  // After serializeConv / data assignment, enrich identification
  if (code.includes('data.closeReasonId = data.close_reason_id;')) {
    code = code.replace(
      'data.closeReasonId = data.close_reason_id;',
      `data.closeReasonId = data.close_reason_id;
  var phone = data.remote_jid || data.remoteJid || "";
  var idResult = await resolveClientUserByPhone(ctx, phone);
  // Prefer persisted FKs; fill missing from lookup
  if ((conv.client_user_id || conv.clientUserId) && !idResult.clientUser && ctx.models.ClientUser) {
    try {
      var cu = await ctx.models.ClientUser.findById(String(conv.client_user_id || conv.clientUserId));
      if (cu) {
        idResult.clientUser = { id: cu.id, name: cu.name, whatsapp: cu.whatsapp, email: cu.email || null, roleTitle: cu.role_title || cu.roleTitle || null };
        idResult.client_user_id = cu.id;
        idResult.identified = true;
        idResult.unit_id = cu.unit_id || cu.unitId || idResult.unit_id;
        idResult.company_id = cu.company_id || cu.companyId || idResult.company_id;
      }
    } catch (e) {}
  }
  if ((conv.unit_id || conv.unitId) && !idResult.unit && ctx.models.Unit) {
    try {
      var un = await ctx.models.Unit.findById(String(conv.unit_id || conv.unitId));
      if (un) idResult.unit = { id: un.id, name: un.name, whatsapp: un.whatsapp || null };
    } catch (e) {}
  }
  applyIdentificationLabels(data, idResult, conv);
  // camelCase CRM mirrors
  data.company = data.company || (idResult.company ? { id: idResult.company.id, name: idResult.company.name, cnpj: null, phone: null } : null);
  if (idResult.clientUser) {
    data.contact = data.contact || {
      id: idResult.clientUser.id,
      name: idResult.clientUser.name,
      email: idResult.clientUser.email,
      phone: idResult.clientUser.whatsapp,
      whatsapp: idResult.clientUser.whatsapp,
      roleTitle: idResult.clientUser.roleTitle,
    };
  }`,
    )
  } else {
    console.warn('Could not patch GET /whatsapp/:id — marker missing')
    return
  }
  await prisma.moduleRoute.update({
    where: { id: route.id },
    data: { controllerCode: code },
  })
  console.log('PATCHED GET /whatsapp/:id with identification')
}

async function patchTicketFromWhatsApp(appId: string) {
  const route = await prisma.moduleRoute.findFirst({
    where: { method: 'POST', path: '/whatsapp/:id/ticket', module: { appId } },
  })
  if (!route?.controllerCode) return
  let code = route.controllerCode
  if (code.includes('client_user_id: conv.client_user_id')) {
    console.log('WA ticket already uses client_user_id')
    return
  }
  // Ensure sequential + client_user fields on create body
  if (code.includes('company_id: conv.company_id || conv.companyId || null,')) {
    code = code.replace(
      'company_id: conv.company_id || conv.companyId || null,',
      `company_id: conv.company_id || conv.companyId || null,
    unit_id: conv.unit_id || conv.unitId || null,
    client_user_id: conv.client_user_id || conv.clientUserId || null,
    requester: conv.contact_name || conv.contactName || null,`,
    )
  }
  await prisma.moduleRoute.update({
    where: { id: route.id },
    data: { controllerCode: code },
  })
  console.log('PATCHED POST /whatsapp/:id/ticket with client_user_id')
}

async function patchConversationPatchAllow(appId: string) {
  const route = await prisma.moduleRoute.findFirst({
    where: { method: 'PATCH', path: '/whatsapp/:id', module: { appId } },
  })
  if (!route?.controllerCode) return
  let code = route.controllerCode
  if (code.includes('client_user_id')) {
    console.log('PATCH /whatsapp/:id already allows client_user_id')
    return
  }
  code = code.replace(
    'if (body.close_reason_id !== undefined) patch.close_reason_id = body.close_reason_id;',
    `if (body.close_reason_id !== undefined) patch.close_reason_id = body.close_reason_id;
  if (body.client_user_id !== undefined) patch.client_user_id = body.client_user_id;
  if (body.clientUserId !== undefined) patch.client_user_id = body.clientUserId;
  if (body.unit_id !== undefined) patch.unit_id = body.unit_id;
  if (body.unitId !== undefined) patch.unit_id = body.unitId;
  if (body.company_id !== undefined) patch.company_id = body.company_id;
  if (body.companyId !== undefined) patch.company_id = body.companyId;`,
  )
  await prisma.moduleRoute.update({
    where: { id: route.id },
    data: { controllerCode: code },
  })
  console.log('PATCHED PATCH /whatsapp/:id allow identification fields')
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)
  await ensureConversationFields(app.id)
  const n = await upsertControllers(app.id)
  await patchGetConversationDetail(app.id)
  await patchTicketFromWhatsApp(app.id)
  await patchConversationPatchAllow(app.id)
  console.log({ updatedControllers: n })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
