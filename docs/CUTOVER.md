# Cutover notes (Module 11)

## What shipped in this monorepo

- New repo: `/home/hengueier/Projects/work/arara-platform`
- API: `packages/api` (code-first `/v1/r/:slug` handlers)
- Frontends: `apps/*`
- Live routes exported from Hostinger `arara-platform-db` → `packages/api/data/exports/`
- Handlers generated: `packages/api/src/apps/<slug>/routes.generated.ts`
- `isolated-vm` sandbox removed; DB `PUT .../modules/.../routes` returns **410** unless `ALLOW_DB_CONTROLLER_PUBLISH=1`

## Re-export / diff before prod deploy

```bash
cd packages/api
npm run export:routes
npm run codegen:routes
git diff --stat data/exports src/apps
```

If export grows new routes, commit the regenerated `routes.generated.ts` files.

## Prod deploy checklist

1. Build/push API image from `packages/api` (existing `remote/` compose still applies).
2. `prisma migrate deploy` — schema only; **do not** rely on integrate scripts to publish controllers.
3. Ensure app rows, API keys, memberships, secrets, and `model_records` data still exist (data path unchanged / JSONB).
4. Smoke each slug: `GET /v1/r/{slug}/...` with production API key.
5. Point frontends / hosting at the new build (`api.arara-tech.com`).

## Archive old workflow

- Leave sibling repos under `arara-api/` intact until cutover is verified.
- Prefer this monorepo as the single place to change handlers and fronts.
- Legacy integrate/enrich scripts that upsert `controllerCode` are obsolete for runtime (kept only as historical reference / data importers).

## Route inventory (export snapshot)

See `packages/api/data/exports/INDEX.json` for per-app route counts and SHA.
