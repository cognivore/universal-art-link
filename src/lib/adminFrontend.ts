import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import { Logger } from './logger.js';
import { PathConfig } from './paths.js';

const shouldSkip = (): boolean => process.env.UAL_SKIP_ADMIN_UI === '1';

const ensureViteBinary = async (paths: PathConfig): Promise<string> => {
  const candidate = path.join(paths.adminAppDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const exists = await fs.pathExists(candidate);
  if (!exists) {
    throw new Error(
      'Admin UI dependencies missing. Run `pnpm install` (workspace) so apps/admin has node_modules before building.',
    );
  }
  return candidate;
};

const runNodeScript = async (
  args: readonly string[],
  options: { readonly cwd: string },
  logger: Logger,
  label: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: 'pipe',
    });

    child.stdout?.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        logger.info(`[${label}] ${message}`);
      }
    });
    child.stderr?.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        logger.warn(`[${label}] ${message}`);
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code ?? -1}`));
      }
    });
  });

export const buildAdminFrontend = async (paths: PathConfig, logger: Logger): Promise<void> => {
  if (shouldSkip()) {
    logger.warn('Skipping admin UI build (UAL_SKIP_ADMIN_UI=1). Legacy admin assets will be used.');
    return;
  }
  const viteBin = await ensureViteBinary(paths);
  logger.info('Building shadcn admin bundle…');
  await runNodeScript([viteBin, 'build'], { cwd: paths.adminAppDir }, logger, 'admin-build');
};

export type AdminWatcher = {
  readonly close: () => Promise<void>;
};

export const startAdminWatcher = async (paths: PathConfig, logger: Logger): Promise<AdminWatcher | null> => {
  if (shouldSkip()) {
    logger.warn('Skipping admin UI watcher (UAL_SKIP_ADMIN_UI=1).');
    return null;
  }
  const viteBin = await ensureViteBinary(paths);
  const child = spawn(
    process.execPath,
    [viteBin, 'build', '--watch', '--config', path.join(paths.adminAppDir, 'vite.config.ts'), '--emptyOutDir'],
    {
      cwd: paths.adminAppDir,
      env: process.env,
      stdio: 'pipe',
    },
  );

  child.stdout?.on('data', (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      logger.info(`[admin-watch] ${message}`);
    }
  });
  child.stderr?.on('data', (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      logger.warn(`[admin-watch] ${message}`);
    }
  });

  const close = async (): Promise<void> =>
    new Promise((resolve) => {
      if (child.killed) {
        resolve();
        return;
      }
      child.once('close', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 2000).unref();
    });

  return { close };
};

