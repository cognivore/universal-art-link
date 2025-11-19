import { buildSite } from '../lib/build.js';
import { log } from '../lib/logger.js';
import { createZipFromDist } from '../lib/packageSite.js';

export const runPackageCommand = async (): Promise<void> => {
  const rootDir = process.cwd();
  try {
    const buildResult = await buildSite({ rootDir, invalidateTemplates: true });
    const zipPath = await createZipFromDist(buildResult.outputDir);
    log.success(`Packaged site at ${zipPath}`);
  } catch (error) {
    log.error('Packaging failed', error);
    process.exitCode = 1;
  }
};

