/**
 * Design tokens as TypeScript objects.
 * These compile to CSS custom properties at runtime.
 * Single source of truth for palette, typography, spacing, and radii.
 */

export type ThemeTokens = {
  readonly palette: {
    readonly primary: string;
    readonly secondary: string;
    readonly accent: string;
    readonly background: string;
    readonly text: string;
  };
  readonly typography: {
    readonly headingFont: string;
    readonly bodyFont: string;
    readonly baseSize: number;
    readonly scaleRatio: number;
  };
  readonly spacing: {
    readonly unit: number;
    readonly scale: ReadonlyArray<number>;
  };
  readonly radii: {
    readonly small: number;
    readonly medium: number;
    readonly large: number;
  };
};

export const defaultTokens: ThemeTokens = {
  palette: {
    primary: '#1a1a1a',
    secondary: '#f5f5f5',
    accent: '#0066cc',
    background: '#ffffff',
    text: '#1a1a1a',
  },
  typography: {
    headingFont: 'system-ui, -apple-system, sans-serif',
    bodyFont: 'system-ui, -apple-system, sans-serif',
    baseSize: 16,
    scaleRatio: 1.25,
  },
  spacing: {
    unit: 8,
    scale: [0, 1, 2, 3, 4, 6, 8, 12, 16],
  },
  radii: {
    small: 4,
    medium: 8,
    large: 16,
  },
};

/** Convert tokens to a CSS custom properties string. */
export const tokensToCssVars = (tokens: ThemeTokens): string => [
  `--color-primary: ${tokens.palette.primary};`,
  `--color-secondary: ${tokens.palette.secondary};`,
  `--color-accent: ${tokens.palette.accent};`,
  `--color-background: ${tokens.palette.background};`,
  `--color-text: ${tokens.palette.text};`,
  `--font-heading: ${tokens.typography.headingFont};`,
  `--font-body: ${tokens.typography.bodyFont};`,
  `--font-base-size: ${tokens.typography.baseSize}px;`,
  `--font-scale: ${tokens.typography.scaleRatio};`,
  `--spacing-unit: ${tokens.spacing.unit}px;`,
  `--radius-sm: ${tokens.radii.small}px;`,
  `--radius-md: ${tokens.radii.medium}px;`,
  `--radius-lg: ${tokens.radii.large}px;`,
].join('\n');
