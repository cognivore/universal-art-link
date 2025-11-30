/**
 * Stripe Product Sync Service
 *
 * Provides bidirectional synchronization between local YAML products
 * and Stripe's product catalog.
 *
 * - Import: Fetches products from Stripe Dashboard and creates/updates local YAML
 * - Export: Creates Stripe products from local YAML and stores IDs back
 */

import Stripe from 'stripe';
import type {
  StripeConfig,
  StripeProduct,
  ProductType,
  Currency,
  SubscriptionInterval,
} from '../types/stripe-commerce.js';
import { generateProductId } from '../types/stripe-commerce.js';
import type { PathConfig } from './paths.js';
import { readStripeProducts, updateStripeProduct, createStripeProduct } from './stripeProductStore.js';
import type { Logger } from './logger.js';

export type SyncResult = {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly exported: number;
  readonly errors: readonly SyncError[];
  readonly timestamp: string;
};

export type SyncError = {
  readonly productId?: string;
  readonly stripeProductId?: string;
  readonly message: string;
};

export type StripeSyncService = {
  readonly importFromStripe: () => Promise<SyncResult>;
  readonly exportToStripe: (productId: string) => Promise<StripeProduct>;
  readonly exportAllToStripe: () => Promise<SyncResult>;
  readonly syncProductDetails: (productId: string) => Promise<StripeProduct>;
  readonly getStripeClient: () => Stripe;
};

/**
 * Map Stripe price interval to our SubscriptionInterval type
 */
const mapStripeInterval = (interval: Stripe.Price.Recurring.Interval | undefined): SubscriptionInterval | null => {
  if (!interval) return null;
  switch (interval) {
    case 'day':
      return 'day';
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
    default:
      return 'month';
  }
};

/**
 * Map Stripe currency to our Currency type (uppercase)
 */
const mapStripeCurrency = (currency: string): Currency => {
  const upper = currency.toUpperCase();
  if (['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].includes(upper)) {
    return upper as Currency;
  }
  return 'USD';
};

/**
 * Determine product type from Stripe price
 */
const getProductType = (price: Stripe.Price | null): ProductType => {
  if (!price) return 'one_time';
  return price.recurring ? 'subscription' : 'one_time';
};

/**
 * Get the first image URL from a Stripe product
 */
const getFirstImage = (images: string[]): string | undefined => {
  return images.length > 0 ? images[0] : undefined;
};

const normalizeBaseUrl = (baseUrl: string | undefined): string | null => {
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, '');
};

const isExternalUrl = (url: string): boolean => /^https?:\/\//i.test(url);

