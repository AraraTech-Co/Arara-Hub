# Deploy produção (Hostinger-Suporte)

Nginx no host **não muda**. Mapeamento atual:

| Domínio / path | Porta | Container |
|----------------|-------|-----------|
| `api.arara-tech.com` | 4100 | `arara-platform-prd` |
| `suporte…/horas/` | 10000 | `arara-front-portal-horas` |
| `crm.arara-tech.com` | 10001 | `arara-front-portal-crm` |
| `suporte.arara-tech.com` | 10003 | `arara-front-portal-suporte` |
| `cursos.arara-tech.com` | 10008 | `arara-front-portal-cursos` |

| Recurso | Nome |
|---------|------|
| Imagem API | `arara-api:local` |
| Container API | `arara-platform-prd` |
| Build dir (servidor) | `~/arara-platform-api` |
| Env | `~/arara-platform-api/prd.env` |
| Rede | `arara_net` |
| Postgres | `arara-platform-db` / DB `production` |
| Fronts compose | `deploy/frontends.compose.yml` |
| API compose | `deploy/api.compose.yml` |

Flags de produção na API: `DISABLE_HOSTING_RESTORE=1`, `DISABLE_APP_HOSTING=1`, `ALLOW_DB_CONTROLLER_PUBLISH=0`.

## Rebuild / restart API

```bash
# do monorepo local
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude coverage --exclude .git \
  --exclude '*.log' --exclude data/hosting \
  packages/api/ Hostinger-Suporte:~/arara-platform-api/

ssh Hostinger-Suporte 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/arara-platform-api
docker build -t arara-api:local .

# refrescar env a partir do container em execução (se existir)
if docker inspect arara-platform-prd >/dev/null 2>&1; then
  docker inspect arara-platform-prd --format '{{range .Config.Env}}{{println .}}{{end}}' > prd.env
fi
grep -q '^DISABLE_HOSTING_RESTORE=' prd.env || echo 'DISABLE_HOSTING_RESTORE=1' >> prd.env
grep -q '^DISABLE_APP_HOSTING=' prd.env || echo 'DISABLE_APP_HOSTING=1' >> prd.env
grep -q '^ALLOW_DB_CONTROLLER_PUBLISH=' prd.env || echo 'ALLOW_DB_CONTROLLER_PUBLISH=0' >> prd.env

docker rm -f arara-platform-prd
docker run -d \
  --name arara-platform-prd \
  --restart unless-stopped \
  --network arara_net \
  -p 4100:4100 \
  --env-file prd.env \
  arara-api:local

curl -sf http://127.0.0.1:4100/health
REMOTE
```

Ou, no servidor com compose:

```bash
cd ~/arara-platform-api
# copiar deploy/api.compose.yml para cá (ou apontar -f)
docker compose -f api.compose.yml up -d --build
```

## Frontends

```bash
rsync -az --delete --exclude node_modules --exclude .git \
  apps/ deploy/ Hostinger-Suporte:~/arara-platform-src/
ssh Hostinger-Suporte 'cd ~/arara-platform-src && docker compose -f deploy/frontends.compose.yml up -d --build'
```

Fronts já apontam `VITE_*` / `NEXT_PUBLIC_*` para `https://api.arara-tech.com` e `API_UPSTREAM=http://arara-platform-prd:4100`.

## Smoke

```bash
curl -sf https://api.arara-tech.com/health
curl -sf "http://${DEPLOY_HOST}:4100/health"   # DEPLOY_HOST from your .env / CI vars
```

## GitHub Actions

Workflows (raiz do monorepo):

| Workflow | Disparo |
|----------|---------|
| `deploy-api.yml` | push em `packages/api/**` ou manual |
| `deploy-portal-suporte.yml` | push no app / Dockerfiles compartilhados |
| `deploy-portal-crm.yml` | idem |
| `deploy-portal-horas.yml` | idem |
| `deploy-portal-cursos.yml` | idem |
| `deploy-all.yml` | só manual (API + todos os fronts) |

Ambiente GitHub: criar **`production`** (Settings → Environments). Secrets/vars podem ficar no repositório; o environment só adiciona aprovação se você configurar.

### Secrets (Settings → Secrets and variables → Actions)

| Secret | Obrigatório | Valor |
|--------|-------------|-------|
| `SSH_PRIVATE_KEY` | **sim** | Chave **privada** completa (`-----BEGIN OPENSSH PRIVATE KEY-----` … `-----END …-----`). Multilinha, **sem aspas**. |

A chave **pública** correspondente deve estar em `~/.ssh/authorized_keys` do `DEPLOY_USER` no servidor.

**Erro `Load key … error in libcrypto`:** o secret está corrompido (aspas, CRLF, só a pública, ou colado em uma linha sem `\n`). Apague e recrie o secret. No terminal local:

```bash
# gerar par só para CI (recomendado)
ssh-keygen -t ed25519 -f ./arara-gha-deploy -N "" -C "github-actions-arara"
# secret = conteúdo de arara-gha-deploy (privado)
# no servidor, como o DEPLOY_USER:
#   cat arara-gha-deploy.pub >> ~/.ssh/authorized_keys
#   chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

> Runtime da API (`DATABASE_URL`, `JWT_SECRET`, …) **não** vai no GitHub — fica em `~/arara-platform-api/prd.env` no host.

### Variables

| Variable | Obrigatório | Exemplo |
|----------|-------------|---------|
| `DEPLOY_HOST` | **sim** | IP ou hostname do VPS (não versionar o valor real) |
| `DEPLOY_USER` | **sim** | `debian` **ou** `prod` (precisa bater com quem tem a pubkey + perms Docker) |
| `DEPLOY_SSH_PORT` | não | `22` |
| `API_REMOTE_DIR` | não | `arara-platform-api` — ou absoluto `/home/debian/arara-platform-api` se o user for `prod` e os dirs forem do `debian` |
| `FRONTS_REMOTE_DIR` | não | `arara-platform-src` (idem: absoluto se necessário) |
| `API_IMAGE` | não | `arara-api:local` |
| `API_HEALTH_URL` | não | `https://api.arara-tech.com/health` |
| `API_UPSTREAM` | não | `http://arara-platform-prd:4100` |

**User `prod` vs `debian`:** os builds atuais estão em `/home/debian/arara-platform-*`. Se `DEPLOY_USER=prod`, ou aponta `API_REMOTE_DIR` / `FRONTS_REMOTE_DIR` para esses paths absolutos (e libera escrita), ou deixa criar cópias novas em `/home/prod/…`. `prod` já está no grupo `docker`.

### Checklist no servidor (uma vez)

1. User `debian` com Docker sem sudo (ou no grupo `docker`).
2. Rede `arara_net` e Postgres `arara-platform-db` no ar.
3. `prd.env` já populado (ou container `arara-platform-prd` rodando para o workflow copiar o env).
4. Chave de deploy no `authorized_keys`.

### Disparo manual

Actions → workflow desejado → **Run workflow**.

## Notas

- Slug público `portal-horas` → storage/DB ainda `time-management` (`packages/api/src/lib/app-slugs.ts`).
- Controllers vêm de `packages/api/src/apps/<slug>/routes.generated.ts` (não do DB).
