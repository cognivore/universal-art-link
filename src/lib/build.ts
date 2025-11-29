import fs from 'fs-extra';
import path from 'node:path';
import { createPathConfig, PathConfig } from './paths.js';
import { loadPages, loadSiteConfig } from './contentLoader.js';
import { renderBlogPost, renderSections } from './sections.js';
import { clearTemplateCache, renderWithLayout } from './template.js';
import { BlogPost, Page, SiteConfig } from '../types/content.js';
import { readCommerceData, type CommerceSnapshot } from './commerceStore.js';
import { readStripeProducts } from './stripeProductStore.js';
import type { CatalogConfig, Merchant, MerchantItem } from '../types/commerce.js';
import type { StripeProduct } from '../types/stripe-commerce.js';

export type BuildOptions = {
  readonly rootDir: string;
  readonly outDir?: string;
  readonly invalidateTemplates?: boolean;
};

export type BuildResult = {
  readonly pages: number;
  readonly outputDir: string;
  readonly previewPaths: ReadonlyArray<string>;
};

const slugToOutputPath = (slug: string): string => {
  if (slug === '/' || slug === './') {
    return 'index.html';
  }
  const normalized = slug.startsWith('/') ? slug.slice(1) : slug;
  return path.join(normalized, 'index.html');
};

const slugDepth = (slug: string): number => {
  if (slug === '/' || slug === './') {
    return 0;
  }
  return slug.split('/').filter((segment) => segment.length > 0).length;
};

const relativeFromDepth = (depth: number): string =>
  depth === 0 ? '.' : Array.from({ length: depth }, () => '..').join('/');

const assetHref = (depth: number, subPath: string): string => {
  const base = relativeFromDepth(depth);
  return `${base}/${subPath}`.replace('//', '/');
};

const slugToHref = (slug: string, depth: number): string => {
  if (slug === '/') {
    return depth === 0 ? './' : `${relativeFromDepth(depth)}/`;
  }
  const normalized = slug.startsWith('/') ? slug.slice(1) : slug;
  return `${relativeFromDepth(depth)}/${normalized}/index.html`.replace('//', '/');
};

