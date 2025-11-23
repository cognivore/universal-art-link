# Content Editing Guide

Designers and editors can update the site without touching templates or TypeScript. Everything lives inside `content/` and `assets/`.

## 1. Global settings

File: `content/site.config.yaml`

- `siteTitle`, `siteDescription`: update meta + footer copy.
- `favicon`: path to an asset in `assets/`.
- `theme`: background/foreground colors, accent, typography stacks, spacing density.
- `navigation`: order + labels of top navigation links. Use slugs (e.g. `/work`) or absolute URLs.
- `socialLinks`: shown in footer/sidebars.
- `deploy`: endpoint + auth for `universal-art-link deploy`.

## 2. Pages

Located under `content/pages/*.yaml`. Each page file contains:

- `slug`: route (e.g. `/`, `/work`, `/project-name`).
- `title` + optional `description`.
- `layout`: `default`, `project`, `index-grid`, `journal`, or `blog`.
- `sections`: ordered blocks that drive the layout.

### Section types

| Type            | Purpose                                                                      |
|-----------------|------------------------------------------------------------------------------|
| `hero`          | Large typographic intro with optional image + CTAs.                          |
| `projects-grid` | Image-led grid of portfolio entries (`span: wide | tall | standard`).        |
| `single-project`| Case study blocks mixing text, imagery, quotes, embeds.                      |
| `text-columns`  | 2–3 column manifesto/about copy.                                             |
| `list-section`  | Lists for press, clients, journal entries.                                   |
| `blog-roll`     | Auto-generated entry list that references structured journal posts.          |
| `contact`       | Email CTA + optional form action.                                            |

### Adding a project card

1. Open `content/pages/work.yaml`.
2. Add an entry under the `projects` array inside the relevant `projects-grid`.
3. Use `slug: "/project-new"` for internal links **or** `url` for external sites.
4. Drop the cover image into `assets/` and reference it via `/assets/...`.

### Creating a new page

1. Copy an existing file in `content/pages/`.
2. Update `slug`, `title`, and sections.
3. Reference the new slug inside `navigation` in `site.config.yaml`.
4. Run `pnpm cli build` or `universal-art-link dev` to preview.

## 3. Assets

- Place imagery/video inside `assets/`.
- Reference files via paths like `/assets/hero-still.svg`.
- Optimize visuals before committing for fast builds.

## 4. Preview + publish

```bash
universal-art-link dev       # live preview with hot reload
universal-art-link build     # regenerate dist/
universal-art-link package   # create dist/site-YYYYMMDD-HHMM.zip
universal-art-link deploy    # POST bundle to configured endpoint
```

### One-click deploy panel

- **Local admin (`pnpm admin`)** – serves `http://localhost:4545/` with the Cargo-style UI. Connect once, then press **Deploy** to trigger `build → package → upload`.
- **Inline admin (`pnpm cli dev`)** – open `http://localhost:4173/admin/` while the dev server is running for the live-reload version.
- Both panels share the same connection file (`.ual/connection.json`) and never send data until you deploy.

### Schema-driven editor

- `content/schema.json` defines the fields for site settings, pages, section blocks, and inline journal posts (stored under `journalPosts` on any page that uses the `journal` layout).
- `journalPosts` can be edited entirely inside the CMS. Each post stores its own slug, cover image, publish date, excerpt, and the same block types that power case studies. The `blog-roll` section simply references these posts, so editors focus on composing content once and reordering entries visually.
- The admin panels render these schemas into forms so editors can edit copy, add/reorder sections, update navigation, and tweak colors without seeing YAML—plus a live preview pane (when `pnpm cli dev` is running on `http://localhost:4173`) mirrors your changes.
- Use the dropdown inside the editor to insert any section defined in the schema; unsupported/custom sections fall back to JSON editors.
- Customize `content/schema.json` to expose new fields—no TypeScript changes required.

## 5. Shopify commerce catalog

**Files**

- `content/commerce/merchants.yaml` — master list of merchants + items.
  - `merchants`: array of records with `name`, `slug`, `shopDomain`, optional `logoUrl`, `description`, `isActive`.
  - `items`: array pointing at each merchant via `merchantId`. Every item needs a `shopifyVariantId` (numeric string). `displayPrice` is purely for UI; Shopify owns the real price at checkout.
- `content/commerce/catalog.yaml` — hero + empty-state copy for the public `/merchants` page.

**Editing flows**

- Open the admin panel (`pnpm admin` or `/admin/` while the dev server runs) and switch to the **Commerce Suite** tab. The wizard walks artists through Shopify prep → merchant profile → item mapping → launch checklist.
- Every merchant is scoped to the Shopify domain you paste. We never store Shopify secrets—just the public shop domain + variant IDs so we can form cart permalinks such as `https://mystore.myshopify.com/cart/123:2,456:1`.
- Each merchant can toggle `isActive`. Inactive merchants/items stay in the YAML/admin UI but disappear from the public `/merchants` catalog and checkout.

**Public experience**

- `/merchants` — hero copy + grid of active merchants.
- `/merchants/{slug}` — merchant detail with item cards, quantity selectors, and “Add to cart” buttons.
- `/cart` — grouped cart that stores selections in `localStorage`, shows one section per merchant, and redirects shoppers to Shopify when they click “Checkout on Shopify”. Multi-merchant carts display a note reminding visitors they’ll complete one Shopify checkout per merchant.
- Cart data works without accounts. Clearing cookies/localStorage resets the cart.

If CLI commands fail, read the error message—it points to the file/field that needs attention.
