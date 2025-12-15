import fs from 'fs-extra';
import path from 'node:path';
import { z } from 'zod';
import { PathConfig } from './paths.js';
import { SchemaFingerprint } from './schemaHash.js';

/**
 * Deploy state management for content-preserving deployments.
 *
 * The state file (.ual/state.json) tracks:
 * - pinnedCommit: Git commit when content was last seeded/migrated
 * - schemaHash: Hash of the content schema at that commit
 * - contentVersion: Incrementing version number for migrations
 * - lastDeployedCommit: Most recent code deployment
 */

export const DeployStateSchema = z.object({
  /** Git commit hash when content was seeded or last migrated */
  pinnedCommit: z.string().min(7),
  /** Schema fingerprint hash at the pinned commit */
  schemaHash: z.string().min(16),
  /** Full schema fingerprint for debugging */
  schemaFingerprint: z.object({
    hash: z.string(),
    schemaJsonHash: z.string(),
    zodTypesHash: z.string(),
    computedAt: z.string(),
  }),
  /** Incrementing version number, bumped on each migration */
  contentVersion: z.number().int().min(1),
  /** Git commit hash of most recent code deployment */
  lastDeployedCommit: z.string().min(7).optional(),
  /** Timestamp of last code deployment */
  lastDeployedAt: z.string().optional(),
  /** Timestamp when state was first created (content seeded) */
  seededAt: z.string(),
  /** History of migrations applied */
  migrations: z.array(z.object({
    fromVersion: z.number(),
    toVersion: z.number(),
    appliedAt: z.string(),
    scriptName: z.string(),
  })).default([]),
});

export type DeployState = z.infer<typeof DeployStateSchema>;

const stateFilePath = (paths: PathConfig): string =>
  path.join(paths.internalDir, 'state.json');

/**
 * Reads the deploy state from the .ual/state.json file.
 * Returns null if the file doesn't exist (server not yet seeded).
 */
export const readDeployState = async (paths: PathConfig): Promise<DeployState | null> => {
  const filePath = stateFilePath(paths);
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    return null;
  }

  const content = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(content);
  const result = DeployStateSchema.safeParse(parsed);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid deploy state file:\n${messages.join('\n')}`);
  }

  return result.data;
};

/**
 * Writes the deploy state to the .ual/state.json file.
 */
export const writeDeployState = async (paths: PathConfig, state: DeployState): Promise<void> => {
  const filePath = stateFilePath(paths);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, state, { spaces: 2 });
};

/**
 * Creates initial deploy state when seeding content.
 */
export const createInitialState = (
  pinnedCommit: string,
  fingerprint: SchemaFingerprint,
): DeployState => ({
  pinnedCommit,
  schemaHash: fingerprint.hash,
  schemaFingerprint: fingerprint,
  contentVersion: 1,
  seededAt: new Date().toISOString(),
  migrations: [],
});

/**
 * Updates state after a successful code-only deployment.
 */
export const updateStateAfterDeploy = (
  state: DeployState,
  deployedCommit: string,
): DeployState => ({
  ...state,
  lastDeployedCommit: deployedCommit,
  lastDeployedAt: new Date().toISOString(),
});

/**
 * Updates state after a migration is applied.
 */
export const updateStateAfterMigration = (
  state: DeployState,
  newFingerprint: SchemaFingerprint,
  newPinnedCommit: string,
  scriptName: string,
): DeployState => ({
  ...state,
  pinnedCommit: newPinnedCommit,
  schemaHash: newFingerprint.hash,
  schemaFingerprint: newFingerprint,
  contentVersion: state.contentVersion + 1,
  migrations: [
    ...state.migrations,
    {
      fromVersion: state.contentVersion,
      toVersion: state.contentVersion + 1,
      appliedAt: new Date().toISOString(),
      scriptName,
    },
  ],
});

/**
 * Checks if the server has been seeded (has a state file).
 */
export const isServerSeeded = async (paths: PathConfig): Promise<boolean> => {
  const state = await readDeployState(paths);
  return state !== null;
};

