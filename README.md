# Arara Platform

Monorepo da **Arara Platform**: API central code-first e frontends dos portais (suporte, CRM, cursos, horas, hub).

Uma única API autentica usuários, gerencia apps/API keys e expõe rotas estáveis em `/v1/r/{slug}/…`. Os fronts são client-only e consomem essa API.

## Layout

```text
packages/api          Fastify + Prisma (auth, apps, rotas code-first)
apps/portal-suporte   Portal de suporte
apps/portal-crm       CRM
apps/portal-cursos    Cursos
apps/portal-horas     Controle de horas
apps/portal-araratech Hub / mission-control
deploy/               Compose e Dockerfiles de produção
docs/                 Deploy, cutover, frontends
```

## Quick start

```bash
# API
cd packages/api
cp .env.example .env          # edite JWT_SECRET, APP_SECRETS_KEY, SEED_*
docker compose up -d
# na raiz do monorepo:
npm install
npx prisma migrate deploy -w @arara/api
npm run db:seed
npm run dev:api
```

- API: http://localhost:4100  
- Health: http://localhost:4100/health  
- Runtime: `http://localhost:4100/v1/r/{slug}/...`

Frontends (em outro terminal):

```bash
cp apps/portal-suporte/.env.example apps/portal-suporte/.env.local   # ajuste a URL
npm run dev:portal-suporte
# idem: dev:portal-crm | dev:portal-cursos | dev:portal-horas
```

## Variáveis de ambiente

Não commite `.env`. Use os exemplos:

| Onde | Exemplo |
|------|---------|
| Raiz / referência | [`.env.example`](./.env.example) |
| API | [`packages/api/.env.example`](./packages/api/.env.example) |
| Cada app | `apps/<slug>/.env.example` |

Obrigatórios na API: `DATABASE_URL`, `JWT_SECRET`, `APP_SECRETS_KEY` (`openssl rand -base64 32`).

Dumps de produção, credenciais e mapas de usuários ficam em `packages/api/data/` e estão no `.gitignore`.

## Arquitetura (resumo)

- **Shared** (SQL): `User`, auth/RBAC, `App`, `AppMembership`, `ApiKey`, `AppSecret`.
- **App-scoped**: JSONB `model_records` com storage `{slug}-{Model}`; handlers usam alias curto (`Ticket`, `Company`).
- Rotas em TypeScript sob `packages/api/src/apps/<slug>/`.

## Deploy

Ver [docs/DEPLOY.md](docs/DEPLOY.md). Host e SSH vêm de variáveis/secrets (`DEPLOY_HOST`, `SSH_PRIVATE_KEY`) — não versionar IPs ou chaves.

```bash
./scripts/deploy-api.sh
# ou GitHub Actions: deploy-api / deploy-portal-* / deploy-all
```

## Apps / slugs

| Slug | Frontend |
|------|----------|
| `portal-suporte` | `apps/portal-suporte` |
| `portal-crm` | `apps/portal-crm` |
| `portal-horas` | `apps/portal-horas` |
| `portal-cursos` | `apps/portal-cursos` |
| `portal-araratech` | `apps/portal-araratech` |
| `arara-hub` | API only |
