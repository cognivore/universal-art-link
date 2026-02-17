#!/usr/bin/env bash
set -euo pipefail

# ─── UAL v2 Server Setup ────────────────────────────────────────────
# Run ONCE on a fresh server (or one that already has Node+pnpm+Caddy).
# Installs PostgreSQL 16, creates the DB and user, creates the ual
# system user, and sets up directory structure.
#
# Usage:  ssh root@your-server 'bash -s' < deploy/setup-server.sh
# ─────────────────────────────────────────────────────────────────────

DEPLOY_DIR="/opt/ual-v2"
DB_NAME="ual_v2"
DB_USER="ual_v2"
SYS_USER="ual"

echo "=== UAL v2: Server Setup ==="

# ── 1. Install PostgreSQL 16 if not present ──────────────────────────
if ! command -v psql &>/dev/null; then
  echo "Installing PostgreSQL 16..."
  apt-get update -qq
  apt-get install -y -qq postgresql postgresql-contrib
  systemctl enable --now postgresql
  echo "PostgreSQL installed."
else
  echo "PostgreSQL already present: $(psql --version)"
fi

# ── 2. Create DB user and database ──────────────────────────────────
echo "Setting up database..."
DB_PASS="${UAL_DB_PASSWORD:-$(openssl rand -hex 16)}"

sudo -u postgres psql -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

sudo -u postgres psql -tc \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

sudo -u postgres psql -c \
  "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

# Also grant schema permissions (Postgres 15+ requires explicit schema grants)
sudo -u postgres psql -d "${DB_NAME}" -c \
  "GRANT ALL ON SCHEMA public TO ${DB_USER};"

echo "Database '${DB_NAME}' ready. User: ${DB_USER}, Password: ${DB_PASS}"
echo ""
echo "  DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
echo ""

# ── 3. Create system user (if not exists) ───────────────────────────
if ! id "${SYS_USER}" &>/dev/null; then
  useradd --system --shell /usr/sbin/nologin --home-dir "${DEPLOY_DIR}" "${SYS_USER}"
  echo "Created system user '${SYS_USER}'."
else
  echo "System user '${SYS_USER}' already exists."
fi

# ── 4. Create directory structure ────────────────────────────────────
mkdir -p "${DEPLOY_DIR}"/{data,releases,logs}
chown -R "${SYS_USER}:${SYS_USER}" "${DEPLOY_DIR}"

echo "Directory structure:"
echo "  ${DEPLOY_DIR}/"
echo "  ├── data/       (uploaded media)"
echo "  ├── releases/   (published site revisions)"
echo "  └── logs/"
echo ""

# ── 5. Ensure Node/pnpm are available ───────────────────────────────
if ! command -v node &>/dev/null; then
  echo "WARNING: Node.js not found. Install Node 20+ before deploying."
fi
if ! command -v pnpm &>/dev/null; then
  echo "WARNING: pnpm not found. Install pnpm before deploying."
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy deploy/env.production.template to ${DEPLOY_DIR}/.env"
echo "  2. Fill in DATABASE_URL (printed above), JWT_SECRET, RESEND_API_KEY, etc."
echo "  3. Run: deploy/deploy.sh root@your-server"
