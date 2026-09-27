#!/usr/bin/env bash
# Dump production DBs from Hostinger-Suporte → platform/data/*-prod/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOSTINGER_HOST:-Hostinger-Suporte}"
REMOTE_OUT=/tmp/arara-prod-dumps

ssh -o BatchMode=yes "$HOST" bash -s <<'REMOTE'
set -euo pipefail
DBCID=$(docker ps -qf name=remote-database)
OUT=/tmp/arara-prod-dumps
rm -rf "$OUT"
mkdir -p "$OUT/crm" "$OUT/horas" "$OUT/portal-suporte"
dump_db() {
  local db="$1" dest="$2"
  echo "Dumping $db"
  tables=$(docker exec "$DBCID" psql -U postgres -d "$db" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY 1;")
  for t in $tables; do
    docker exec "$DBCID" psql -U postgres -d "$db" -Atc \
      "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM \"$t\" t;" \
      > "$dest/${t}.json"
    echo "  $t $(wc -c < "$dest/${t}.json") bytes"
  done
}
dump_db crm "$OUT/crm"
dump_db horas "$OUT/horas"
dump_db "portal-suporte" "$OUT/portal-suporte"
echo DONE
REMOTE

mkdir -p "$ROOT/data"
rsync -az -e "ssh -o BatchMode=yes" "$HOST:$REMOTE_OUT/crm/" "$ROOT/data/portal-crm-prod/"
rsync -az -e "ssh -o BatchMode=yes" "$HOST:$REMOTE_OUT/horas/" "$ROOT/data/time-management-prod/"
rsync -az -e "ssh -o BatchMode=yes" "$HOST:$REMOTE_OUT/portal-suporte/" "$ROOT/data/portal-suporte-prod/"
echo "Local dumps ready under $ROOT/data/"
du -sh "$ROOT/data/portal-crm-prod" "$ROOT/data/time-management-prod" "$ROOT/data/portal-suporte-prod"
