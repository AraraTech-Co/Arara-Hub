export const README_MARKDOWN = `# Arara API Platform — Agent / Developer Brief

> **Como usar este documento:** abra \`GET https://api.arara-tech.com/readme\` (local: \`http://localhost:4100/readme\`) e cole no Claude / Cursor / Codex. É a **base de prompt** oficial. Siga à risca.

Monorepo **arara-platform**: API em \`packages/api\`, fronts em \`apps/<slug>\`. Auth, apps, API keys, models JSONB e **handlers TypeScript code-first**. Frontends **não** têm banco de usuários próprio.

> **Sandbox abolido.** Runtime **não** lê \`controller_code\` do Postgres. Rotas vivem no git. URL estável: \`/v1/r/:slug/...\`. Em produção, publicar rota via DB → **410** (\`ALLOW_DB_CONTROLLER_PUBLISH=0\`).

---

## Como este repositório deve ser usado

### O que é de quem

| Você quer… | Onde mexer | Como chega em produção |
|------------|------------|------------------------|
| Rota/handler de um app | \`packages/api/data/exports/<slug>/routes.json\` → \`codegen\` → \`src/apps/<slug>/\` | Deploy **API** (imagem embute handlers) |
| Schema / dados JSONB do app | \`POST /v1/apps/:slug/models\` (+ records via handlers) | Já no Postgres; schema também pode ir em \`data/exports/<slug>/models.json\` |
| Identidade, login, membership | Platform SQL (\`users\`, \`AppMembership\`, …) — **nunca** model \`User\` por app | Migrações Prisma / seed / APIs \`/v1/auth\`, \`/v1/apps/:slug/members\` |
| UI do portal | \`apps/<slug>/\` (front) | Deploy do front (\`deploy-portal-*\`) |
| Deploy / ops | \`docs/DEPLOY.md\`, \`.github/workflows/\` | SSH build no Hostinger |

### Fluxo mental (sempre)

\`\`\`text
1. Classifique o dado: shared (todas as apps) ou app-scoped (só esta)?
2. Shared → reutilize User/Company/ApiKey. Não invente {slug}-User.
3. App-scoped → storage {slug}-{Nome}; no código use ctx.models.Nome
4. Nova rota → arquivo de export (ou codegen) no pacote API → commit → deploy API
5. Front só consome /v1/r/:slug/... com JWT ou x-api-key
\`\`\`

### O que **não** fazer

- Publicar controller só no banco e esperar que \`/v1/r\` use isso.
- Criar \`portal-xyz-User\` / segundo login.
- Stub \`model.create(ctx.body)\` em path de ação (\`/approve\`, \`/bulk-action\`, …).
- Assumir que \`x-api-key\` = pessoa logada (muitas rotas exigem JWT ou \`x-portal-sessao\`).
- Depender de \`/h/:slug\` hosting embutido em produção (desligado; fronts são containers).

---

## 0. Regras absolutas

### Usuários canônicos

1. Única identidade = tabela \`users\` (shared \`User\`).
2. FKs de pessoa = \`users.id\` (\`user_id\`, \`assigned_to\`, …).
3. Perfil do app: \`Profile\` / \`StaffProfile\` com **\`data.id\` = \`users.id\`**.
4. E-mail staff canônico: \`*@arara-tech.com\`.
5. Admin JWT da platform ≠ admin do domínio do app (ex. Horas).

### Models: shared vs app-scoped (detalhe)

Há **duas camadas** de “model”:

#### A) Platform SQL (sempre shared — não são JSONB de app)

| Model | Para que serve |
|-------|----------------|
| \`User\` | Pessoa global (login) |
| \`Role\` / \`Permission\` / \`UserRole\` | RBAC da platform |
| \`App\` | Registro do app (\`slug\`, owner, status) |
| \`AppMembership\` | Qual user acessa qual app (+ role no app) |
| \`ApiKey\` | Auth do app (hash; por app) |
| \`AppSecret\` | Segredos de terceiro (AES; por app) |
| \`Notification\` | Inbox cross-app |
| \`RefreshToken\` | Sessão auth |

Isso **não** se cria com \`POST /v1/apps/:slug/models\`. É Prisma / APIs \`/v1/...\`.

#### B) Dados de negócio JSONB (por app, com exceções conceituais)

Persistidos em \`model_defs\` + \`model_records\`.

| Tipo | Nome no **storage** (DB) | Nome no **handler** | Quando usar |
|------|--------------------------|---------------------|-------------|
| **Shared (conceito)** | Preferir PascalCase sem slug (\`Company\`) | \`ctx.models.Company\` | Entidade de negócio comum a várias apps (empresas/clientes). **Não** \`portal-suporte-Company\` no modelo alvo. |
| **App-scoped** | \`{storage-slug}-{Nome}\` | \`ctx.models.{Nome}\` (alias curto) | Tudo específico: \`Ticket\`, \`Course\`, \`HourEntries\`, \`Profile\`, … |

Exemplos:

\`\`\`text
✅ User          → SQL platform
✅ Company       → shared (alvo); handlers: ctx.models.Company
✅ ApiKey        → SQL platform (por app, mas não é ModelRecord)
✅ portal-suporte-Ticket     → JSONB; handler: ctx.models.Ticket
✅ time-management-StaffProfile → JSONB; handler: ctx.models.StaffProfile
✅ portal-cursos-Course      → JSONB; handler: ctx.models.Course

❌ portal-suporte-User
❌ portal-suporte-Company   (errado no modelo alvo)
❌ misturar records de portal-crm-Ticket com portal-suporte-Ticket
\`\`\`

**Como o runtime monta \`ctx.models\`:** para o \`App\` resolvido (slug de **storage**), cada \`ModelDef\` vira API \`findMany/findById/create/update/delete\` no alias curto. O prefixo \`{slug}-\` é automático no storage.

**Alias de slug (Horas):** URL pública \`portal-horas\` · storage/DB \`time-management\` (\`src/lib/app-slugs.ts\`). Models/records usam o prefixo **\`time-management-\`**. A URL \`/v1/r/portal-horas/...\` e \`/v1/r/time-management/...\` apontam para os mesmos handlers.

---

## 1. Mapa de pastas (onde criar o quê)

\`\`\`text
arara-platform/
├── packages/api/                          ← API
│   ├── data/exports/<slug>/
│   │   ├── routes.json                    ← FONTE das rotas (edite aqui)
│   │   └── models.json                    ← opcional (documentação/export de schemas)
│   ├── src/apps/<slug>/
│   │   ├── routes.generated.ts            ← GERADO (npm run codegen:routes)
│   │   └── index.ts                       ← GERADO (registerAppRoutes)
│   ├── src/apps/register-all.ts           ← GERADO (lista todos os slugs)
│   ├── src/lib/app-slugs.ts               ← aliases / slugs removidos
│   ├── src/modules/                       ← HTTP platform (/v1/auth, /v1/apps, …)
│   └── prisma/                            ← schema SQL shared
├── apps/<slug>/                           ← frontend do portal
├── deploy/                                ← Dockerfiles + compose fronts/API
├── tooling/codegen-static-routes.ts       ← codegen
└── docs/DEPLOY.md
\`\`\`

| Arquivo / pasta | Quem escreve | Frequência |
|-----------------|--------------|------------|
| \`data/exports/<slug>/routes.json\` | Você (ou \`export:routes\`) | Sempre que mudar rota |
| \`src/apps/<slug>/routes.generated.ts\` | **Codegen** (não editar de rotina) | Após cada codegen |
| \`apps/<slug>/\` | Você (UI) | Features de front |
| \`src/lib/app-slugs.ts\` | Você | Só se precisar de alias de storage |

---

## 2. Criar um **novo app** (passo a passo)

Slug exemplo: \`portal-estoque\` (kebab-case).

### Passo 1 — Decidir models

Liste entidades e classifique:

| Entidade | Tipo | Storage | No handler |
|----------|------|---------|------------|
| Pessoa que loga | shared SQL | \`users\` | \`ctx.user\` / APIs auth |
| Empresa cliente | shared (conceito) | \`Company\` | \`ctx.models.Company\` |
| Item de estoque | app-scoped | \`portal-estoque-StockItem\` | \`ctx.models.StockItem\` |
| Preferências do user neste app | app-scoped | \`portal-estoque-Profile\` | \`ctx.models.Profile\` (\`id\` = \`users.id\`) |

### Passo 2 — Registrar o app na platform

Com JWT developer/admin:

\`\`\`http
POST /v1/apps
Authorization: Bearer <jwt>
{ "name": "Portal Estoque", "slug": "portal-estoque" }
\`\`\`

Guarde a \`apiKey\` (uma vez). Conceda memberships:

\`\`\`http
POST /v1/apps/portal-estoque/members
Authorization: Bearer <jwt>
{ "userId": "<users.id>", "role": "admin" }
\`\`\`

### Passo 3 — Criar models app-scoped

\`\`\`http
POST /v1/apps/portal-estoque/models
x-api-key: sk_live_...
{
  "name": "StockItem",
  "schema": {
    "type": "object",
    "required": ["sku", "title"],
    "properties": {
      "sku": { "type": "string" },
      "title": { "type": "string" },
      "qty": { "type": "number" },
      "updated_by": { "type": "string", "description": "platform users.id" }
    }
  }
}
\`\`\`

Isso grava def/records sob o nome namespaced. No controller use **\`ctx.models.StockItem\`**.

Perfil (se precisar de role local):

\`\`\`http
POST /v1/apps/portal-estoque/models
{ "name": "Profile", "schema": { "type": "object", "properties": {
  "id": { "type": "string", "description": "MUST equal users.id" },
  "email": { "type": "string" },
  "role": { "type": "string" }
}}}
\`\`\`

### Passo 4 — Criar o arquivo de rotas (obrigatório no git)

Crie a pasta e o arquivo:

\`\`\`text
packages/api/data/exports/portal-estoque/routes.json
\`\`\`

Formato mínimo:

\`\`\`json
{
  "slug": "portal-estoque",
  "routes": [
    {
      "module": "stock",
      "method": "GET",
      "path": "/items",
      "authMode": "actor",
      "webhookSecretName": null,
      "requiredPermissions": [],
      "routeId": "portal-estoque-items-list",
      "controllerCode": "async function handler(ctx) {\\n  const StockItem = ctx.models.StockItem;\\n  if (!StockItem) return ctx.reply.status(500).send({ error: 'Model StockItem missing' });\\n  const rows = await StockItem.findMany({});\\n  return ctx.reply.send({ data: rows, count: rows.length });\\n}\\nmodule.exports = { handler };\\n"
    }
  ]
}
\`\`\`

\`controllerCode\` = string JS no contrato legado (\`async function handler(ctx)\` + \`module.exports = { handler }\`).

Opcional: \`packages/api/data/exports/portal-estoque/models.json\` para documentar schemas exportados.

### Passo 5 — Codegen (gera os arquivos TypeScript)

Na raiz ou em \`packages/api\`:

\`\`\`bash
npm run codegen:routes
\`\`\`

Isso **cria/atualiza**:

\`\`\`text
packages/api/src/apps/portal-estoque/routes.generated.ts
packages/api/src/apps/portal-estoque/index.ts
packages/api/src/apps/register-all.ts          ← inclui loadPortalEstoqueRoutes()
\`\`\`

Reinicie a API (\`npm run dev\`). Teste:

\`\`\`http
GET /v1/r/portal-estoque/items
x-api-key: sk_live_...
\`\`\`

### Passo 6 — Frontend (opcional mas usual)

\`\`\`text
apps/portal-estoque/     ← Vite ou Next client-only
\`\`\`

Env de build: API \`https://api.arara-tech.com\`, slug \`portal-estoque\`.  
Compose: entrada em \`deploy/frontends.compose.yml\` + workflow \`deploy-portal-estoque.yml\` (espelhe um existente).

### Passo 7 — Commit e deploy

\`\`\`text
git add packages/api/data/exports/portal-estoque
git add packages/api/src/apps/portal-estoque
git add packages/api/src/apps/register-all.ts
# + apps/portal-estoque se houver front
\`\`\`

Deploy API (GHA **Deploy API** ou \`./scripts/deploy-api.sh\`). Sem redeploy da API, rotas novas **não** existem em produção.

### Alias de storage (só se o DB já usa outro slug)

Ex.: público \`portal-horas\`, storage \`time-management\`:

1. Em \`src/lib/app-slugs.ts\`: \`APP_SLUG_ALIASES['portal-horas'] = 'time-management'\`.
2. Em \`src/apps/portal-horas/index.ts\`: \`registerAppRoutes\` nos **dois** slugs (veja o app Horas).
3. Models no DB continuam prefixados com o **storage** slug.

---

## 3. Alterar rota de um app **já existente**

1. Edite \`packages/api/data/exports/<slug>/routes.json\` (adicione/mude \`controllerCode\`, path, method).  
2. \`npm run codegen:routes\`.  
3. Teste local \`/v1/r/<slug>/...\`.  
4. Commit dos **dois**: export + \`routes.generated.ts\` (+ \`index\`/\`register-all\` se slug novo).  
5. Deploy API.

Edição direta em \`routes.generated.ts\` só em emergência — o próximo codegen **sobrescreve**.

Rotas de ação (\`/approve\`, \`/bulk-action\`, …): implemente de verdade ou responda **501**; nunca CRUD genérico enganoso.

---

## 4. Contrato do handler

\`\`\`js
async function handler(ctx) {
  const { params, query, body, user, models, secrets, fetch, reply, notify, randomBytes, randomUUID } = ctx
  // models.Ticket → storage {slug}-Ticket
  const row = await models.Ticket.findById(params.id)
  return reply.send({ data: row })
}
module.exports = { handler }
\`\`\`

| Campo | Significado |
|-------|-------------|
| \`ctx.user\` | Pessoa (JWT) ou metadata de key/webhook — **key sozinha pode não ter \`id\`** |
| \`ctx.models.X\` | CRUD JSONB do app (storage slug resolvido) |
| \`ctx.secrets.get(name)\` | AppSecret em claro (não logar / não devolver) |
| \`ctx.fetch\` | HTTP allowlisted (\`SANDBOX_FETCH_*\`) |
| \`ctx.notify\` | Grava \`notifications\` SQL |
| \`ctx.randomBytes(n)\` | Hex CSPRNG do host (\`n\` inteiro 1..1024) — **não** use \`Math.random\` para segredo |
| \`ctx.randomUUID()\` | UUID v4 CSPRNG do host |

\`authMode\`: \`actor\` (default) · \`webhook_secret\` + \`webhookSecretName\` para webhooks sem API key.

---

## 5. Autenticação (resumo)

| Mecanismo | Header / meio | Carrega pessoa? |
|-----------|---------------|-----------------|
| JWT | \`Authorization: Bearer\` | Sim (\`ctx.user.id\`) |
| API key | \`x-api-key\` | Não (é o app) |
| Sessão portal | \`x-portal-sessao\` | Sim (padrão suporte) |
| Webhook secret | \`?token=\` / body | \`type: webhook\` |

\`POST /v1/auth/register\` **não** dá membership. Use \`/v1/apps/:slug/members\`.

ApiKey vs AppSecret, machine key \`secrets:read\`, memberships: ver seções históricas abaixo / OpenAPI.

---

## 6. Apps em produção

| Slug URL | Storage | Front |
|----------|---------|-------|
| \`portal-suporte\` | idem | \`apps/portal-suporte\` |
| \`portal-crm\` | idem | \`apps/portal-crm\` |
| \`portal-horas\` | \`time-management\` | \`apps/portal-horas\` |
| \`portal-cursos\` | idem | \`apps/portal-cursos\` |
| \`portal-araratech\` | idem | \`apps/portal-araratech\` |
| \`arara-hub\` | idem | — |

Removido: \`festa-da-firma\`.

Produção: \`https://api.arara-tech.com\`.

---

## 7. Dev local

\`\`\`bash
# raiz do monorepo
npm install
cp packages/api/.env.example packages/api/.env
cd packages/api && docker compose up -d
npx prisma migrate deploy && npm run db:seed
npm run dev
\`\`\`

Seed: emails/passwords from \`SEED_*\` in \`.env\` (see \`.env.example\`).

Scripts: \`export:routes\` · \`codegen:routes\` · \`db:migrate\` · \`db:seed\`.  
Deploy: \`docs/DEPLOY.md\` · \`./scripts/deploy-api.sh\` · GHA \`deploy-api\` / \`deploy-portal-*\`.

---

## 8. Auth, secrets, memberships, notificações

### Login / refresh

\`POST /v1/auth/login\` → \`token\` + \`refreshToken\`. Refresh com rotação em \`POST /v1/auth/refresh\`. Senha mín. 8 chars.

### AppSecret

Credenciais de terceiro (AES, \`APP_SECRETS_KEY\`). Default \`serverOnly: true\`. Key de UI \`app:*\` lista metadados mas **não** lê valor server-only; machine key com \`secrets:read\` sim.

### Membership

Roles: \`user|support|developer|admin\`. Só JWT owner/admin do app. API keys não administram membros/keys.

### Notificações

SQL \`notifications\`. \`POST /v1/notifications\` ou \`ctx.notify({ userId, title, body, severity, href, sourceApp })\`. Front usa JWT em \`/v1/notifications\` (não \`/v1/r\`).

### Hosting embutido

Desligado em prod (\`DISABLE_APP_HOSTING=1\`). Use containers \`arara-front-*\`.

### RBAC platform

\`user\` 10 · \`support\` 20 · \`developer\` 30 · \`admin\` 40. Aliases: \`master\`→\`admin\`, \`agent\`→\`support\`.

---

## 9. Checklist (merge / deploy)

- [ ] Dado classificado: shared vs app-scoped  
- [ ] Sem \`{slug}-User\` / clone de login  
- [ ] FKs pessoa = \`users.id\`; Profile.id = \`users.id\`  
- [ ] Rotas em \`data/exports/<slug>/routes.json\` + codegen commitado  
- [ ] \`register-all.ts\` inclui o slug (via codegen)  
- [ ] Testado \`/v1/r/<slug>/...\` local  
- [ ] Deploy **API** após mudar handlers  
- [ ] Front em \`apps/<slug>\` se houver UI  
- [ ] Sem stub CRUD em path de verbo  
- [ ] Horas: URL \`portal-horas\`, storage \`time-management\`  

---

## 10. Endpoints (mapa)

| Método | Path | Notas |
|--------|------|--------|
| GET | \`/health\` | |
| GET | \`/readme\` | **este documento** |
| GET | \`/openapi.json\` | |
| POST | \`/v1/auth/register\\|login\\|refresh\` | |
| GET | \`/v1/auth/me\` | |
| \\* | \`/v1/apps\`, \`/keys\`, \`/members\`, \`/secrets\`, \`/models\` | platform |
| \\* | \`/v1/apps/:slug/modules\`, \`.../routes\` | legado; **≠ runtime** (410 publish) |
| ALL | \`/v1/r/:appSlug/*\` | **runtime code-first** |
| \\* | \`/v1/notifications\` | inbox |
| \\* | \`/h/:slug/*\` | off em prod |

---

*AraraTech · arara-platform · \`GET /readme\` · code-first monorepo*
`

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Arara API Platform',
    version: '0.3.1',
    description:
      'API modular AraraTech (monorepo code-first). GET /readme: como criar apps, models shared vs app-scoped, rotas em data/exports. Runtime /v1/r/:slug.',
  },
  servers: [
    { url: 'https://api.arara-tech.com', description: 'Production' },
    { url: 'http://localhost:4100', description: 'Local' },
  ],
  paths: {
    '/health': {
      get: { summary: 'Health check', responses: { '200': { description: 'OK' } } },
    },
    '/readme': {
      get: {
        summary: 'Markdown — agent/developer brief',
        description:
          'Como usar o monorepo: novo app (data/exports + codegen), shared vs app-scoped models, deploy API.',
        responses: { '200': { description: 'Markdown' } },
      },
    },
    '/v1/auth/register': { post: { summary: 'Register user; returns token + refreshToken' } },
    '/v1/auth/login': { post: { summary: 'Login (JWT + refreshToken)' } },
    '/v1/auth/refresh': { post: { summary: 'Rotate refresh + new access token' } },
    '/v1/auth/me': { get: { summary: 'Current actor' } },
    '/v1/users/{id}/password': { post: { summary: 'Set password (API key or JWT self)' } },
    '/v1/apps': {
      get: { summary: 'List apps' },
      post: { summary: 'Create app + initial API key' },
    },
    '/v1/apps/{slug}': { get: { summary: 'Get app' } },
    '/v1/apps/{slug}/keys': { post: { summary: 'Create API key' } },
    '/v1/apps/{slug}/keys/{id}': { delete: { summary: 'Revoke API key' } },
    '/v1/apps/{slug}/members': {
      get: { summary: 'List memberships' },
      post: { summary: 'Grant/update membership' },
    },
    '/v1/apps/{slug}/members/{userId}': { delete: { summary: 'Revoke membership' } },
    '/v1/apps/{slug}/secrets': {
      get: { summary: 'List secrets metadata' },
      post: { summary: 'Upsert AppSecret' },
    },
    '/v1/apps/{slug}/secrets/{name}': {
      get: { summary: 'Get decrypted secret' },
      delete: { summary: 'Delete secret' },
    },
    '/v1/apps/{slug}/modules': {
      get: { summary: 'List modules (legacy)' },
      post: { summary: 'Create module (legacy; not runtime source)' },
    },
    '/v1/apps/{slug}/modules/{moduleName}/routes': {
      put: { summary: 'DB route upsert (410 in prod)' },
      get: { summary: 'List DB routes (legacy)' },
    },
    '/v1/apps/{slug}/models': {
      get: { summary: 'List JSONB model defs' },
      post: { summary: 'Create app-scoped model schema' },
    },
    '/v1/apps/{slug}/models/{name}': { patch: { summary: 'Update model schema' } },
    '/v1/r/{appSlug}/{path}': {
      get: { summary: 'Runtime code-first' },
      post: { summary: 'Runtime' },
      put: { summary: 'Runtime' },
      patch: { summary: 'Runtime' },
      delete: { summary: 'Runtime' },
    },
    '/v1/notifications': {
      get: { summary: 'Inbox' },
      post: { summary: 'Create notification' },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
  },
}
