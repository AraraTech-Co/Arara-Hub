# Arara API (`packages/api`)

API modular do monorepo **arara-platform**: auth, apps, API keys, models JSONB e rotas **code-first** em `src/apps/<slug>`.

**Documento completo (agentes + humanos):** [`GET /readme`](http://localhost:4100/readme) · produção: `https://api.arara-tech.com/readme`.

## Quick start

```bash
cp .env.example .env
docker compose up -d
# na raiz do monorepo: npm install
npx prisma migrate deploy && npm run db:seed
npm run dev
```

| | URL |
|--|-----|
| Health | http://localhost:4100/health |
| Brief | http://localhost:4100/readme |
| Runtime | http://localhost:4100/v1/r/{slug}/... |

Seed users: set `SEED_*` in `.env` (see `.env.example`).  
Env: `JWT_SECRET` + `APP_SECRETS_KEY` (`openssl rand -base64 32`).

## Como usar (resumo)

| Tarefa | Onde |
|--------|------|
| **Novo app / novas rotas** | Criar `packages/api/data/exports/<slug>/routes.json` → `npm run codegen:routes` → commit `src/apps/<slug>/` + `register-all.ts` → **deploy API** |
| **Model só deste app** | `POST /v1/apps/:slug/models` com nome curto (`Ticket`); storage vira `{slug}-Ticket`; no handler `ctx.models.Ticket` |
| **User / login / membership** | Platform SQL + `/v1/auth`, `/v1/apps/:slug/members` — **nunca** `{slug}-User` |
| **Empresa (shared)** | Conceito `Company` (sem prefixo de slug no modelo alvo) |
| **UI** | `apps/<slug>/` + deploy front |

### Shared vs app-scoped

| Tipo | Exemplos | Storage | No código |
|------|----------|---------|-----------|
| Shared SQL | `User`, `App`, `ApiKey`, `AppMembership` | Prisma | APIs `/v1/...` |
| Shared negócio | `Company` | sem inventar `{slug}-Company` | `ctx.models.Company` |
| App-scoped | `Ticket`, `Course`, `Profile` | `{slug}-Ticket` | `ctx.models.Ticket` |

Detalhe + passo a passo de app novo: **`GET /readme`**.

### Novo app (checklist rápido)

1. `POST /v1/apps` → slug kebab-case + API key  
2. Models app-scoped via `POST .../models`  
3. Arquivo **`data/exports/<slug>/routes.json`**  
4. `npm run codegen:routes`  
5. Testar `/v1/r/<slug>/...`  
6. Front opcional em `apps/<slug>/`  
7. Commit + Deploy API  

Alias Horas: URL `portal-horas` → storage `time-management` (`src/lib/app-slugs.ts`).

## Scripts

| | |
|--|--|
| `npm run dev` | API watch |
| `npm run export:routes` | Dump → `data/exports` |
| `npm run codegen:routes` | Gera `src/apps/*/routes.generated.ts` |
| `npm run db:migrate` / `db:seed` | Prisma |

## Deploy

[`docs/DEPLOY.md`](../../docs/DEPLOY.md) · `./scripts/deploy-api.sh` · GHA `deploy-api`.

| | |
|--|--|
| Container | `arara-platform-prd` |
| Image | `arara-api:local` |
| Prod | `DISABLE_APP_HOSTING=1`, `ALLOW_DB_CONTROLLER_PUBLISH=0` |
