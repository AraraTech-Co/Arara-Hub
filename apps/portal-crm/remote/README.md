# Produção (servidor remoto) — CRM

Deploy **sem registry externo**: o GitHub Actions sincroniza o código para
`/home/<REMOTE_USER>/crm-app` no VPS, **builda a imagem no próprio VPS** e sobe
o stack. Zero AWS/ECR. O CRM anexa à rede `remote_portal` (criada pelo
portal-suporte) para alcançar o Postgres pgvector existente.

- Projeto Compose: **`crm`** + serviço **`crm`** — isolado do stack `remote` /
  serviço `app` do portal-suporte. Sem isso, um `up` mata o outro.
- App servido na **porta 8080** do host (container escuta 3000).
- Banco: database **`crm`** dentro do Postgres compartilhado (`remote-database-1`,
  porta 5432, serviço `database` na rede `remote_portal`). Um database por app.
- Build via `docker compose build` no VPS, disparado pelo GitHub Actions no push
  para `main`.

## Rodar manualmente no VPS

```bash
cd /home/<user>/crm-app
export DB_USER=postgres DB_PASSWORD=*** DB_HOST=database DB_PORT=5432 DB_NAME=crm
export AUTH_SECRET=*** AUTH_URL=http://YOUR_DEPLOY_HOST:8080 AUTH_TRUST_HOST=true
docker compose -p crm -f remote/base.yml -f remote/core.yml build crm
docker compose -p crm -f remote/base.yml -f remote/core.yml run --rm crm prisma migrate deploy
docker compose -p crm -f remote/base.yml -f remote/core.yml up -d crm
```

## Configuração no GitHub (Settings > Secrets and variables > Actions)

**Repository variables:** `MACHINE_IP`, `REMOTE_USER` (=prod), `SSH_PORT` (=22),
`DB_HOST` (=database), `DB_PORT` (=5432), `DB_NAME` (=crm), `DB_USER` (=postgres),
`AUTH_URL`, `AUTH_TRUST_HOST` (=true), `NEXT_PUBLIC_SITE_URL`.

**Repository secrets:** `SSH_KEY` (chave privada do prod@VPS), `DB_PASSWORD`
(senha do Postgres compartilhado), `AUTH_SECRET`.

Sem credenciais AWS — o build e o deploy acontecem inteiramente no VPS via SSH.
