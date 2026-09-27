# Tooling

| Script | Purpose |
|--------|---------|
| `export-routes-from-db.ts` | SSH Hostinger → dump published `module_routes` into `packages/api/data/exports/` |
| `codegen-static-routes.ts` | Turn exports into `packages/api/src/apps/<slug>/routes.generated.ts` |

```bash
cd packages/api
npm run export:routes
npm run codegen:routes
```
