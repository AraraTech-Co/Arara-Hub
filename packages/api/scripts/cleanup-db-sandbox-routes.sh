#!/usr/bin/env bash
# One-shot cleanup: remove DB-stored sandbox controllers (code-first API).
# Safe after runtime no longer reads module_routes.controller_code.
set -euo pipefail

echo "This script is a reference. Production cleanup was applied on Hostinger."
echo "SQL:"
cat <<'SQL'
BEGIN;
DELETE FROM module_routes;
DELETE FROM modules;
DELETE FROM apps WHERE slug IN (
  'festa-da-firma',
  'doc-apoio', 'doc-apoio-2', 'doc-apoio-3', 'doc-apoio-4'
);
COMMIT;
VACUUM FULL module_routes;
VACUUM FULL modules;
SQL
