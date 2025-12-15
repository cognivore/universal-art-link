import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Git utilities for content-preserving deployments.
 */

/**
 * Gets the current git commit hash (short form).
 */
export const getCurrentCommit = async (rootDir: string): Promise<string> => {
  try {
    const { stdout } = await execAsync('git rev-parse --short HEAD', { cwd: rootDir });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get git commit: ${(error as Error).message}`);
  }
};

/**
 * Gets the full git commit hash.
 */
export const getCurrentCommitFull = async (rootDir: string): Promise<string> => {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: rootDir });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get git commit: ${(error as Error).message}`);
  }
};

/**
 * Checks if the working directory has uncommitted changes.
 */
export const hasUncommittedChanges = async (rootDir: string): Promise<boolean> => {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: rootDir });
    return stdout.trim().length > 0;
  } catch (error) {
    throw new Error(`Failed to check git status: ${(error as Error).message}`);
  }
};

/**
 * Gets the commit message for a given commit hash.
 */
export const getCommitMessage = async (rootDir: string, commit: string): Promise<string> => {
  try {
    const { stdout } = await execAsync(`git log -1 --format=%s ${commit}`, { cwd: rootDir });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get commit message: ${(error as Error).message}`);
  }
};

