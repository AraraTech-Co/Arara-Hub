#!/usr/bin/env bash
# Rebuild + restart one production frontend on Hostinger-Suporte.
# Usage: ./scripts/deploy-front.sh portal-suporte
set -euo pipefail

APP="${1:?usage: $0 <portal-suporte|portal-crm|portal-horas|portal-cursos>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-Hostinger-Suporte}"
REMOTE_DIR="${REMOTE_DIR:-~/arara-platform-src}"
API_UPSTREAM="${API_UPSTREAM:-http://arara-platform-prd:4100}"

case "$APP" in
  portal-suporte|portal-crm|portal-horas|portal-cursos) ;;
  *) echo "unknown app: $APP" >&2; exit 1 ;;
esac

echo "==> rsync apps/${APP} + deploy → ${REMOTE_HOST}:${REMOTE_DIR}"
ssh "${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}/apps ${REMOTE_DIR}/deploy"
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude dist --exclude .next --exclude out \
  --exclude coverage --exclude '*.log' \
  "${ROOT}/apps/${APP}/" "${REMOTE_HOST}:${REMOTE_DIR}/apps/${APP}/"
rsync -az --delete \
  "${ROOT}/deploy/" "${REMOTE_HOST}:${REMOTE_DIR}/deploy/"

echo "==> compose build/up ${APP}"
ssh "${REMOTE_HOST}" "APP='${APP}' API_UPSTREAM='${API_UPSTREAM}' REMOTE_DIR='${REMOTE_DIR}' bash -s" <<'REMOTE'
set -euo pipefail
cd "${REMOTE_DIR/#\~/$HOME}"
export API_UPSTREAM
docker compose -f deploy/frontends.compose.yml build "${APP}"
docker compose -f deploy/frontends.compose.yml up -d --no-deps "${APP}"
docker ps --filter "name=arara-front-${APP}" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
REMOTE

echo "==> ok"
