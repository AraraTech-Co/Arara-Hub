# Frontend containers (one per app)

Each SPA runs in its **own** Docker container on `arara_net`.  
Nginx serves the static build and proxies `/v1` → the API container (`API_UPSTREAM`).

This **replaces** the old API embedded hosting (`POST /v1/apps/:slug/hosting`, `/h/:slug/`, ports 10000–10050).

| Container | Host port | URL |
|-----------|-----------|-----|
| `arara-front-portal-horas` | 4201 | `http://$DEPLOY_HOST:4201` |
| `arara-front-portal-cursos` | 4202 | `http://$DEPLOY_HOST:4202` |
| `arara-front-portal-crm` | 4203 | `http://$DEPLOY_HOST:4203` |
| `arara-front-portal-suporte` | 4204 | `http://$DEPLOY_HOST:4204` |

```bash
# from monorepo root, on a machine with Docker (or rsync then build on VPS)
docker compose -f deploy/frontends.compose.yml build
docker compose -f deploy/frontends.compose.yml up -d
```

Canary API must set `DISABLE_APP_HOSTING=1` and `DISABLE_HOSTING_RESTORE=1`.
