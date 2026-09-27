# Frontend apps

All apps talk to the central API at `/v1/r/{slug}/...` (JWT or `x-api-key`).

| Folder | Slug | Default API URL env |
|--------|------|---------------------|
| `apps/portal-suporte` | `portal-suporte` | `NEXT_PUBLIC_ARARA_API_URL` / `VITE_ARARA_API_URL` |
| `apps/portal-crm` | `portal-crm` | `NEXT_PUBLIC_ARARA_API_URL` |
| `apps/portal-cursos` | `portal-cursos` | `VITE_ARARA_API_URL` |
| `apps/portal-horas` | `portal-horas` | `VITE_ARARA_API_URL` |
| `apps/portal-araratech` | `portal-araratech` | (legacy; prefer API hosting) |

Local default: `http://localhost:4100`.

```bash
# from monorepo root
npm run dev:api
# then in another terminal, e.g.
cd apps/portal-cursos && cp .env.example .env && npm install && npm run dev
```

Do not reintroduce per-app Next.js API routes as the source of truth for business logic.
