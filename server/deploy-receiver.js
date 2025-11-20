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

app.post('/deploy', async (req, res) => {
  let zipPath;
  try {
    const rawSiteId = req.headers['x-site-id'] ?? 'default';
    const siteId = rawSiteId.toString().replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'default';
    const siteDir = path.join(BASE, siteId);
    const releasesDir = path.join(siteDir, 'releases');
    const currentLink = path.join(siteDir, 'current');
    await fsp.mkdir(releasesDir, { recursive: true });

    const ts = timestamp();
    zipPath = path.join(releasesDir, `upload-${ts}.zip`);
    await writeUpload(req, zipPath);

    const releaseDir = path.join(releasesDir, ts);
    await fsp.mkdir(releaseDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(releaseDir, true);

    try {
      await fsp.unlink(currentLink);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    await fsp.symlink(releaseDir, currentLink, 'dir');

    const releases = (await fsp.readdir(releasesDir))
      .filter((entry) => /^\d{14}$/.test(entry))
      .sort()
      .reverse();
    const stale = releases.slice(5);
    await Promise.all(stale.map((entry) => fsp.rm(path.join(releasesDir, entry), { recursive: true, force: true })));

    res.status(200).send('Deployed');
  } catch (error) {
    console.error('Deploy failed', error);
    res.status(500).send(error.message ?? 'Deploy failed');
  } finally {
    if (zipPath) {
      await fsp.rm(zipPath, { force: true });
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Deploy receiver listening on http://${HOST}:${PORT}`);
});

