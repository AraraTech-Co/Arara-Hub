#!/usr/bin/env bash
# Static export do Arara Hub (client-only) + deploy no hosting da Arara Platform.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${ARARA_API_URL:-https://api.arara-tech.com}"
APP_SLUG="${ARARA_APP_SLUG:-arara-hub}"
API_KEY="${ARARA_API_KEY:-}"

if [[ -z "$API_KEY" ]]; then echo "Set ARARA_API_KEY (sk_live_...)"; exit 1; fi
cd "$ROOT"

cat > .env.local <<EOF
NEXT_PUBLIC_ARARA_API_URL=$API_URL
NEXT_PUBLIC_ARARA_APP_SLUG=$APP_SLUG
EOF

# usa a config de export
cp next.config.export.mjs next.config.mjs
trap 'rm -f next.config.mjs' EXIT
[[ -f next.config.ts ]] && mv next.config.ts next.config.ts.bak-export
trap 'rm -f next.config.mjs; [[ -f next.config.ts.bak-export ]] && mv next.config.ts.bak-export next.config.ts' EXIT

echo "→ build (static export)"
./node_modules/.bin/next build
[[ -d out ]] || { echo "build não gerou out/"; exit 1; }

ZIP="/tmp/${APP_SLUG}-out.zip"
rm -f "$ZIP"; (cd out && zip -qr "$ZIP" .)
echo "→ deploy → $API_URL/v1/apps/$APP_SLUG/hosting"
curl -s -X POST "$API_URL/v1/apps/$APP_SLUG/hosting" -H "x-api-key: $API_KEY" -F "file=@$ZIP" | head -c 400
echo