const createLinkResolver = (depth: number) => (href: string): string => {
  if (!href) {
    return '#';
  }
  if (/^(https?:|mailto:|tel:|#)/.test(href)) {
    return href;
  }
  if (href.startsWith('/')) {
    return slugToHref(href, depth);
  }
  return href;
};

const themeToCssVariables = (theme: SiteConfig['theme']): string => {
  const densityScale: Record<'airy' | 'standard' | 'tight', Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string>> = {
    airy: {
      xs: '0.75rem',
      sm: '1.25rem',
      md: '2.25rem',
      lg: '3.5rem',
      xl: '5rem',
    },
    standard: {
      xs: '0.5rem',
      sm: '1rem',
      md: '1.5rem',
      lg: '2.5rem',
      xl: '4rem',
    },
    tight: {
      xs: '0.35rem',
      sm: '0.75rem',
      md: '1.25rem',
      lg: '2rem',
      xl: '3.25rem',
    },
  };

  const density = densityScale[theme.density] ?? densityScale.standard;

  const vars: Record<string, string> = {
    '--bg': theme.background,
    '--fg': theme.foreground,
    '--accent': theme.accent,
    '--muted': theme.muted,
    '--border-subtle': theme.borderSubtle,
    '--font-display': theme.typography.displaySans,
    '--font-body': theme.typography.bodySans,
    '--font-accent': theme.typography.accentSerif ?? theme.typography.bodySans,
    '--space-xs': density.xs,
    '--space-sm': density.sm,
    '--space-md': density.md,
    '--space-lg': density.lg,
    '--space-xl': density.xl,
  };

  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');
};

const copyIfExists = async (source: string, destination: string): Promise<void> => {
  const exists = await fs.pathExists(source);
  if (!exists) {
    return;
  }
  await fs.copy(source, destination, { overwrite: true });
};

const copyAdminInterface = async (paths: PathConfig): Promise<void> => {
  const destination = path.join(paths.outputDir, 'admin');
  const modernBundle = paths.adminAppDistDir;
  if (await fs.pathExists(modernBundle)) {
    await fs.copy(modernBundle, destination, { overwrite: true });
    return;
  }
  await copyIfExists(paths.adminDir, destination);
  await copyIfExists(paths.adminSharedDir, path.join(destination, 'shared'));
};

const buildNavigation = (
  config: SiteConfig,
  depth: number,
  currentSlug: string,
): ReadonlyArray<{ readonly label: string; readonly href: string; readonly active: boolean }> =>
  config.navigation.map((item) => {
    const href = item.href.startsWith('/') ? slugToHref(item.href, depth) : item.href;
    const isExact = item.href === currentSlug;
    const isNested = item.href !== '/' && currentSlug?.startsWith(`${item.href}/`);
    const active = Boolean(isExact || isNested);
    return { label: item.label, href, active };
  });

const buildSocial = (
  config: SiteConfig,
): ReadonlyArray<{ readonly label: string; readonly href: string }> =>
  (config.socialLinks ?? []).map((link) => ({ label: link.label, href: link.href }));

const renderPageToHtml = async (
  page: Page,
  site: SiteConfig,
  paths: PathConfig,
): Promise<{ readonly html: string; readonly outputPath: string }> => {
  const depth = slugDepth(page.slug);
  const resolveLink = createLinkResolver(depth);
  const resolvePost = (postId: string): BlogPost | undefined => (page.journalPosts ?? []).find((post) => post.id === postId);
  const renderedSections = renderSections(page.sections, { resolveLink, resolvePost });
  const themeVars = themeToCssVariables(site.theme);

  const metaTitle = `${page.title} · ${site.siteTitle}`;
  const canonical =
    site.baseUrl.startsWith('http://') || site.baseUrl.startsWith('https://')
      ? new URL(page.slug, site.baseUrl).toString()
      : `${site.baseUrl.replace(/\/$/, '')}${page.slug}`;

  const context = {
    site,
    page,
    meta: {
      title: metaTitle,
      description: page.description ?? site.siteDescription,
      canonicalUrl: canonical,
    },
    assets: {
      styles: assetHref(depth, 'styles/editorial.css'),
      scripts: assetHref(depth, 'scripts/app.js'),
      base: relativeFromDepth(depth),
    },
    sections: renderedSections,
    themeVars,
    navigation: buildNavigation(site, depth, page.slug),
    socialLinks: buildSocial(site),
  };

  const layout = page.layout ?? 'default';
  const html = await renderWithLayout(layout, context, paths);
  const outputPath = path.join(paths.outputDir, slugToOutputPath(page.slug));
  return { html, outputPath };
};

const renderBlogPostPage = async (
  post: BlogPost,
  parentPage: Page,
  site: SiteConfig,
  paths: PathConfig,
): Promise<{ readonly html: string; readonly outputPath: string }> => {
  const depth = slugDepth(post.slug);
  const resolveLink = createLinkResolver(depth);
  const renderedBody = renderBlogPost(post, { resolveLink });
  const themeVars = themeToCssVariables(site.theme);
  const metaTitle = `${post.title} · ${site.siteTitle}`;
  const canonical =
    site.baseUrl.startsWith('http://') || site.baseUrl.startsWith('https://')
      ? new URL(post.slug, site.baseUrl).toString()
      : `${site.baseUrl.replace(/\/$/, '')}${post.slug}`;

  const pageStub: Page = {
    slug: post.slug,
    title: post.title,
    description: post.excerpt ?? parentPage.description ?? site.siteDescription,
    layout: 'blog',
    sections: [],
    journalPosts: [],
  };

  const context = {
    site,
    page: pageStub,
    meta: {
      title: metaTitle,
      description: pageStub.description ?? site.siteDescription,
      canonicalUrl: canonical,
    },
    assets: {
      styles: assetHref(depth, 'styles/editorial.css'),
      scripts: assetHref(depth, 'scripts/app.js'),
      base: relativeFromDepth(depth),
    },
    sections: [renderedBody],
    themeVars,
    navigation: buildNavigation(site, depth, post.slug),
    socialLinks: buildSocial(site),
    post,
  };

  const html = await renderWithLayout('blog', context, paths);
  const outputPath = path.join(paths.outputDir, slugToOutputPath(post.slug));
  return { html, outputPath };
};

type CommercePageDefinition = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly sections: string[];
};

