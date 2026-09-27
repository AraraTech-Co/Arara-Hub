#!/usr/bin/env bash
# Execução manual do job auto-close.
# Fecha tickets com status 'resolvido' há mais de 7 dias.
#
# Uso no VPS:
#   bash scripts/run-auto-close-once.sh
#
# O script lê DATABASE_URL do container Next.js em execução.

set -euo pipefail

CONTAINER="${PORTAL_CONTAINER:-portal-suporte}"
DAYS="${1:-7}"

echo "==> Lendo DATABASE_URL do container '$CONTAINER'..."
DB_URL=$(docker exec "$CONTAINER" printenv DATABASE_URL)

if [ -z "$DB_URL" ]; then
  echo "ERRO: DATABASE_URL não encontrado no container '$CONTAINER'."
  echo "      Ajuste a variável PORTAL_CONTAINER= ou verifique o nome do container."
  exit 1
fi

# Extrai partes da URL: postgresql://user:pass@host:port/dbname
PGUSER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
PGPASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
PGHOST=$(echo "$DB_URL" | sed -E 's|.*@([^:]+):.*|\1|')
PGPORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
PGDATABASE=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')

export PGPASSWORD

echo "==> Banco: $PGDATABASE em $PGHOST:$PGPORT (usuário: $PGUSER)"
echo ""

# Preview
echo "==> Tickets que serão fechados (resolvido há mais de $DAYS dias):"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "
  SELECT id, title, status, updated_at
  FROM tickets
  WHERE status = 'resolvido'
    AND updated_at < NOW() - INTERVAL '$DAYS days'
  ORDER BY updated_at ASC;
"

echo ""
read -rp "Confirmar fechamento? [s/N] " CONFIRM
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
  echo "Cancelado."
  exit 0
fi

# Executa
UPDATED=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -c "
  UPDATE tickets
  SET status = 'fechado', updated_at = NOW()
  WHERE status = 'resolvido'
    AND updated_at < NOW() - INTERVAL '$DAYS days'
  RETURNING id;
" | grep -c '[a-z0-9]' || true)

echo ""
echo "==> Concluído: $UPDATED ticket(s) fechados."
