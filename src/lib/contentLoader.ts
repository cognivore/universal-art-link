import fs from 'fs-extra';
import path from 'node:path';
import { listStructuredFiles, readStructuredFile } from './fileUtils.js';
import { Page, PageSchema, SiteConfig, SiteConfigSchema } from '../types/content.js';

const CONFIG_BASENAMES = ['site.config', 'site'];

const findConfigPath = async (contentDir: string): Promise<string> => {
  const entries = await fs.readdir(contentDir);
  for (const entry of entries) {
    const fullPath = path.join(contentDir, entry);
    if (!CONFIG_BASENAMES.some((name) => entry.startsWith(name))) {
      continue;
    }
    if (fullPath.endsWith('.json') || fullPath.endsWith('.yaml') || fullPath.endsWith('.yml')) {
      return fullPath;
    }
  }
  throw new Error(
    `Could not locate site config. Expected one of ${CONFIG_BASENAMES
      .map((name) => `"${name}.(yaml|yml|json)"`)
      .join(', ')} inside ${contentDir}`,
  );
};

export const loadSiteConfig = async (contentDir: string): Promise<SiteConfig> => {
  const configPath = await findConfigPath(contentDir);
  const parsed = await readStructuredFile<unknown>(configPath);
  const result = SiteConfigSchema.safeParse(parsed);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid site config (${configPath}):\n${messages.join('\n')}`);
  }
  return result.data;
};

export const loadPages = async (pagesDir: string): Promise<readonly Page[]> => {
  const files = await listStructuredFiles(pagesDir);
  if (files.length === 0) {
    throw new Error(`No page files found inside ${pagesDir}`);
  }

  const pages = await Promise.all(
    files.map(async (filePath) => {
      const parsed = await readStructuredFile<unknown>(filePath);
      const result = PageSchema.safeParse(parsed);
      if (!result.success) {
        const messages = result.error.issues.map(
          (issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`,
        );
        throw new Error(`Invalid page definition (${filePath}):\n${messages.join('\n')}`);
      }
      return result.data;
    }),
  );

  const sorted = [...pages].sort((a, b) => a.slug.localeCompare(b.slug));
  return sorted;
};

