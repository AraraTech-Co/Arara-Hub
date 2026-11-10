/**
 * Domain controllers for portal-crm beyond generic CRUD.
 *
 * Run (from platform/):
 *   npx tsx scripts/portal-crm/enrich-controllers.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-crm'
const MODULE_NAME = 'crm-domain'

type Spec = { method: string; path: string; code: string }

const CONTROLLERS: Spec[] = [
  {
    method: 'GET',
    path: '/leads',
    code: `async function handler(ctx) {
  var Client = ctx.models.Client;
  if (!Client) return ctx.reply.status(500).send({ error: "Model Client missing" });
  var q = (ctx.query && ctx.query.q) ? String(ctx.query.q).toLowerCase() : "";
  var all = await Client.findMany({});
  var rows = all.filter(function (c) {
    if (c.type !== "lead") return false;
    if (c.ownerId != null && c.ownerId !== "") return false;
    if (!q) return true;
    var name = String(c.name || "").toLowerCase();
    var company = String(c.company || "").toLowerCase();
    var tags = Array.isArray(c.tags) ? c.tags.join(" ").toLowerCase() : "";
    return name.indexOf(q) >= 0 || company.indexOf(q) >= 0 || tags.indexOf(q) >= 0;
  });
  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/leads/:id/claim',
    code: `async function handler(ctx) {
  var Client = ctx.models.Client;
  if (!Client) return ctx.reply.status(500).send({ error: "Model Client missing" });
  var user = ctx.user || {};
  var uid = user.id || user.userId;
  if (!uid) return ctx.reply.status(401).send({ error: "Unauthorized" });
  var id = String((ctx.params && ctx.params.id) || "");
  var row = await Client.findById(id);
  if (!row) return ctx.reply.status(404).send({ error: "Lead não encontrado" });
  if (row.type !== "lead") return ctx.reply.status(400).send({ error: "Não é um lead" });
  if (row.ownerId != null && row.ownerId !== "") {
    return ctx.reply.status(409).send({ error: "Este lead já foi pego por outro vendedor." });
  }
  var updated = await Client.update(id, {
    ownerId: uid,
    updatedAt: new Date().toISOString(),
  });
  return ctx.reply.send({ success: true, client: updated });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/clients',
    code: `async function handler(ctx) {
  var Client = ctx.models.Client;
  if (!Client) return ctx.reply.status(500).send({ error: "Model Client missing" });
  var q = ctx.query || {};
  var search = q.q ? String(q.q).toLowerCase() : "";
  var tipo = q.tipo || q.type || "";
  var ownerId = q.ownerId;
  var scopeOwner = q.scopeOwner;
  var all = await Client.findMany({});
  var rows = all.filter(function (c) {
    if (ownerId === "null" || ownerId === "__null__") {
      if (c.ownerId != null && c.ownerId !== "") return false;
    } else if (ownerId) {
      if (String(c.ownerId) !== String(ownerId)) return false;
    } else if (scopeOwner) {
      // exclude pool when listing "my/team" clients
      if (c.ownerId == null || c.ownerId === "") return false;
      if (scopeOwner !== "admin" && String(c.ownerId) !== String(scopeOwner)) return false;
    } else {
      if (c.ownerId == null || c.ownerId === "") return false;
    }
    if (tipo === "lead" || tipo === "cliente") {
      if (c.type !== tipo) return false;
    }
    if (!search) return true;
    var name = String(c.name || "").toLowerCase();
    var company = String(c.company || "").toLowerCase();
    return name.indexOf(search) >= 0 || company.indexOf(search) >= 0;
  });
  rows.sort(function (a, b) {
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return ctx.reply.send({ data: rows.slice(0, 200), count: rows.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/clients',
    code: `async function handler(ctx) {
  var Client = ctx.models.Client;
  if (!Client) return ctx.reply.status(500).send({ error: "Model Client missing" });
  function soDigitos(v){ return String(v==null?'':v).replace(/\\D/g,''); }
  function cnpjValido(d){
    if(!/^\\d{14}$/.test(d) || /^(\\d)\\1{13}$/.test(d)) return false;
    function dv(base){ var pesos=base.length===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2]; var s=0; for(var i=0;i<base.length;i++) s+=Number(base[i])*pesos[i]; var r=s%11; return r<2?0:11-r; }
    var d1=dv(d.slice(0,12)); var d2=dv(d.slice(0,12)+d1);
    return d[12]===String(d1) && d[13]===String(d2);
  }
  var PORTES=['ME','EPP','Medio','Grande'];
  // Normaliza e valida os campos do item 2. Devolve { erro } ou { valores } so com as chaves presentes no corpo.
  function camposDoProspect(b){
    var v={};
    if(b.cnpj!==undefined){
      var d=soDigitos(b.cnpj);
      if(d==='') v.cnpj=null;
      else if(!cnpjValido(d)) return { erro:'CNPJ inválido' };
      else v.cnpj=d;
    }
    var links=['linkedinEmpresa','linkedinDecisor'];
    for(var i=0;i<links.length;i++){
      var k=links[i];
      if(b[k]===undefined) continue;
      var u=String(b[k]==null?'':b[k]).trim();
      if(u==='') { v[k]=null; continue; }
      if(!/^https?:\\/\\/\\S+$/i.test(u)) return { erro:'Link do LinkedIn inválido' };
      v[k]=u;
    }
    if(b.porte!==undefined){
      if(b.porte===null||b.porte==='') v.porte=null;
      else if(PORTES.indexOf(b.porte)<0) return { erro:'Porte inválido' };
      else v.porte=b.porte;
    }
    if(b.qtdLojas!==undefined){
      if(b.qtdLojas===null||b.qtdLojas==='') v.qtdLojas=null;
      else { var n=Number(b.qtdLojas); if(!Number.isInteger(n)||n<0) return { erro:'Nº de lojas inválido' }; v.qtdLojas=n; }
    }
    return { valores:v };
  }
  async function duplicadoDe(Client, cnpj){
    var achados=await Client.findMany({ cnpj:cnpj, limit:1 });
    return achados[0] || null;
  }
  var user = ctx.user || {};
  var uid = user.id || user.userId;
  var body = Object.assign({}, ctx.body || {});
  var now = new Date().toISOString();
  if (!body.name) return ctx.reply.status(400).send({ error: "name required" });
  var confirmar = body.confirmarDuplicado === true;
  delete body.confirmarDuplicado;
  var campos = camposDoProspect(body);
  if (campos.erro) return ctx.reply.status(400).send({ error: campos.erro });
  Object.assign(body, campos.valores);
  if (body.cnpj === null) delete body.cnpj;
  if (!body.type) body.type = "lead";
  if (body.ownerId === undefined) body.ownerId = uid || null;
  if (!Array.isArray(body.tags)) body.tags = body.tags ? [String(body.tags)] : [];
  body.createdAt = body.createdAt || now;
  body.updatedAt = now;
  if (body.id === undefined) body.id = ctx.randomUUID();
  try {
    if (body.cnpj && !confirmar) {
      var dup = await duplicadoDe(Client, body.cnpj);
      if (dup) return ctx.reply.status(409).send({ error: "Já existe um cadastro com este CNPJ", duplicado: { id: dup.id, name: dup.name } });
    }
    var row = await Client.create(body);
    return ctx.reply.status(201).send(row);
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/clients/:id',
    code: `async function handler(ctx) {
  var Client = ctx.models.Client;
  if (!Client) return ctx.reply.status(500).send({ error: "Model Client missing" });
  function soDigitos(v){ return String(v==null?'':v).replace(/\\D/g,''); }
  function cnpjValido(d){
    if(!/^\\d{14}$/.test(d) || /^(\\d)\\1{13}$/.test(d)) return false;
    function dv(base){ var pesos=base.length===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2]; var s=0; for(var i=0;i<base.length;i++) s+=Number(base[i])*pesos[i]; var r=s%11; return r<2?0:11-r; }
    var d1=dv(d.slice(0,12)); var d2=dv(d.slice(0,12)+d1);
    return d[12]===String(d1) && d[13]===String(d2);
  }
  var PORTES=['ME','EPP','Medio','Grande'];
  // Normaliza e valida os campos do item 2. Devolve { erro } ou { valores } so com as chaves presentes no corpo.
  function camposDoProspect(b){
    var v={};
    if(b.cnpj!==undefined){
      var d=soDigitos(b.cnpj);
      if(d==='') v.cnpj=null;
      else if(!cnpjValido(d)) return { erro:'CNPJ inválido' };
      else v.cnpj=d;
    }
    var links=['linkedinEmpresa','linkedinDecisor'];
    for(var i=0;i<links.length;i++){
      var k=links[i];
      if(b[k]===undefined) continue;
      var u=String(b[k]==null?'':b[k]).trim();
      if(u==='') { v[k]=null; continue; }
      if(!/^https?:\\/\\/\\S+$/i.test(u)) return { erro:'Link do LinkedIn inválido' };
      v[k]=u;
    }
    if(b.porte!==undefined){
      if(b.porte===null||b.porte==='') v.porte=null;
      else if(PORTES.indexOf(b.porte)<0) return { erro:'Porte inválido' };
      else v.porte=b.porte;
    }
    if(b.qtdLojas!==undefined){
      if(b.qtdLojas===null||b.qtdLojas==='') v.qtdLojas=null;
      else { var n=Number(b.qtdLojas); if(!Number.isInteger(n)||n<0) return { erro:'Nº de lojas inválido' }; v.qtdLojas=n; }
    }
    return { valores:v };
  }
  async function duplicadoDe(Client, cnpj){
    var achados=await Client.findMany({ cnpj:cnpj, limit:1 });
    return achados[0] || null;
  }
  var uid = ctx.user && ctx.user.id;
  if (!uid) return ctx.reply.status(401).send({ error: "Auth necessaria" });
  var id = String((ctx.params && ctx.params.id) || "");
  var b = ctx.body || {};
  try {
    var atual = await Client.findById(id);
    if (!atual) return ctx.reply.status(404).send({ error: "Not found" });
    var perfil = ctx.models.Profile ? await ctx.models.Profile.findById(uid) : null;
    var gestor = !!perfil && (perfil.role === "gerente" || perfil.role === "admin");
    if (!gestor && String(atual.ownerId || "") !== String(uid)) {
      return ctx.reply.status(403).send({ error: "Só o dono do lead ou o gestor pode editar" });
    }
    // Monta o que grava campo a campo; o resto do corpo é ignorado.
    var patch = {};
    var textos = ["name", "company", "email", "phone", "notes"];
    for (var i = 0; i < textos.length; i++) {
      var k = textos[i];
      if (b[k] === undefined) continue;
      var t = b[k] == null ? "" : String(b[k]).trim();
      patch[k] = t === "" ? null : t;
    }
    if (patch.name === null) return ctx.reply.status(400).send({ error: "name required" });
    if (b.type !== undefined) {
      if (b.type !== "lead" && b.type !== "cliente") return ctx.reply.status(400).send({ error: "Tipo inválido" });
      patch.type = b.type;
    }
    if (b.tags !== undefined) {
      patch.tags = Array.isArray(b.tags) ? b.tags.map(function (x) { return String(x).trim(); }).filter(Boolean) : [];
    }
    var campos = camposDoProspect(b);
    if (campos.erro) return ctx.reply.status(400).send({ error: campos.erro });
    Object.assign(patch, campos.valores);
    if (patch.cnpj && patch.cnpj !== atual.cnpj && b.confirmarDuplicado !== true) {
      var dup = await duplicadoDe(Client, patch.cnpj);
      if (dup) return ctx.reply.status(409).send({ error: "Já existe um cadastro com este CNPJ", duplicado: { id: dup.id, name: dup.name } });
    }
    patch.updatedAt = new Date().toISOString();
    var row = await Client.update(id, patch);
    if (!row) return ctx.reply.status(404).send({ error: "Not found" });
    return ctx.reply.send(row);
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/deals',
    code: `async function handler(ctx) {
  var Deal = ctx.models.Deal;
  var Client = ctx.models.Client;
  if (!Deal) return ctx.reply.status(500).send({ error: "Model Deal missing" });
  var q = ctx.query || {};
  var status = q.status || "open";
  var ownerId = q.ownerId;
  var all = await Deal.findMany({});
  var clients = Client ? await Client.findMany({}) : [];
  var byId = {};
  clients.forEach(function (c) { byId[c.id] = c; });
  var rows = all.filter(function (d) {
    if (status && status !== "all" && d.status !== status) return false;
    if (ownerId && String(d.ownerId) !== String(ownerId)) return false;
    return true;
  });
  var data = rows.map(function (d) {
    var c = byId[d.clientId];
    return Object.assign({}, d, {
      value: d.value != null ? Number(d.value) : null,
      client: c ? { id: c.id, name: c.name } : { id: d.clientId, name: "—" },
    });
  });
  return ctx.reply.send({ data: data, count: data.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/deals',
    code: `async function handler(ctx) {
  var Deal = ctx.models.Deal;
  var Stage = ctx.models.Stage;
  if (!Deal) return ctx.reply.status(500).send({ error: "Model Deal missing" });
  var user = ctx.user || {};
  var uid = user.id || user.userId;
  var body = Object.assign({}, ctx.body || {});
  var now = new Date().toISOString();
  if (!body.title || !body.clientId) {
    return ctx.reply.status(400).send({ error: "title and clientId required" });
  }
  if (!body.ownerId) body.ownerId = uid;
  if (!body.stageId && Stage) {
    var stages = await Stage.findMany({});
    stages.sort(function (a, b) { return Number(a.order || 0) - Number(b.order || 0); });
    if (stages[0]) body.stageId = stages[0].id;
  }
  if (!body.stageId) return ctx.reply.status(400).send({ error: "stageId required" });
  body.status = body.status || "open";
  body.stageHistory = Array.isArray(body.stageHistory) ? body.stageHistory : [];
  body.createdAt = now;
  body.updatedAt = now;
  try {
    var row = await Deal.create(body);
    return ctx.reply.status(201).send(row);
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/deals/:id/stage',
    code: `async function handler(ctx) {
  var Deal = ctx.models.Deal;
  var Stage = ctx.models.Stage;
  if (!Deal) return ctx.reply.status(500).send({ error: "Model Deal missing" });
  var id = String((ctx.params && ctx.params.id) || "");
  var stageId = (ctx.body && ctx.body.stageId) || null;
  if (!stageId) return ctx.reply.status(400).send({ error: "stageId required" });
  var deal = await Deal.findById(id);
  if (!deal) return ctx.reply.status(404).send({ error: "Negociação não encontrada" });
  if (Stage) {
    var st = await Stage.findById(String(stageId));
    if (!st) return ctx.reply.status(400).send({ error: "Etapa inválida" });
  }
  var history = Array.isArray(deal.stageHistory) ? deal.stageHistory.slice() : [];
  history.push({ stageId: String(stageId), movedAt: new Date().toISOString() });
  var updated = await Deal.update(id, {
    stageId: String(stageId),
    stageHistory: history,
    updatedAt: new Date().toISOString(),
  });
  return ctx.reply.send(updated);
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/deals/:id',
    code: `async function handler(ctx) {
  var Deal = ctx.models.Deal;
  var Client = ctx.models.Client;
  if (!Deal) return ctx.reply.status(500).send({ error: "Model Deal missing" });
  var id = String((ctx.params && ctx.params.id) || "");
  var body = Object.assign({}, ctx.body || {});
  var deal = await Deal.findById(id);
  if (!deal) return ctx.reply.status(404).send({ error: "Negociação não encontrada" });
  body.updatedAt = new Date().toISOString();
  if (body.status === "won" || body.status === "lost") {
    body.closedAt = body.closedAt || new Date().toISOString();
  }
  var updated = await Deal.update(id, body);
  if (body.status === "won" && Client && deal.clientId) {
    try {
      await Client.update(deal.clientId, { type: "cliente", updatedAt: new Date().toISOString() });
    } catch (e) {}
  }
  return ctx.reply.send(updated);
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/activities',
    code: `async function handler(ctx) {
  var Activity = ctx.models.Activity;
  var Client = ctx.models.Client;
  if (!Activity) return ctx.reply.status(500).send({ error: "Model Activity missing" });
  var q = ctx.query || {};
  var ownerId = q.ownerId;
  var all = await Activity.findMany({});
  var clients = Client ? await Client.findMany({}) : [];
  var byId = {};
  clients.forEach(function (c) { byId[c.id] = c; });
  var rows = all.filter(function (a) {
    if (ownerId && String(a.ownerId) !== String(ownerId)) return false;
    return true;
  });
  rows.sort(function (a, b) {
    return String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || ""));
  });
  var data = rows.map(function (a) {
    var c = a.clientId ? byId[a.clientId] : null;
    return Object.assign({}, a, { client: c ? { id: c.id, name: c.name } : null });
  });
  return ctx.reply.send({ data: data, count: data.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/activities',
    code: `async function handler(ctx) {
  var Activity = ctx.models.Activity;
  if (!Activity) return ctx.reply.status(500).send({ error: "Model Activity missing" });
  var user = ctx.user || {};
  var uid = user.id || user.userId;
  var body = Object.assign({}, ctx.body || {});
  var now = new Date().toISOString();
  if (!body.type || !body.scheduledAt) {
    return ctx.reply.status(400).send({ error: "type and scheduledAt required" });
  }
  if (!body.ownerId) body.ownerId = uid;
  body.reminderSent = !!body.reminderSent;
  body.createdAt = now;
  body.updatedAt = now;
  try {
    var row = await Activity.create(body);
    return ctx.reply.status(201).send(row);
  } catch (e) {
    return ctx.reply.status(400).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/activities/:id/complete',
    code: `async function handler(ctx) {
  var Activity = ctx.models.Activity;
  if (!Activity) return ctx.reply.status(500).send({ error: "Model Activity missing" });
  var id = String((ctx.params && ctx.params.id) || "");
  var body = ctx.body || {};
  var row = await Activity.findById(id);
  if (!row) return ctx.reply.status(404).send({ error: "Atividade não encontrada" });
  var patch = {
    doneAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (body.notes != null) patch.notes = body.notes;
  var updated = await Activity.update(id, patch);
  return ctx.reply.send(updated);
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/stages',
    code: `async function handler(ctx) {
  var Stage = ctx.models.Stage;
  if (!Stage) return ctx.reply.status(500).send({ error: "Model Stage missing" });
  var all = await Stage.findMany({});
  var rows = all.filter(function (s) { return s.active !== false; });
  rows.sort(function (a, b) { return Number(a.order || 0) - Number(b.order || 0); });
  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/stages',
    code: `async function handler(ctx) {
  var Stage = ctx.models.Stage;
  if (!Stage) return ctx.reply.status(500).send({ error: "Model Stage missing" });
  var body = Object.assign({}, ctx.body || {});
  var now = new Date().toISOString();
  if (!body.name) return ctx.reply.status(400).send({ error: "name required" });
  body.order = Number(body.order || 0);
  body.color = body.color || "#6366f1";
  body.active = body.active !== false;
  body.createdAt = now;
  body.updatedAt = now;
  var row = await Stage.create(body);
  return ctx.reply.status(201).send(row);
}
module.exports = { handler };`,
  },
  {
    method: 'PATCH',
    path: '/stages/:id',
    code: `async function handler(ctx) {
  var Stage = ctx.models.Stage;
  if (!Stage) return ctx.reply.status(500).send({ error: "Model Stage missing" });
  var id = String((ctx.params && ctx.params.id) || "");
  var body = Object.assign({}, ctx.body || {});
  body.updatedAt = new Date().toISOString();
  var row = await Stage.update(id, body);
  if (!row) return ctx.reply.status(404).send({ error: "Not found" });
  return ctx.reply.send(row);
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/goals',
    code: `async function handler(ctx) {
  var Goal = ctx.models.Goal;
  if (!Goal) return ctx.reply.status(500).send({ error: "Model Goal missing" });
  var q = ctx.query || {};
  var all = await Goal.findMany({});
  var rows = all.filter(function (g) {
    if (q.userId && String(g.userId) !== String(q.userId)) return false;
    if (q.periodMonth && Number(g.periodMonth) !== Number(q.periodMonth)) return false;
    if (q.periodYear && Number(g.periodYear) !== Number(q.periodYear)) return false;
    return true;
  });
  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };`,
  },
  {
    method: 'POST',
    path: '/goals',
    code: `async function handler(ctx) {
  var Goal = ctx.models.Goal;
  if (!Goal) return ctx.reply.status(500).send({ error: "Model Goal missing" });
  var body = Object.assign({}, ctx.body || {});
  var now = new Date().toISOString();
  if (!body.userId || body.periodMonth == null || body.periodYear == null) {
    return ctx.reply.status(400).send({ error: "userId, periodMonth, periodYear required" });
  }
  body.targetValue = Number(body.targetValue || 0);
  body.targetDeals = Number(body.targetDeals || 0);
  body.createdAt = now;
  body.updatedAt = now;
  var row = await Goal.create(body);
  return ctx.reply.status(201).send(row);
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/teams',
    code: `async function handler(ctx) {
  var Team = ctx.models.Team;
  if (!Team) return ctx.reply.status(500).send({ error: "Model Team missing" });
  var all = await Team.findMany({});
  return ctx.reply.send({ data: all, count: all.length });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/profiles',
    code: `async function handler(ctx) {
  var Profile = ctx.models.Profile;
  if (!Profile) return ctx.reply.status(500).send({ error: "Model Profile missing" });
  var all = await Profile.findMany({});
  return ctx.reply.send({ data: all, count: all.length });
}
module.exports = { handler };`,
  },
  {
    method: 'GET',
    path: '/me/profile',
    code: `async function handler(ctx) {
  var Profile = ctx.models.Profile;
  var user = ctx.user || {};
  var uid = user.id || user.userId;
  if (!uid) return ctx.reply.status(401).send({ error: "Unauthorized" });
  if (!Profile) {
    return ctx.reply.send({
      id: uid,
      email: user.email || null,
      fullName: user.name || null,
      role: "vendedor",
    });
  }
  var row = await Profile.findById(String(uid));
  if (!row) {
    return ctx.reply.send({
      id: uid,
      email: user.email || null,
      fullName: user.name || null,
      role: "vendedor",
    });
  }
  return ctx.reply.send(row);
}
module.exports = { handler };`,
  },
]

async function ensureModule(appId: string) {
  let mod = await prisma.module.findFirst({ where: { appId, name: MODULE_NAME } })
  if (!mod) {
    mod = await prisma.module.create({
      data: {
        appId,
        name: MODULE_NAME,
        status: 'published',
        description: 'CRM domain controllers (leads, deals, activities)',
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

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)
  const mod = await ensureModule(app.id)

  let updated = 0
  for (const spec of CONTROLLERS) {
    const route = await prisma.moduleRoute.findFirst({
      where: { method: spec.method, path: spec.path, moduleId: mod.id },
    })
    if (!route) {
      // also check other modules (avoid duplicates)
      const any = await prisma.moduleRoute.findFirst({
        where: {
          method: spec.method,
          path: spec.path,
          module: { appId: app.id },
        },
      })
      if (any) {
        await prisma.moduleRoute.update({
          where: { id: any.id },
          data: { controllerCode: spec.code },
        })
        console.log('UPDATED', spec.method, spec.path)
      } else {
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
      }
    } else {
      await prisma.moduleRoute.update({
        where: { id: route.id },
        data: { controllerCode: spec.code },
      })
      console.log('UPDATED', spec.method, spec.path)
    }
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
