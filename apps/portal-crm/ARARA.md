# CRM — client-only na Arara Platform

Este repositório é o **front do Portal CRM**. Em produção **não** há servidor Node/Prisma/NextAuth próprio.

```text
Browser (Next static)  →  api.arara-tech.com
                            ├─ /v1/auth/*          (usuários compartilhados)
                            ├─ /v1/r/portal-crm/*  (Client, Deal, Stage, …)
                            └─ hosting estático    (crm.arara-tech.com)
```

## Intuito (não negociável)

| É | Não é |
|---|--------|
| Front consome a **API universal** Arara | Backend separado no VPS (`crm-app` Docker) |
| Deploy = **zip static export** no hosting da platform | `docker compose build` + `prisma migrate` no Postgres `crm` |
| Auth = JWT Arara + API key do app `portal-crm` | NextAuth local (`AUTH_SECRET`, `AUTH_MODE=local`) |
| Dados em `portal-crm-*` na platform | Schema Prisma deste repo como fonte de verdade em prod |

**Reposos dos produtos deixam de ter server separado.** Prisma/`app/api`/NextAuth no código são **legado** (dev local opcional), não o cutover de produção.

Se alguém propor checklist “rsync → compose → migrate → AUTH_MODE=local”, está no modelo antigo — rejeitar e apontar para este doc.

## Slug e URLs

| | |
|---|---|
| App slug | `portal-crm` |
| API | `https://api.arara-tech.com` |
| UI | `https://crm.arara-tech.com` (hosting `:10001`) |
| Runtime | `/v1/r/portal-crm/...` |

## Auth

- **Users** = globais na platform (mesmo login do portal-suporte / Horas).
- **API key** = por app (`app:portal-crm:*`), mintada no login staff e guardada em `localStorage` (`arara_app_key:portal-crm`).
- **Role CRM** (`vendedor` / `gerente` / `admin`) = `portal-crm-Profile` (+ AppMembership).

Ver [`lib/arara/`](./lib/arara/) (`AuthProvider`, `arara` client).

## Dev

```bash
cp env.arara.example .env.local
# NEXT_PUBLIC_ARARA_API_URL=https://api.arara-tech.com   # ou http://localhost:4100
# NEXT_PUBLIC_ARARA_APP_SLUG=portal-crm

npm run dev   # :3010 — UI client aponta para a Arara
```

Login de staff unificado (ex.: usuários já na platform com membership `portal-crm`).

## Release (caminho oficial)

```bash
npm run export:deploy
# ou:
# ARARA_API_URL=https://api.arara-tech.com ARARA_API_KEY=... bash scripts/export-and-deploy.sh
```

1. Estaciona `app/api` e `proxy.ts`
2. `next build` com `output: 'export'` ([`next.config.export.mjs`](./next.config.export.mjs))
3. Zip de `out/` → `POST /v1/apps/portal-crm/hosting`

**Artefato = zip estático**, não imagem Docker.

## Backend (na platform, não neste repo)

Controllers / seed do domínio CRM:

```bash
# no repo platform/
npx tsx scripts/portal-crm/enrich-schemas-and-seed.ts
npx tsx scripts/portal-crm/enrich-controllers.ts
```

Rotas úteis: `/leads`, `/leads/:id/claim`, `/clients`, `/deals`, `/deals/:id/stage`, `/activities`, `/stages`, `/me/profile`, …

## O que NÃO fazer em produção

- Subir `remote/base.yml` + `remote/core.yml` do CRM como backend oficial
- `prisma migrate deploy` no banco `crm` do VPS como cutover
- Manter `AUTH_MODE=local` / NextAuth como auth de prod
- Tratar `arara-host/` como UI (foi smoke antigo; a UI real é o export Next)

## Legado neste repo

`prisma/`, `app/api/`, `auth.ts`, `lib/arara-server.ts`, `remote/` — referência / eventual `npm run dev` híbrido. **Não** são o deploy Arara.
