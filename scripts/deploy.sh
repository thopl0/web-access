#!/usr/bin/env bash
#
# Deploy web-access on the production host (140.245.24.116).
# Pulls latest main, installs deps, builds, restarts the API + worker, and health-checks.
#
# Usage (run ON the server, from anywhere — it cd's to its own repo):
#   bash scripts/deploy.sh
#
# NOTE: this does NOT run database migrations. Schema changes are applied manually as additive DDL
# (sudo docker exec -i web-access-postgres-1 psql -U <user> -d webaccess) BEFORE running this.
set -euo pipefail

# Resolve the repo root from this script's own location, so the working directory doesn't matter.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

SERVICES=(web-access-api web-access-worker)
HEALTH_URL="http://localhost:4011/health"

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "Deploying from $REPO_DIR"
echo "  current: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

step "Pulling latest main"
git pull --ff-only
echo "  now at:  $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

step "Installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

step "Building"
pnpm build

step "Restarting services: ${SERVICES[*]}"
sudo systemctl restart "${SERVICES[@]}"

step "Waiting for health ($HEALTH_URL)"
ok=""
for _ in $(seq 1 15); do
  sleep 2
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)" = "200" ]; then
    ok="yes"
    break
  fi
done

step "Service status"
for s in "${SERVICES[@]}"; do
  printf '  %-22s %s\n' "$s" "$(systemctl is-active "$s" || true)"
done

if [ "$ok" = "yes" ]; then
  printf '\n\033[32m✓ Deploy complete — health check passed.\033[0m\n'
else
  printf '\n\033[31m✗ Deploy finished but health check did NOT pass.\033[0m\n'
  echo "  Inspect: journalctl -u web-access-api -n 50 --no-pager"
  exit 1
fi
