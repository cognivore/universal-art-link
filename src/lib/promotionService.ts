/**
 * Promotion Service
 *
 * Handles promotion of content from staging to production environment.
 * This includes:
 * - Copying content YAML files (pages, products, commerce config)
 * - Copying assets directory
 * - Calling production webhook to export products to Stripe live mode
 *
 * IMPORTANT: This service is designed to run on the deployment server
 * where both staging and production directories exist.
 *
 * The Stripe export is done via a webhook to production because:
 * - Staging only has test Stripe keys
 * - Production has live Stripe keys
 * - The webhook creates a snapshot before importing
 */

import fs from 'fs-extra';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PathConfig } from './paths.js';
import type { StripeSyncService, SyncResult } from './stripeSyncService.js';
import type { Logger } from './logger.js';

export type PromotionStep = 'content' | 'assets' | 'products';

export type PromotionStepResult = {
  readonly step: PromotionStep;
  readonly success: boolean;
  readonly message: string;
  readonly details?: readonly string[];
};

export type PromotionResult = {
  readonly success: boolean;
  readonly steps: readonly PromotionStepResult[];
  readonly timestamp: string;
  readonly stripeSync?: SyncResult;
};

export type PromotionService = {
  readonly promoteAll: () => Promise<PromotionResult>;
  readonly promoteContent: () => Promise<PromotionStepResult>;
  readonly promoteAssets: () => Promise<PromotionStepResult>;
  readonly promoteProducts: () => Promise<PromotionStepResult & { stripeSync?: SyncResult }>;
  readonly checkEnvironment: () => Promise<{ valid: boolean; message: string }>;
};

export type PromotionWebhookConfig = {
  readonly productionUrl: string;
  readonly promotionSecret: string;
};

/**
 * Generate HMAC signature for webhook authentication
 */