const escapeHtmlLite = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const serializeCommercePayload = (payload: unknown): string => JSON.stringify(payload).replace(/</g, '\\u003c');

const createCommerceDataScript = (payload: unknown): string =>
  `<script type="application/json" id="ual-commerce-data">${serializeCommercePayload(payload)}</script>`;

const renderCatalogHeroSection = (
  site: SiteConfig,
  catalog: CatalogConfig | undefined,
): string => {
  const title = catalog?.hero?.title?.trim() || 'Neighborhood commerce, powered by Shopify';
  const body =
    catalog?.hero?.body?.trim() ||
    `Browse studio prints, tutoring sessions, and services published through ${site.siteTitle}.`;
  const ctaLabel = catalog?.hero?.ctaLabel?.trim() || 'Browse merchants';
  const ctaHref = catalog?.hero?.ctaHref?.trim() || '#merchant-list';
  return `<section class="section commerce-hero stack">
    <p class="kicker">Local commerce</p>
    <h1 class="display">${escapeHtmlLite(title)}</h1>
    <p class="measure">${escapeHtmlLite(body)}</p>
    <div class="commerce-hero__actions">
      <a class="btn btn--solid" href="${escapeHtmlLite(ctaHref)}">${escapeHtmlLite(ctaLabel)}</a>
      <a class="btn btn--ghost" href="/cart">View cart</a>
    </div>
  </section>`;
};

const renderMerchantGridSection = (
  merchants: ReadonlyArray<{ merchant: Merchant; items: MerchantItem[] }>,
  emptyState: CatalogConfig['emptyState'] | undefined,
): string => {
  if (merchants.length === 0) {
    const title = emptyState?.title?.trim() || 'No merchants are live yet';
    const body =
      emptyState?.body?.trim() ||
      'Use the Commerce Suite wizard in your admin panel to activate the first merchant.';
    return `<section class="section commerce-merchant-grid stack" id="merchant-list">
      <div class="commerce-empty">
        <h3>${escapeHtmlLite(title)}</h3>
        <p class="measure">${escapeHtmlLite(body)}</p>
        <a class="btn btn--solid" href="/cart">Visit cart</a>
      </div>
    </section>`;
  }
  const cards = merchants
    .map(({ merchant, items }) => {
      const count = items.length;
      const offeringsLabel = `${count} offering${count === 1 ? '' : 's'}`;
      const logo = merchant.logoUrl
        ? `<img src="${escapeHtmlLite(merchant.logoUrl)}" alt="${escapeHtmlLite(merchant.name)} logo" loading="lazy" />`
        : `<div class="commerce-merchant-card__placeholder">${escapeHtmlLite(merchant.name.charAt(0).toUpperCase())}</div>`;
      const description = merchant.description
        ? `<p class="commerce-merchant-card__description">${escapeHtmlLite(merchant.description)}</p>`
        : '';
      return `<article class="commerce-merchant-card">
        <div class="commerce-merchant-card__logo">${logo}</div>
        <div class="commerce-merchant-card__body">
          <h3>${escapeHtmlLite(merchant.name)}</h3>
          ${description}
          <div class="commerce-merchant-card__meta">
            <span>${offeringsLabel}</span>
            <a class="btn btn--ghost" href="/merchants/${escapeHtmlLite(merchant.slug)}">View offerings</a>
          </div>
        </div>
      </article>`;
    })
    .join('\n');
  return `<section class="section commerce-merchant-grid stack" id="merchant-list">
    <div class="commerce-merchant-grid__items">
      ${cards}
    </div>
  </section>`;
};

const renderMerchantHeroSection = (merchant: Merchant): string => {
  const description = merchant.description
    ? `<p class="measure">${escapeHtmlLite(merchant.description)}</p>`
    : '';
  const logo = merchant.logoUrl
    ? `<figure class="commerce-merchant-hero__logo">
        <img src="${escapeHtmlLite(merchant.logoUrl)}" alt="${escapeHtmlLite(merchant.name)} logo" loading="lazy" />
      </figure>`
    : '';
  return `<section class="section commerce-merchant-hero grid-2">
    ${logo}
    <div class="commerce-merchant-hero__copy stack">
      <p class="kicker">Merchant</p>
      <h1 class="display">${escapeHtmlLite(merchant.name)}</h1>
      ${description}
      <div class="commerce-merchant-hero__links">
        <a class="btn btn--solid" href="/cart">Go to cart</a>
        <a class="btn btn--ghost" href="/merchants">Back to merchants</a>
      </div>
    </div>
  </section>`;
};

