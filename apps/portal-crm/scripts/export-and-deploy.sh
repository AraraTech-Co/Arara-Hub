#!/usr/bin/env bash
# Static export of CRM UI (client-only) + deploy to Arara hosting (portal-crm).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${PLATFORM_DIR:-$ROOT/../platform}"
API_URL="${ARARA_API_URL:-https://api.arara-tech.com}"
APP_SLUG="${ARARA_APP_SLUG:-portal-crm}"
API_KEY="${ARARA_API_KEY:-}"

if [[ -z "$API_KEY" && -f "$PLATFORM/data/portal-crm-api-key.txt" ]]; then
  API_KEY="$(tr -d '\n' < "$PLATFORM/data/portal-crm-api-key.txt")"
fi
if [[ -z "$API_KEY" ]]; then
  echo "Set ARARA_API_KEY"
  exit 1
fi

cd "$ROOT"

cat > .env.local << EOF
NEXT_PUBLIC_ARARA_API_URL=$API_URL
NEXT_PUBLIC_ARARA_APP_SLUG=$APP_SLUG
NEXT_PUBLIC_ARARA_API_KEY=
EOF

STASH_DIR=".export-stash-$$"
mkdir -p "$STASH_DIR"
cleanup() {
  [[ -d "$STASH_DIR/api" && ! -d app/api ]] && mv "$STASH_DIR/api" app/api
  [[ -f "$STASH_DIR/proxy.ts" && ! -f proxy.ts ]] && mv "$STASH_DIR/proxy.ts" proxy.ts
  [[ -f next.config.ts.bak-export ]] && mv next.config.ts.bak-export next.config.ts
  [[ -f next.config.mjs ]] && rm -f next.config.mjs
  rm -rf "$STASH_DIR"
}
trap cleanup EXIT

echo "→ Parking server-only trees for static export"
[[ -d app/api ]] && mv app/api "$STASH_DIR/api"
[[ -f proxy.ts ]] && mv proxy.ts "$STASH_DIR/proxy.ts"
# Remove any leftover export config from a previous failed run
rm -f next.config.mjs

# Swap config: Next 16 uses next.config.ts — park it and use export mjs
if [[ -f next.config.ts ]]; then
  mv next.config.ts next.config.ts.bak-export
fi
cp next.config.export.mjs next.config.mjs

echo "→ Building static export"
./node_modules/.bin/next build

if [[ ! -d out ]]; then
  echo "Build did not produce out/"
  exit 1
fi

ZIP="/tmp/${APP_SLUG}-next-out.zip"
rm -f "$ZIP"
(cd out && zip -qr "$ZIP" .)
echo "→ Artifact $ZIP ($(du -h "$ZIP" | cut -f1))"

echo "→ Deploy hosting"
RESP="$(curl -sS -X POST "$API_URL/v1/apps/$APP_SLUG/hosting" \
  -H "x-api-key: $API_KEY" \
  -F "file=@$ZIP")"
echo "$RESP" | python3 -m json.tool
echo "$RESP" | python3 -c "import sys,json; print('URL', json.load(sys.stdin).get('hosting',{}).get('url',''))"
