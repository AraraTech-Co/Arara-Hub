# Portal Suporte — front client-only (Arara)

## Modelo de auth

- **Usuários** globais na platform (JWT compartilhado entre apps).
- **API keys** por app (`app:{slug}:*`). Público usa `NEXT_PUBLIC_ARARA_API_KEY`.
- Staff no login minta key do app e guarda em `localStorage` (`arara_app_key:{slug}`).

## Dev (padrão do time)

```bash
cp .env.local.example .env.local   # preencher NEXT_PUBLIC_ARARA_*
npm run dev:arara                 # :3011 — ARARA_CLIENT_ONLY=1
```

`npm run dev` / Prisma / `app/api` = **legacy local** (não é o caminho Arara).

Login: use the seed users from `packages/api/.env` (`SEED_ADMIN_*` / `SEED_DEV_*`).

## Release (Phase 3 — oficial)

```bash
npm run export:deploy
```

Estaciona `app/api`, `uploads`, `pages/api`, middleware, sentry; gera `out/`; zip → `POST /v1/apps/portal-suporte/hosting`.

- Hosting: http://localhost:10000/
- API: http://localhost:4100/
- Proxy: http://localhost:4100/h/portal-suporte/

## Fases

| Fase | Status |
|------|--------|
| 1 / 1b | Login, dashboard, kanban, companies, ticket view, export |
| 2 | Público criar/acompanhar/avaliar, tasks/teams/users/SLA/incidents/emails, controllers track/status/assign |
| 3 | Export = release path; Prisma/`app/api` só legacy |

## Controllers ricos (platform)

```bash
cd ../platform && npm run enrich:portal-suporte-controllers
```

## Limitações conhecidas

- DevOps: listagem SSH + histórico de ping via Arara; ICMP/terminal/SSH ao vivo não rodam no runtime estático (controllers retornam stub seguro).
- Magic-link, Meilisearch/PDF avançado e CRM permanecem fora do recorte atual.
