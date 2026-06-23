#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-wb_niche_local}"

psql \
  --host "${PGHOST:-127.0.0.1}" \
  --port "${PGPORT:-7777}" \
  --username "${PGUSER:-wb_niche}" \
  --dbname "${PGDATABASE:-wb_niche_analysis}"
