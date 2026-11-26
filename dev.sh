#!/usr/bin/env bash
# Serve a markdown-tools-cli -site-dir folder and run the React app against it.
# The app fetches directory.json, articles/, frontmatter/, backlinks/, and assets/.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
default_dir="$here/../../../markdown-indexer/libs/markdown-tools-cli/mememaps.net"
data_dir="${DATA_DIR:-$default_dir}"
data_port="${DATA_PORT:-8000}"
app_port="${APP_PORT:-5173}"

if [[ ! -f "$data_dir/directory.json" ]]; then
  echo "no directory.json in $data_dir" >&2
  echo "publish with: markdown-tools-cli -dir <vault> -site-dir <site>" >&2
  echo "the CLI writes manifest.json; this app fetches directory.json:" >&2
  echo "  ln -sfn manifest.json \"$data_dir/directory.json\"" >&2
  exit 1
fi

if [[ ! -d "$here/app/node_modules" ]]; then
  ( cd "$here/app" && npm install )
fi

echo "JSON at http://127.0.0.1:${data_port}/  ($data_dir)"
python3 -m http.server "$data_port" --directory "$data_dir" >/tmp/025-data-server.log 2>&1 &
data_pid=$!
cleanup() { kill "$data_pid" 2>/dev/null || true; }
trap cleanup EXIT

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:${data_port}/directory.json" >/dev/null; then
    break
  fi
  sleep 0.2
done

echo "app at http://127.0.0.1:${app_port}/"
cd "$here/app"
DATA_ORIGIN="http://127.0.0.1:${data_port}" npm run dev -- --host 0.0.0.0 --port "$app_port" --strictPort
