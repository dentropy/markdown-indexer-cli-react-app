#!/bin/sh
# Publish VAULT_DIR into DATA_ROOT, then serve the reader and that site.
set -eu

vault="${VAULT_DIR:-/opt/vault}"
data="${DATA_ROOT:-/data}"

mkdir -p "$data"
if [ "${SKIP_PUBLISH:-}" != "1" ]; then
  markdown-indexer-cli -dir "$vault" -site-dir "$data"
fi

export DATA_ROOT="$data"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"
cd /opt/app
exec node server.mjs
