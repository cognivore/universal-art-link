/**
 * Stripe Product Sync Cron
 *
 * Runs periodic synchronization of products from Stripe to local YAML.
 * Configurable via environment variables:
 *
 * - UAL_STRIPE_SYNC_ENABLED: Set to 'true' to enable sync
 * - UAL_STRIPE_SYNC_INTERVAL_MS: Sync interval in milliseconds (default: 1 hour)
 */

import type { StripeSyncService, SyncResult } from './stripeSyncService.js';
import type { Logger } from './logger.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export type SyncCronConfig = {
  readonly enabled: boolean;
  readonly intervalMs: number;
};

export type SyncCron = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly runNow: () => Promise<SyncResult>;
  readonly getLastResult: () => SyncResult | null;
  readonly isRunning: () => boolean;
};

/**
 * Read sync cron configuration from environment.
 */
export const getSyncCronConfig = (): SyncCronConfig => ({
  enabled: process.env.UAL_STRIPE_SYNC_ENABLED === 'true',
  intervalMs: parseInt(process.env.UAL_STRIPE_SYNC_INTERVAL_MS ?? '', 10) || DEFAULT_INTERVAL_MS,
});

/**
 * Create a sync cron job that periodically imports products from Stripe.
 */
export const createSyncCron = (
  syncService: StripeSyncService,
  logger: Logger,
  config?: Partial<SyncCronConfig>,
): SyncCron => {
  const resolvedConfig: SyncCronConfig = {
    ...getSyncCronConfig(),
    ...config,
  };

  let intervalId: NodeJS.Timeout | null = null;
  let lastResult: SyncResult | null = null;
  let isCurrentlyRunning = false;

  const runSync = async (): Promise<SyncResult> => {
    if (isCurrentlyRunning) {
      logger.info('[sync-cron] Sync already in progress, skipping');
      return lastResult ?? {
        imported: 0,
        updated: 0,
        skipped: 0,
        exported: 0,
        errors: [{ message: 'Sync already in progress' }],
        timestamp: new Date().toISOString(),
      };
    }

    isCurrentlyRunning = true;
    logger.info('[sync-cron] Starting Stripe product sync...');

    try {
      const result = await syncService.importFromStripe();
      lastResult = result;

      if (result.errors.length > 0) {
        logger.warn(`[sync-cron] Sync completed with ${result.errors.length} error(s)`);
        for (const error of result.errors) {
          logger.error(`[sync-cron] Error: ${error.message}`, {
            productId: error.productId,
            stripeProductId: error.stripeProductId,
          });
        }
      } else {
        logger.info(
          `[sync-cron] Sync completed: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`,
        );
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[sync-cron] Sync failed: ${message}`);

      const result: SyncResult = {
        imported: 0,
        updated: 0,
        skipped: 0,
        exported: 0,
        errors: [{ message }],
        timestamp: new Date().toISOString(),
      };
      lastResult = result;
      return result;
    } finally {
      isCurrentlyRunning = false;
    }
  };

  const start = (): void => {
    if (!resolvedConfig.enabled) {
      logger.info('[sync-cron] Stripe sync is disabled (UAL_STRIPE_SYNC_ENABLED != true)');
      return;
    }

    if (intervalId !== null) {
      logger.warn('[sync-cron] Sync cron already running');
      return;
    }

    const intervalMinutes = Math.round(resolvedConfig.intervalMs / 60000);
    logger.info(`[sync-cron] Starting sync cron (every ${intervalMinutes} minutes)`);

    // Run immediately on start
    void runSync();

    // Then run on interval
    intervalId = setInterval(() => {
      void runSync();
    }, resolvedConfig.intervalMs);
  };

  const stop = (): void => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info('[sync-cron] Sync cron stopped');
    }
  };

  const runNow = async (): Promise<SyncResult> => runSync();

  const getLastResult = (): SyncResult | null => lastResult;

  const isRunning = (): boolean => intervalId !== null;

  return {
    start,
    stop,
    runNow,
    getLastResult,
    isRunning,
  };
};

