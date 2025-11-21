import { buildSite } from '../lib/build.js';
import { log } from '../lib/logger.js';
import { createZipFromDist } from '../lib/packageSite.js';
import { createPathConfig } from '../lib/paths.js';
import { buildAdminFrontend } from '../lib/adminFrontend.js';

export const runPackageCommand = async (): Promise<void> => {
  const rootDir = process.cwd();
  const paths = createPathConfig(rootDir);
  try {
    await buildAdminFrontend(paths, log);
    const buildResult = await buildSite({ rootDir, invalidateTemplates: true });
    const zipPath = await createZipFromDist(buildResult.outputDir);
    log.success(`Packaged site at ${zipPath}`);
  } catch (error) {
    log.error('Packaging failed', error);
    process.exitCode = 1;
  }
};

