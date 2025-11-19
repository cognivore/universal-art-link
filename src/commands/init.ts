import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';

type InitOptions = {
  readonly force?: boolean;
  readonly target?: string;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const starterDir = path.resolve(moduleDir, '../../starter');

const copyBlueprint = async (destination: string, force: boolean): Promise<void> => {
  const entries = await fs.readdir(starterDir);
  await Promise.all(
    entries.map(async (entry) => {
      const source = path.join(starterDir, entry);
      const target = path.join(destination, entry);
      const exists = await fs.pathExists(target);
      if (exists && !force) {
        log.warn(`Skipping existing ${entry}. Use --force to overwrite.`);
        return;
      }
      await fs.copy(source, target, { overwrite: true });
      log.info(`Wrote ${target}`);
    }),
  );
};

export const runInitCommand = async ({ force = false, target }: InitOptions = {}): Promise<void> => {
  const destination = path.resolve(process.cwd(), target ?? '.');
  await fs.ensureDir(destination);

  const starterExists = await fs.pathExists(starterDir);
  if (!starterExists) {
    throw new Error(`Starter template missing at ${starterDir}`);
  }

  await copyBlueprint(destination, force);
  log.success(`Starter content copied into ${destination}`);
};

