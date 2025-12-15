import express from 'express';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const SECRET = process.env.DEPLOY_SECRET ?? 'CHANGE_ME';
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const BASE = process.env.DEPLOY_BASE ?? '/var/www/mysite';

const app = express();

// Parse JSON for state endpoints
app.use(express.json({ limit: '10mb' }));

const authorize = (req, res, next) => {
  if (req.path === '/connect') {
    next();
    return;
  }
  const header = req.headers.authorization ?? '';
  if (header !== `Bearer ${SECRET}`) {
    res.status(403).send('Forbidden');
    return;
  }
  next();
};

app.use(authorize);

app.post('/connect', (req, res) => {
  const ok = (req.headers.authorization ?? '') === `Bearer ${SECRET}`;
  res.status(ok ? 200 : 403).send(ok ? 'ok' : 'forbidden');
});

// -----------------------------------------------------------------------------
// State Management Endpoints
// -----------------------------------------------------------------------------

const getSiteDir = (req) => {
  const rawSiteId = req.headers['x-site-id'] ?? 'default';
  const siteId = rawSiteId.toString().replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'default';
  return path.join(BASE, siteId);
};

const getStatePath = (siteDir) => path.join(siteDir, '.ual', 'state.json');
const getContentDir = (siteDir) => path.join(siteDir, 'content');

/**
 * GET /state - Fetch the current deploy state
 * Returns 404 if server hasn't been seeded yet
 */
app.get('/state', async (req, res) => {
  try {
    const siteDir = getSiteDir(req);
    const statePath = getStatePath(siteDir);

    const exists = await fsp.access(statePath).then(() => true).catch(() => false);
    if (!exists) {
      res.status(404).json({ error: 'Server not seeded', seeded: false });
      return;
    }

    const content = await fsp.readFile(statePath, 'utf8');
    const state = JSON.parse(content);
    res.status(200).json({ seeded: true, state });
  } catch (error) {
    console.error('Failed to read state', error);
    res.status(500).json({ error: error.message ?? 'Failed to read state' });
  }
});

/**
 * POST /state - Update the deploy state (used after successful deployments)
 */
app.post('/state', async (req, res) => {
  try {
    const siteDir = getSiteDir(req);
    const statePath = getStatePath(siteDir);

    await fsp.mkdir(path.dirname(statePath), { recursive: true });
    await fsp.writeFile(statePath, JSON.stringify(req.body, null, 2), 'utf8');

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to write state', error);
    res.status(500).json({ error: error.message ?? 'Failed to write state' });
  }
});

/**
 * POST /seed - Seed content from uploaded zip containing YAML files
 * This initializes the server with content and creates the state file
 */
app.post('/seed', async (req, res) => {
  let zipPath;
  try {
    const siteDir = getSiteDir(req);
    const contentDir = getContentDir(siteDir);
    const statePath = getStatePath(siteDir);

    // Check if already seeded
    const alreadySeeded = await fsp.access(statePath).then(() => true).catch(() => false);
    if (alreadySeeded && req.headers['x-force-seed'] !== 'true') {
      res.status(409).json({
        error: 'Server already seeded. Use x-force-seed: true header to overwrite.',
        seeded: true,
      });
      return;
    }

    // Write uploaded zip
    const ts = timestamp();
    await fsp.mkdir(siteDir, { recursive: true });
    zipPath = path.join(siteDir, `seed-${ts}.zip`);
    await writeUpload(req, zipPath);

    // Extract content
    await fsp.mkdir(contentDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(contentDir, true);

    // State will be written by the client after successful seed
    res.status(200).json({ ok: true, message: 'Content seeded successfully' });
  } catch (error) {
    console.error('Seed failed', error);
    res.status(500).json({ error: error.message ?? 'Seed failed' });
  } finally {
    if (zipPath) {
      await fsp.rm(zipPath, { force: true });
    }
  }
});

/**
 * GET /content - Fetch current content YAML files from the server
 * Used to validate content against new schemas before deployment
 */
app.get('/content', async (req, res) => {
  try {
    const siteDir = getSiteDir(req);
    const contentDir = getContentDir(siteDir);

    const exists = await fsp.access(contentDir).then(() => true).catch(() => false);
    if (!exists) {
      res.status(404).json({ error: 'No content found', seeded: false });
      return;
    }

    // Read all YAML files recursively
    const files = {};
    const readDir = async (dir, prefix = '') => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await readDir(fullPath, relativePath);
        } else if (/\.ya?ml$/i.test(entry.name) || entry.name === 'schema.json') {
          const content = await fsp.readFile(fullPath, 'utf8');
          files[relativePath] = content;
        }
      }
    };

    await readDir(contentDir);
    res.status(200).json({ files });
  } catch (error) {
    console.error('Failed to read content', error);
    res.status(500).json({ error: error.message ?? 'Failed to read content' });
  }
});

