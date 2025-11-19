import { buildSite } from '../lib/build.js';
import { deployZipBundle } from '../lib/deploy.js';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { createZipFromDist } from '../lib/packageSite.js';
import { loadSiteConfig } from '../lib/contentLoader.js';

export const runDeployCommand = async (): Promise<void> => {
  const rootDir = process.cwd();
  const paths = createPathConfig(rootDir);

  try {
    const siteConfig = await loadSiteConfig(paths.contentDir);
    if (!siteConfig.deploy?.endpoint) {
      log.warn('No deploy.endpoint configured in content/site.config.*');
      return;
    }

    const buildResult = await buildSite({ rootDir, invalidateTemplates: true });
    const zipPath = await createZipFromDist(buildResult.outputDir);
    const response = await deployZipBundle(zipPath, siteConfig.deploy);
    log.success(`Deployed bundle successfully (${response.status})`);
  } catch (error) {
    log.error('Deploy failed', error);
    process.exitCode = 1;
  }
};

