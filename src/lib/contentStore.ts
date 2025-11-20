import fs from 'fs-extra';
import path from 'node:path';
import YAML from 'yaml';
import { PathConfig } from './paths.js';

export type SiteDocument = Record<string, unknown>;

export type PageDocument = {
  readonly file?: string;
  readonly data: Record<string, unknown>;
};

export type ContentSnapshot = {
  readonly site: SiteDocument;
  readonly pages: PageDocument[];
};

const isYamlFile = (fileName: string): boolean => /\.ya?ml$/i.test(fileName);

const readYamlFile = async (filePath: string, fallback: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = YAML.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
};

const writeYamlFile = async (filePath: string, data: Record<string, unknown>): Promise<void> => {
  await fs.ensureDir(path.dirname(filePath));
  const payload = YAML.stringify(data ?? {}, { lineWidth: 0 });
  await fs.writeFile(filePath, payload, 'utf8');
};

const siteConfigPath = (paths: PathConfig): string => path.join(paths.contentDir, 'site.config.yaml');

const pagesDirectory = (paths: PathConfig): string => paths.pagesDir;

const sanitizeSlugToFile = (slug: string, fallbackIndex: number): string => {
  const trimmed = slug.replace(/^\//, '').replace(/\//g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
  const candidate = trimmed || `page-${fallbackIndex + 1}`;
  return candidate.endsWith('.yaml') || candidate.endsWith('.yml') ? candidate : `${candidate}.yaml`;
};

export const readContentSnapshot = async (paths: PathConfig): Promise<ContentSnapshot> => {
  const site = await readYamlFile(siteConfigPath(paths), {});
  let pageEntries: string[] = [];
  try {
    pageEntries = (await fs.readdir(pagesDirectory(paths))).filter(isYamlFile).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      throw error;
    }
  }

  const pages = await Promise.all(
    pageEntries.map(async (entry) => {
      const filePath = path.join(pagesDirectory(paths), entry);
      const data = await readYamlFile(filePath, {});
      return { file: entry, data };
    }),
  );

  return { site, pages };
};

const resolvePageFileName = (page: PageDocument, index: number): string => {
  if (page.file && page.file.trim()) {
    return page.file.trim();
  }
  const slug = typeof page.data?.slug === 'string' ? page.data.slug : '';
  return sanitizeSlugToFile(slug, index);
};

export const writeContentSnapshot = async (paths: PathConfig, snapshot: ContentSnapshot): Promise<void> => {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid content payload.');
  }
  await writeYamlFile(siteConfigPath(paths), (snapshot.site as Record<string, unknown>) ?? {});

  if (!Array.isArray(snapshot.pages)) {
    return;
  }

  await fs.ensureDir(pagesDirectory(paths));

  await Promise.all(
    snapshot.pages.map(async (page, index) => {
      if (!page || typeof page !== 'object') {
        return;
      }
      const fileName = resolvePageFileName(page, index);
      const target = path.join(pagesDirectory(paths), fileName);
      const data = (page.data as Record<string, unknown>) ?? {};
      await writeYamlFile(target, data);
    }),
  );
};

export const readSchemaDefinition = async (paths: PathConfig): Promise<Record<string, unknown> | null> => {
  const schemaPath = path.join(paths.contentDir, 'schema.json');
  const exists = await fs.pathExists(schemaPath);
  if (!exists) {
    return null;
  }
  const text = await fs.readFile(schemaPath, 'utf8');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse schema.json: ${(error as Error).message}`);
  }
};

