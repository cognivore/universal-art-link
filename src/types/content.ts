import { z } from 'zod';

const slugTransform = z
  .string()
  .min(1, 'Slug is required')
  .transform((value) => (value.startsWith('/') ? value : `/${value}`))
  .transform((value) => (value === '//' ? '/' : value.replace(/\/{2,}/g, '/')))
  .transform((value) => (value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value));

const MediaSchema = z.object({
  src: z.string().min(1, 'Media src is required'),
  alt: z.string().default(''),
  focalPoint: z.enum(['left', 'center', 'right']).default('center'),
});

const CtaSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const HeroSectionSchema = z.object({
  type: z.literal('hero'),
  kicker: z.string().optional(),
  eyebrow: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  media: MediaSchema.optional(),
  primaryCta: CtaSchema.optional(),
  secondaryCta: CtaSchema.optional(),
});

const ProjectCardSchema = z.object({
  title: z.string(),
  role: z.string(),
  year: z.string(),
  coverImage: MediaSchema,
  url: z.string().optional(),
  slug: slugTransform.optional(),
  span: z.enum(['wide', 'tall', 'standard']).default('standard'),
});

const ProjectsGridSectionSchema = z.object({
  type: z.literal('projects-grid'),
  title: z.string(),
  intro: z.string().optional(),
  projects: z.array(ProjectCardSchema).min(1, 'At least one project is required'),
});

const TextBlockSchema = z.object({
  type: z.literal('text'),
  title: z.string().optional(),
  body: z.string(),
});

const ImageBlockSchema = z.object({
  type: z.literal('image'),
  media: MediaSchema,
  caption: z.string().optional(),
  bleed: z.boolean().default(false),
});

const ImageGridBlockSchema = z.object({
  type: z.literal('image-grid'),
  items: z.array(
    z.object({
      media: MediaSchema,
      caption: z.string().optional(),
    }),
  ),
});

const QuoteBlockSchema = z.object({
  type: z.literal('quote'),
  quote: z.string(),
  cite: z.string().optional(),
  role: z.string().optional(),
});

const EmbedBlockSchema = z.object({
  type: z.literal('embed'),
  html: z.string(),
  label: z.string().optional(),
});

const ProjectBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  ImageGridBlockSchema,
  QuoteBlockSchema,
  EmbedBlockSchema,
]);

const BlogPostBlockSchema = ProjectBlockSchema;

const BlogPostSchema = z.object({
  id: z.string().min(1, 'Post ID required'),
  title: z.string(),
  slug: slugTransform,
  excerpt: z.string().optional(),
  publishedAt: z.string(),
  coverImage: MediaSchema,
  blocks: z.array(BlogPostBlockSchema).min(1, 'Add at least one block to the post'),
});

const SingleProjectSectionSchema = z.object({
  type: z.literal('single-project'),
  title: z.string(),
  role: z.string(),
  year: z.string(),
  credits: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  blocks: z.array(ProjectBlockSchema).min(1),
});

const TextColumnsSectionSchema = z.object({
  type: z.literal('text-columns'),
  title: z.string().optional(),
  columns: z.array(
    z.object({
      label: z.string().optional(),
      body: z.string(),
    }),
  ),
});

const ListSectionSchema = z.object({
  type: z.literal('list-section'),
  title: z.string(),
  items: z.array(
    z.object({
      label: z.string(),
      detail: z.string().optional(),
      url: z.string().optional(),
    }),
  ),
});

const ContactSectionSchema = z.object({
  type: z.literal('contact'),
  title: z.string(),
  body: z.string(),
  email: z.string().email('Invalid email address'),
  formAction: z.string().optional(),
});

const BlogRollSectionSchema = z.object({
  type: z.literal('blog-roll'),
  title: z.string(),
  intro: z.string().optional(),
  posts: z
    .array(
      z.object({
        postId: z.string().min(1, 'Post reference is required'),
        featured: z.boolean().optional(),
      }),
    )
    .default([]),
});

export const SectionSchema = z.discriminatedUnion('type', [
  HeroSectionSchema,
  ProjectsGridSectionSchema,
  SingleProjectSectionSchema,
  TextColumnsSectionSchema,
  ListSectionSchema,
  ContactSectionSchema,
  BlogRollSectionSchema,
]);

const NavigationItemSchema = z.object({
  label: z.string(),
  href: slugTransform.or(z.string().url()),
});

const SocialLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const TypographySchema = z.object({
  displaySans: z.string(),
  bodySans: z.string(),
  accentSerif: z.string().optional(),
});

const ThemeSchema = z.object({
  mode: z.enum(['light', 'dark']).default('light'),
  background: z.string().default('#f6f1eb'),
  foreground: z.string().default('#0f0f0f'),
  accent: z.string().default('#ff4d00'),
  muted: z.string().default('#6a6a6a'),
  borderSubtle: z.string().default('rgba(10,10,10,0.15)'),
  typography: TypographySchema,
  density: z.enum(['airy', 'standard', 'tight']).default('standard'),
});

const DeploySchema = z.object({
  endpoint: z.string().url('Deploy endpoint must be a valid URL'),
  method: z.enum(['POST', 'PUT']).optional(),
  authHeader: z.string().optional(),
});

export const PageSchema = z.object({
  slug: slugTransform,
  title: z.string(),
  description: z.string().optional(),
  layout: z.enum(['default', 'project', 'index-grid', 'journal', 'blog']).default('default'),
  sections: z.array(SectionSchema).default([]),
  journalPosts: z.array(BlogPostSchema).optional(),
});

export const SiteConfigSchema = z.object({
  siteTitle: z.string(),
  siteDescription: z.string(),
  favicon: z.string().optional(),
  baseUrl: z.string().default('/'),
  theme: ThemeSchema,
  navigation: z.array(NavigationItemSchema),
  socialLinks: z.array(SocialLinkSchema).optional(),
  deploy: DeploySchema.optional(),
});

export type Media = z.infer<typeof MediaSchema>;
export type HeroSection = z.infer<typeof HeroSectionSchema>;
export type ProjectsGridSection = z.infer<typeof ProjectsGridSectionSchema>;
export type SingleProjectSection = z.infer<typeof SingleProjectSectionSchema>;
export type TextColumnsSection = z.infer<typeof TextColumnsSectionSchema>;
export type ListSection = z.infer<typeof ListSectionSchema>;
export type ContactSection = z.infer<typeof ContactSectionSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type ProjectBlock = z.infer<typeof ProjectBlockSchema>;
export type BlogPostBlock = z.infer<typeof BlogPostBlockSchema>;
export type BlogPost = z.infer<typeof BlogPostSchema>;
export type Page = z.infer<typeof PageSchema>;
export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type ThemeConfig = z.infer<typeof ThemeSchema>;

