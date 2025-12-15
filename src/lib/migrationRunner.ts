import fs from 'fs-extra';
import path from 'node:path';
import YAML from 'yaml';
import { PathConfig } from './paths.js';

/**
 * Migration framework for content-preserving deployments.
 *
 * Migration scripts transform content YAML files when schema changes occur.
 * They are stored in the migrations/ directory and applied in order.
 */

export type MigrationScript = {
  readonly name: string;
  readonly description: string;
  readonly targetSchemaHash: string;
  readonly createdAt: string;
  readonly transform: (files: MigrationFiles) => MigrationFiles;
};

export type MigrationFiles = Record<string, unknown>;

export type MigrationManifest = {
  readonly name: string;
  readonly description: string;
  readonly targetSchemaHash: string;
  readonly createdAt: string;
  readonly scriptPath: string;
};

const migrationsDir = (rootDir: string): string => path.join(rootDir, 'migrations');

/**
 * Lists all available migration scripts.
 */
export const listMigrations = async (rootDir: string): Promise<MigrationManifest[]> => {
  const dir = migrationsDir(rootDir);
  const exists = await fs.pathExists(dir);
  if (!exists) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const manifests: MigrationManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(dir, entry.name, 'manifest.json');
    const manifestExists = await fs.pathExists(manifestPath);
    if (!manifestExists) continue;

    const content = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(content) as MigrationManifest;
    manifests.push({
      ...manifest,
      scriptPath: path.join(dir, entry.name, 'migrate.js'),
    });
  }

  // Sort by creation date
  return manifests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

/**
 * Creates a new migration script scaffold.
 */
export const createMigrationScaffold = async (
  rootDir: string,
  name: string,
  description: string,
  targetSchemaHash: string,
): Promise<string> => {
  const dir = migrationsDir(rootDir);
  await fs.ensureDir(dir);

  // Generate migration directory name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const migrationDir = path.join(dir, `${timestamp}-${safeName}`);

  await fs.ensureDir(migrationDir);

  // Create manifest
  const manifest: MigrationManifest = {
    name,
    description,
    targetSchemaHash,
    createdAt: new Date().toISOString(),
    scriptPath: 'migrate.js',
  };

  await fs.writeJson(path.join(migrationDir, 'manifest.json'), manifest, { spaces: 2 });

  // Create migration script template
  const scriptTemplate = `/**
 * Migration: ${name}
 * Description: ${description}
 * Target Schema Hash: ${targetSchemaHash}
 *
 * This script transforms content files from the previous schema to the new schema.
 * It receives all content files as parsed objects and must return the transformed files.
 */

/**
 * Transform content files to match the new schema.
 *
 * @param {Record<string, unknown>} files - Object mapping file paths to parsed YAML content
 * @returns {Record<string, unknown>} - Transformed files
 *
 * Example file paths:
 *   - 'site.config.yaml' - Site configuration
 *   - 'pages/home.yaml' - Page content
 *   - 'pages/about.yaml' - Page content
 */
export const transform = (files) => {
  const result = { ...files };

  // Example: Rename a field in site config
  // if (result['site.config.yaml']) {
  //   const config = result['site.config.yaml'];
  //   config.newFieldName = config.oldFieldName;
  //   delete config.oldFieldName;
  // }

  // Example: Update all pages
  // for (const [path, content] of Object.entries(result)) {
  //   if (path.startsWith('pages/')) {
  //     content.layout = content.layout ?? 'default';
  //   }
  // }

  return result;
};
`;

  await fs.writeFile(path.join(migrationDir, 'migrate.js'), scriptTemplate, 'utf8');

  return migrationDir;
};

/**
 * Loads and executes a migration script.
 */
export const loadMigration = async (scriptPath: string): Promise<MigrationScript['transform']> => {
  // Dynamic import of the migration script
  const module = await import(scriptPath) as { transform: MigrationScript['transform'] };

  if (typeof module.transform !== 'function') {
    throw new Error(`Migration script must export a 'transform' function: ${scriptPath}`);
  }

  return module.transform;
};

/**
 * Applies a migration to content files.
 */
export const applyMigration = async (
  contentFiles: Record<string, string>,
  scriptPath: string,
): Promise<Record<string, string>> => {
  // Parse YAML files
  const parsed: MigrationFiles = {};
  for (const [filePath, content] of Object.entries(contentFiles)) {
    if (/\.ya?ml$/i.test(filePath)) {
      parsed[filePath] = YAML.parse(content);
    } else if (filePath.endsWith('.json')) {
      parsed[filePath] = JSON.parse(content);
    }
  }

  // Load and run migration
  const transform = await loadMigration(scriptPath);
  const transformed = transform(parsed);

  // Serialize back to YAML
  const result: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(transformed)) {
    if (/\.ya?ml$/i.test(filePath)) {
      result[filePath] = YAML.stringify(content, { lineWidth: 0 });
    } else if (filePath.endsWith('.json')) {
      result[filePath] = JSON.stringify(content, null, 2);
    }
  }

  return result;
};

/**
 * Validates that a migration produces valid content.
 */
export const validateMigrationOutput = (
  files: Record<string, string>,
  validator: (files: Record<string, string>) => { valid: boolean; errors: unknown[] },
): { valid: boolean; errors: unknown[] } => {
  return validator(files);
};

