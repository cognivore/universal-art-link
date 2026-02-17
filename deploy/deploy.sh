#!/usr/bin/env bash
set -euo pipefail

# ─── UAL v2 Deploy ──────────────────────────────────────────────────
# Builds locally, rsync's to server, installs deps, runs migrations,
# installs/restarts systemd units.
#
# Usage:  ./deploy/deploy.sh root@your-server
# ─────────────────────────────────────────────────────────────────────

TARGET="${1:?Usage: deploy.sh user@host}"
DEPLOY_DIR="/opt/ual-v2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== UAL v2: Build & Deploy to ${TARGET} ==="

# ── 1. Build everything locally ──────────────────────────────────────
echo "Building monorepo..."
cd "${REPO_ROOT}"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build

echo "Build complete."

# ── 2. Rsync to server ──────────────────────────────────────────────
echo "Syncing to ${TARGET}:${DEPLOY_DIR}/ ..."

rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='data/' \
  --exclude='releases/' \
  --exclude='logs/' \
  --exclude='tests/' \
  --exclude='.turbo' \
  "${REPO_ROOT}/" "${TARGET}:${DEPLOY_DIR}/code/"

echo "Sync complete."

# ── 3. Install production dependencies on server ────────────────────
echo "Installing production dependencies on server..."

ssh "${TARGET}" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/ual-v2/code
pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod
REMOTE

echo "Dependencies installed."

# ── 4. Run migrations ───────────────────────────────────────────────
echo "Running migrations..."

ssh "${TARGET}" bash -s <<'REMOTE'
set -euo pipefail
set -a; source /opt/ual-v2/.env; set +a
cd /opt/ual-v2/code
node infra/migrations/runner.js
REMOTE

echo "Migrations done."

# ── 5. Fix ownership ────────────────────────────────────────────────
ssh "${TARGET}" "chown -R ual:ual /opt/ual-v2"

# ── 6. Install and restart systemd units ─────────────────────────────
echo "Installing systemd services..."

ssh "${TARGET}" bash -s <<'REMOTE'
set -euo pipefail

cp /opt/ual-v2/code/deploy/systemd/ual-v2-api.service      /etc/systemd/system/
cp /opt/ual-v2/code/deploy/systemd/ual-v2-realtime.service  /etc/systemd/system/
cp /opt/ual-v2/code/deploy/systemd/ual-v2-worker.service    /etc/systemd/system/

# Fix paths: services run from /opt/ual-v2/code, not /opt/ual-v2
sed -i 's|WorkingDirectory=/opt/ual-v2$|WorkingDirectory=/opt/ual-v2/code|' \
  /etc/systemd/system/ual-v2-*.service

systemctl daemon-reload
systemctl enable ual-v2-api ual-v2-realtime ual-v2-worker
systemctl restart ual-v2-api ual-v2-realtime ual-v2-worker

sleep 2
echo ""
echo "Service statuses:"
for svc in ual-v2-api ual-v2-realtime ual-v2-worker; do
  status=$(systemctl is-active "$svc" 2>/dev/null || true)
  echo "  ${svc}: ${status}"
done
REMOTE

echo ""
echo "=== Deploy complete ==="
echo "Services running at ${TARGET}."