const timestamp = () => {
  const now = new Date();
  const pad = (value) => value.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
};

const writeUpload = async (req, filePath) =>
  new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath);
    req.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    req.on('error', reject);
  });

/**
 * POST /deploy - Deploy code bundle
 *
 * Headers:
 *   x-site-id: Site identifier (default: 'default')
 *   x-deploy-mode: 'full' | 'code-only' (default: 'code-only')
 *
 * In 'code-only' mode (default), the content directory is preserved:
 * - Extracts the zip to a new release directory
 * - Symlinks the shared content directory into the release
 * - Updates the 'current' symlink
 *
 * In 'full' mode, the entire bundle is extracted (legacy behavior).
 */
app.post('/deploy', async (req, res) => {
  let zipPath;
  try {
    const siteDir = getSiteDir(req);
    const releasesDir = path.join(siteDir, 'releases');
    const currentLink = path.join(siteDir, 'current');
    const sharedContentDir = getContentDir(siteDir);
    const deployMode = req.headers['x-deploy-mode'] ?? 'code-only';

    await fsp.mkdir(releasesDir, { recursive: true });

    const ts = timestamp();
    zipPath = path.join(releasesDir, `upload-${ts}.zip`);
    await writeUpload(req, zipPath);

    const releaseDir = path.join(releasesDir, ts);
    await fsp.mkdir(releaseDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(releaseDir, true);

    // In code-only mode, symlink the shared content directory
    if (deployMode === 'code-only') {
      const releaseContentDir = path.join(releaseDir, 'content');

      // Remove any content directory that came with the bundle
      await fsp.rm(releaseContentDir, { recursive: true, force: true });

      // Symlink to shared content directory
      const sharedExists = await fsp.access(sharedContentDir).then(() => true).catch(() => false);
      if (sharedExists) {
        await fsp.symlink(sharedContentDir, releaseContentDir, 'dir');
        console.log(`Symlinked content: ${releaseContentDir} -> ${sharedContentDir}`);
      } else {
        console.warn(`Shared content directory not found: ${sharedContentDir}`);
      }
    }

    // Update current symlink
    try {
      await fsp.unlink(currentLink);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    await fsp.symlink(releaseDir, currentLink, 'dir');

    // Cleanup old releases (keep last 5)
    const releases = (await fsp.readdir(releasesDir))
      .filter((entry) => /^\d{14}$/.test(entry))
      .sort()
      .reverse();
    const stale = releases.slice(5);
    await Promise.all(stale.map((entry) => fsp.rm(path.join(releasesDir, entry), { recursive: true, force: true })));

    res.status(200).json({
      ok: true,
      message: 'Deployed',
      mode: deployMode,
      release: ts,
    });
  } catch (error) {
    console.error('Deploy failed', error);
    res.status(500).json({ error: error.message ?? 'Deploy failed' });
  } finally {
    if (zipPath) {
      await fsp.rm(zipPath, { force: true });
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Deploy receiver listening on http://${HOST}:${PORT}`);
});

