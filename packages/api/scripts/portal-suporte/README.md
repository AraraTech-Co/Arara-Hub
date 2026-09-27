# Portal Suporte → Arara Platform

Integração do app de produção (Hostinger-Suporte) na API modular.

## O que foi feito

- Conta platform: `portal-suporte@arara.local` (role `developer`)
- App slug: `portal-suporte`
- **92 models** namespaced (`portal-suporte-Ticket`, `portal-suporte-Company`, …)
  - Controllers usam alias curto: `models.Ticket`, `models.Company`

- **61 modules / 363 routes** (todos os endpoints `app/api/**` do portal)
- **11.752 ModelRecords** importados do dump de produção
- Migration SQL: [`prisma/migrations/20260723160000_portal_suporte_data`](../prisma/migrations/20260723160000_portal_suporte_data/migration.sql) (~6.2MB)

## Credenciais

Geradas em `data/portal-suporte-credentials.json` ao rodar o integrate:

| Campo | Valor |
|-------|-------|
| Email | `portal-suporte@arara.local` |
| Senha | `portal-suporte123` |
| API key | `data/portal-suporte-api-key.txt` / credentials.json |

## Runtime

Base: `http://localhost:4100/v1/r/portal-suporte`

Exemplos (header `x-api-key: <key>`):

```bash
curl -s http://localhost:4100/v1/r/portal-suporte/tickets -H "x-api-key: $KEY"
curl -s http://localhost:4100/v1/r/portal-suporte/tickets/:id -H "x-api-key: $KEY"
curl -s http://localhost:4100/v1/r/portal-suporte/admin/companies -H "x-api-key: $KEY"
curl -s http://localhost:4100/v1/r/portal-suporte/admin/users -H "x-api-key: $KEY"
```

Paths espelham o portal sem o prefixo `/api` (ex.: `/api/tickets` → `/v1/r/portal-suporte/tickets`).

## Re-integrar / atualizar dump

1. Dump de produção (SSH `Hostinger-Suporte`):

```bash
# no servidor: export JSON por tabela (ver histórico do integrate)
scp -r Hostinger-Suporte:/tmp/ps-json platform/data/portal-suporte-prod
```

2. Regenerar manifest (models + controllers) e aplicar:

```bash
cd platform
npm run generate:portal-suporte-manifest
npm run integrate:portal-suporte
```

O integrate:
- upsert user/app/api key
- registra models + modules published
- importa JSON → `model_records` (preserva IDs)
- reescreve a migration SQL de dados

## Limitações do MVP

Controllers são **CRUD genéricos** no sandbox (`isolated-vm`), não a lógica completa do Next.js (IA, SSH, PDF, Meilisearch, websockets). Os **dados** e a **superfície de rotas** estão registrados para o front/Claude consumirem e evoluírem os controllers módulo a módulo.
