import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import { PathConfig } from './paths.js';

/**
 * Schema hash utility for content-preserving deployments.
 *
 * Generates a deterministic hash from the content schema definition (schema.json)
 * and the Zod type definitions (types/content.ts). This hash is used to detect
 * when schema changes occur that would require content migration.
 */

export type SchemaFingerprint = {
  readonly hash: string;
  readonly schemaJsonHash: string;
  readonly zodTypesHash: string;
  readonly computedAt: string;
};

const hashContent = (content: string): string => {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
};

const normalizeJson = (content: string): string => {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 0);
  } catch {
    return content;
  }
};

const normalizeTypeScript = (content: string): string => {
  // Remove comments and normalize whitespace for consistent hashing
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, '') // Remove line comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

const readSchemaJson = async (paths: PathConfig): Promise<string> => {
  const schemaPath = path.join(paths.contentDir, 'schema.json');
  const exists = await fs.pathExists(schemaPath);
  if (!exists) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }
  const content = await fs.readFile(schemaPath, 'utf8');
  return normalizeJson(content);
};

const readZodTypes = async (rootDir: string): Promise<string> => {
  const typesPath = path.join(rootDir, 'src/types/content.ts');
  const exists = await fs.pathExists(typesPath);
  if (!exists) {
    throw new Error(`Zod types file not found: ${typesPath}`);
  }
  const content = await fs.readFile(typesPath, 'utf8');
  return normalizeTypeScript(content);
};

/**
 * Computes a deterministic schema fingerprint from the content schema definition
 * and Zod type definitions. Changes to either will result in a different hash.
 */
export const computeSchemaFingerprint = async (paths: PathConfig): Promise<SchemaFingerprint> => {
  const [schemaJson, zodTypes] = await Promise.all([
    readSchemaJson(paths),
    readZodTypes(paths.rootDir),
  ]);

  const schemaJsonHash = hashContent(schemaJson);
  const zodTypesHash = hashContent(zodTypes);
  const combinedHash = hashContent(`${schemaJsonHash}:${zodTypesHash}`);

  return {
    hash: combinedHash,
    schemaJsonHash,
    zodTypesHash,
    computedAt: new Date().toISOString(),
  };
};

/**
 * Compares two schema fingerprints and returns whether they are compatible.
 * Schemas are compatible if and only if their hashes match exactly.
 */
export const schemasCompatible = (local: SchemaFingerprint, remote: SchemaFingerprint): boolean => {
  return local.hash === remote.hash;
};

/**
 * Generates a human-readable diff description between two fingerprints.
 */
export const describeSchemaChange = (local: SchemaFingerprint, remote: SchemaFingerprint): string => {
  const changes: string[] = [];

  if (local.schemaJsonHash !== remote.schemaJsonHash) {
    changes.push('schema.json has changed');
  }
  if (local.zodTypesHash !== remote.zodTypesHash) {
    changes.push('Zod type definitions (src/types/content.ts) have changed');
  }

  if (changes.length === 0) {
    return 'No schema changes detected';
  }

  return `Schema incompatibility detected:\n  - ${changes.join('\n  - ')}`;
};

