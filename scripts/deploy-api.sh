#!/usr/bin/env bash
# Rebuild + restart production API on Hostinger-Suporte.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-Hostinger-Suporte}"
REMOTE_DIR="${REMOTE_DIR:-~/arara-platform-api}"
IMAGE="${API_IMAGE:-arara-api:local}"

# Least-privilege ctx.fetch hosts (env does not travel in git — must live in prd.env).
DEFAULT_FETCH_BY_APP='portal-suporte:www.avisaapi.com.br,portal-suporte:openrouter.ai,portal-suporte:api.arara-tech.com,portal-horas:api.arara-tech.com'

echo "==> rsync packages/api → ${REMOTE_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude coverage --exclude .git \
  --exclude '*.log' --exclude data/hosting \
  "${ROOT}/packages/api/" "${REMOTE_HOST}:${REMOTE_DIR}/"

# Ship compose next to build context for optional docker compose usage
scp -q "${ROOT}/deploy/api.compose.yml" "${REMOTE_HOST}:${REMOTE_DIR}/api.compose.yml"

echo "==> build + recreate arara-platform-prd (${IMAGE})"
ssh "${REMOTE_HOST}" "IMAGE='${IMAGE}' REMOTE_DIR='${REMOTE_DIR}' DEFAULT_FETCH_BY_APP='${DEFAULT_FETCH_BY_APP}' bash -s" <<'REMOTE'
set -euo pipefail
cd "${REMOTE_DIR/#\~/$HOME}"
docker build -t "${IMAGE}" .

ENV_FILE=prd.env
if docker inspect arara-platform-prd >/dev/null 2>&1; then
  docker inspect arara-platform-prd --format '{{range .Config.Env}}{{println .}}{{end}}' > "${ENV_FILE}"
fi
touch "${ENV_FILE}"

# Set KEY=VAL when missing or empty (prd.env survives image rebuilds; defaults do not).
ensure_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    local cur
    cur="$(grep "^${key}=" "${ENV_FILE}" | head -1 | cut -d= -f2-)"
    if [ -z "${cur}" ]; then
      sed -i "s|^${key}=.*|${key}=${val}|" "${ENV_FILE}"
    fi
  else
    echo "${key}=${val}" >> "${ENV_FILE}"
  fi
}

ensure_env DISABLE_HOSTING_RESTORE 1
ensure_env DISABLE_APP_HOSTING 1
ensure_env ALLOW_DB_CONTROLLER_PUBLISH 0
ensure_env SANDBOX_FETCH_ALLOWLIST_BY_APP "${DEFAULT_FETCH_BY_APP}"
ensure_env SANDBOX_FETCH_TIMEOUT_MS 8000

# Anthropic → OpenRouter (portal-suporte IA); keep other slug:host entries.
if grep -q '^SANDBOX_FETCH_ALLOWLIST_BY_APP=.*api\.anthropic\.com' "${ENV_FILE}" \
  && ! grep -q '^SANDBOX_FETCH_ALLOWLIST_BY_APP=.*openrouter\.ai' "${ENV_FILE}"; then
  sed -i 's|portal-suporte:api\.anthropic\.com|portal-suporte:openrouter.ai|g' "${ENV_FILE}"
fi
# WhatsApp host must be reachable for portal-suporte (was often only on the old global list).
if grep -q '^SANDBOX_FETCH_ALLOWLIST_BY_APP=' "${ENV_FILE}" \
  && ! grep -q '^SANDBOX_FETCH_ALLOWLIST_BY_APP=.*www\.avisaapi\.com\.br' "${ENV_FILE}"; then
  sed -i "s|^SANDBOX_FETCH_ALLOWLIST_BY_APP=\\(.*\\)|SANDBOX_FETCH_ALLOWLIST_BY_APP=portal-suporte:www.avisaapi.com.br,\\1|" "${ENV_FILE}"
fi

docker rm -f arara-platform-prd
docker run -d \
  --name arara-platform-prd \
  --restart unless-stopped \
  --network arara_net \
  -p 4100:4100 \
  --env-file "${ENV_FILE}" \
  "${IMAGE}"

sleep 2
curl -sf http://127.0.0.1:4100/health
echo
docker ps --filter name=arara-platform-prd --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
REMOTE

echo "==> ok"
