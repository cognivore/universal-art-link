import YAML from 'yaml';
import { SiteConfigSchema, PageSchema } from '../types/content.js';
import { z } from 'zod';

/**
 * Schema validation utility for content-preserving deployments.
 *
 * Validates existing YAML content against the current Zod schemas to ensure
 * compatibility before deployment. This catches schema breaking changes.
 */

export type ValidationResult = {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<ValidationError>;
};

export type ValidationError = {
  readonly file: string;
  readonly path: string;
  readonly message: string;
};

export type ContentFiles = Record<string, string>;

const parseYaml = (content: string, fileName: string): unknown => {
  try {
    return YAML.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse YAML in ${fileName}: ${(error as Error).message}`);
  }
};

const formatZodError = (error: z.ZodError, fileName: string): ValidationError[] => {
  return error.issues.map((issue) => ({
    file: fileName,
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
};

/**
 * Validates a site.config.yaml file against the SiteConfigSchema.
 */
export const validateSiteConfig = (content: string, fileName: string): ValidationError[] => {
  const parsed = parseYaml(content, fileName);
  const result = SiteConfigSchema.safeParse(parsed);

  if (result.success) {
    return [];
  }

  return formatZodError(result.error, fileName);
};

/**
 * Validates a page YAML file against the PageSchema.
 */
export const validatePage = (content: string, fileName: string): ValidationError[] => {
  const parsed = parseYaml(content, fileName);
  const result = PageSchema.safeParse(parsed);

  if (result.success) {
    return [];
  }

  return formatZodError(result.error, fileName);
};

/**
 * Validates all content files against their respective schemas.
 *
 * Expected structure:
 * - site.config.yaml or site.yaml → SiteConfigSchema
 * - pages/*.yaml → PageSchema
 *
 * Returns a ValidationResult with all errors found.
 */
export const validateContentFiles = (files: ContentFiles): ValidationResult => {
  const errors: ValidationError[] = [];

  for (const [fileName, content] of Object.entries(files)) {
    // Skip schema.json - it's not validated, it IS the schema definition
    if (fileName === 'schema.json') {
      continue;
    }

    // Skip non-YAML files
    if (!/\.ya?ml$/i.test(fileName)) {
      continue;
    }

    try {
      if (fileName === 'site.config.yaml' || fileName === 'site.yaml') {
        errors.push(...validateSiteConfig(content, fileName));
      } else if (fileName.startsWith('pages/')) {
        errors.push(...validatePage(content, fileName));
      }
      // Other YAML files (commerce, auth) can be added here as needed
    } catch (error) {
      errors.push({
        file: fileName,
        path: '(parse)',
        message: (error as Error).message,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Formats validation errors for display.
 */
export const formatValidationErrors = (result: ValidationResult): string => {
  if (result.valid) {
    return 'All content files are valid.';
  }

  const grouped = new Map<string, ValidationError[]>();
  for (const error of result.errors) {
    const existing = grouped.get(error.file) ?? [];
    grouped.set(error.file, [...existing, error]);
  }

  const lines: string[] = ['Schema validation failed:', ''];

  for (const [file, fileErrors] of grouped) {
    lines.push(`  ${file}:`);
    for (const err of fileErrors) {
      lines.push(`    - ${err.path}: ${err.message}`);
    }
    lines.push('');
  }

  lines.push('Content must be migrated before deployment.');
  lines.push('Create a migration script or update the content manually.');

  return lines.join('\n');
};

