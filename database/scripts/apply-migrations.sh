#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

export PGPASSWORD="${PGPASSWORD:-wb_niche_local}"

for migration in "${DATABASE_DIR}"/migrations/*.sql; do
  echo "[database] applying ${migration}"
  psql \
    --host "${PGHOST:-127.0.0.1}" \
    --port "${PGPORT:-7777}" \
    --username "${PGUSER:-wb_niche}" \
    --dbname "${PGDATABASE:-wb_niche_analysis}" \
    --file "${migration}"
done