const renderMerchantItemsSection = (merchant: Merchant, items: MerchantItem[]): string => {
  if (items.length === 0) {
    return `<section class="section commerce-item-grid stack" data-merchant-id="${escapeHtmlLite(merchant.id)}">
      <p class="measure">No offerings are available yet. Check back soon.</p>
    </section>`;
  }
  const cards = items
    .map((item) => {
      const description = item.description ? `<p class="measure">${escapeHtmlLite(item.description)}</p>` : '';
      const image = item.imageUrl
        ? `<div class="commerce-item-card__media">
            <img src="${escapeHtmlLite(item.imageUrl)}" alt="${escapeHtmlLite(item.title)}" loading="lazy" />
          </div>`
        : '';
      const price = item.displayPrice
        ? `<span class="commerce-item-card__price">${escapeHtmlLite(item.displayPrice)}</span>`
        : '<span class="commerce-item-card__price commerce-item-card__price--muted">Price shown at checkout</span>';
      return `<article class="commerce-item-card" data-item-id="${escapeHtmlLite(item.id)}" data-merchant-id="${escapeHtmlLite(item.merchantId)}" data-variant-id="${escapeHtmlLite(item.shopifyVariantId)}">
        ${image}
        <div class="commerce-item-card__body">
          <div class="commerce-item-card__intro">
            <h3>${escapeHtmlLite(item.title)}</h3>
            ${price}
          </div>
          ${description}
          <div class="commerce-item-card__actions">
            <label class="commerce-item-card__quantity">
              <span class="micro-label">Quantity</span>
              <input type="number" min="1" value="1" data-quantity-input />
            </label>
            <button class="btn btn--solid" type="button" data-add-to-cart>Add to cart</button>
          </div>
        </div>
      </article>`;
    })
    .join('\n');
  return `<section class="section commerce-item-grid stack" data-merchant-id="${escapeHtmlLite(merchant.id)}">
    <div class="commerce-item-grid__items">
      ${cards}
    </div>
  </section>`;
};

const renderCartSection = (isSingleTenant = false, shopName = ''): string => {
  const noteText = isSingleTenant
    ? 'Review your items below and click checkout to complete your purchase on Shopify.'
    : 'Your cart may include items from multiple businesses. You will complete a separate Shopify checkout for each merchant.';

  const emptyMessage = isSingleTenant
    ? `No items yet. Visit the shop to browse ${shopName ? shopName + ' offerings' : 'available products'}.`
    : 'No items yet. Visit the merchants catalog to add prints, services, or tutoring sessions.';

  const emptyLink = isSingleTenant
    ? `<a class="btn btn--solid" href="/shop">Browse shop</a>`
    : `<a class="btn btn--solid" href="/merchants">Browse merchants</a>`;

  return `<section class="section commerce-cart stack" data-cart-root>
    <div class="stack">
      <p class="kicker">Shopify checkout</p>
      <h1 class="display">Your cart</h1>
      <p class="measure" data-cart-note>
        ${escapeHtmlLite(noteText)}
      </p>
    </div>
    <div class="commerce-cart__groups" data-cart-groups></div>
    <div class="commerce-cart__empty" data-cart-empty>
      <p class="measure">${escapeHtmlLite(emptyMessage)}</p>
      ${emptyLink}
    </div>
  </section>`;
};

// Stripe Commerce Page Builders