const signWebhookPayload = (payload: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

/**
 * Verify HMAC signature from webhook request
 */
export const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string,
): boolean => {
  const expected = signWebhookPayload(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

/**
 * Files and directories to copy during content promotion
 */
const CONTENT_PATHS = [
  'pages',          // Page content YAML files
  'commerce',       // Commerce config (catalog, shop, stripe-products)
  'site.config.yaml', // Site configuration
] as const;

/**
 * Files to exclude from promotion (secrets, environment-specific)
 */
const EXCLUDED_FILES = [
  '.env',
  '.env.local',
  'admins.yaml',  // Auth config should be managed separately
] as const;

/**
 * Create a promotion service that syncs content from staging to production.
 *
 * @param stagingPaths - Path configuration for staging environment
 * @param productionPaths - Path configuration for production environment
 * @param liveSyncService - Stripe sync service configured for live mode (optional, only on production)
 * @param logger - Logger instance
 * @param webhookConfig - Config for calling production webhook (only on staging)
 */
export const createPromotionService = (
  stagingPaths: PathConfig,
  productionPaths: PathConfig,
  liveSyncService: StripeSyncService | null,
  logger: Logger,
  webhookConfig?: PromotionWebhookConfig,
): PromotionService => {
  /**
   * Check if the promotion environment is valid (both directories exist)
   */
  const checkEnvironment = async (): Promise<{ valid: boolean; message: string }> => {
    const stagingExists = await fs.pathExists(stagingPaths.contentDir);
    const productionExists = await fs.pathExists(productionPaths.contentDir);

    if (!stagingExists) {
      return { valid: false, message: `Staging content directory not found: ${stagingPaths.contentDir}` };
    }
    if (!productionExists) {
      return { valid: false, message: `Production content directory not found: ${productionPaths.contentDir}` };
    }

    return { valid: true, message: 'Environment is valid for promotion' };
  };

  /**
   * Copy content YAML files from staging to production
   */
  const promoteContent = async (): Promise<PromotionStepResult> => {
    const copiedFiles: string[] = [];
    const errors: string[] = [];

    try {
      for (const contentPath of CONTENT_PATHS) {
        const stagingPath = path.join(stagingPaths.contentDir, contentPath);
        const productionPath = path.join(productionPaths.contentDir, contentPath);

        const exists = await fs.pathExists(stagingPath);
        if (!exists) {
          logger.info(`[promotion] Skipping ${contentPath} (not found in staging)`);
          continue;
        }

        const stats = await fs.stat(stagingPath);

        if (stats.isDirectory()) {
          // Copy directory recursively, excluding certain files
          await fs.ensureDir(productionPath);

          const files = await fs.readdir(stagingPath);
          for (const file of files) {
            if (EXCLUDED_FILES.includes(file as typeof EXCLUDED_FILES[number])) {
              logger.info(`[promotion] Skipping excluded file: ${file}`);
              continue;
            }

            const srcFile = path.join(stagingPath, file);
            const destFile = path.join(productionPath, file);

            await fs.copy(srcFile, destFile, { overwrite: true });
            copiedFiles.push(`${contentPath}/${file}`);
          }
        } else {
          // Copy single file
          if (!EXCLUDED_FILES.includes(contentPath as typeof EXCLUDED_FILES[number])) {
            await fs.copy(stagingPath, productionPath, { overwrite: true });
            copiedFiles.push(contentPath);
          }
        }
      }

      logger.info(`[promotion] Content promoted: ${copiedFiles.length} files copied`);

      return {
        step: 'content',
        success: true,
        message: `Promoted ${copiedFiles.length} content files`,
        details: copiedFiles,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[promotion] Content promotion failed: ${message}`);

      return {
        step: 'content',
        success: false,
        message: `Content promotion failed: ${message}`,
        details: errors,
      };
    }
  };

  /**
   * Copy assets directory from staging to production
   */
  const promoteAssets = async (): Promise<PromotionStepResult> => {
    try {
      const stagingAssets = stagingPaths.assetsDir;
      const productionAssets = productionPaths.assetsDir;

      const exists = await fs.pathExists(stagingAssets);
      if (!exists) {
        return {
          step: 'assets',
          success: true,
          message: 'No assets to promote (staging assets directory not found)',
        };
      }

      // Get list of files for details
      const assetFiles = await fs.readdir(stagingAssets);

      // Copy entire assets directory
      await fs.copy(stagingAssets, productionAssets, { overwrite: true });

      logger.info(`[promotion] Assets promoted: ${assetFiles.length} files`);

      return {
        step: 'assets',
        success: true,
        message: `Promoted ${assetFiles.length} asset files`,
        details: assetFiles,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[promotion] Asset promotion failed: ${message}`);

      return {
        step: 'assets',
        success: false,
        message: `Asset promotion failed: ${message}`,
      };
    }
  };

  /**
   * Export products to Stripe live mode.
   *
   * If running on staging (webhookConfig provided), calls production webhook.
   * If running on production (liveSyncService provided), exports directly.
   */
  const promoteProducts = async (): Promise<PromotionStepResult & { stripeSync?: SyncResult }> => {
    // If we have webhook config, we're on staging - call production webhook
    if (webhookConfig) {
      try {
        logger.info('[promotion] Calling production webhook for Stripe live export...');

        const timestamp = Date.now().toString();
        const payload = JSON.stringify({ timestamp, action: 'promote-products' });
        const signature = signWebhookPayload(payload, webhookConfig.promotionSecret);

        const response = await fetch(`${webhookConfig.productionUrl}/__ual/webhook/promotion`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-UAL-Signature': signature,
            'X-UAL-Timestamp': timestamp,
          },
          body: payload,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Production webhook failed: ${response.status} ${errorText}`);
        }

        const result = await response.json() as {
          success: boolean;
          message: string;
          snapshotId?: string;
          stripeSync?: SyncResult;
        };

        logger.info(`[promotion] Production webhook response: ${result.message}`);

        return {
          step: 'products',
          success: result.success,
          message: result.message,
          details: result.snapshotId ? [`Snapshot created: ${result.snapshotId}`] : undefined,
          stripeSync: result.stripeSync,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[promotion] Production webhook failed: ${message}`);

        return {
          step: 'products',
          success: false,
          message: `Production webhook failed: ${message}`,
        };
      }
    }

    // If we have liveSyncService, we're on production - export directly
    if (liveSyncService) {
      try {
        logger.info('[promotion] Exporting products to Stripe live mode...');
        const syncResult = await liveSyncService.exportAllToStripe();

        const hasErrors = syncResult.errors.length > 0;
        const message = hasErrors
          ? `Exported ${syncResult.exported} products with ${syncResult.errors.length} errors`
          : `Exported ${syncResult.exported} products to Stripe (${syncResult.skipped} already synced)`;

        logger.info(`[promotion] ${message}`);

        return {
          step: 'products',
          success: !hasErrors,
          message,
          details: syncResult.errors.map((e) => e.message),
          stripeSync: syncResult,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[promotion] Product export failed: ${message}`);

        return {
          step: 'products',
          success: false,
          message: `Product export failed: ${message}`,
        };
      }
    }

    // Neither webhook nor sync service - can't export
    return {
      step: 'products',
      success: true,
      message: 'Stripe sync not configured - skipping product export',
    };
  };

  /**
   * Run full promotion: content, assets, and products
   */
  const promoteAll = async (): Promise<PromotionResult> => {
    const steps: PromotionStepResult[] = [];
    let stripeSync: SyncResult | undefined;

    // Check environment first
    const envCheck = await checkEnvironment();
    if (!envCheck.valid) {
      return {
        success: false,
        steps: [{
          step: 'content',
          success: false,
          message: envCheck.message,
        }],
        timestamp: new Date().toISOString(),
      };
    }

    // Step 1: Promote content
    const contentResult = await promoteContent();
    steps.push(contentResult);

    // Step 2: Promote assets
    const assetsResult = await promoteAssets();
    steps.push(assetsResult);

    // Step 3: Promote products to Stripe
    const productsResult = await promoteProducts();
    steps.push(productsResult);
    if (productsResult.stripeSync) {
      stripeSync = productsResult.stripeSync;
    }

    const allSuccess = steps.every((s) => s.success);

    return {
      success: allSuccess,
      steps,
      timestamp: new Date().toISOString(),
      stripeSync,
    };
  };

  return {
    promoteAll,
    promoteContent,
    promoteAssets,
    promoteProducts,
    checkEnvironment,
  };
};

/**
 * Create production path config from a base production directory.
 */
export const createProductionPathConfig = (productionRoot: string): PathConfig => ({
  rootDir: productionRoot,
  contentDir: path.join(productionRoot, 'content'),
  pagesDir: path.join(productionRoot, 'content', 'pages'),
  commerceDir: path.join(productionRoot, 'content', 'commerce'),
  templatesDir: path.join(productionRoot, 'templates'),
  layoutsDir: path.join(productionRoot, 'templates', 'layouts'),
  partialsDir: path.join(productionRoot, 'templates', 'partials'),
  stylesDir: path.join(productionRoot, 'templates', 'styles'),
  scriptsDir: path.join(productionRoot, 'templates', 'scripts'),
  assetsDir: path.join(productionRoot, 'assets'),
  adminDir: path.join(productionRoot, 'admin', 'dev'),
  adminSharedDir: path.join(productionRoot, 'admin', 'shared'),
  adminAppDir: path.join(productionRoot, 'apps', 'admin'),
  adminAppDistDir: path.join(productionRoot, 'apps', 'admin', 'dist'),
  internalDir: path.join(productionRoot, '.ual'),
  outputDir: path.join(productionRoot, 'dist'),
});

