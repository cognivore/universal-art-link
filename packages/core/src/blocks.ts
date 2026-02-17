import { z } from 'zod';

/**
 * Block type registry: a tagged union of all supported block types.
 * Each block type has a `type` discriminator and a `props` record.
 * This is the single source of truth consumed by editor, renderer, and validation.
 */

export const HeroBlockProps = z.object({
  heading: z.string().default(''),
  subheading: z.string().default(''),
  imageId: z.string().nullable().default(null),
  ctaLabel: z.string().default(''),
  ctaUrl: z.string().default(''),
});

export const TextBlockProps = z.object({
  body: z.string().default(''),
  alignment: z.enum(['left', 'center', 'right']).default('left'),
});

export const ImageBlockProps = z.object({
  mediaId: z.string().nullable().default(null),
  alt: z.string().default(''),
  caption: z.string().default(''),
  fullBleed: z.boolean().default(false),
});

export const ImageGridBlockProps = z.object({
  images: z.array(z.object({
    mediaId: z.string(),
    alt: z.string().default(''),
    caption: z.string().default(''),
  })).default([]),
  columns: z.number().int().min(1).max(6).default(3),
});

export const QuoteBlockProps = z.object({
  text: z.string().default(''),
  attribution: z.string().default(''),
});

export const EmbedBlockProps = z.object({
  url: z.string().url().or(z.literal('')).default(''),
  caption: z.string().default(''),
});

export const ProjectsGridBlockProps = z.object({
  projectIds: z.array(z.string()).default([]),
  columns: z.number().int().min(1).max(4).default(3),
});

export const ContactFormBlockProps = z.object({
  heading: z.string().default(''),
  email: z.string().email().or(z.literal('')).default(''),
  description: z.string().default(''),
});

export const BlogRollBlockProps = z.object({
  maxPosts: z.number().int().positive().default(10),
  showExcerpt: z.boolean().default(true),
});

export const BlockPropsMap = {
  hero: HeroBlockProps,
  text: TextBlockProps,
  image: ImageBlockProps,
  imageGrid: ImageGridBlockProps,
  quote: QuoteBlockProps,
  embed: EmbedBlockProps,
  projectsGrid: ProjectsGridBlockProps,
  contactForm: ContactFormBlockProps,
  blogRoll: BlogRollBlockProps,
} as const;

export type BlockType = keyof typeof BlockPropsMap;

export const BLOCK_TYPES = Object.keys(BlockPropsMap) as ReadonlyArray<BlockType>;

export const BlockModel = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hero'), id: z.string(), props: HeroBlockProps }),
  z.object({ type: z.literal('text'), id: z.string(), props: TextBlockProps }),
  z.object({ type: z.literal('image'), id: z.string(), props: ImageBlockProps }),
  z.object({ type: z.literal('imageGrid'), id: z.string(), props: ImageGridBlockProps }),
  z.object({ type: z.literal('quote'), id: z.string(), props: QuoteBlockProps }),
  z.object({ type: z.literal('embed'), id: z.string(), props: EmbedBlockProps }),
  z.object({ type: z.literal('projectsGrid'), id: z.string(), props: ProjectsGridBlockProps }),
  z.object({ type: z.literal('contactForm'), id: z.string(), props: ContactFormBlockProps }),
  z.object({ type: z.literal('blogRoll'), id: z.string(), props: BlogRollBlockProps }),
]);

export type BlockModel = z.infer<typeof BlockModel>;

/** Validate props for a given block type. Returns parsed props or throws. */
export const validateBlockProps = (type: BlockType, raw: unknown): unknown =>
  BlockPropsMap[type].parse(raw);
