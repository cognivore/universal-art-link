import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates a temporary isolated test site with minimal content
 */
export async function createTestSite() {
  const tempDir = mkdtempSync(join(tmpdir(), 'ual-test-'));
  const projectRoot = join(__dirname, '..', '..');

  // Copy starter template to temp directory
  const starterDir = join(projectRoot, 'starter');
  await fs.copy(starterDir, tempDir);

  console.log(`Created test site in: ${tempDir}`);
  return tempDir;
}

/**
 * Cleans up the test site directory
 */
export async function cleanupTestSite(testDir) {
  if (testDir && testDir.includes('ual-test-')) {
    await fs.remove(testDir);
    console.log(`Cleaned up test site: ${testDir}`);
  }
}

/**
 * Starts the dev server for a test site
 * Returns server instance and port
 */
export async function startTestServer(testDir) {
  const { buildSite } = await import('../../build/lib/build.js');
  const { startDevServer } = await import('../../build/lib/devServer.js');
  const { AdminService } = await import('../../build/lib/adminService.js');
  const { createPathConfig } = await import('../../build/lib/paths.js');
  const { log } = await import('../../build/lib/logger.js');

  const projectRoot = join(__dirname, '..', '..');
  const paths = createPathConfig(testDir);

  // Use pre-built admin assets from the project root (not from temp test dir)
  const projectPaths = createPathConfig(projectRoot);
  const adminAssetsExist = await fs.pathExists(projectPaths.adminAppDistDir);

  if (!adminAssetsExist) {
    console.warn('⚠️  Admin assets not found. Run `pnpm admin:build` first for full e2e testing.');
  }

  // Build the site
  const buildResult = await buildSite({
    rootDir: testDir,
    invalidateTemplates: true
  });

  const adminService = new AdminService(testDir, log);

  // Find an available port
  const port = 4173 + Math.floor(Math.random() * 1000);

  const runtimeConfig = {
    previewBaseUrl: `http://localhost:${port}`,
    previewHealthPath: '/__ual/healthz',
    apiBaseUrl: '/__ual/api',
    adminBaseUrl: `http://localhost:${port}/admin`,
    strapiUrl: process.env.UAL_STRAPI_URL ?? 'http://localhost:1337',
    previewPaths: buildResult.previewPaths,
  };

  const server = startDevServer({
    distDir: buildResult.outputDir,
    adminAssetsDir: projectPaths.adminAppDistDir, // Use project root admin assets
    port,
    logger: log,
    adminService,
    paths,
    runtimeConfig,
  });

  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`Test server started on http://localhost:${port}`);

  return { server, port };
}

/**
 * Stops the test server
 */
export async function stopTestServer(server) {
  if (server) {
    await server.close();
    console.log('Test server stopped');
  }
}