const buildStripeShopPageDefinition = (site: SiteConfig, products: StripeProduct[]): CommercePageDefinition => {
  const stripeScript = `<script defer src="../scripts/stripe-checkout.js"></script>`;

  const heroSection = `<section class="section commerce-hero stack">
    <p class="kicker">Shop</p>
    <h1 class="display">${escapeHtmlLite(site.siteTitle)}</h1>
    <p class="measure">Browse our products and subscriptions</p>
  </section>`;

  // If there are products, render them statically; otherwise use dynamic loading
  const catalogSection = products.length > 0
    ? renderStripeProductsSection(products)
    : `<section class="section commerce-item-grid stack" data-stripe-catalog>
        <div class="commerce-loading">
          <p class="measure">Loading products...</p>
        </div>
      </section>`;

  const dataScript = createCommerceDataScript({ mode: 'stripe', products });

  return {
    slug: '/shop',
    title: 'Shop',
    description: `Shop from ${site.siteTitle}`,
    sections: [heroSection, catalogSection, dataScript, stripeScript],
  };
};

const renderStripeProductsSection = (products: StripeProduct[]): string => {
  const activeProducts = products.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  if (activeProducts.length === 0) {
    return `<section class="section commerce-item-grid stack">
      <div class="commerce-empty">
        <h3>No products available yet</h3>
        <p class="measure">Check back soon for new offerings.</p>
      </div>
    </section>`;
  }

  const cards = activeProducts.map((product) => {
    const image = product.imageUrl
      ? `<div class="commerce-item-card__media">
          <img src="${escapeHtmlLite(product.imageUrl)}" alt="${escapeHtmlLite(product.name)}" loading="lazy" />
        </div>`
      : '';

    const price = (product.priceAmountCents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: product.currency,
    });
    const interval = product.type === 'subscription' && product.interval ? ` / ${product.interval}` : '';
    const typeLabel = product.type === 'subscription'
      ? '<span class="commerce-item-card__badge">Subscription</span>'
      : '';

    const description = product.description
      ? `<p class="measure">${escapeHtmlLite(product.description)}</p>`
      : '';

    const quantityInput = product.type === 'one_time'
      ? `<label class="commerce-item-card__quantity">
          <span class="micro-label">Quantity</span>
          <input type="number" min="1" value="1" data-quantity-input />
        </label>`
      : '';

    const buttonLabel = product.type === 'subscription' ? 'Subscribe' : 'Buy now';

    return `<article class="commerce-item-card" data-stripe-product="${escapeHtmlLite(product.id)}">
      ${image}
      <div class="commerce-item-card__body">
        <div class="commerce-item-card__intro">
          <h3>${escapeHtmlLite(product.name)}</h3>
          <span class="commerce-item-card__price">${escapeHtmlLite(price)}${interval}</span>
          ${typeLabel}
        </div>
        ${description}
        <div class="commerce-item-card__actions">
          ${quantityInput}
          <button class="btn btn--solid" type="button" data-checkout-button>${buttonLabel}</button>
        </div>
      </div>
    </article>`;
  }).join('\n');

  return `<section class="section commerce-item-grid stack">
    <div class="commerce-item-grid__items">
      ${cards}
    </div>
  </section>`;
};

const buildCheckoutSuccessPageDefinition = (site: SiteConfig): CommercePageDefinition => {
  const content = `<section class="section stack" style="text-align: center; padding-top: 4rem;">
    <div class="stack" style="max-width: 500px; margin: 0 auto;">
      <p class="kicker">Order confirmed</p>
      <h1 class="display">Thank you!</h1>
      <p class="measure">Your order has been received and is being processed. You will receive a confirmation email shortly.</p>
      <div style="margin-top: 2rem;">
        <a class="btn btn--solid" href="/shop">Continue shopping</a>
        <a class="btn btn--ghost" href="/" style="margin-left: 1rem;">Back to home</a>
      </div>
    </div>
  </section>`;

  return {
    slug: '/checkout/success',
    title: 'Order Confirmed',
    description: 'Your order has been confirmed',
    sections: [content],
  };
};

