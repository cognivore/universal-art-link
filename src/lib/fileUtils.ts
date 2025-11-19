import fs from 'fs-extra';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const structuredExtensions = new Set(['.yaml', '.yml', '.json']);

export const readStructuredFile = async <T>(filePath: string): Promise<T> => {
  const ext = path.extname(filePath).toLowerCase();
  if (!structuredExtensions.has(ext)) {
    throw new Error(`Unsupported file extension "${ext}" for ${filePath}`);
  }

  const raw = await fs.readFile(filePath, 'utf8');
  if (ext === '.json') {
    return JSON.parse(raw) as T;
  }
  return parseYaml(raw) as T;
};

export const listStructuredFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await fs.readdir(directory);
  return entries
    .map((entry) => path.join(directory, entry))
    .filter((entryPath) => structuredExtensions.has(path.extname(entryPath).toLowerCase()));
};

