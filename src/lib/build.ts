import fs from 'fs-extra';
import path from 'node:path';
import { createPathConfig, PathConfig } from './paths.js';
import { loadPages, loadSiteConfig } from './contentLoader.js';
import { renderBlogPost, renderSections } from './sections.js';
import { clearTemplateCache, renderWithLayout } from './template.js';
import { BlogPost, Page, SiteConfig } from '../types/content.js';

export type BuildOptions = {
  readonly rootDir: string;
  readonly outDir?: string;
  readonly invalidateTemplates?: boolean;
};

export type BuildResult = {
  readonly pages: number;
  readonly outputDir: string;
  readonly previewPaths: ReadonlyArray<string>;
};

const slugToOutputPath = (slug: string): string => {
  if (slug === '/' || slug === './') {
    return 'index.html';
  }
  const normalized = slug.startsWith('/') ? slug.slice(1) : slug;
  return path.join(normalized, 'index.html');
};

const slugDepth = (slug: string): number => {
  if (slug === '/' || slug === './') {
    return 0;
  }
  return slug.split('/').filter((segment) => segment.length > 0).length;
};

const relativeFromDepth = (depth: number): string =>
  depth === 0 ? '.' : Array.from({ length: depth }, () => '..').join('/');

const assetHref = (depth: number, subPath: string): string => {
  const base = relativeFromDepth(depth);
  return `${base}/${subPath}`.replace('//', '/');
};

const slugToHref = (slug: string, depth: number): string => {
  if (slug === '/') {
    return depth === 0 ? './' : `${relativeFromDepth(depth)}/`;
  }
  const normalized = slug.startsWith('/') ? slug.slice(1) : slug;
  return `${relativeFromDepth(depth)}/${normalized}/index.html`.replace('//', '/');
};

