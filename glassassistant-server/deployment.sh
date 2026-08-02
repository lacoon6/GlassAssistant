#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and configure production values." >&2
  exit 1
fi

docker compose config --quiet
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps
