#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
git pull --ff-only
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
pm2 save
