import chokidar from 'chokidar';
import path from 'node:path';
import { buildSite } from '../lib/build.js';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { startDevServer } from '../lib/devServer.js';

type DevOptions = {
  readonly port?: number;
};

export const runDevCommand = async ({ port = 4173 }: DevOptions = {}): Promise<void> => {
  const rootDir = process.cwd();
  const paths = createPathConfig(rootDir);

  await buildSite({ rootDir, invalidateTemplates: true });
  const server = startDevServer({ distDir: paths.outputDir, port, logger: log });

  const watcher = chokidar.watch(
    [paths.contentDir, paths.templatesDir, paths.assetsDir, path.join(rootDir, 'templates/styles'), path.join(rootDir, 'templates/scripts')],
    { ignoreInitial: true },
  );

  let building = false;
  let queued = false;

  const rebuild = async (): Promise<void> => {
    if (building) {
      queued = true;
      return;
    }
    building = true;
    try {
      await buildSite({ rootDir, invalidateTemplates: true });
      log.success('Site rebuilt');
      server.notifyReload();
    } catch (error) {
      log.error('Rebuild failed', error);
    } finally {
      building = false;
      if (queued) {
        queued = false;
        void rebuild();
      }
    }
  };

  watcher.on('all', (event, changedPath) => {
    log.info(`Detected ${event} at ${changedPath}`);
    void rebuild();
  });

  const shutdown = async (): Promise<void> => {
    await watcher.close();
    await server.close();
    log.info('dev server stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};

