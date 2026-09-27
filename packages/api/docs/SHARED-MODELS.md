# Shared platform surface

## SQL (platform-native)

| Model | Purpose |
|-------|---------|
| `User` | Global identity (all apps) |
| `Role` / `Permission` / `UserRole` | RBAC |
| `App` | App registry (slug, status, owner) — **not** the source of HTTP routes |
| `AppMembership` | Per-app role for a shared user |
| `ApiKey` | Per-app authentication (hashed) |
| `AppSecret` | Per-app encrypted third-party credentials |
| `Notification` | Cross-app user notifications |
| `RefreshToken` | Auth sessions |
| `AppHosting` | SPA hosting metadata |

## App data (JSONB)

- Storage: `model_defs` + `model_records`
- Namespaced names: `{slug}-{PascalCase}` (e.g. `portal-suporte-Ticket`)
- Handlers use short aliases via `buildModelsApi`: `ctx.models.Ticket`

## Shared business aliases

Per project rule:

- **User**, **Company** (empresas), **ApiKey** — shared conceptually across apps
- `Company` is still stored as app-scoped JSONB where present (e.g. `portal-suporte-Company`) and exposed as `ctx.models.Company` until a future relational promotion
- Do **not** invent `portal-suporte-User` as a second identity store

## Routes (code-first)

HTTP handlers live in `packages/api/src/apps/<slug>/routes.generated.ts` (regenerated from `data/exports` via `npm run codegen:routes`). Runtime URL: `/v1/r/<slug>/...`.
