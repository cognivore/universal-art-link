# Commerce Quickstart Guide

## Single-Tenant Setup (Recommended for Artists)

### 1. Get your Shopify Storefront API token

1. Go to your Shopify Admin dashboard
2. Navigate to **Apps** → **Develop apps** (or **App development**)
3. Click **Create an app**
4. Name it (e.g., "UAL Storefront")
5. Go to **Configuration** tab
6. Find **Storefront API** section
7. Click **Configure**
8. Enable permission: `unauthenticated_read_product_listings`
9. Save and go to **API credentials** tab
10. Copy the **Storefront access token** (starts with a long string)

**Important**: This is a PUBLIC token, safe to commit to your repo.

### 2. Configure your shop

Edit `content/commerce/shop.yaml`:

```yaml
shop:
  domain: "your-actual-store.myshopify.com"  # Your Shopify domain
  name: "Your Studio Name"
  description: "Brief description of your shop"
  logoUrl: "/assets/your-logo.svg"
  storefrontAccessToken: "paste-your-token-here"  # From step 1
  featuredCollection: ""  # Optional: collection handle
  cartNote: "Order via Your Studio"

enableMultiMerchant: false  # Keep this false for single-tenant
```

### 3. Update site navigation

Edit `content/site.config.yaml`:

```yaml
navigation:
  - label: Work
    href: /work
  - label: Shop
    href: /shop  # Add this link
  - label: Contact
    href: /contact
```

### 4. Build and preview

```bash
pnpm cli dev
# Visit http://localhost:4173/shop
```

Your products will load automatically from Shopify with real prices and availability!

## What Happens

- Products are fetched from Shopify Storefront API on page load
- Real-time pricing and inventory status
- "Sold out" badges appear automatically
- Add to cart works with localStorage
- Checkout redirects to your Shopify domain

## Testing the Flow

1. Visit `http://localhost:4173/shop`
2. Products should load (if you have products in Shopify)
3. Add items to cart
4. Visit `/cart`
5. Click "Checkout on Shopify"
6. Should redirect to: `https://your-store.myshopify.com/cart/123:1,456:2?note=Order%20via...`

## Troubleshooting

### Products not loading

**Check console errors**: Open browser DevTools → Console
- "Failed to parse commerce payload" → Check shop.yaml syntax
- "Shopify API error: 401" → Wrong or missing access token
- "Shopify API error: 403" → Token doesn't have right permissions

**Verify token**: Make sure you copied the Storefront access token (NOT the Admin API token)

**Check domain**: Verify your shop domain is correct (no https://, no trailing slashes)

### Products show but "Sold out"

Your products might be:
- Actually sold out in Shopify
- Not published to your sales channel
- Set to "Draft" status

Go to Shopify Admin → Products → Check product status and inventory.

## Multi-Merchant Mode (Advanced)

For collectives or marketplaces with multiple Shopify stores:

1. Set `enableMultiMerchant: true` in `shop.yaml`
2. Visit admin panel → Commerce Suite
3. Use the 4-step wizard to add merchants
4. Manually map variant IDs for each product
5. Update navigation to `/merchants` instead of `/shop`

See `docs/single-vs-multi-merchant.md` for full details.

## API Endpoints (Admin)

When dev server is running, admin panel can access:

- `GET /__ual/api/commerce` - Full commerce data
- `GET /__ual/api/commerce/shop` - Shop configuration
- `POST /__ual/api/commerce/shop` - Save shop config
- `POST /__ual/api/commerce/mode` - Toggle single/multi mode

## File Structure

```
content/commerce/
  ├── shop.yaml          # Shop config + mode flag
  ├── merchants.yaml     # Multi-merchant data (only used if enableMultiMerchant: true)
  └── catalog.yaml       # Multi-merchant hero copy (optional)
```

Only `shop.yaml` is used in single-tenant mode.











