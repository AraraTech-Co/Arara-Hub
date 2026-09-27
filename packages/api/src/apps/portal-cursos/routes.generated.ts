/** @generated from data/exports/portal-cursos/routes.json — run: npm run codegen:routes */
import type { StaticRoute } from '../../lib/handler-ctx.js'
import { compileController } from '../../lib/compile-controller.js'

export const PortalCursosRoutes: StaticRoute[] = [
  // 0 courses DELETE /courses/:id (56c1c4de)
  {
    module: "courses",
    method: "DELETE",
    path: "/courses/:id",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62o9000hok5yext5zngm",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Course = ctx.models.Course;\n  var Lesson = ctx.models.Lesson;\n  if (!Course) return ctx.reply.status(500).send({ error: \"Model Course missing\" });\n  var id = ctx.params.id;\n  var cur = await Course.findById(id);\n  if (!cur) return ctx.reply.status(404).send({ error: \"Course not found\" });\n  if (Lesson) {\n    var lessons = await Lesson.findMany({}) || [];\n    for (var i = 0; i < lessons.length; i++) {\n      if (String(lessons[i].course_id || lessons[i].courseId) === String(id)) {\n        await Lesson.delete(lessons[i].id);\n      }\n    }\n  }\n  await Course.delete(id);\n  return ctx.reply.status(204).send();\n}\nmodule.exports = { handler };\n"),
  },
  // 1 courses DELETE /lessons/:id (973871d7)
  {
    module: "courses",
    method: "DELETE",
    path: "/lessons/:id",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62oc000nok5yasa1t7l2",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Lesson = ctx.models.Lesson;\n  if (!Lesson) return ctx.reply.status(500).send({ error: \"Model Lesson missing\" });\n  var id = ctx.params.id;\n  var cur = await Lesson.findById(id);\n  if (!cur) return ctx.reply.status(404).send({ error: \"Lesson not found\" });\n  await Lesson.delete(id);\n  return ctx.reply.status(204).send();\n}\nmodule.exports = { handler };\n"),
  },
  // 2 courses GET /courses (f0b9f84e)
  {
    module: "courses",
    method: "GET",
    path: "/courses",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62o30009ok5y349nqyoh",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Course = ctx.models.Course;\n  if (!Course) return ctx.reply.status(500).send({ error: \"Model Course missing\" });\n  var rows = await Course.findMany({}) || [];\n  var q = ctx.query || {};\n  if (q.published === \"true\" || q.published === true) {\n    rows = rows.filter(function(c) { return c.published !== false; });\n  }\n  var search = String(q.q || q.search || \"\").toLowerCase().trim();\n  if (search) {\n    rows = rows.filter(function(c) {\n      var title = String(c.title || \"\").toLowerCase();\n      var summary = String(c.summary || \"\").toLowerCase();\n      var tags = Array.isArray(c.tags) ? c.tags.join(\" \").toLowerCase() : \"\";\n      return title.indexOf(search) >= 0 || summary.indexOf(search) >= 0 || tags.indexOf(search) >= 0;\n    });\n  }\n  rows.sort(function(a, b) {\n    var ao = Number(a.sort_order || 0), bo = Number(b.sort_order || 0);\n    if (ao !== bo) return ao - bo;\n    return String(a.title || \"\").localeCompare(String(b.title || \"\"));\n  });\n  return ctx.reply.send({ data: rows, count: rows.length });\n}\nmodule.exports = { handler };\n"),
  },
  // 3 courses GET /courses/:slug (2d2f02dc)
  {
    module: "courses",
    method: "GET",
    path: "/courses/:slug",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62o5000bok5y9slvy49c",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Course = ctx.models.Course;\n  var Lesson = ctx.models.Lesson;\n  if (!Course || !Lesson) return ctx.reply.status(500).send({ error: \"Models missing\" });\n  var slug = ctx.params.slug;\n  var courses = await Course.findMany({}) || [];\n  var course = null;\n  for (var i = 0; i < courses.length; i++) {\n    if (String(courses[i].slug) === slug || String(courses[i].id) === slug) { course = courses[i]; break; }\n  }\n  if (!course) return ctx.reply.status(404).send({ error: \"Course not found\" });\n  var lessons = (await Lesson.findMany({}) || []).filter(function(l) {\n    return String(l.course_id || l.courseId) === String(course.id);\n  });\n  lessons.sort(function(a, b) {\n    return Number(a.sort_order || 0) - Number(b.sort_order || 0);\n  });\n  return ctx.reply.send({ data: { course: course, lessons: lessons } });\n}\nmodule.exports = { handler };\n"),
  },
  // 4 courses PATCH /courses/:id (de5fe729)
  {
    module: "courses",
    method: "PATCH",
    path: "/courses/:id",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62o8000fok5yc0zs1f2e",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Course = ctx.models.Course;\n  if (!Course) return ctx.reply.status(500).send({ error: \"Model Course missing\" });\n  var id = ctx.params.id;\n  var cur = await Course.findById(id);\n  if (!cur) return ctx.reply.status(404).send({ error: \"Course not found\" });\n  var body = ctx.body || {};\n  var patch = { updated_at: nowIso() };\n  if (body.title !== undefined) patch.title = String(body.title).trim();\n  if (body.slug !== undefined) patch.slug = String(body.slug).trim();\n  if (body.summary !== undefined) patch.summary = String(body.summary);\n  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];\n  if (body.published !== undefined) patch.published = Boolean(body.published);\n  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);\n  var updated = await Course.update(id, patch);\n  return ctx.reply.send({ data: updated });\n}\nmodule.exports = { handler };\n"),
  },
  // 5 courses PATCH /lessons/:id (c5179fc1)
  {
    module: "courses",
    method: "PATCH",
    path: "/lessons/:id",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62ob000lok5yjedwl9yg",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Lesson = ctx.models.Lesson;\n  if (!Lesson) return ctx.reply.status(500).send({ error: \"Model Lesson missing\" });\n  var id = ctx.params.id;\n  var cur = await Lesson.findById(id);\n  if (!cur) return ctx.reply.status(404).send({ error: \"Lesson not found\" });\n  var body = ctx.body || {};\n  var patch = { updated_at: nowIso() };\n  if (body.title !== undefined) patch.title = String(body.title).trim();\n  if (body.slug !== undefined) patch.slug = String(body.slug).trim();\n  if (body.body_markdown !== undefined) patch.body_markdown = String(body.body_markdown);\n  if (body.bodyMarkdown !== undefined) patch.body_markdown = String(body.bodyMarkdown);\n  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);\n  if (body.published !== undefined) patch.published = Boolean(body.published);\n  var updated = await Lesson.update(id, patch);\n  return ctx.reply.send({ data: updated });\n}\nmodule.exports = { handler };\n"),
  },
  // 6 courses POST /courses (b986ebc0)
  {
    module: "courses",
    method: "POST",
    path: "/courses",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62o7000dok5yub0y9vm1",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Course = ctx.models.Course;\n  if (!Course) return ctx.reply.status(500).send({ error: \"Model Course missing\" });\n  var body = ctx.body || {};\n  var title = String(body.title || \"\").trim();\n  if (!title) return ctx.reply.status(400).send({ error: \"title required\" });\n  var slug = String(body.slug || slugify(title)).trim();\n  var existing = await Course.findMany({}) || [];\n  for (var i = 0; i < existing.length; i++) {\n    if (String(existing[i].slug) === slug) return ctx.reply.status(409).send({ error: \"slug already exists\" });\n  }\n  var ts = nowIso();\n  var row = await Course.create({\n    id: uid(\"crs\"),\n    title: title,\n    slug: slug,\n    summary: String(body.summary || \"\"),\n    tags: Array.isArray(body.tags) ? body.tags : [],\n    published: body.published !== false,\n    sort_order: Number(body.sort_order != null ? body.sort_order : existing.length),\n    created_by: ctx.user.id,\n    created_at: ts,\n    updated_at: ts,\n  });\n  try {\n    if (typeof ctx.notify === \"function\" && ctx.user && ctx.user.id) {\n      await ctx.notify({\n        userId: ctx.user.id,\n        title: \"Curso criado\",\n        body: \"O curso \\\"\" + title + \"\\\" foi publicado no Portal de Cursos.\",\n        severity: \"success\",\n        href: \"https://cursos.arara-tech.com/courses/\" + encodeURIComponent(slug),\n        sourceApp: \"portal-cursos\",\n      });\n    }\n  } catch (e) {}\n  return ctx.reply.status(201).send({ data: row });\n}\nmodule.exports = { handler };\n"),
  },
  // 7 courses POST /courses/:id/lessons (2605c1b8)
  {
    module: "courses",
    method: "POST",
    path: "/courses/:id/lessons",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmspb62oa000jok5yzmcwhnat",
    handler: compileController("async function handler(ctx) {\n\nfunction requireStaff(ctx) {\n  var u = ctx.user;\n  if (!u || !u.id) {\n    return ctx.reply.status(401).send({ error: \"JWT required (staff only)\" });\n  }\n  var roles = u.roles || [];\n  var ok = false;\n  for (var i = 0; i < roles.length; i++) {\n    var r = String(roles[i] || \"\").toLowerCase();\n    if (r === \"support\" || r === \"developer\" || r === \"admin\" || r === \"master\") { ok = true; break; }\n  }\n  if (!ok) return ctx.reply.status(403).send({ error: \"Requires support, developer or admin role\" });\n  return null;\n}\nfunction nowIso() { return new Date().toISOString(); }\nfunction uid(p) { return (p || \"id\") + \"_\" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }\nfunction slugify(s) {\n  return String(s || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\")\n    .slice(0, 80) || \"item\";\n}\n\n  var denied = requireStaff(ctx); if (denied) return denied;\n  var Course = ctx.models.Course;\n  var Lesson = ctx.models.Lesson;\n  if (!Course || !Lesson) return ctx.reply.status(500).send({ error: \"Models missing\" });\n  var courseId = ctx.params.id;\n  var course = await Course.findById(courseId);\n  if (!course) return ctx.reply.status(404).send({ error: \"Course not found\" });\n  var body = ctx.body || {};\n  var title = String(body.title || \"\").trim();\n  if (!title) return ctx.reply.status(400).send({ error: \"title required\" });\n  var slug = String(body.slug || slugify(title)).trim();\n  var siblings = (await Lesson.findMany({}) || []).filter(function(l) {\n    return String(l.course_id || l.courseId) === String(courseId);\n  });\n  var ts = nowIso();\n  var row = await Lesson.create({\n    id: uid(\"les\"),\n    course_id: courseId,\n    title: title,\n    slug: slug,\n    body_markdown: String(body.body_markdown != null ? body.body_markdown : body.bodyMarkdown || \"\"),\n    sort_order: Number(body.sort_order != null ? body.sort_order : siblings.length),\n    published: body.published !== false,\n    created_by: ctx.user.id,\n    created_at: ts,\n    updated_at: ts,\n  });\n  return ctx.reply.status(201).send({ data: row });\n}\nmodule.exports = { handler };\n"),
  }
]
