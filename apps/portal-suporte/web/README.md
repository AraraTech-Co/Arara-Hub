# Portal Suporte — frontend (Arara API)

SPA Vite/React **sem backend local**. Consome apenas a Arara Platform:

- Auth: `POST /v1/auth/login`
- Dados: `/v1/r/portal-suporte/...`

O app Next.js em `../` (Prisma + `app/api`) fica legado; o artefato de hosting é este `web/`.

## Dev

```bash
cp .env.example .env
npm install
npm run dev
```

Login seed: `portal-suporte@arara.local` / `portal-suporte123`  
Cole a API key do app (arquivo `platform/data/portal-suporte-api-key.txt`) se quiser.

## Build + deploy hosting

```bash
./scripts/deploy-hosting.sh
```

Sobe zip em `POST /v1/apps/portal-suporte/hosting` (porta 10000–20000).
