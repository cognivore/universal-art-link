import { buildSite } from '../lib/build.js';
import { deployZipBundle } from '../lib/deploy.js';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { createZipFromDist } from '../lib/packageSite.js';
import { loadSiteConfig } from '../lib/contentLoader.js';
import { readConnectionRecord } from '../lib/connectionStore.js';

export const runDeployCommand = async (): Promise<void> => {
  const rootDir = process.cwd();
  const paths = createPathConfig(rootDir);

  try {
    const siteConfig = await loadSiteConfig(paths.contentDir);
    let deployConfig = siteConfig.deploy;

    if (!deployConfig) {
      const storedConnection = await readConnectionRecord(rootDir);
      if (storedConnection) {
        log.info('Using saved admin connection for deployment.');
        deployConfig = {
          endpoint: storedConnection.deployEndpoint,
          method: 'POST',
          authHeader: `Bearer ${storedConnection.secret}`,
        };
      }
    }

    if (!deployConfig?.endpoint) {
      log.warn('No deploy endpoint configured. Use the admin panel to connect.');
      return;
    }

    const buildResult = await buildSite({ rootDir, invalidateTemplates: true });
    const zipPath = await createZipFromDist(buildResult.outputDir);
    const response = await deployZipBundle(zipPath, deployConfig);
    log.success(`Deployed bundle successfully (${response.status})`);
  } catch (error) {
    log.error('Deploy failed', error);
    process.exitCode = 1;
  }
};

