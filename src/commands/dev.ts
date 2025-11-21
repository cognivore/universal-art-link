import chokidar from 'chokidar';
import path from 'node:path';
import { buildSite } from '../lib/build.js';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { startDevServer, type AdminRuntimeConfig } from '../lib/devServer.js';
import { AdminService } from '../lib/adminService.js';
import { buildAdminFrontend, startAdminWatcher } from '../lib/adminFrontend.js';

type DevOptions = {
  readonly port?: number;
  readonly strapiUrl?: string;
};

export const runDevCommand = async ({ port = 4173, strapiUrl }: DevOptions = {}): Promise<void> => {
  const rootDir = process.cwd();
  const paths = createPathConfig(rootDir);

  const resolvedStrapiUrl = strapiUrl ?? process.env.UAL_STRAPI_URL ?? 'http://localhost:1337';

  await buildAdminFrontend(paths, log);
  const adminWatcher = await startAdminWatcher(paths, log);

  const buildResult = await buildSite({ rootDir, invalidateTemplates: true });
  const adminService = new AdminService(rootDir, log);

  const runtimeConfig: AdminRuntimeConfig = {
    previewBaseUrl: `http://localhost:${port}`,
    previewHealthPath: '/__ual/healthz',
    apiBaseUrl: '/__ual/api',
    adminBaseUrl: `http://localhost:${port}/admin`,
    strapiUrl: resolvedStrapiUrl,
    previewPaths: buildResult.previewPaths,
  };

  const server = startDevServer({
    distDir: paths.outputDir,
    adminAssetsDir: paths.adminAppDistDir,
    port,
    logger: log,
    adminService,
    paths,
    runtimeConfig,
  });

  const watcher = chokidar.watch(
    [
      paths.contentDir,
      paths.templatesDir,
      paths.assetsDir,
      paths.stylesDir,
      paths.scriptsDir,
      paths.adminDir,
      paths.adminSharedDir,
    ],
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
      const nextBuild = await buildSite({ rootDir, invalidateTemplates: true });
      log.success('Site rebuilt');
      server.updateRuntimeConfig({ previewPaths: nextBuild.previewPaths });
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
    log.info(`[watcher] Detected ${event} at ${changedPath}`);
    void rebuild();
  });

  const shutdown = async (signal: string): Promise<void> => {
    log.info(`[shutdown] Received ${signal}, closing dev server...`);
    try {
      log.info('[shutdown] Closing watcher...');
      await watcher.close();
      log.info('[shutdown] Closing HTTP server...');
      await server.close();
      log.info('[shutdown] Closing admin watcher...');
      await adminWatcher?.close();
      log.info('[shutdown] Dev server stopped cleanly');
    } catch (error) {
      log.error('[shutdown] Error during shutdown', error);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('uncaughtException', (error) => {
    log.error('[fatal] Uncaught exception', error);
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.error('[fatal] Unhandled promise rejection', reason);
    void shutdown('unhandledRejection');
  });
};