const buildSingleShopPageDefinition = (site: SiteConfig, commerce: CommerceSnapshot): CommercePageDefinition | null => {
  if (!commerce.shop || !commerce.shop.domain) {
    return null;
  }

  const shopData = {
    domain: commerce.shop.domain,
    name: commerce.shop.name,
    description: commerce.shop.description,
    logoUrl: commerce.shop.logoUrl,
    storefrontAccessToken: commerce.shop.storefrontAccessToken || '',
    featuredCollection: commerce.shop.featuredCollection || '',
    cartNote: commerce.shop.cartNote || `Order via ${site.siteTitle}`,
  };

  const shopScript = createCommerceDataScript({ mode: 'single-tenant', shop: shopData });
  const storefrontScriptTag = `<script defer src="../scripts/shopify-storefront.js"></script>`;

  const heroSection = `<section class="section commerce-hero stack">
    <p class="kicker">Studio shop</p>
    <h1 class="display">${escapeHtmlLite(commerce.shop.name)}</h1>
    <p class="measure">${escapeHtmlLite(commerce.shop.description || 'Browse our offerings')}</p>
    <div class="commerce-hero__actions">
      <a class="btn btn--ghost" href="/cart">View cart</a>
    </div>
  </section>`;

  const catalogSection = `<section class="section commerce-item-grid stack" data-shop-catalog>
    <div class="commerce-loading">
      <p class="measure">Loading products from Shopify…</p>
    </div>
  </section>`;

  return {
    slug: '/shop',
    title: commerce.shop.name,
    description: commerce.shop.description || `Shop from ${commerce.shop.name}`,
    sections: [heroSection, catalogSection, shopScript, storefrontScriptTag],
  };
};

const buildCommercePageDefinitions = (site: SiteConfig, commerce: CommerceSnapshot): CommercePageDefinition[] => {
  const activeMerchants = commerce.merchants.filter((merchant) => merchant.isActive);
  const merchantEntries = activeMerchants
    .map((merchant) => {
      const items = commerce.items
        .filter((item) => item.merchantId === merchant.id && item.isActive)
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }
          return a.title.localeCompare(b.title);
        });
      return { merchant, items };
    })
    .sort((a, b) => a.merchant.name.localeCompare(b.merchant.name));

  const dataset = {
    siteTitle: site.siteTitle,
    merchants: activeMerchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      shopDomain: merchant.shopDomain,
      logoUrl: merchant.logoUrl,
      description: merchant.description,
    })),
    items: merchantEntries
      .flatMap((entry) => entry.items)
      .map((item) => ({
        id: item.id,
        merchantId: item.merchantId,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        shopifyVariantId: item.shopifyVariantId,
        displayPrice: item.displayPrice,
        sortOrder: item.sortOrder,
      })),
  };
  const commerceScript = createCommerceDataScript(dataset);

  const pages: CommercePageDefinition[] = [];
  pages.push({
    slug: '/merchants',
    title: 'Merchants',
    description:
      commerce.catalog?.hero?.body?.trim() ||
      `Browse the local catalog curated by ${site.siteTitle}`,
    sections: [renderCatalogHeroSection(site, commerce.catalog), renderMerchantGridSection(merchantEntries, commerce.catalog?.emptyState), commerceScript],
  });

  for (const { merchant, items } of merchantEntries) {
    pages.push({
      slug: `/merchants/${merchant.slug}`,
      title: merchant.name,
      description: merchant.description ?? `Offerings from ${merchant.name}`,
      sections: [renderMerchantHeroSection(merchant), renderMerchantItemsSection(merchant, items), commerceScript],
    });
  }

  pages.push({
    slug: '/cart',
    title: 'Cart',
    description: 'Grouped checkout links that redirect shoppers to Shopify.',
    sections: [renderCartSection(false, ''), commerceScript],
  });

  return pages;
};

const renderCommercePage = async (
  definition: CommercePageDefinition,
  site: SiteConfig,
  paths: PathConfig,
): Promise<{ readonly html: string; readonly outputPath: string }> => {
  const depth = slugDepth(definition.slug);
  const themeVars = themeToCssVariables(site.theme);
  const canonical =
    site.baseUrl.startsWith('http://') || site.baseUrl.startsWith('https://')
      ? new URL(definition.slug, site.baseUrl).toString()
      : `${site.baseUrl.replace(/\/$/, '')}${definition.slug}`;

  const pageStub: Page = {
    slug: definition.slug,
    title: definition.title,
    description: definition.description,
    layout: 'default',
    sections: [],
    journalPosts: [],
  };

  const context = {
    site,
    page: pageStub,
    meta: {
      title: `${definition.title} · ${site.siteTitle}`,
      description: definition.description ?? site.siteDescription,
      canonicalUrl: canonical,
    },
    assets: {
      styles: assetHref(depth, 'styles/editorial.css'),
      scripts: assetHref(depth, 'scripts/app.js'),
      base: relativeFromDepth(depth),
    },
    sections: definition.sections,
    themeVars,
    navigation: buildNavigation(site, depth, definition.slug),
    socialLinks: buildSocial(site),
  };

  const html = await renderWithLayout('default', context, paths);
  const outputPath = path.join(paths.outputDir, slugToOutputPath(definition.slug));
  return { html, outputPath };
};

