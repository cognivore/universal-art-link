# Shopify Commerce Suite

## Overview

The UAL commerce suite enables multi-merchant e-commerce using Shopify cart permalinks. Artists and local businesses can:
- Register their business and Shopify shop domain
- Map catalog items to Shopify variant IDs
- Let customers browse and add items to a cart
- Redirect to Shopify for secure checkout

**No Shopify API keys or secrets are stored.** The system only persists shop domains and variant IDs to construct cart URLs.

## Architecture

### Data Layer
- **Types**: `src/types/commerce.ts` - Zod schemas for Merchant, MerchantItem, Cart payloads
- **Storage**: `src/lib/commerceStore.ts` - CRUD operations on `content/commerce/*.yaml`
- **Cart URLs**: `src/lib/shopifyCart.ts` - Builds Shopify permalink format
- **Tests**: `src/lib/shopifyCart.test.ts` - 4 test cases for URL building

### Backend API
- **Endpoints**: `src/lib/devServer.ts` (lines 181-297) - `/__ual/api/commerce/*`
  - `GET /commerce` - Read all merchants/items/catalog
  - `POST /merchants` - Create merchant
  - `PATCH /merchants/:id` - Update merchant
  - `DELETE /merchants/:id` - Delete merchant (cascades to items)
  - `POST /merchants/:id/items` - Create item
  - `PATCH /items/:id` - Update item
  - `DELETE /items/:id` - Delete item
  - `POST /catalog` - Save catalog hero/empty-state copy

### Admin UI
- **Location**: `apps/admin/src/features/commerce/`
- **Components**:
  - `CommerceSuite.tsx` - Main wizard + merchant/item panels
  - `useCommerce.ts` - State management hook
- **API Client**: `apps/admin/src/lib/commerce-api.ts`
- **Integration**: `apps/admin/src/App.tsx` - Tab switcher between CMS and Commerce

### Storefront
- **Build**: `src/lib/build.ts` - Generates `/merchants`, `/merchants/[slug]`, `/cart`
- **Styles**: `templates/styles/editorial.css` (lines 730-1005) - Commerce cards, cart groups
- **Runtime**: `templates/scripts/app.js` - localStorage cart, add-to-cart, Shopify redirects

## Data Files

### Merchants
**Location**: `content/commerce/merchants.yaml`

```yaml
merchants:
  - id: mrt_abc123
    ownerUserId: system
    name: Atelier Press
    slug: atelier-press
    shopDomain: atelier-press.myshopify.com
    logoUrl: /assets/logo-atelier.svg
    description: Letterpress print studio
    isActive: true
    createdAt: 2025-01-15T12:00:00.000Z
    updatedAt: 2025-01-15T12:00:00.000Z

items:
  - id: itm_xyz789
    merchantId: mrt_abc123
    title: Print Pack (3x A3)
    description: Chromatic giclée prints
    imageUrl: /assets/print-pack.svg
    shopifyVariantId: "48712093813533"
    displayPrice: "$120"
    isActive: true
    sortOrder: 0
    createdAt: 2025-01-15T12:00:00.000Z
    updatedAt: 2025-01-15T12:00:00.000Z
```

### Catalog Config
**Location**: `content/commerce/catalog.yaml`

```yaml
hero:
  title: Shop from local studios
  body: Support independent artists and makers
  ctaLabel: Browse catalog
  ctaHref: /merchants
emptyState:
  title: No merchants yet
  body: Check back soon for new offerings
```

## Workflow

### 1. Merchant Onboarding (Admin Wizard)
1. **Shopify Setup** - Guide merchant to create Shopify account, products, variants
2. **Register in UAL** - Form captures name, slug, shop domain, logo
3. **Map Items** - Create catalog entries linking to Shopify variant IDs
4. **Launch** - Add `/merchants` to site navigation, test checkout flow

### 2. Customer Flow (Storefront)
1. Browse `/merchants` - Grid of active merchants
2. Visit `/merchants/[slug]` - Merchant detail with item cards
3. Add items to cart - localStorage-backed, works across sessions
4. View `/cart` - Items grouped by merchant
5. Click "Checkout on Shopify" - Redirect to `https://shop.myshopify.com/cart/12345:2,67890:1`
6. Complete purchase on Shopify - UAL doesn't track orders

## Shopify Cart Permalink Format

```
https://{shop_domain}/cart/{variant_id}:{quantity},{variant_id}:{quantity}?note={note}
```

**Example**:
```
https://atelier-press.myshopify.com/cart/48712093813533:2,48712093813534:1?note=Order%20via%20UAL
```

## Testing

```bash
# Type check
nix develop --command pnpm lint

# Run tests (includes Shopify cart URL tests)
nix develop --command pnpm test

# Build site with commerce pages
nix develop --command pnpm cli build

# Dev server with commerce API
nix develop --command pnpm cli dev
# Then visit http://localhost:4173/admin
```

## Security

- **No Shopify Admin API** - Never calls Shopify endpoints
- **No API tokens stored** - Only public shop domains and variant IDs
- **Client-side cart** - Uses localStorage, works without auth
- **Stateless checkout** - Redirects to Shopify, no order tracking

## Limitations

- No inventory sync - Items may be out of stock on Shopify
- No price validation - Display prices are UI-only
- No order history - Customers manage orders via Shopify
- Separate checkouts - Each merchant requires individual Shopify redirect
- No webhooks - UAL doesn't receive order completion events

## Future Enhancements

- Multi-merchant carts (combine into single Shopify if same domain)
- Inventory availability indicators (client-side Storefront API)
- Merchant analytics dashboard (page views, cart additions)
- Email notifications (order confirmations via Shopify webhooks)






