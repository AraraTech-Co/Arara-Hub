#!/usr/bin/env bash
# Zip a static directory and upload to Arara app hosting.
# Usage: bash scripts/deploy-hosting.sh <slug> <dir-with-index.html>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${ARARA_API_URL:-http://localhost:4100}"
SLUG="${1:?slug required}"
DIR="${2:?static dir required}"
API_KEY="${ARARA_API_KEY:-}"

if [[ -z "$API_KEY" && -f "$ROOT/data/${SLUG}-api-key.txt" ]]; then
  API_KEY="$(tr -d '\n' < "$ROOT/data/${SLUG}-api-key.txt")"
fi
if [[ -z "$API_KEY" ]]; then
  echo "Missing API key for $SLUG"
  exit 1
fi
if [[ ! -f "$DIR/index.html" ]]; then
  echo "No index.html in $DIR"
  exit 1
fi

ZIP="/tmp/${SLUG}-hosting.zip"
rm -f "$ZIP"
(cd "$DIR" && zip -qr "$ZIP" .)
echo "→ Artifact $ZIP ($(du -h "$ZIP" | cut -f1))"

RESP="$(curl -sS -X POST "$API_URL/v1/apps/$SLUG/hosting" \
  -H "x-api-key: $API_KEY" \
  -F "file=@$ZIP")"
echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
echo "$RESP" | python3 -c "import sys,json; print('URL', json.load(sys.stdin).get('hosting',{}).get('url',''))" 2>/dev/null || true
