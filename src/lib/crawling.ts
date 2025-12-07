/**
 * Crawling Settings
 *
 * Controls whether search engines can crawl the site via robots.txt.
 * - Staging: Always blocked (protects placeholder content from indexing)
 * - Production: Configurable via admin settings (default: blocked)
 *
 * State is persisted to .ual/crawling.json to survive server restarts.
 */

import fs from 'fs-extra';
import path from 'node:path';

// Persistent state file location
let stateFilePath: string | null = null;

// Runtime state for crawling permission (can be toggled without restart)
let runtimeCrawlingAllowed: boolean | null = null;

/**
 * Initialize the crawling module with a root directory.
 * This loads any persisted state from disk.
 */
export const initCrawling = async (rootDir: string): Promise<void> => {
  stateFilePath = path.join(rootDir, '.ual', 'crawling.json');

  try {
    if (await fs.pathExists(stateFilePath)) {
      const data = await fs.readJson(stateFilePath);
      if (typeof data.allowed === 'boolean') {
        runtimeCrawlingAllowed = data.allowed;
      }
    }
  } catch {
    // Ignore errors - will use default state
  }
};

/**
 * Persist crawling state to disk.
 */
const persistState = async (): Promise<void> => {
  if (!stateFilePath) return;

  try {
    await fs.ensureDir(path.dirname(stateFilePath));
    if (runtimeCrawlingAllowed === null) {
      // Remove file when reset to default
      await fs.remove(stateFilePath);
    } else {
      await fs.writeJson(stateFilePath, { allowed: runtimeCrawlingAllowed });
    }
  } catch (error) {
    console.error('[crawling] Failed to persist state:', error);
  }
};

/**
 * Check if crawling is allowed.
 * Priority: runtime state > environment variable > default (false)
 *
 * Default is false to protect placeholder content from being indexed.
 */
export const isCrawlingAllowed = (): boolean => {
  if (runtimeCrawlingAllowed !== null) {
    return runtimeCrawlingAllowed;
  }
  return process.env.UAL_ALLOW_CRAWLING === 'true';
};

/**
 * Toggle crawling permission at runtime.
 * Pass null to reset to environment variable behavior.
 * Changes are persisted to disk.
 */
export const setCrawlingAllowed = (allowed: boolean | null): void => {
  runtimeCrawlingAllowed = allowed;
  void persistState();
};

/**
 * Get current crawling state info for admin display.
 */
export const getCrawlingState = (): {
  allowed: boolean;
  source: 'runtime' | 'env' | 'default';
} => {
  if (runtimeCrawlingAllowed !== null) {
    return { allowed: runtimeCrawlingAllowed, source: 'runtime' };
  }
  if (process.env.UAL_ALLOW_CRAWLING === 'true') {
    return { allowed: true, source: 'env' };
  }
  return { allowed: false, source: 'default' };
};

/**
 * Generate robots.txt content based on crawling settings.
 *
 * @param isStaging - Whether this is the staging environment
 * @returns robots.txt content
 */
export const generateRobotsTxt = (isStaging: boolean): string => {
  // Staging always blocks all crawlers
  if (isStaging) {
    return `# Staging environment - all crawlers blocked
User-agent: *
Disallow: /
`;
  }

  // Production: check setting
  const allowed = isCrawlingAllowed();

  if (allowed) {
    return `# Production - crawling allowed
User-agent: *
Allow: /

# Block admin paths
User-agent: *
Disallow: /__ual/
Disallow: /admin/
`;
  }

  return `# Production - crawling blocked (enable in admin settings when ready)
User-agent: *
Disallow: /
`;
};