export const createStripeSyncService = (
  config: StripeConfig,
  paths: PathConfig,
  logger: Logger,
  options: { assetBaseUrl?: string } = {},
): StripeSyncService => {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });
  const assetBaseUrl = normalizeBaseUrl(options.assetBaseUrl);

  const resolvePublicImageUrl = (imageUrl?: string): string | undefined => {
    if (!imageUrl) return undefined;
    if (isExternalUrl(imageUrl)) {
      return imageUrl;
    }
    if (!assetBaseUrl) {
      logger.warn('[stripe-sync] assetBaseUrl is not configured; cannot resolve local image URL');
      return undefined;
    }
    if (imageUrl.startsWith('/')) {
      return `${assetBaseUrl}${imageUrl}`;
    }
    return `${assetBaseUrl}/${imageUrl}`;
  };

  /**
   * Import products from Stripe into local YAML.
   * Matches by stripeProductId or creates new local products for unknown Stripe products.
   */
  const importFromStripe = async (): Promise<SyncResult> => {
    const errors: SyncError[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    try {
      // Fetch all active products from Stripe
      const stripeProducts: Stripe.Product[] = [];
      for await (const product of stripe.products.list({ active: true, limit: 100 })) {
        stripeProducts.push(product);
      }

      // Fetch all prices (we need these for pricing info)
      const stripePrices: Stripe.Price[] = [];
      for await (const price of stripe.prices.list({ active: true, limit: 100 })) {
        stripePrices.push(price);
      }

      // Build a map of product ID -> default price
      const pricesByProduct = new Map<string, Stripe.Price>();
      for (const price of stripePrices) {
        const productId = typeof price.product === 'string' ? price.product : price.product?.id;
        if (productId && !pricesByProduct.has(productId)) {
          // Take the first price as default
          pricesByProduct.set(productId, price);
        }
      }

      // Load current local products
      const localConfig = await readStripeProducts(paths);
      const localByStripeId = new Map<string, StripeProduct>();
      const localByUalId = new Map<string, StripeProduct>();

      for (const product of localConfig.products) {
        if (product.stripeProductId) {
          localByStripeId.set(product.stripeProductId, product);
        }
        // Also check metadata for ual_product_id
        localByUalId.set(product.id, product);
      }

      // Process each Stripe product
      for (const stripeProduct of stripeProducts) {
        try {
          const price = pricesByProduct.get(stripeProduct.id);

          // Check if we already have this product locally
          let existingLocal = localByStripeId.get(stripeProduct.id);

          // Also check by ual_product_id in metadata
          if (!existingLocal && stripeProduct.metadata.ual_product_id) {
            existingLocal = localByUalId.get(stripeProduct.metadata.ual_product_id);
          }

          if (existingLocal) {
            // Update existing product
            const updates: Partial<StripeProduct> = {};
            let hasChanges = false;

            if (stripeProduct.name !== existingLocal.name) {
              updates.name = stripeProduct.name;
              hasChanges = true;
            }
            if ((stripeProduct.description ?? '') !== existingLocal.description) {
              updates.description = stripeProduct.description ?? '';
              hasChanges = true;
            }
            const stripeImage = getFirstImage(stripeProduct.images);
            if (stripeImage && stripeImage !== existingLocal.imageUrl) {
              updates.imageUrl = stripeImage;
              hasChanges = true;
            }
            if (price && price.unit_amount && price.unit_amount !== existingLocal.priceAmountCents) {
              updates.priceAmountCents = price.unit_amount;
              hasChanges = true;
            }
            if (!existingLocal.stripeProductId) {
              updates.stripeProductId = stripeProduct.id;
              hasChanges = true;
            }
            if (price && !existingLocal.stripePriceId) {
              updates.stripePriceId = price.id;
              hasChanges = true;
            }

            if (hasChanges) {
              await updateStripeProduct(paths, existingLocal.id, updates);
              updated++;
            } else {
              skipped++;
            }
          } else {
            // Create new local product from Stripe
            const newProduct = await createStripeProduct(paths, {
              name: stripeProduct.name,
              description: stripeProduct.description ?? undefined,
              imageUrl: getFirstImage(stripeProduct.images),
              type: getProductType(price ?? null),
              priceAmountCents: price?.unit_amount ?? 0,
              currency: price ? mapStripeCurrency(price.currency) : 'USD',
              interval: price?.recurring ? mapStripeInterval(price.recurring.interval) : null,
              intervalCount: price?.recurring?.interval_count ?? null,
              isActive: stripeProduct.active,
              metadata: {
                ...stripeProduct.metadata,
                imported_from_stripe: 'true',
              },
            });

            // Store Stripe IDs
            await updateStripeProduct(paths, newProduct.id, {
              stripeProductId: stripeProduct.id,
              stripePriceId: price?.id,
            });

            imported++;
          }
        } catch (error) {
          errors.push({
            stripeProductId: stripeProduct.id,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      errors.push({
        message: `Failed to fetch from Stripe: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    return {
      imported,
      updated,
      skipped,
      exported: 0,
      errors,
      timestamp: new Date().toISOString(),
    };
  };

  /**
   * Export a single local product to Stripe.
   * Creates both a Stripe Product and Price, then stores IDs back in local YAML.
   */
  const exportToStripe = async (productId: string): Promise<StripeProduct> => {
    const localConfig = await readStripeProducts(paths);
    const product = localConfig.products.find((p) => p.id === productId);

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    // Skip if already exported
    if (product.stripeProductId && product.stripePriceId) {
      return product;
    }

    // Create Stripe product
    const stripeProduct = await stripe.products.create({
      name: product.name,
      description: product.description || undefined,
      images: product.imageUrl ? [resolvePublicImageUrl(product.imageUrl) ?? product.imageUrl] : undefined,
      active: product.isActive,
      metadata: {
        ual_product_id: product.id,
        ...(product.metadata ?? {}),
      },
    });

    // Create Stripe price
    const priceData: Stripe.PriceCreateParams = {
      product: stripeProduct.id,
      unit_amount: product.priceAmountCents,
      currency: product.currency.toLowerCase(),
    };

    if (product.type === 'subscription' && product.interval) {
      priceData.recurring = {
        interval: product.interval,
        interval_count: product.intervalCount ?? 1,
      };
    }

    const stripePrice = await stripe.prices.create(priceData);

    // Update local product with Stripe IDs
    const updated = await updateStripeProduct(paths, productId, {
      stripeProductId: stripeProduct.id,
      stripePriceId: stripePrice.id,
      imageUrl: getFirstImage(stripeProduct.images) ?? product.imageUrl,
    });

    return updated;
  };

  /**
   * Ensure a local product's name/description/image are mirrored in Stripe.
   */
  const syncProductDetails = async (productId: string): Promise<StripeProduct> => {
    const localConfig = await readStripeProducts(paths);
    const product = localConfig.products.find((p) => p.id === productId);

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    if (!product.stripeProductId || !product.stripePriceId) {
      logger.info(`[stripe-sync] Product ${productId} not yet exported to Stripe, exporting now...`);
      return exportToStripe(productId);
    }

    const image = resolvePublicImageUrl(product.imageUrl);
    logger.info(`[stripe-sync] Syncing product ${productId} to Stripe`);
    logger.info(`[stripe-sync]   Local imageUrl: ${product.imageUrl}`);
    logger.info(`[stripe-sync]   Resolved public URL: ${image}`);
    logger.info(`[stripe-sync]   assetBaseUrl: ${assetBaseUrl}`);

    const updatedStripeProduct = await stripe.products.update(product.stripeProductId, {
      name: product.name,
      description: product.description || undefined,
      active: product.isActive,
      images: image ? [image] : undefined,
      metadata: {
        ...(product.metadata ?? {}),
        ual_product_id: product.id,
      },
    });

    logger.info(`[stripe-sync] Stripe response images: ${JSON.stringify(updatedStripeProduct.images)}`);

    const updated = await updateStripeProduct(paths, productId, {
      imageUrl: getFirstImage(updatedStripeProduct.images) ?? product.imageUrl,
    });

    return updated;
  };

  /**
   * Export all local products that don't have Stripe IDs yet.
   */
  const exportAllToStripe = async (): Promise<SyncResult> => {
    const errors: SyncError[] = [];
    let exported = 0;
    let skipped = 0;

    try {
      const localConfig = await readStripeProducts(paths);

      for (const product of localConfig.products) {
        if (product.stripeProductId && product.stripePriceId) {
          skipped++;
          continue;
        }

        try {
          await exportToStripe(product.id);
          exported++;
        } catch (error) {
          errors.push({
            productId: product.id,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      errors.push({
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    return {
      imported: 0,
      updated: 0,
      skipped,
      exported,
      errors,
      timestamp: new Date().toISOString(),
    };
  };

  const getStripeClient = (): Stripe => stripe;

  return {
    importFromStripe,
    exportToStripe,
    exportAllToStripe,
    syncProductDetails,
    getStripeClient,
  };
};

