# Remote deploy (VPS)

Compose project: `arara` (pasta `~/remote-arara` no servidor).

Não usa o projeto `remote` do portal-suporte — evita conflito de nomes/`-p`.

## Arquivos

| File | Role |
|------|------|
| `base.yml` | volumes + network |
| `core.yml` | `app` (platform API) + `database` (Postgres) |

## Fluxo CI

O workflow `.github/workflows/deploy.yml`:

1. Build + push da imagem para **Docker Hub**
2. SSH → rsync `remote/` → pull → `prisma migrate deploy`
3. `docker compose up` do stack
4. Seed/integra apps (dados JSONB / users — **não** controllers). Controllers are code-first in `src/apps/<slug>`:

```bash
# optional data import only — does NOT publish runtime controllers anymore
npm run integrate:portal-suporte   # or integrate:all-apps após dumps
```

Runtime handlers: `npm run export:routes` + `npm run codegen:routes` in the monorepo, then deploy the built API image.

Migrations de schema: `init` → `app_hosting` → `app_memberships` → `app_secrets` → `app_secret_server_only`.  

### AppSecret (credenciais de terceiros)

Diferente de `ApiKey` (hash one-way para auth): `AppSecret` guarda valores recuperáveis (token WhatsApp etc.) com AES-256-GCM e `APP_SECRETS_KEY`.

Default **`serverOnly: true`**: valor em claro só com JWT admin/owner ou ApiKey **machine** (`app:{slug}:secrets:read`). Keys de UI (`app:{slug}:*`) listam metadados mas **não** leem o valor — evita exposição via `localStorage`.

```bash
POST /v1/apps/:slug/secrets   { "name": "whatsapp_token", "value": "…", "serverOnly": true }
GET  /v1/apps/:slug/secrets                  # lista (inclui serverOnly), sem valores
GET  /v1/apps/:slug/secrets/:name            # valor: admin/owner JWT ou machine key
POST /v1/apps/:slug/keys      { "machine": true, "name": "server" }  # admin/owner; só no env
DELETE /v1/apps/:slug/secrets/:name          # só JWT
```

**Produção:** o secret `APP_SECRETS_KEY` no GitHub Actions deve ser o mesmo valor em `~/remote-arara/.env` no VPS (já provisionado). Gerar uma vez com `openssl rand -base64 32` e **não** rotacionar sem recriptografar secrets existentes.

Controllers (`/v1/r`) podem usar `ctx.secrets.get`, `ctx.fetch` (allowlist), `ctx.randomBytes(n)` (hex CSPRNG) e `ctx.randomUUID()`. Em prod preferir só BY_APP (global vazio): `SANDBOX_FETCH_ALLOWLIST_BY_APP=portal-suporte:www.avisaapi.com.br,portal-suporte:openrouter.ai,portal-suporte:api.arara-tech.com,portal-horas:api.arara-tech.com`, `SANDBOX_TIMEOUT_MS=15000`. Sem as duas vars, `ctx.fetch` nega tudo.

Imagem: `{DOCKERHUB_USERNAME}/{DOCKERHUB_REPOSITORY}` (ex. `dockerflip747/arara-api`; default repo `arara-api`).

## Vars / secrets (GitHub)

| Tipo | Nome | Obrigatório | Default / exemplo |
|------|------|-------------|-------------------|
| **Secret** | `DOCKERHUB_USERNAME` | sim | `dockerflip747` |
| **Secret** | `DOCKERHUB_TOKEN` | sim | Access Token (não a senha) |
| **Secret** | `SSH_KEY` | sim | chave privada SSH do VPS |
| **Secret** | `DB_PASSWORD` | sim | senha Postgres |
| **Secret** | `JWT_SECRET` | sim | string longa aleatória |
| **Var** | `JWT_EXPIRES_IN` | não | `7d` (access JWT) |
| **Var** | `REFRESH_TOKEN_EXPIRES_DAYS` | não | `30` |
| **Secret** | `APP_SECRETS_KEY` | sim | base64 de 32 bytes (`openssl rand -base64 32`) — AES-256 para `AppSecret`; **não** reutilizar `JWT_SECRET` |
| **Var** | `MACHINE_IP` | sim | IP/DNS do VPS |
| **Var** | `REMOTE_USER` | sim | `ubuntu` |
| **Var** | `DB_NAME` | sim | `arara_platform` |
| **Var** | `DB_USER` | sim | `arara` |
| **Var** | `PUBLIC_HOST` | sim | IP/domínio público |
| **Var** | `DOCKERHUB_REPOSITORY` | não | `arara-api` |
| **Var** | `SSH_PORT` | não | `22` |
| **Var** | `DB_HOST` | não | `arara-platform-db` (nome do container na rede `arara`) |
| **Var** | `DB_PORT` | não | `5432` |
| **Var** | `APP_PORT` | não | `4100` |
| **Var** | `SANDBOX_TIMEOUT_MS` | não | `15000` |
| **Var** | `SANDBOX_FETCH_ALLOWLIST` | não | vazio (preferir BY_APP; hosts globais exatos se precisar) |
| **Var** | `SANDBOX_FETCH_ALLOWLIST_BY_APP` | não* | `portal-suporte:www.avisaapi.com.br,portal-suporte:openrouter.ai,portal-suporte:api.arara-tech.com,portal-horas:api.arara-tech.com` (`slug:hostname` vírgula). *Obrigatório em prod se global estiver vazio — senão WhatsApp/IA/etc. morrem. |
| **Var** | `SANDBOX_FETCH_TIMEOUT_MS` | não | `8000` |
