#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @groupshot/web build
WEB_DIST="$PWD/apps/web/dist" TRUST_PROXY=1 PORT="${PORT:-8787}" bun apps/server/src/index.ts &
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 1
cloudflared tunnel --url "http://localhost:${PORT:-8787}"
