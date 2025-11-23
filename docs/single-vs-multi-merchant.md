# Single-Tenant vs. Multi-Merchant Commerce

## Overview

UAL Commerce supports two modes:

### 1. Single-Tenant Mode (DEFAULT)
- One Shopify store per deployment
- Products fetched directly from Shopify Storefront API
- Simpler setup, no manual variant ID mapping
- Perfect for: Individual artists, single studios, tutors

### 2. Multi-Merchant Mode (OPT-IN)
- Multiple merchants/shops in one deployment
- Manual product catalog with variant ID mapping
- Marketplace-style browsing
- Perfect for: Collectives, multi-vendor platforms, co-ops

## Single-Tenant Setup

### 1. Configure your shop

Edit `content/commerce/shop.yaml`:

```yaml
shop:
  domain: "your-store.myshopify.com"
  name: "Your Studio Name"
  description: "Brief description"
  logoUrl: "/assets/your-logo.svg"
  storefrontAccessToken: "your-public-token-here"
  featuredCollection: "" # Optional: show specific collection
  cartNote: "Order via Your Studio"

enableMultiMerchant: false
```

### 2. Get Shopify Storefront API Token

1. Go to Shopify Admin > Apps > Develop apps
2. Click "Create an app"
3. Name it (e.g., "UAL Storefront")
4. Go to "Configuration" > "Storefront API"
5. Enable: `unauthenticated_read_product_listings`
6. Save and get your **Storefront access token**
7. Paste it into `shop.yaml`

**Important**: This is a PUBLIC token, safe to commit to your repo.

### 3. Add navigation link

In `content/site.config.yaml`:

```yaml
navigation:
  - label: Shop
    href: /shop
```

### 4. Your shop page automatically:
- Fetches products from Shopify (fresh on every page load)
- Shows real prices and availability
- Handles sold-out products
- Redirects to Shopify checkout

No manual sync needed! ✨

## Multi-Merchant Setup

### Enable multi-merchant mode

**Option 1**: Via config file

Set in `content/commerce/shop.yaml`:
```yaml
enableMultiMerchant: true
```

**Option 2**: Via CLI flag
```bash
pnpm cli dev --multi-merchant
```

**Option 3**: Via environment variable
```bash
UAL_MULTI_MERCHANT=true pnpm cli dev
```

### Then use the admin panel

1. Visit `http://localhost:4173/admin`
2. Click "Commerce Suite"
3. Follow the 4-step wizard to add merchants and items

## When to Use Each Mode

### Use Single-Tenant If:
- You're one artist/business with one Shopify store
- You want products to auto-sync from Shopify
- You don't want to manually map variant IDs
- You want the simplest possible setup

### Use Multi-Merchant If:
- You're building a collective/marketplace
- You have multiple independent Shopify stores
- You need custom product curation (not all Shopify products)
- You want fine-grained control over what shows where

## Technical Differences

| Feature | Single-Tenant | Multi-Merchant |
|---------|--------------|----------------|
| Data source | Shopify Storefront API | Local YAML files |
| Product sync | Automatic (live fetch) | Manual (admin UI) |
| Setup complexity | Low | Medium |
| Shopify stores | 1 | Many |
| Checkout | Shopify cart permalink | Shopify cart permalink |
| Navigation | `/shop` | `/merchants`, `/merchants/[slug]` |

## Migration

### From Multi to Single:
1. Pick one merchant as your primary shop
2. Copy their `shopDomain` to `shop.yaml`
3. Get Storefront API token
4. Set `enableMultiMerchant: false`
5. Update nav links: `/merchants` → `/shop`

### From Single to Multi:
1. Keep your `shop.yaml` config
2. Add merchants via admin UI
3. Set `enableMultiMerchant: true`
4. Update nav links: `/shop` → `/merchants`

