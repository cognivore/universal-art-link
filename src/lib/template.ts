import fs from 'fs-extra';
import path from 'node:path';
import Handlebars from 'handlebars';
import { Page, SiteConfig } from '../types/content.js';
import { PathConfig } from './paths.js';

export type LayoutContext = {
  readonly site: SiteConfig;
  readonly page: Page;
  readonly meta: {
    readonly title: string;
    readonly description: string;
    readonly canonicalUrl: string;
  };
  readonly assets: {
    readonly styles: string;
    readonly scripts: string;
    readonly base: string;
  };
  readonly sections: readonly string[];
  readonly themeVars: string;
  readonly navigation: ReadonlyArray<{ readonly label: string; readonly href: string; readonly active: boolean }>;
  readonly socialLinks: ReadonlyArray<{ readonly label: string; readonly href: string }>;
};

type TemplateCacheKey = `${string}:${string}`;

const templateCache = new Map<TemplateCacheKey, Handlebars.TemplateDelegate<LayoutContext>>();

export const clearTemplateCache = (): void => {
  templateCache.clear();
};

const loadPartials = async (env: typeof Handlebars, partialsDir: string): Promise<void> => {
  const exists = await fs.pathExists(partialsDir);
  if (!exists) {
    return;
  }
  const files = await fs.readdir(partialsDir);
  await Promise.all(
    files.map(async (fileName) => {
      const fullPath = path.join(partialsDir, fileName);
      if (!fileName.endsWith('.hbs')) {
        return;
      }
      const source = await fs.readFile(fullPath, 'utf8');
      env.registerPartial(path.basename(fileName, '.hbs'), source);
    }),
  );
};

const createEnvironment = async (paths: PathConfig): Promise<typeof Handlebars> => {
  const env = Handlebars.create();
  await loadPartials(env, paths.partialsDir);
  return env;
};

export const renderWithLayout = async (
  layout: string,
  context: LayoutContext,
  paths: PathConfig,
): Promise<string> => {
  const cacheKey: TemplateCacheKey = `${paths.layoutsDir}:${layout}`;
  const cached = templateCache.get(cacheKey);
  if (cached) {
    return cached(context);
  }

  const layoutPath = path.join(paths.layoutsDir, `${layout}.hbs`);
  const exists = await fs.pathExists(layoutPath);
  if (!exists) {
    throw new Error(`Layout "${layout}" not found at ${layoutPath}`);
  }

  const env = await createEnvironment(paths);
  const source = await fs.readFile(layoutPath, 'utf8');
  const compiled = env.compile<LayoutContext>(source, { noEscape: true });
  templateCache.set(cacheKey, compiled);
  return compiled(context);
};

