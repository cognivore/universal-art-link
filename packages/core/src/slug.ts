/**
 * Slug validation and reserved-word blocking.
 * Pure functions -- no side effects.
 */

const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'ws', 'static', 'media',
  'auth', 'login', 'logout', 'register',
  'meta', 'health', 'healthz', 'readyz',
  'www', 'mail', 'ftp', 'smtp', 'imap',
  'blog', 'app', 'dashboard', 'console',
  'stripe', 'webhook', 'callback',
]);

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_SLUG_LENGTH = 63;

export type SlugValidation =
  | { readonly valid: true; readonly slug: string }
  | { readonly valid: false; readonly reason: string };

export const validateSlug = (raw: string): SlugValidation => {
  const slug = raw.trim().toLowerCase();

  if (slug.length === 0) {
    return { valid: false, reason: 'Slug must not be empty' };
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    return { valid: false, reason: `Slug must be ${MAX_SLUG_LENGTH} characters or fewer` };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      reason: 'Slug must contain only lowercase letters, digits, and hyphens; must not start or end with a hyphen',
    };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return { valid: false, reason: `"${slug}" is a reserved word and cannot be used as a slug` };
  }

  return { valid: true, slug };
};

export const isReservedSlug = (slug: string): boolean =>
  RESERVED_SLUGS.has(slug.toLowerCase());

/** Normalize a string into a URL-safe slug candidate. */
export const toSlugCandidate = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
