import fs from 'fs-extra';
import { buildSite } from '../lib/build.js';
import { log } from '../lib/logger.js';
import { createPathConfig } from '../lib/paths.js';
import { createZipFromDist } from '../lib/packageSite.js';
import { loadSiteConfig } from '../lib/contentLoader.js';
import { readConnectionRecord } from '../lib/connectionStore.js';
import { buildAdminFrontend } from '../lib/adminFrontend.js';
import { computeSchemaFingerprint, schemasCompatible, describeSchemaChange } from '../lib/schemaHash.js';
import { updateStateAfterDeploy } from '../lib/deployState.js';
import { getCurrentCommit, hasUncommittedChanges } from '../lib/gitUtils.js';
import {
  fetchRemoteState,
  fetchRemoteContent,
  updateRemoteState,
  deployCodeBundle,
  RemoteConfig,
} from '../lib/remoteStateClient.js';
import { validateContentFiles, formatValidationErrors } from '../lib/schemaValidator.js';

type DeployOptions = {
  readonly skipSchemaCheck?: boolean;
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

  // Extract base URL from deploy endpoint
  const deployUrl = new URL(deployConfig.endpoint);
  const baseUrl = `${deployUrl.protocol}//${deployUrl.host}`;
  const secret = deployConfig.authHeader?.replace(/^Bearer\s+/i, '') ?? '';

  return {
    endpoint: baseUrl,
    secret,
  };
};

export const runDeployCommand = async (options: DeployOptions = {}): Promise<void> => {
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
    if (hasChanges && !options.force) {
      log.error('Uncommitted changes detected. Commit your changes before deploying.');
      log.info('Use --force to deploy anyway (not recommended).');
      process.exitCode = 1;
      return;
    }

    // Get current git commit
    const currentCommit = await getCurrentCommit(rootDir);
    log.info(`Current commit: ${currentCommit}`);

    // Compute local schema fingerprint
    log.info('Computing schema fingerprint...');
    const localFingerprint = await computeSchemaFingerprint(paths);
    log.info(`Local schema hash: ${localFingerprint.hash}`);

    // Fetch remote state
    log.info('Fetching remote state...');
    const remoteState = await fetchRemoteState(remoteConfig);

    if (!remoteState.seeded) {
      log.error('Server has not been seeded with content.');
      log.info('Run "pnpm ual seed" to initialize the server with content.');
      process.exitCode = 1;
      return;
    }

    const state = remoteState.state!;
    log.info(`Remote schema hash: ${state.schemaHash}`);
    log.info(`Remote pinned commit: ${state.pinnedCommit}`);

    // Check schema compatibility
    if (!options.skipSchemaCheck) {
      const compatible = schemasCompatible(localFingerprint, state.schemaFingerprint);

      if (!compatible) {
        log.error('Schema incompatibility detected!');
        log.error(describeSchemaChange(localFingerprint, state.schemaFingerprint));
        log.info('');
        log.info('The content schema has changed since the server was last seeded.');
        log.info('You must create a migration script to update the content.');
        log.info('');
        log.info('Options:');
        log.info('  1. Create a migration: pnpm ual migrate --create');
        log.info('  2. Run existing migration: pnpm ual migrate --apply <script>');
        log.info('  3. Force deploy (dangerous): pnpm ual deploy --skip-schema-check');
        process.exitCode = 1;
        return;
      }

      log.success('Schema fingerprints match.');
    } else {
      log.warn('Skipping schema check (--skip-schema-check). This may break the site!');
    }

    // Fetch remote content and validate against current Zod schemas
    log.info('Fetching remote content for validation...');
    const remoteContent = await fetchRemoteContent(remoteConfig);

    if (Object.keys(remoteContent.files).length === 0) {
      log.warn('No content files found on remote. This is unexpected.');
    } else {
      log.info(`Validating ${Object.keys(remoteContent.files).length} content files...`);
      const validationResult = validateContentFiles(remoteContent.files);

      if (!validationResult.valid) {
        log.error('Content validation failed!');
        log.error(formatValidationErrors(validationResult));
        log.info('');
        log.info('The remote content does not validate against current schemas.');
        log.info('This indicates a schema change that requires migration.');
        process.exitCode = 1;
        return;
      }

      log.success('Remote content validates against current schemas.');
    }

    // Build the site (code-only, content will be preserved on server)
    log.info('Building site...');
    await buildAdminFrontend(paths, log);
    const buildResult = await buildSite({ rootDir, invalidateTemplates: true });
    log.success(`Built ${buildResult.pages} pages.`);

    // Create zip bundle
    log.info('Creating deployment bundle...');
    const zipPath = await createZipFromDist(buildResult.outputDir);
    const zipBuffer = await fs.readFile(zipPath);

    // Deploy code-only bundle
    log.info('Deploying code bundle...');
    const deployResult = await deployCodeBundle(remoteConfig, zipBuffer);
    log.info(`Deployed release: ${deployResult.release}`);

    // Update remote state
    log.info('Updating remote state...');
    const newState = updateStateAfterDeploy(state, currentCommit);
    await updateRemoteState(remoteConfig, newState);

    log.success(`Deployed successfully!`);
    log.info(`  Commit: ${currentCommit}`);
    log.info(`  Release: ${deployResult.release}`);
    log.info(`  Schema: ${localFingerprint.hash}`);
  } catch (error) {
    log.error('Deploy failed', error);
    process.exitCode = 1;
  }
};
