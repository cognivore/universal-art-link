# UAL Single-Tenant Stripe Deployment Guide

This guide walks through setting up UAL (Universal Artistic Link) with single-tenant Stripe commerce on a Hetzner cloud server. By the end, you'll have:

- A production website at `yourdomain.com` with Stripe checkout
- A staging website at `staging.yourdomain.com` for testing
- Automatic TLS certificates via Caddy
- Magic link authentication for admin access

## Prerequisites

Before starting, you'll need:

- A domain name (we'll use Porkbun for DNS)
- A credit card for Hetzner (they charge ~€4.51/month for CX22)
- Basic terminal/command-line familiarity

**Time estimate:** 1-2 hours for first-time setup

---

## Step 1: Create a Stripe Account

### 1.1 Sign Up

1. Go to [stripe.com](https://stripe.com) and click "Start now"
2. Enter your email and create a password
3. Verify your email address

### 1.2 Complete Business Profile

1. In the Stripe Dashboard, click "Activate payments"
2. Fill in your business details:
   - Business type (Individual/Sole proprietor is fine)
   - Personal information
   - Business address
   - Bank account for payouts

**Note:** You can start with test mode while completing verification.

### 1.3 Get Your API Keys

1. Go to [Stripe Dashboard → Developers → API Keys](https://dashboard.stripe.com/apikeys)
2. Copy these values:
   - **Publishable key** (`pk_live_...`)
   - **Secret key** (`sk_live_...`) - click "Reveal" to see it

3. For test mode, switch to "Test mode" toggle and get:
   - **Test publishable key** (`pk_test_...`)
   - **Test secret key** (`sk_test_...`)

### 1.4 Set Up Webhooks

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter your webhook URL: `https://yourdomain.com/__ual/api/stripe/webhook`
4. Select events to listen to:
   - `checkout.session.completed`
   - `checkout.session.expired`
5. Click "Add endpoint"
6. Copy the **Signing secret** (`whsec_...`)

Repeat for staging with URL: `https://staging.yourdomain.com/__ual/api/stripe/webhook`

---

## Step 2: Set Up Hetzner Cloud

### 2.1 Create an Account

1. Go to [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Click "Try Hetzner Cloud" and create an account
3. Add a payment method (credit card required)

### 2.2 Create an API Token

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud/)
2. Select your project (or create one)
3. Click "Security" in the left sidebar
4. Click "API Tokens" → "Generate API Token"
5. Name it "UAL Deployment"
6. Select "Read & Write" permissions
7. Copy the token (you won't see it again!)

### 2.3 Add Your SSH Key

1. In the Hetzner console, go to "Security" → "SSH Keys"
2. Click "Add SSH Key"
3. Paste your public key (usually `~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`)
4. Give it a descriptive name

If you don't have an SSH key, create one:

```bash
ssh-keygen -t ed25519 -C "your@email.com"
```

---

## Step 3: Set Up DNS with Porkbun

### 3.1 Get API Credentials

1. Log in to [porkbun.com](https://porkbun.com)
2. Go to [Account → API Access](https://porkbun.com/account/api)
3. Create an API key:
   - Enter your password
   - Click "Create API Key"
4. Copy both:
   - **API Key** (`pk1_...`)
   - **Secret Key** (`sk1_...`)

### 3.2 Enable API for Your Domain

1. Go to your domain management page
2. Click the "API ACCESS" toggle to enable it

---

## Step 4: Configure Your Environment

### 4.1 Clone the Repository

```bash
git clone https://github.com/your-org/universal-artistic-link.git
cd universal-artistic-link
```

### 4.2 Create Your `.env` File

```bash
cp .env.example .env
```

### 4.3 Fill In Your Secrets

Edit `.env` with your values:

```bash
# Hetzner
HETZNER_API_TOKEN=your-hetzner-token

# Porkbun
PORKBUN_API_KEY=pk1_...
PORKBUN_API_SECRET=sk1_...

# Domain
UAL_BASE_DOMAIN=yourdomain.com

# Stripe Test Keys (for staging)
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...

# Stripe Live Keys (for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Generate these with: openssl rand -hex 32
UAL_JWT_SECRET=your-64-char-hex-secret
UAL_MAGIC_LINK_SECRET=another-64-char-hex-secret
```

Generate secrets:

```bash
openssl rand -hex 32  # Run twice, once for each secret
```

### 4.4 Generate Staging Bypass JWT

For automated testing, generate a staging bypass token:

```bash
npx tsx src/lib/stagingAuth.ts
```

Add the output to your `.env`:

```bash
UAL_STAGING_BYPASS=true
UAL_STAGING_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**⚠️ NEVER set `UAL_STAGING_BYPASS=true` in production!**

---

## Step 5: Deploy

### 5.1 Enter Development Environment

```bash
# Using Nix
nix develop

# Or with direnv
direnv allow
```

### 5.2 Run Full Deployment

```bash
./deploy/deploy.ysh full
```

This will:
1. Create a Hetzner CX22 server (~5 minutes)
2. Configure DNS records
3. Install Node.js, pnpm, and Caddy
4. Clone and build UAL
5. Set up systemd services
6. Configure TLS certificates

### 5.3 Verify Deployment

```bash
# Check staging
curl https://staging.yourdomain.com/__ual/healthz

# Check production
curl https://yourdomain.com/__ual/healthz
```

---

## Step 6: Set Up Admin Access

### 6.1 Configure Admin Emails

Set the `UAL_ADMIN_EMAILS` environment variable (comma-separated `email:name` pairs):

```bash
# Example: two admins (Name is optional; defaults to \"Admin\")
UAL_ADMIN_EMAILS=\"jm@memorici.de:Kartupelis,emilie.mchl@gmail.com:Pupina\"
```

Store this in `.env` (or your secret manager) before deploying. Only emails listed in `UAL_ADMIN_EMAILS` can receive magic links and log in.

### 6.2 Deploy the Update

```bash
./deploy/deploy.ysh install
```

### 6.3 Request Magic Link

1. Go to `https://yourdomain.com/admin`
2. Enter your email
3. Check your email for the magic link (or check server logs in dev mode)
4. Click the link to log in

---

## Step 7: Add Products

### 7.1 Via Admin Panel

1. Log in to `/admin`
2. Click "Commerce" → "Stripe Products"
3. Click "Add Product"
4. Fill in details:
   - Name
   - Description
   - Price (in cents, e.g., 2500 = $25.00)
   - Type: One-time or Subscription

### 7.2 Via YAML File

Edit `content/commerce/stripe-products.yaml`:

```yaml
products:
  - id: prod_art_print
    name: "Fine Art Print"
    description: "Museum-quality giclée print on archival paper"
    type: one_time
    priceAmountCents: 12000
    currency: USD
    isActive: true
    sortOrder: 0
```

---

## Step 8: Test Checkout

### 8.1 Test Mode

On staging, use Stripe test cards:

| Card Number | Result |
|-------------|--------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 9995 | Declined (insufficient funds) |
| 4000 0027 6000 3184 | Requires authentication |

Use any future expiry date and any 3-digit CVC.

### 8.2 Run E2E Tests

```bash
./deploy/deploy.ysh test
```

This runs automated tests against your staging server.

---

## Ongoing Maintenance

### View Logs

```bash
./deploy/deploy.ysh logs
```

### Update Deployment

```bash
./deploy/deploy.ysh install
```

### Destroy Infrastructure

```bash
./deploy/deploy.ysh destroy
```

---

## Cost Summary

| Service | Cost |
|---------|------|
| Hetzner CX22 | ~€4.51/month |
| Porkbun Domain | ~$10/year |
| Stripe | 2.9% + $0.30 per transaction |

**Total fixed costs:** ~$6-7/month

---

## Troubleshooting

### DNS Not Propagating

DNS changes can take up to 48 hours, but usually complete within 15 minutes. Check propagation:

```bash
dig staging.yourdomain.com
```

### Caddy TLS Issues

Check Caddy logs:

```bash
ssh root@your-server-ip
journalctl -u caddy -n 50
```

### Magic Links Not Working

1. Check the server logs for the magic link URL
2. Verify your email is present in `UAL_ADMIN_EMAILS`
3. Check the JWT and magic link secrets are set

### Stripe Webhooks Failing

1. Check the webhook signing secret matches
2. Verify the webhook URL is correct
3. Check Stripe Dashboard → Developers → Webhooks for errors

---

## Security Checklist

- [ ] Never commit `.env` to git
- [ ] Use different secrets for staging and production
- [ ] Never enable `UAL_STAGING_BYPASS` in production
- [ ] Regularly rotate API keys and secrets
- [ ] Keep dependencies updated
- [ ] Enable Stripe Radar for fraud protection

---

## Next Steps

- Set up email sending for magic links (Resend, SendGrid, etc.)
- Configure Stripe Radar for fraud detection
- Set up monitoring and alerting
- Create backup procedures for content
- Consider CDN for assets (Cloudflare, etc.)

