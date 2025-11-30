#!/usr/bin/env bash
# =============================================================================
# UAL Secrets Population Script
# Populates .env from passveil secrets
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")"

echo "🔐 Populating .env from passveil..."

# Fetch all secrets
echo "  Fetching Hetzner token..."
HETZNER=$(passveil show console.hetzner.com/projects/electricity/api-trolltech)

echo "  Fetching Porkbun credentials..."
PORKBUN_KEY=$(passveil show porkbun.com/api | head -n1)
PORKBUN_SECRET=$(passveil show porkbun.com/api | tail -n1)

echo "  Fetching Stripe TEST keys..."
STRIPE_TEST_PK=$(passveil show dashboard.stripe.com/okashi.school/test/api | head -n1)
STRIPE_TEST_SK=$(passveil show dashboard.stripe.com/okashi.school/test/api | tail -n1)
STRIPE_TEST_WH=$(passveil show dashboard.stripe.com/okashi.school/test/api/webhook)

echo "  Fetching Stripe LIVE keys..."
STRIPE_LIVE_PK=$(passveil show dashboard.stripe.com/okashi.school/prod/api | head -n1)
STRIPE_LIVE_SK=$(passveil show dashboard.stripe.com/okashi.school/prod/api | tail -n1)
STRIPE_LIVE_WH=$(passveil show dashboard.stripe.com/okashi.school/prod/api/webhook)

echo "  Fetching Resend API key..."
RESEND=$(passveil show resend.com/cognivore@github.com/api)

echo "  Fetching admin accounts..."
ADMIN_RAW=$(passveil show okashi.school/admins || true)
UAL_ADMIN_EMAILS=""
if [[ -n "${ADMIN_RAW}" ]]; then
  mapfile -t ADMIN_LINES <<< "${ADMIN_RAW}"
  ADMIN_ENTRIES=()
  for ((i = 0; i < ${#ADMIN_LINES[@]}; i += 2)); do
    name=$(echo "${ADMIN_LINES[i]:-}" | xargs)
    email=$(echo "${ADMIN_LINES[i+1]:-}" | xargs)
    if [[ -z "${email}" ]]; then
      continue
    fi
    if [[ -z "${name}" ]]; then
      name="Admin"
    fi
    ADMIN_ENTRIES+=("${email}:${name}")
  done
  if [[ ${#ADMIN_ENTRIES[@]} -gt 0 ]]; then
    UAL_ADMIN_EMAILS=$(IFS=,; echo "${ADMIN_ENTRIES[*]}")
  fi
fi

if [[ -z "${UAL_ADMIN_EMAILS}" ]]; then
  echo "❌ No admin entries resolved from passveil secret okashi.school/admins" >&2
  exit 1
fi

echo "  Generating JWT secrets..."
JWT_SECRET=$(openssl rand -hex 32)
MAGIC_SECRET=$(openssl rand -hex 32)

# Write .env file
cat > .env << EOF
# =============================================================================
# UAL Environment - okashi-school.com
# Generated: $(date)
# =============================================================================

# Hetzner Cloud API
HETZNER_API_TOKEN=${HETZNER}

# Porkbun DNS API
PORKBUN_API_KEY=${PORKBUN_KEY}
PORKBUN_API_SECRET=${PORKBUN_SECRET}

# Domain Configuration
UAL_BASE_DOMAIN=okashi-school.com
UAL_SERVER_NAME=ual-okashi

# Stripe Test/Staging Keys
STRIPE_PUBLISHABLE_KEY_TEST=${STRIPE_TEST_PK}
STRIPE_SECRET_KEY_TEST=${STRIPE_TEST_SK}
STRIPE_WEBHOOK_SECRET_TEST=${STRIPE_TEST_WH}

# Stripe Live/Production Keys
STRIPE_PUBLISHABLE_KEY=${STRIPE_LIVE_PK}
STRIPE_SECRET_KEY=${STRIPE_LIVE_SK}
STRIPE_WEBHOOK_SECRET=${STRIPE_LIVE_WH}

# Authentication Secrets
UAL_JWT_SECRET=${JWT_SECRET}
UAL_MAGIC_LINK_SECRET=${MAGIC_SECRET}

# Staging Auth Bypass
UAL_STAGING_BYPASS=true

# Email Service (Resend)
RESEND_API_KEY=${RESEND}
EMAIL_FROM=noreply@okashi-school.com

# Admin Users (comma-separated email:name pairs, required)
UAL_ADMIN_EMAILS="${UAL_ADMIN_EMAILS}"
EOF

# Generate staging JWT
echo "  Generating staging JWT..."
STAGING_JWT=$(UAL_JWT_SECRET="${JWT_SECRET}" node -e "
const crypto = require('crypto');
const header = { alg: 'HS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = { sub: 'staging@ual.local', name: 'Staging Santa 🎅', is_santa: true, iat: now, exp: now + 365*24*60*60 };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const data = b64(header) + '.' + b64(payload);
const sig = crypto.createHmac('sha256', process.env.UAL_JWT_SECRET).update(data).digest('base64url');
console.log(data + '.' + sig);
")

# Append staging JWT
echo "UAL_STAGING_JWT=${STAGING_JWT}" >> .env

echo ""
echo "✅ .env created successfully!"
echo ""
echo "Verify with: head -20 .env"
echo ""
echo "Next step: ./deploy/deploy.ysh full"

