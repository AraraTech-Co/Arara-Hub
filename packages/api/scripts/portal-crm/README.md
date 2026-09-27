# portal-crm enrich scripts

```bash
# Local DB
npx tsx scripts/portal-crm/enrich-schemas-and-seed.ts
npx tsx scripts/portal-crm/enrich-controllers.ts

# Prod (compile first, then docker exec node)
npx esbuild scripts/portal-crm/*.ts --outdir=/tmp/portal-crm-js --format=esm --platform=node --packages=external
scp -r /tmp/portal-crm-js prod@HOST:/tmp/portal-crm-js
# docker cp + node scripts/portal-crm/enrich-*.js inside arara-platform-prd
```
