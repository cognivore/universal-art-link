import fs from 'fs-extra';
import path from 'node:path';
import archiver from 'archiver';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { loadSiteConfig } from '../lib/contentLoader.js';
import { readConnectionRecord } from '../lib/connectionStore.js';
import { computeSchemaFingerprint } from '../lib/schemaHash.js';
import { updateStateAfterMigration } from '../lib/deployState.js';
import { getCurrentCommit, hasUncommittedChanges } from '../lib/gitUtils.js';
import {
  fetchRemoteState,
  fetchRemoteContent,
  seedRemoteContent,
  updateRemoteState,
  RemoteConfig,
} from '../lib/remoteStateClient.js';
import { validateContentFiles, formatValidationErrors } from '../lib/schemaValidator.js';
import {
  listMigrations,
  createMigrationScaffold,
  applyMigration,
  MigrationManifest,
} from '../lib/migrationRunner.js';

type MigrateOptions = {
  readonly create?: boolean;
  readonly apply?: string;
  readonly list?: boolean;
  readonly name?: string;
  readonly description?: string;
  readonly dryRun?: boolean;
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

const createContentZipFromFiles = async (files: Record<string, string>): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    for (const [filePath, content] of Object.entries(files)) {
      archive.append(content, { name: filePath });
    }

    void archive.finalize();
  });
};

const handleCreate = async (rootDir: string, name?: string, description?: string): Promise<void> => {
  const paths = createPathConfig(rootDir);

  // Compute target schema hash
  log.info('Computing target schema fingerprint...');
  const fingerprint = await computeSchemaFingerprint(paths);
  log.info(`Target schema hash: ${fingerprint.hash}`);

  const migrationName = name ?? `schema-${fingerprint.hash.slice(0, 8)}`;
  const migrationDesc = description ?? 'Schema migration';

  log.info('Creating migration scaffold...');
  const migrationDir = await createMigrationScaffold(
    rootDir,
    migrationName,
    migrationDesc,
    fingerprint.hash,
  );

  log.success('Migration scaffold created!');
  log.info(`  Directory: ${migrationDir}`);
  log.info('');
  log.info('Next steps:');
  log.info(`  1. Edit ${path.join(migrationDir, 'migrate.js')}`);
  log.info('  2. Test with: pnpm ual migrate --apply <path> --dry-run');
  log.info('  3. Apply with: pnpm ual migrate --apply <path>');
};

const handleList = async (rootDir: string): Promise<void> => {
  const migrations = await listMigrations(rootDir);

  if (migrations.length === 0) {
    log.info('No migrations found.');
    log.info('Create one with: pnpm ual migrate --create');
    return;
  }

  log.info(`Found ${migrations.length} migration(s):\n`);

  for (const m of migrations) {
    log.info(`  ${m.name}`);
    log.info(`    Description: ${m.description}`);
    log.info(`    Target Schema: ${m.targetSchemaHash}`);
    log.info(`    Created: ${m.createdAt}`);
    log.info(`    Script: ${m.scriptPath}`);
    log.info('');
  }
};

