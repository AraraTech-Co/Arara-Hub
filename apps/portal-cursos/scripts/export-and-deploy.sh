#!/usr/bin/env bash
# Build Vite SPA + deploy to Arara hosting (portal-cursos).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${PLATFORM_DIR:-$ROOT/../platform}"
API_URL="${ARARA_API_URL:-https://api.arara-tech.com}"
APP_SLUG="${ARARA_APP_SLUG:-portal-cursos}"
API_KEY="${ARARA_API_KEY:-}"

if [[ -z "$API_KEY" && -f "$PLATFORM/data/portal-cursos-api-key.txt" ]]; then
  API_KEY="$(tr -d '\n' < "$PLATFORM/data/portal-cursos-api-key.txt")"
fi
if [[ -z "$API_KEY" ]]; then
  echo "Set ARARA_API_KEY (or run integrate so platform/data/portal-cursos-api-key.txt exists)"
  exit 1
fi

cd "$ROOT"

echo "→ npm install / build"
npm install
npm run build

if [[ ! -d dist ]]; then
  echo "Build did not produce dist/"
  exit 1
fi

ZIP="/tmp/${APP_SLUG}-dist.zip"
rm -f "$ZIP"
(cd dist && zip -qr "$ZIP" .)
echo "→ Artifact $ZIP ($(du -h "$ZIP" | cut -f1))"

echo "→ Deploy hosting"
RESP="$(curl -sS -X POST "$API_URL/v1/apps/$APP_SLUG/hosting" \
  -H "x-api-key: $API_KEY" \
  -F "file=@$ZIP")"
echo "$RESP" | python3 -m json.tool
echo "$RESP" | python3 -c "import sys,json; print('URL', json.load(sys.stdin).get('hosting',{}).get('url',''))"
