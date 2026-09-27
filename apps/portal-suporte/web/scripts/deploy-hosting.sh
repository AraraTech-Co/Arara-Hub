#!/usr/bin/env bash
# Build SPA + zip + deploy to Arara platform hosting
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="$ROOT/web"
PLATFORM="${PLATFORM_DIR:-$ROOT/../platform}"
API_URL="${ARARA_API_URL:-http://localhost:4100}"
APP_SLUG="${ARARA_APP_SLUG:-portal-suporte}"
API_KEY="${ARARA_API_KEY:-}"

if [[ -z "$API_KEY" && -f "$PLATFORM/data/portal-suporte-api-key.txt" ]]; then
  API_KEY="$(tr -d '\n' < "$PLATFORM/data/portal-suporte-api-key.txt")"
fi

if [[ -z "$API_KEY" ]]; then
  echo "Set ARARA_API_KEY or ensure $PLATFORM/data/portal-suporte-api-key.txt exists"
  exit 1
fi

echo "→ Building web/"
cd "$WEB"
npm run build

ZIP="/tmp/${APP_SLUG}-front.zip"
rm -f "$ZIP"
(cd "$WEB/dist" && zip -qr "$ZIP" .)
echo "→ Artifact $ZIP ($(du -h "$ZIP" | cut -f1))"

echo "→ Deploying to $API_URL/v1/apps/$APP_SLUG/hosting"
RESP="$(curl -sS -X POST "$API_URL/v1/apps/$APP_SLUG/hosting" \
  -H "x-api-key: $API_KEY" \
  -F "file=@$ZIP")"

echo "$RESP" | python3 -m json.tool
URL="$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hosting',{}).get('url',''))")"
echo "→ Open $URL"
