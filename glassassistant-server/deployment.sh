#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.production.example to .env and configure production values." >&2
  exit 1
fi

npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
curl --fail --silent --show-error http://127.0.0.1:3100/health
