import { z } from 'zod';
import { BlockModel } from './blocks.js';
import { MediaModel } from './media.js';

/**
 * SiteConfig: theme tokens, navigation, SEO defaults.
 * Stored in the CRDT config map and in canonical export JSON.
 */
export const SiteConfig = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
  favicon: z.string().default(''),
  palette: z.object({
    primary: z.string().default('#1a1a1a'),
    secondary: z.string().default('#f5f5f5'),
    accent: z.string().default('#0066cc'),
    background: z.string().default('#ffffff'),
    text: z.string().default('#1a1a1a'),
  }).default({}),
  typography: z.object({
    headingFont: z.string().default('system-ui'),
    bodyFont: z.string().default('system-ui'),
    baseSize: z.number().default(16),
    scaleRatio: z.number().default(1.25),
  }).default({}),
  spacing: z.object({
    unit: z.number().default(8),
    scale: z.array(z.number()).default([0, 1, 2, 3, 4, 6, 8, 12, 16]),
  }).default({}),
  radii: z.object({
    small: z.number().default(4),
    medium: z.number().default(8),
    large: z.number().default(16),
  }).default({}),
  navigation: z.array(z.object({
    label: z.string(),
    slug: z.string(),
  })).default([]),
  seo: z.object({
    ogImage: z.string().default(''),
    twitterHandle: z.string().default(''),
  }).default({}),
});

export type SiteConfig = z.infer<typeof SiteConfig>;

export const PageStatus = z.enum(['draft', 'published', 'archived']);
export type PageStatus = z.infer<typeof PageStatus>;

export const PageModel = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: PageStatus.default('draft'),
  seo: z.object({
    title: z.string().default(''),
    description: z.string().default(''),
    ogImage: z.string().default(''),
  }).default({}),
  blocks: z.array(BlockModel).default([]),
});

export type PageModel = z.infer<typeof PageModel>;

/**
 * SiteModel: the canonical export format.
 * This is what the renderer consumes and what gets stored in snapshot site_json.
 * Must be validated, deterministic (stable ordering), and backward-migration capable.
 */
export const SiteModel = z.object({
  config: SiteConfig,
  pages: z.array(PageModel),
  media: z.record(z.string(), MediaModel),
});

export type SiteModel = z.infer<typeof SiteModel>;

/** Create an empty SiteModel with sensible defaults. */
export const emptySiteModel = (): SiteModel => ({
  config: SiteConfig.parse({}),
  pages: [],
  media: {},
});