export const buildSite = async ({ rootDir, outDir, invalidateTemplates }: BuildOptions): Promise<BuildResult> => {
  if (invalidateTemplates) {
    clearTemplateCache();
  }

  const paths = createPathConfig(rootDir, outDir);
  const [siteConfig, pages, commerce, stripeProducts] = await Promise.all([
    loadSiteConfig(paths.contentDir),
    loadPages(paths.pagesDir),
    readCommerceData(paths),
    readStripeProducts(paths),
  ]);

  await fs.ensureDir(paths.outputDir);
  await fs.emptyDir(paths.outputDir);

  const rendered: Array<{ html: string; outputPath: string }> = [];
  const blogPreviewPaths: string[] = [];
  for (const page of pages) {
    rendered.push(await renderPageToHtml(page, siteConfig, paths));
    if (Array.isArray(page.journalPosts)) {
      for (const post of page.journalPosts) {
        rendered.push(await renderBlogPostPage(post, page, siteConfig, paths));
        blogPreviewPaths.push(post.slug);
      }
    }
  }

  const commercePreviewPaths: string[] = [];

  // Check if we have Stripe products configured
  const hasStripeProducts = stripeProducts.products.length > 0;

  if (hasStripeProducts) {
    // Stripe commerce mode: generate /shop page with Stripe checkout
    const stripeShopPage = buildStripeShopPageDefinition(siteConfig, stripeProducts.products);
    rendered.push(await renderCommercePage(stripeShopPage, siteConfig, paths));
    commercePreviewPaths.push(stripeShopPage.slug);

    // Generate checkout success page
    const successPage = buildCheckoutSuccessPageDefinition(siteConfig);
    rendered.push(await renderCommercePage(successPage, siteConfig, paths));
    commercePreviewPaths.push(successPage.slug);
  } else if (commerce.enableMultiMerchant) {
    // Multi-merchant Shopify mode: generate /merchants pages
    const commercePages = buildCommercePageDefinitions(siteConfig, commerce);
    for (const commercePage of commercePages) {
      rendered.push(await renderCommercePage(commercePage, siteConfig, paths));
      commercePreviewPaths.push(commercePage.slug);
    }
  } else if (commerce.shop?.domain) {
    // Single-tenant Shopify mode: generate /shop page
    const shopPage = buildSingleShopPageDefinition(siteConfig, commerce);
    if (shopPage) {
      rendered.push(await renderCommercePage(shopPage, siteConfig, paths));
      commercePreviewPaths.push(shopPage.slug);
    }

    // Always generate /cart page for Shopify mode
    const cartPage: CommercePageDefinition = {
      slug: '/cart',
      title: 'Cart',
      description: 'Your shopping cart',
      sections: [renderCartSection(true, commerce.shop?.name || ''), createCommerceDataScript({
        mode: 'single-tenant',
        shop: commerce.shop
      })],
    };
    rendered.push(await renderCommercePage(cartPage, siteConfig, paths));
    commercePreviewPaths.push('/cart');
  }

  await Promise.all(
    rendered.map(async ({ html, outputPath }) => {
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, html, 'utf8');
    }),
  );

  await copyIfExists(paths.assetsDir, path.join(paths.outputDir, 'assets'));
  await copyIfExists(paths.stylesDir, path.join(paths.outputDir, 'styles'));
  await copyIfExists(paths.scriptsDir, path.join(paths.outputDir, 'scripts'));
  await copyAdminInterface(paths);

  const previewPaths = [...pages.map((page) => page.slug), ...blogPreviewPaths, ...commercePreviewPaths];
  return { pages: rendered.length, outputDir: paths.outputDir, previewPaths };
};

