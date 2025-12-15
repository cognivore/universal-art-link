import fs from 'fs-extra';
import path from 'node:path';
import archiver from 'archiver';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { loadSiteConfig } from '../lib/contentLoader.js';
import { readConnectionRecord } from '../lib/connectionStore.js';
import { computeSchemaFingerprint } from '../lib/schemaHash.js';
import { createInitialState } from '../lib/deployState.js';
import { getCurrentCommit, hasUncommittedChanges } from '../lib/gitUtils.js';
import {
  fetchRemoteState,
  seedRemoteContent,
  updateRemoteState,
  RemoteConfig,
} from '../lib/remoteStateClient.js';

type SeedOptions = {
  readonly force?: boolean;
};

const getRemoteConfig = async (rootDir: string): Promise<RemoteConfig | null> => {
  const paths = createPathConfig(rootDir);
  const siteConfig = await loadSiteConfig(paths.contentDir);
  let deployConfig = siteConfig.deploy;

  if (!deployConfig) {
    const storedConnection = await readConnectionRecord(rootDir);
    if (storedConnection) {
      return {
        endpoint: storedConnection.baseUrl,
        secret: storedConnection.secret,
      };
    }
    return null;
  }

  const deployUrl = new URL(deployConfig.endpoint);
  const baseUrl = `${deployUrl.protocol}//${deployUrl.host}`;
  const secret = deployConfig.authHeader?.replace(/^Bearer\s+/i, '') ?? '';

  return {
    endpoint: baseUrl,
    secret,
  };
};

const createContentZip = async (contentDir: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Add all content files
    archive.glob('**/*', {
      cwd: contentDir,
      dot: false,
    });

    void archive.finalize();
  });
};

export const runSeedCommand = async (options: SeedOptions = {}): Promise<void> => {
  const rootDir = process.cwd();
  const paths = createPathConfig(rootDir);

  try {
    // Get remote config
    const remoteConfig = await getRemoteConfig(rootDir);
    if (!remoteConfig) {
      log.warn('No deploy endpoint configured. Use the admin panel to connect.');
      return;
    }

    // Check for uncommitted changes
    const hasChanges = await hasUncommittedChanges(rootDir);
    if (hasChanges) {
      log.error('Uncommitted changes detected. Commit your changes before seeding.');
      log.info('The seed commit will be pinned as the content baseline.');
      process.exitCode = 1;
      return;
    }

    // Get current git commit
    const currentCommit = await getCurrentCommit(rootDir);
    log.info(`Current commit: ${currentCommit}`);

    // Check if already seeded
    log.info('Checking remote state...');
    const remoteState = await fetchRemoteState(remoteConfig);

    if (remoteState.seeded && !options.force) {
      log.error('Server is already seeded with content.');
      log.info(`Pinned commit: ${remoteState.state!.pinnedCommit}`);
      log.info(`Schema hash: ${remoteState.state!.schemaHash}`);
      log.info('');
      log.info('To re-seed (overwrite existing content), use --force.');
      log.warn('WARNING: --force will destroy all content edits made on the server!');
      process.exitCode = 1;
      return;
    }

    if (options.force && remoteState.seeded) {
      log.warn('Force seeding will overwrite existing content on the server.');
    }

    // Compute schema fingerprint
    log.info('Computing schema fingerprint...');
    const fingerprint = await computeSchemaFingerprint(paths);
    log.info(`Schema hash: ${fingerprint.hash}`);

    // Verify content directory exists
    const contentExists = await fs.pathExists(paths.contentDir);
    if (!contentExists) {
      log.error(`Content directory not found: ${paths.contentDir}`);
      process.exitCode = 1;
      return;
    }

    // Create zip of content directory
    log.info('Packaging content...');
    const zipBuffer = await createContentZip(paths.contentDir);
    log.info(`Content package: ${(zipBuffer.length / 1024).toFixed(1)} KB`);

    // Upload content to server
    log.info('Uploading content to server...');
    await seedRemoteContent(remoteConfig, zipBuffer, options.force);
    log.success('Content uploaded successfully.');

    // Create and upload initial state
    log.info('Initializing deploy state...');
    const initialState = createInitialState(currentCommit, fingerprint);
    await updateRemoteState(remoteConfig, initialState);

    log.success('Server seeded successfully!');
    log.info(`  Commit: ${currentCommit}`);
    log.info(`  Schema: ${fingerprint.hash}`);
    log.info(`  Content version: 1`);
    log.info('');
    log.info('You can now deploy code changes with: pnpm ual deploy');
  } catch (error) {
    log.error('Seed failed', error);
    process.exitCode = 1;
  }
};

