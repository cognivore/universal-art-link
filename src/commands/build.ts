import { buildSite } from '../lib/build.js';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { buildAdminFrontend } from '../lib/adminFrontend.js';

type BuildCommandOptions = {
  readonly output?: string;
};

export const runBuildCommand = async (options: BuildCommandOptions = {}): Promise<void> => {
  const rootDir = process.cwd();
  const paths = createPathConfig(rootDir, options.output ?? 'dist');
  try {
    await buildAdminFrontend(paths, log);
    const result = await buildSite({ rootDir, outDir: options.output, invalidateTemplates: true });
    log.success(`Built ${result.pages} pages into ${result.outputDir}`);
  } catch (error) {
    log.error('Build failed', error);
    process.exitCode = 1;
  }
};

