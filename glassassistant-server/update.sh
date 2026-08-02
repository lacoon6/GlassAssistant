#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
git pull --ff-only
docker compose config --quiet
docker compose build --pull
docker compose up -d --remove-orphans
docker image prune -f
docker compose ps