const handleApply = async (
  rootDir: string,
  migrationPath: string,
  dryRun: boolean,
): Promise<void> => {
  const paths = createPathConfig(rootDir);

  // Get remote config
  const remoteConfig = await getRemoteConfig(rootDir);
  if (!remoteConfig) {
    log.warn('No deploy endpoint configured. Use the admin panel to connect.');
    return;
  }

  // Check for uncommitted changes
  const hasChanges = await hasUncommittedChanges(rootDir);
  if (hasChanges) {
    log.error('Uncommitted changes detected. Commit your changes before migrating.');
    process.exitCode = 1;
    return;
  }

  // Get current git commit
  const currentCommit = await getCurrentCommit(rootDir);
  log.info(`Current commit: ${currentCommit}`);

  // Check remote state
  log.info('Fetching remote state...');
  const remoteState = await fetchRemoteState(remoteConfig);

  if (!remoteState.seeded) {
    log.error('Server has not been seeded with content.');
    log.info('Run "pnpm ual seed" first.');
    process.exitCode = 1;
    return;
  }

  const state = remoteState.state!;
  log.info(`Current content version: ${state.contentVersion}`);

  // Load migration manifest
  const manifestPath = path.join(migrationPath, 'manifest.json');
  const manifestExists = await fs.pathExists(manifestPath);
  if (!manifestExists) {
    log.error(`Migration manifest not found: ${manifestPath}`);
    process.exitCode = 1;
    return;
  }

  const manifest = await fs.readJson(manifestPath) as MigrationManifest;
  log.info(`Applying migration: ${manifest.name}`);
  log.info(`  Target schema: ${manifest.targetSchemaHash}`);

  // Compute local schema and verify it matches target
  const localFingerprint = await computeSchemaFingerprint(paths);
  if (localFingerprint.hash !== manifest.targetSchemaHash) {
    log.error('Migration target schema does not match current schema!');
    log.error(`  Expected: ${manifest.targetSchemaHash}`);
    log.error(`  Current: ${localFingerprint.hash}`);
    log.info('Make sure you have the correct code version checked out.');
    process.exitCode = 1;
    return;
  }

  // Fetch remote content
  log.info('Fetching remote content...');
  const remoteContent = await fetchRemoteContent(remoteConfig);

  if (Object.keys(remoteContent.files).length === 0) {
    log.error('No content files found on remote.');
    process.exitCode = 1;
    return;
  }

  log.info(`Found ${Object.keys(remoteContent.files).length} content files.`);

  // Apply migration
  log.info('Applying migration transform...');
  const scriptPath = path.resolve(migrationPath, 'migrate.js');
  const transformed = await applyMigration(remoteContent.files, scriptPath);

  log.info(`Transformed ${Object.keys(transformed).length} files.`);

  // Validate transformed content
  log.info('Validating transformed content...');
  const validationResult = validateContentFiles(transformed);

  if (!validationResult.valid) {
    log.error('Transformed content does not validate!');
    log.error(formatValidationErrors(validationResult));
    log.info('Fix the migration script and try again.');
    process.exitCode = 1;
    return;
  }

  log.success('Transformed content validates successfully.');

  if (dryRun) {
    log.info('');
    log.info('Dry run complete. No changes made to remote.');
    log.info('Run without --dry-run to apply the migration.');
    return;
  }

  // Upload transformed content
  log.info('Uploading transformed content...');
  const zipBuffer = await createContentZipFromFiles(transformed);
  await seedRemoteContent(remoteConfig, zipBuffer, true);

  // Update state
  log.info('Updating remote state...');
  const newState = updateStateAfterMigration(
    state,
    localFingerprint,
    currentCommit,
    manifest.name,
  );
  await updateRemoteState(remoteConfig, newState);

  log.success('Migration applied successfully!');
  log.info(`  Content version: ${state.contentVersion} → ${newState.contentVersion}`);
  log.info(`  Schema: ${newState.schemaHash}`);
  log.info(`  Pinned commit: ${newState.pinnedCommit}`);
};

export const runMigrateCommand = async (options: MigrateOptions = {}): Promise<void> => {
  const rootDir = process.cwd();

  try {
    if (options.list) {
      await handleList(rootDir);
      return;
    }

    if (options.create) {
      await handleCreate(rootDir, options.name, options.description);
      return;
    }

    if (options.apply) {
      await handleApply(rootDir, options.apply, options.dryRun ?? false);
      return;
    }

    // Default: show help
    log.info('Migration commands:');
    log.info('  --list                List available migrations');
    log.info('  --create              Create a new migration scaffold');
    log.info('  --apply <path>        Apply a migration to remote content');
    log.info('');
    log.info('Options:');
    log.info('  --name <name>         Migration name (for --create)');
    log.info('  --description <desc>  Migration description (for --create)');
    log.info('  --dry-run             Validate without applying (for --apply)');
  } catch (error) {
    log.error('Migration failed', error);
    process.exitCode = 1;
  }
};

