# Portal CRM — Arara Tech

Front do CRM de vendas. **Produção = client-only na Arara Platform** (sem Prisma/Docker do app).

Leia **[`ARARA.md`](./ARARA.md)** antes de propor deploy VPS / NextAuth / migrations.

## Quick start

```bash
cp env.arara.example .env.local
npm install
npm run dev          # http://localhost:3010
```

## Deploy (oficial)

```bash
npm run export:deploy
```

UI: https://crm.arara-tech.com · API: https://api.arara-tech.com
