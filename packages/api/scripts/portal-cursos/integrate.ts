/**
 * Integrate portal-cursos: app, Course/Lesson models, controllers, staff memberships, seed.
 *
 *   npx tsx scripts/portal-cursos/integrate.ts
 *   # against prod DATABASE_URL:
 *   DATABASE_URL=... npx tsx scripts/portal-cursos/integrate.ts
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type Prisma } from '@prisma/client'
import { hashPassword, hashApiKey, appScopes } from '../../src/lib/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DATA = path.join(ROOT, 'data')
const SLUG = 'portal-cursos'
const APP_NAME = 'Portal de Cursos'

const prisma = new PrismaClient()

const STAFF_ROLES = new Set(['support', 'developer', 'admin', 'master'])

const COURSE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array' },
    published: { type: 'boolean' },
    sort_order: { type: 'number' },
    created_by: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'title', 'slug'],
}

const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    course_id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    body_markdown: { type: 'string' },
    sort_order: { type: 'number' },
    published: { type: 'boolean' },
    created_by: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'course_id', 'title', 'slug'],
}

const STAFF_GATE = `
function requireStaff(ctx) {
  var u = ctx.user;
  if (!u || !u.id) {
    return ctx.reply.status(401).send({ error: "JWT required (staff only)" });
  }
  var roles = u.roles || [];
  var ok = false;
  for (var i = 0; i < roles.length; i++) {
    var r = String(roles[i] || "").toLowerCase();
    if (r === "support" || r === "developer" || r === "admin" || r === "master") { ok = true; break; }
  }
  if (!ok) return ctx.reply.status(403).send({ error: "Requires support, developer or admin role" });
  return null;
}
function nowIso() { return new Date().toISOString(); }
function uid(p) { return (p || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}
`

type Spec = { method: string; path: string; code: string }

const ROUTES: Spec[] = [
  {
    method: 'GET',
    path: '/courses',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Course = ctx.models.Course;
  if (!Course) return ctx.reply.status(500).send({ error: "Model Course missing" });
  var rows = await Course.findMany({}) || [];
  var q = ctx.query || {};
  if (q.published === "true" || q.published === true) {
    rows = rows.filter(function(c) { return c.published !== false; });
  }
  var search = String(q.q || q.search || "").toLowerCase().trim();
  if (search) {
    rows = rows.filter(function(c) {
      var title = String(c.title || "").toLowerCase();
      var summary = String(c.summary || "").toLowerCase();
      var tags = Array.isArray(c.tags) ? c.tags.join(" ").toLowerCase() : "";
      return title.indexOf(search) >= 0 || summary.indexOf(search) >= 0 || tags.indexOf(search) >= 0;
    });
  }
  rows.sort(function(a, b) {
    var ao = Number(a.sort_order || 0), bo = Number(b.sort_order || 0);
    if (ao !== bo) return ao - bo;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };
`,
  },
  {
    method: 'GET',
    path: '/courses/:slug',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Course = ctx.models.Course;
  var Lesson = ctx.models.Lesson;
  if (!Course || !Lesson) return ctx.reply.status(500).send({ error: "Models missing" });
  var slug = ctx.params.slug;
  var courses = await Course.findMany({}) || [];
  var course = null;
  for (var i = 0; i < courses.length; i++) {
    if (String(courses[i].slug) === slug || String(courses[i].id) === slug) { course = courses[i]; break; }
  }
  if (!course) return ctx.reply.status(404).send({ error: "Course not found" });
  var lessons = (await Lesson.findMany({}) || []).filter(function(l) {
    return String(l.course_id || l.courseId) === String(course.id);
  });
  lessons.sort(function(a, b) {
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });
  return ctx.reply.send({ data: { course: course, lessons: lessons } });
}
module.exports = { handler };
`,
  },
  {
    method: 'POST',
    path: '/courses',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Course = ctx.models.Course;
  if (!Course) return ctx.reply.status(500).send({ error: "Model Course missing" });
  var body = ctx.body || {};
  var title = String(body.title || "").trim();
  if (!title) return ctx.reply.status(400).send({ error: "title required" });
  var slug = String(body.slug || slugify(title)).trim();
  var existing = await Course.findMany({}) || [];
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].slug) === slug) return ctx.reply.status(409).send({ error: "slug already exists" });
  }
  var ts = nowIso();
  var row = await Course.create({
    id: uid("crs"),
    title: title,
    slug: slug,
    summary: String(body.summary || ""),
    tags: Array.isArray(body.tags) ? body.tags : [],
    published: body.published !== false,
    sort_order: Number(body.sort_order != null ? body.sort_order : existing.length),
    created_by: ctx.user.id,
    created_at: ts,
    updated_at: ts,
  });
  try {
    if (typeof ctx.notify === "function" && ctx.user && ctx.user.id) {
      await ctx.notify({
        userId: ctx.user.id,
        title: "Curso criado",
        body: "O curso \\"" + title + "\\" foi publicado no Portal de Cursos.",
        severity: "success",
        href: "https://cursos.arara-tech.com/courses/" + encodeURIComponent(slug),
        sourceApp: "portal-cursos",
      });
    }
  } catch (e) {}
  return ctx.reply.status(201).send({ data: row });
}
module.exports = { handler };
`,
  },
  {
    method: 'PATCH',
    path: '/courses/:id',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Course = ctx.models.Course;
  if (!Course) return ctx.reply.status(500).send({ error: "Model Course missing" });
  var id = ctx.params.id;
  var cur = await Course.findById(id);
  if (!cur) return ctx.reply.status(404).send({ error: "Course not found" });
  var body = ctx.body || {};
  var patch = { updated_at: nowIso() };
  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.slug !== undefined) patch.slug = String(body.slug).trim();
  if (body.summary !== undefined) patch.summary = String(body.summary);
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.published !== undefined) patch.published = Boolean(body.published);
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
  var updated = await Course.update(id, patch);
  return ctx.reply.send({ data: updated });
}
module.exports = { handler };
`,
  },
  {
    method: 'DELETE',
    path: '/courses/:id',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Course = ctx.models.Course;
  var Lesson = ctx.models.Lesson;
  if (!Course) return ctx.reply.status(500).send({ error: "Model Course missing" });
  var id = ctx.params.id;
  var cur = await Course.findById(id);
  if (!cur) return ctx.reply.status(404).send({ error: "Course not found" });
  if (Lesson) {
    var lessons = await Lesson.findMany({}) || [];
    for (var i = 0; i < lessons.length; i++) {
      if (String(lessons[i].course_id || lessons[i].courseId) === String(id)) {
        await Lesson.delete(lessons[i].id);
      }
    }
  }
  await Course.delete(id);
  return ctx.reply.status(204).send();
}
module.exports = { handler };
`,
  },
  {
    method: 'POST',
    path: '/courses/:id/lessons',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Course = ctx.models.Course;
  var Lesson = ctx.models.Lesson;
  if (!Course || !Lesson) return ctx.reply.status(500).send({ error: "Models missing" });
  var courseId = ctx.params.id;
  var course = await Course.findById(courseId);
  if (!course) return ctx.reply.status(404).send({ error: "Course not found" });
  var body = ctx.body || {};
  var title = String(body.title || "").trim();
  if (!title) return ctx.reply.status(400).send({ error: "title required" });
  var slug = String(body.slug || slugify(title)).trim();
  var siblings = (await Lesson.findMany({}) || []).filter(function(l) {
    return String(l.course_id || l.courseId) === String(courseId);
  });
  var ts = nowIso();
  var row = await Lesson.create({
    id: uid("les"),
    course_id: courseId,
    title: title,
    slug: slug,
    body_markdown: String(body.body_markdown != null ? body.body_markdown : body.bodyMarkdown || ""),
    sort_order: Number(body.sort_order != null ? body.sort_order : siblings.length),
    published: body.published !== false,
    created_by: ctx.user.id,
    created_at: ts,
    updated_at: ts,
  });
  return ctx.reply.status(201).send({ data: row });
}
module.exports = { handler };
`,
  },
  {
    method: 'PATCH',
    path: '/lessons/:id',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Lesson = ctx.models.Lesson;
  if (!Lesson) return ctx.reply.status(500).send({ error: "Model Lesson missing" });
  var id = ctx.params.id;
  var cur = await Lesson.findById(id);
  if (!cur) return ctx.reply.status(404).send({ error: "Lesson not found" });
  var body = ctx.body || {};
  var patch = { updated_at: nowIso() };
  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.slug !== undefined) patch.slug = String(body.slug).trim();
  if (body.body_markdown !== undefined) patch.body_markdown = String(body.body_markdown);
  if (body.bodyMarkdown !== undefined) patch.body_markdown = String(body.bodyMarkdown);
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
  if (body.published !== undefined) patch.published = Boolean(body.published);
  var updated = await Lesson.update(id, patch);
  return ctx.reply.send({ data: updated });
}
module.exports = { handler };
`,
  },
  {
    method: 'DELETE',
    path: '/lessons/:id',
    code: `async function handler(ctx) {
${STAFF_GATE}
  var denied = requireStaff(ctx); if (denied) return denied;
  var Lesson = ctx.models.Lesson;
  if (!Lesson) return ctx.reply.status(500).send({ error: "Model Lesson missing" });
  var id = ctx.params.id;
  var cur = await Lesson.findById(id);
  if (!cur) return ctx.reply.status(404).send({ error: "Lesson not found" });
  await Lesson.delete(id);
  return ctx.reply.status(204).send();
}
module.exports = { handler };
`,
  },
]

async function upsertModel(appId: string, storageName: string, schema: object) {
  await prisma.modelDef.upsert({
    where: { appId_name: { appId, name: storageName } },
    create: { appId, name: storageName, schema: schema as Prisma.InputJsonValue, version: 1 },
    update: { schema: schema as Prisma.InputJsonValue, version: { increment: 1 } },
  })
}

async function main() {
  mkdirSync(DATA, { recursive: true })

  const developer = await prisma.role.findUnique({ where: { name: 'developer' } })
  if (!developer) throw new Error('Run db:seed first (developer role missing)')

  const serviceEmail = `${SLUG}@arara.local`
  const servicePassword = `${SLUG}123`
  const owner = await prisma.user.upsert({
    where: { email: serviceEmail },
    create: {
      id: 'svc_portal_cursos',
      email: serviceEmail,
      name: `${APP_NAME} Service`,
      passwordHash: await hashPassword(servicePassword),
      roles: { create: [{ roleId: developer.id }] },
    },
    update: { name: `${APP_NAME} Service`, passwordHash: await hashPassword(servicePassword) },
  })

  console.log('→ App', SLUG)
  const app = await prisma.app.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG,
      name: APP_NAME,
      description: 'How-tos e cursos internos AraraTech (staff)',
      ownerId: owner.id,
    },
    update: { name: APP_NAME, ownerId: owner.id, status: 'active' },
  })

  const credPath = path.join(DATA, `${SLUG}-credentials.json`)
  let apiRaw = ''
  if (existsSync(credPath)) {
    try {
      const old = JSON.parse(readFileSync(credPath, 'utf8'))
      if (old.apiKey) apiRaw = old.apiKey
    } catch {
      /* ignore */
    }
  }
  if (!apiRaw) {
    const secret = randomBytes(24).toString('base64url')
    apiRaw = `sk_live_${secret}`
  }
  const apiPrefix = apiRaw.slice(0, 16)
  const apiHash = hashApiKey(apiRaw)
  const apiId = 'key_portal_cursos'

  await prisma.apiKey.updateMany({ where: { appId: app.id, revokedAt: null }, data: { revokedAt: new Date() } })
  await prisma.apiKey.upsert({
    where: { id: apiId },
    create: {
      id: apiId,
      appId: app.id,
      name: `${SLUG}-prod`,
      prefix: apiPrefix,
      keyHash: apiHash,
      scopes: appScopes(SLUG),
    },
    update: { prefix: apiPrefix, keyHash: apiHash, scopes: appScopes(SLUG), revokedAt: null },
  })
  writeFileSync(path.join(DATA, `${SLUG}-api-key.txt`), apiRaw + '\n')
  writeFileSync(
    credPath,
    JSON.stringify({ slug: SLUG, apiKey: apiRaw, serviceEmail, servicePassword }, null, 2) + '\n',
  )
  console.log('→ API key written to data/' + SLUG + '-api-key.txt')

  const courseStorage = `${SLUG}-Course`
  const lessonStorage = `${SLUG}-Lesson`
  console.log('→ Models')
  await upsertModel(app.id, courseStorage, COURSE_SCHEMA)
  await upsertModel(app.id, lessonStorage, LESSON_SCHEMA)

  console.log('→ Module courses')
  const existingMods = await prisma.module.findMany({ where: { appId: app.id }, select: { id: true } })
  if (existingMods.length) {
    await prisma.moduleRoute.deleteMany({ where: { moduleId: { in: existingMods.map((m) => m.id) } } })
    await prisma.module.deleteMany({ where: { appId: app.id } })
  }
  const mod = await prisma.module.create({
    data: {
      appId: app.id,
      name: 'courses',
      description: 'Cursos e lições Markdown',
      status: 'published',
    },
  })
  for (const r of ROUTES) {
    await prisma.moduleRoute.create({
      data: {
        moduleId: mod.id,
        method: r.method,
        path: r.path,
        controllerCode: r.code,
      },
    })
  }
  console.log('  routes', ROUTES.length)

  console.log('→ Staff AppMemberships')
  const staffUsers = await prisma.user.findMany({
    where: {
      status: 'active',
      roles: { some: { role: { name: { in: [...STAFF_ROLES] } } } },
    },
    include: { roles: { include: { role: true } } },
  })
  let memCount = 0
  for (const u of staffUsers) {
    const roleNames = u.roles.map((ur) => ur.role.name)
    let membershipRole = 'support'
    if (roleNames.includes('admin') || roleNames.includes('master')) membershipRole = 'admin'
    else if (roleNames.includes('developer')) membershipRole = 'developer'
    else if (roleNames.includes('support')) membershipRole = 'support'
    await prisma.appMembership.upsert({
      where: { userId_appId: { userId: u.id, appId: app.id } },
      create: { userId: u.id, appId: app.id, role: membershipRole },
      update: { role: membershipRole },
    })
    memCount++
  }
  console.log('  memberships', memCount)

  console.log('→ Seed exemplo')
  const existingCourses = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: courseStorage },
  })
  if (existingCourses.length === 0) {
    const ts = new Date().toISOString()
    const courseId = 'crs_seed_homolog'
    await prisma.modelRecord.create({
      data: {
        id: courseId,
        appId: app.id,
        modelName: courseStorage,
        data: {
          id: courseId,
          title: 'Deploy em homologação',
          slug: 'deploy-homologacao',
          summary: 'Passo a passo para publicar builds de homologação nas lojas.',
          tags: ['deploy', 'homologacao', 'ops'],
          published: true,
          sort_order: 0,
          created_by: owner.id,
          created_at: ts,
          updated_at: ts,
        } as Prisma.InputJsonValue,
      },
    })
    const lessonId = 'les_seed_homolog_1'
    await prisma.modelRecord.create({
      data: {
        id: lessonId,
        appId: app.id,
        modelName: lessonStorage,
        data: {
          id: lessonId,
          course_id: courseId,
          title: 'Visão geral do fluxo',
          slug: 'visao-geral',
          body_markdown: [
            '# Deploy em homologação',
            '',
            'Este how-to descreve o fluxo padrão AraraTech.',
            '',
            '## Passos',
            '',
            '1. Gerar o artefato (export estático / build).',
            '2. Enviar via `POST /v1/apps/:slug/hosting` com a API key do app.',
            '3. Validar em `https://api.arara-tech.com/h/:slug/` ou no subdomínio da loja.',
            '',
            '## Checklist',
            '',
            '- [ ] Env de homolog apontando para a API correta',
            '- [ ] Smoke de login e rota crítica',
            '- [ ] Avisar o time no canal de deploys',
            '',
            '> Edite este conteúdo no Portal de Cursos — qualquer staff pode contribuir.',
          ].join('\n'),
          sort_order: 0,
          published: true,
          created_by: owner.id,
          created_at: ts,
          updated_at: ts,
        } as Prisma.InputJsonValue,
      },
    })
    console.log('  seeded Deploy em homologação')
  } else {
    console.log('  seed skipped (courses already exist)')
  }

  console.log('✓ portal-cursos ready')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
