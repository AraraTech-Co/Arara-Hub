# Adaptação do `hub-araratech` ao padrão do monorepo (client-only)

**Data:** 2026-09-10
**Origem:** `leololato/hub-araratech@feature/hub-central` foi trazido **inteiro** para `apps/hub-araratech` (fork completo do portal-suporte com a tela do Hub por cima).
**Alvo:** app **client-only** no padrão do monorepo (igual `apps/portal-crm`), servido em `hub.arara-tech.com`, consumindo a Arara Platform (`api.arara-tech.com`). Slug de runtime/hosting: **`arara-hub`** (o backend SSO já existe em `packages/api/src/apps/arara-hub`: `/sso/criar`, `/sso/trocar`).

---

## Diagnóstico: o que veio e o que serve

O `hub-araratech` é o **fork inteiro do portal-suporte**: `app/(admin|auth|public|client)`, dezenas de `app/api/*` (ai, devops, integrations, cron, kb, tickets…), `app/server` (MVC), Prisma, NextAuth (`@auth/prisma-adapter`), S3, Sentry, Docker.

**A fatia que é o Hub de verdade** (só isso interessa pro produto):
- `app/(client)/hub/page.tsx` + `layout.tsx` — a tela do Hub
- `app/_components/hub/{HubHeader,ModuleCard,QuickLinks}.tsx`
- `config/hub-modules.ts` — a grade de módulos por papel
- `app/api/hub/quick-links/route.ts` — quick links (legado dev)

O resto (~95%) é bagagem do suporte, **incompatível com o modelo client-only** (prod não tem Node/Prisma/NextAuth próprio).

---

## Gap (o que falta adaptar)

| # | Item | Hoje (fork) | Alvo (client-only) |
|---|------|-------------|--------------------|
| 1 | **Auth** | `auth.requireAuthenticated()` (NextAuth server) + Prisma | `lib/arara/` (JWT Arara + app API key no localStorage), igual `portal-crm` |
| 2 | **Tela do Hub** | Server Component lendo Prisma (`profile`, `quickLink`) | Client Component usando `useAuth()` + fetch à plataforma |
| 3 | **Grade de módulos** | `getHubModules(role)` estático por papel | Idealmente por **AppMembership** (`/v1/auth/me` → memberships); v1 pode manter por papel |
| 4 | **Abrir um app (card)** | `href` interno (`/dashboard`, `/crm`…) | **SSO handoff**: `POST /v1/r/arara-hub/sso/criar` → redireciona ao app destino com o código; o app troca via `/sso/trocar` |
| 5 | **Notificações (sino)** | componente local | `GET /v1/notifications` (JWT) + marcar lida |
| 6 | **Quick links** | Prisma `quickLink` | runtime `/v1/r/arara-hub/quick-links` **ou** config estática (v1) |
| 7 | **Build/Deploy** | `next build` + Docker/Vercel | **static export** (`next.config.export.mjs`) → zip `out/` → `POST /v1/apps/arara-hub/hosting` (`scripts/export-and-deploy.sh`) |
| 8 | **Limpeza** | fork inteiro (Prisma/NextAuth/server/rotas do suporte) | remover tudo que não é o Hub; `package.json` enxuto (deps client-only) |
| 9 | **Registro no monorepo** | não está em `workspaces` nem em CI | adicionar `apps/hub-araratech` aos `workspaces` do root + workflow `deploy-portal-hub`/`deploy-arara-hub` |

---

## Plano de execução (fases)

- **Fase 1 — Esqueleto client-only:** trazer `lib/arara/` (adaptado, slug `arara-hub`), `lib/canonical-roles`, `next.config.ts` (dev) + `next.config.export.mjs`, `scripts/export-and-deploy.sh`, `env.arara.example`, `package.json` enxuto, `tailwind/postcss/tsconfig`. Provider de auth no layout raiz.
- **Fase 2 — Tela do Hub (client):** reescrever `hub/page.tsx` como Client Component: `useAuth()` → role/nome; `getHubModules(role)`; render de `HubHeader/ModuleCard/QuickLinks`. Login page client (reusa `arara.login`).
- **Fase 3 — SSO handoff nos cards:** `ModuleCard` chama `sso/criar` e redireciona ao app destino; documentar o `/sso` que cada app precisa (CRM já tem rota `/sso` pronta de referência).
- **Fase 4 — Notificações:** `HubHeader` consome `/v1/notifications`.
- **Fase 5 — Limpeza:** remover `app/(admin|auth|public)`, `app/api/*` (menos o que virar runtime), `app/server`, `prisma`, NextAuth, Sentry/S3/Docker não usados.
- **Fase 6 — Registro/CI:** `workspaces` + workflow de deploy path-scoped (`apps/hub-araratech/**`) + hosting `arara-hub`.

## Estado (10/09)

**Feito:** Fases 1, 2, 4 e 5 (esqueleto client-only, telas `/login`+`/hub`, notificações, limpeza do fork). **Grade por AppMembership CONCLUÍDA** — `getHubModules(memberships)` via `/v1/auth/me` (um card por app, selo de papel por app). Build static export verde; validado no browser (Leonardo → 5 apps, selo Admin).

**Falta:**
- **Fase 3 (parcial):** `/sso` nos apps de destino (suporte, horas, cursos, araratech) — o Hub já faz o `sso/criar` no clique; o CRM já tem `/sso` de referência.
- **Fase 6 (preparada):** workflow `deploy-hub-araratech.yml` **criado (manual/`workflow_dispatch`)** e passo-a-passo em [`DEPLOY-HUB.md`](./DEPLOY-HUB.md). NÃO precisa de `workspaces` (o `Dockerfile.next-export` builda standalone com o `package-lock.json` do app). **Falta (só Leonardo, produção):** serviço `hub-araratech` no `deploy/frontends.compose.yml` (⚠️ dispara deploy em massa), Nginx do VPS `hub.arara-tech.com`→:10009, DNS, ligar o gatilho de push e rodar o deploy.

**Decisões pendentes (Leonardo):**
- Slug de hosting do front: **`arara-hub`** (mesmo do SSO) ou um novo (`hub`)?
- Deploy automático em `master` (criar workflow) ou manual por ora?
