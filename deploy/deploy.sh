#!/usr/bin/env bash
# In-repo budp deploy: git pull -> build -> migrate -> seed -> recreate -> health.
# Runs on the VPS. Reproduces the legacy /opt/budp/deploy.sh, compose-driven.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export APP_ENV_FILE="${APP_ENV_FILE:-/opt/budp/app.env}"
PUBLIC_URL="https://budp.lumeapps.de"
set -a; source "$APP_ENV_FILE"; set +a
cd "$REPO_DIR"
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
echo "==> git pull";      git pull --ff-only
echo "==> build";         $COMPOSE build
echo "==> migrate";       $COMPOSE run --rm app npm run migrate
echo "==> seed groups";   $COMPOSE run --rm app npm run seed-groups
echo "==> seed brickpm";  $COMPOSE run --rm app npm run seed-brickpm
echo "==> recreate app";  docker rm -f budp-app >/dev/null 2>&1 || true
$COMPOSE up -d
echo "==> wait ready";    for i in $(seq 1 30); do docker logs budp-app 2>&1 | grep -q "Ready in" && break; sleep 2; done
echo "==> health";        curl -sS -o /dev/null -w "  /login -> %{http_code}\n" "$PUBLIC_URL/login" || true
echo "Done ($(git rev-parse --short HEAD))."
