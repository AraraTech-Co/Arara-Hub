# Archived Prisma data migrations

SQL dumps with production data are **not** in Git. Keep them locally (gitignored) if you need historical imports.

Homolog / prod schema path:

```bash
npx prisma migrate deploy
npm run integrate:all-apps   # requires local dumps under packages/api/data/*-prod/
```