const createLinkResolver = (depth: number) => (href: string): string => {
  if (!href) {
    return '#';
  }
  if (/^(https?:|mailto:|tel:|#)/.test(href)) {
    return href;
  }
  if (href.startsWith('/')) {
    return slugToHref(href, depth);
  }
  return href;
};

const themeToCssVariables = (theme: SiteConfig['theme']): string => {
  const densityScale: Record<'airy' | 'standard' | 'tight', Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string>> = {
    airy: {
      xs: '0.75rem',
      sm: '1.25rem',
      md: '2.25rem',
      lg: '3.5rem',
      xl: '5rem',
    },
    standard: {
      xs: '0.5rem',
      sm: '1rem',
      md: '1.5rem',
      lg: '2.5rem',
      xl: '4rem',
    },
    tight: {
      xs: '0.35rem',
      sm: '0.75rem',
      md: '1.25rem',
      lg: '2rem',
      xl: '3.25rem',
    },
  };

  const density = densityScale[theme.density] ?? densityScale.standard;

  const vars: Record<string, string> = {
    '--bg': theme.background,
    '--fg': theme.foreground,
    '--accent': theme.accent,
    '--muted': theme.muted,
    '--border-subtle': theme.borderSubtle,
    '--font-display': theme.typography.displaySans,
    '--font-body': theme.typography.bodySans,
    '--font-accent': theme.typography.accentSerif ?? theme.typography.bodySans,
    '--space-xs': density.xs,
    '--space-sm': density.sm,
    '--space-md': density.md,
    '--space-lg': density.lg,
    '--space-xl': density.xl,
  };

  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');
};

const copyIfExists = async (source: string, destination: string): Promise<void> => {
  const exists = await fs.pathExists(source);
  if (!exists) {
    return;
  }
  await fs.copy(source, destination, { overwrite: true });
};

const copyAdminInterface = async (paths: PathConfig): Promise<void> => {
  const destination = path.join(paths.outputDir, 'admin');
  const modernBundle = paths.adminAppDistDir;
  if (await fs.pathExists(modernBundle)) {
    await fs.copy(modernBundle, destination, { overwrite: true });
    return;
  }
  await copyIfExists(paths.adminDir, destination);
  await copyIfExists(paths.adminSharedDir, path.join(destination, 'shared'));
};

const buildNavigation = (
  config: SiteConfig,
  depth: number,
  currentSlug: string,
): ReadonlyArray<{ readonly label: string; readonly href: string; readonly active: boolean }> =>
  config.navigation.map((item) => {
    const href = item.href.startsWith('/') ? slugToHref(item.href, depth) : item.href;
    const isExact = item.href === currentSlug;
    const isNested = item.href !== '/' && currentSlug?.startsWith(`${item.href}/`);
    const active = Boolean(isExact || isNested);
    return { label: item.label, href, active };
  });

const buildSocial = (
  config: SiteConfig,
): ReadonlyArray<{ readonly label: string; readonly href: string }> =>
  (config.socialLinks ?? []).map((link) => ({ label: link.label, href: link.href }));

const renderPageToHtml = async (
  page: Page,
  site: SiteConfig,
  paths: PathConfig,
): Promise<{ readonly html: string; readonly outputPath: string }> => {
  const depth = slugDepth(page.slug);
  const resolveLink = createLinkResolver(depth);
  const resolvePost = (postId: string): BlogPost | undefined => (page.journalPosts ?? []).find((post) => post.id === postId);
  const renderedSections = renderSections(page.sections, { resolveLink, resolvePost });
  const themeVars = themeToCssVariables(site.theme);

  const metaTitle = `${page.title} · ${site.siteTitle}`;
  const canonical =
    site.baseUrl.startsWith('http://') || site.baseUrl.startsWith('https://')
      ? new URL(page.slug, site.baseUrl).toString()
      : `${site.baseUrl.replace(/\/$/, '')}${page.slug}`;

  const context = {
    site,
    page,
    meta: {
      title: metaTitle,
      description: page.description ?? site.siteDescription,
      canonicalUrl: canonical,
    },
    assets: {
      styles: assetHref(depth, 'styles/editorial.css'),
      scripts: assetHref(depth, 'scripts/app.js'),
      base: relativeFromDepth(depth),
    },
    sections: renderedSections,
    themeVars,
    navigation: buildNavigation(site, depth, page.slug),
    socialLinks: buildSocial(site),
  };

  const layout = page.layout ?? 'default';
  const html = await renderWithLayout(layout, context, paths);
  const outputPath = path.join(paths.outputDir, slugToOutputPath(page.slug));
  return { html, outputPath };
};

const renderBlogPostPage = async (
  post: BlogPost,
  parentPage: Page,
  site: SiteConfig,
  paths: PathConfig,
): Promise<{ readonly html: string; readonly outputPath: string }> => {
  const depth = slugDepth(post.slug);
  const resolveLink = createLinkResolver(depth);
  const renderedBody = renderBlogPost(post, { resolveLink });
  const themeVars = themeToCssVariables(site.theme);
  const metaTitle = `${post.title} · ${site.siteTitle}`;
  const canonical =
    site.baseUrl.startsWith('http://') || site.baseUrl.startsWith('https://')
      ? new URL(post.slug, site.baseUrl).toString()
      : `${site.baseUrl.replace(/\/$/, '')}${post.slug}`;

  const pageStub: Page = {
    slug: post.slug,
    title: post.title,
    description: post.excerpt ?? parentPage.description ?? site.siteDescription,
    layout: 'blog',
    sections: [],
    journalPosts: [],
  };

  const context = {
    site,
    page: pageStub,
    meta: {
      title: metaTitle,
      description: pageStub.description ?? site.siteDescription,
      canonicalUrl: canonical,
    },
    assets: {
      styles: assetHref(depth, 'styles/editorial.css'),
      scripts: assetHref(depth, 'scripts/app.js'),
      base: relativeFromDepth(depth),
    },
    sections: [renderedBody],
    themeVars,
    navigation: buildNavigation(site, depth, post.slug),
    socialLinks: buildSocial(site),
    post,
  };

  const html = await renderWithLayout('blog', context, paths);
  const outputPath = path.join(paths.outputDir, slugToOutputPath(post.slug));
  return { html, outputPath };
};

export const buildSite = async ({ rootDir, outDir, invalidateTemplates }: BuildOptions): Promise<BuildResult> => {
  if (invalidateTemplates) {
    clearTemplateCache();
  }

  const paths = createPathConfig(rootDir, outDir);
  const [siteConfig, pages] = await Promise.all([loadSiteConfig(paths.contentDir), loadPages(paths.pagesDir)]);

  await fs.ensureDir(paths.outputDir);
  await fs.emptyDir(paths.outputDir);

  const rendered: Array<{ html: string; outputPath: string }> = [];
  const blogPreviewPaths: string[] = [];
  for (const page of pages) {
    rendered.push(await renderPageToHtml(page, siteConfig, paths));
    if (Array.isArray(page.journalPosts)) {
      for (const post of page.journalPosts) {
        rendered.push(await renderBlogPostPage(post, page, siteConfig, paths));
        blogPreviewPaths.push(post.slug);
      }
    }
  }

  await Promise.all(
    rendered.map(async ({ html, outputPath }) => {
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, html, 'utf8');
    }),
  );

  await copyIfExists(paths.assetsDir, path.join(paths.outputDir, 'assets'));
  await copyIfExists(paths.stylesDir, path.join(paths.outputDir, 'styles'));
  await copyIfExists(paths.scriptsDir, path.join(paths.outputDir, 'scripts'));
  await copyAdminInterface(paths);

  const previewPaths = [...pages.map((page) => page.slug), ...blogPreviewPaths];
  return { pages: rendered.length, outputDir: paths.outputDir, previewPaths };
};

