# Portal de Cursos (`cursos.arara-tech.com`)

SPA Vite + React no app Arara `portal-cursos`. Conteúdo Markdown em models `Course` / `Lesson`. Acesso staff (`support` | `developer` | `admin`).

## Setup local

```bash
cd portal-cursos
cp .env.example .env
npm install
npm run dev
```

API local: `VITE_ARARA_API_URL=http://localhost:4100`.

## Integrate (platform)

```bash
cd platform
npm run integrate:portal-cursos
```

Cria app, models, rotas `/courses*`, memberships staff e seed “Deploy em homologação”.

Em produção, rode o mesmo script com `DATABASE_URL` do banco da platform.

## Deploy hosting

```bash
cd portal-cursos
ARARA_API_URL=https://api.arara-tech.com \
ARARA_API_KEY="$(tr -d '\n' < ../platform/data/portal-cursos-api-key.txt)" \
npm run deploy
```

Hosting sticky: `https://api.arara-tech.com/h/portal-cursos/` (porta dedicada no VPS).

## DNS / nginx

1. DNS: criar registro **A** `cursos.arara-tech.com` → `YOUR_DEPLOY_HOST` (mesmo host de `crm.` / `suporte.`).
2. Nginx no VPS já inclui snippet ` /etc/nginx/snippets/cursos-arara.conf` apontando para a porta sticky **10008** (atualize se o hosting mudar de porta).
3. Depois do DNS propagar, emitir TLS:

```bash
sudo certbot --nginx -d cursos.arara-tech.com
```

Enquanto o DNS não existir, o site responde em `http://YOUR_DEPLOY_HOST:10008/` e via proxy HTTP com `Host: cursos.arara-tech.com` na porta 80.

## Auth

Login em `/v1/auth/login`; o front minta key do app e chama `/v1/r/portal-cursos/*` com Bearer JWT (gate de papel no controller).
