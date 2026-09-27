#!/usr/bin/env bash
# Static export of portal-suporte UI (client-only) + deploy to Arara hosting.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${PLATFORM_DIR:-$ROOT/../platform}"
API_URL="${ARARA_API_URL:-http://localhost:4100}"
APP_SLUG="${ARARA_APP_SLUG:-portal-suporte}"
API_KEY="${ARARA_API_KEY:-}"

if [[ -z "$API_KEY" && -f "$PLATFORM/data/portal-suporte-api-key.txt" ]]; then
  API_KEY="$(tr -d '\n' < "$PLATFORM/data/portal-suporte-api-key.txt")"
fi
if [[ -z "$API_KEY" ]]; then
  echo "Set ARARA_API_KEY"
  exit 1
fi

cd "$ROOT"

if [[ ! -f .env.local ]]; then
  cat > .env.local << EOF
NEXT_PUBLIC_ARARA_API_URL=$API_URL
NEXT_PUBLIC_ARARA_APP_SLUG=$APP_SLUG
NEXT_PUBLIC_ARARA_API_KEY=
EOF
fi

STASH_DIR=".export-stash-$$"
mkdir -p "$STASH_DIR"
cleanup() {
  [[ -d "$STASH_DIR/api" && ! -d app/api ]] && mv "$STASH_DIR/api" app/api
  [[ -d "$STASH_DIR/uploads" && ! -d app/uploads ]] && mv "$STASH_DIR/uploads" app/uploads
  [[ -d "$STASH_DIR/pages-api" && ! -d pages/api ]] && mkdir -p pages && mv "$STASH_DIR/pages-api" pages/api
  [[ -f "$STASH_DIR/middleware.ts" && ! -f middleware.ts ]] && mv "$STASH_DIR/middleware.ts" middleware.ts
  [[ -f next.config.mjs.bak-export ]] && mv next.config.mjs.bak-export next.config.mjs
  # Park instrumentation / sentry so static export does not pull server SDK
  [[ -f "$STASH_DIR/instrumentation.ts" && ! -f instrumentation.ts ]] && mv "$STASH_DIR/instrumentation.ts" instrumentation.ts
  [[ -f "$STASH_DIR/sentry.client.config.ts" && ! -f sentry.client.config.ts ]] && mv "$STASH_DIR/sentry.client.config.ts" sentry.client.config.ts
  [[ -f "$STASH_DIR/sentry.server.config.ts" && ! -f sentry.server.config.ts ]] && mv "$STASH_DIR/sentry.server.config.ts" sentry.server.config.ts
  [[ -f "$STASH_DIR/sentry.edge.config.ts" && ! -f sentry.edge.config.ts ]] && mv "$STASH_DIR/sentry.edge.config.ts" sentry.edge.config.ts
  rm -rf "$STASH_DIR"
}
trap cleanup EXIT

echo "→ Parking server-only trees for static export"
[[ -d app/api ]] && mv app/api "$STASH_DIR/api"
[[ -d app/uploads ]] && mv app/uploads "$STASH_DIR/uploads"
[[ -d pages/api ]] && mv pages/api "$STASH_DIR/pages-api"
[[ -f middleware.ts ]] && mv middleware.ts "$STASH_DIR/middleware.ts"
[[ -f instrumentation.ts ]] && mv instrumentation.ts "$STASH_DIR/instrumentation.ts"
[[ -f sentry.client.config.ts ]] && mv sentry.client.config.ts "$STASH_DIR/sentry.client.config.ts"
[[ -f sentry.server.config.ts ]] && mv sentry.server.config.ts "$STASH_DIR/sentry.server.config.ts"
[[ -f sentry.edge.config.ts ]] && mv sentry.edge.config.ts "$STASH_DIR/sentry.edge.config.ts"

# Swap config
cp next.config.mjs next.config.mjs.bak-export
cp next.config.export.mjs next.config.mjs

echo "→ Building static export (local next $(./node_modules/.bin/next --version))"
./node_modules/.bin/next build

if [[ ! -d out ]]; then
  echo "Build did not produce out/"
  exit 1
fi

ZIP="/tmp/${APP_SLUG}-next-out.zip"
rm -f "$ZIP"
# Carimbo de versão: o portal é um SPA e a equipe deixa a aba aberta por dias —
# sem isto, cada deploy só chega a quem der F5. O front consulta este arquivo e
# avisa quando há versão nova (app/_hooks/use-versao-portal.ts).
printf '{"versao":"%s"}' "$(date -u +%Y%m%d%H%M%S)" > out/versao.json
(cd out && zip -qr "$ZIP" .)
echo "→ Artifact $ZIP ($(du -h "$ZIP" | cut -f1))"

# Permite validar a compilação sem publicar em produção — o portal tem gente
# operando, e nem toda verificação precisa virar deploy.
if [[ "${SKIP_DEPLOY:-}" == "1" ]]; then
  echo "→ SKIP_DEPLOY=1: artefato pronto em $ZIP, nada publicado"
  exit 0
fi

echo "→ Deploy hosting"
RESP="$(curl -sS -X POST "$API_URL/v1/apps/$APP_SLUG/hosting" \
  -H "x-api-key: $API_KEY" \
  -F "zip=@$ZIP")"
echo "$RESP" | python3 -m json.tool
echo "$RESP" | python3 -c "import sys,json; print('URL', json.load(sys.stdin).get('hosting',{}).get('url',''))"
