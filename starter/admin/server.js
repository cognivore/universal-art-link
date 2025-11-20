import express from 'express';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_PORT = Number(process.env.ADMIN_PORT ?? 4545);
const ROOT = process.env.UAL_ROOT ? path.resolve(process.env.UAL_ROOT) : path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const CONTENT_DIR = path.join(ROOT, 'content');
const PAGES_DIR = path.join(CONTENT_DIR, 'pages');
const SITE_CONFIG_FILE = path.join(CONTENT_DIR, 'site.config.yaml');
const SCHEMA_FILE = path.join(CONTENT_DIR, 'schema.json');
const CONNECTION_FILE = path.join(ROOT, '.ual', 'connection.json');
const CLI_ENTRY = path.join(ROOT, 'build', 'cli.js');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

const normalizeEndpoint = (input) => {
  if (!input) throw new Error('Provide a deployment endpoint URL.');
  const candidate = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`;
  const url = new URL(candidate);
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
};

const ensureDir = (dir) => fsp.mkdir(dir, { recursive: true });

const readJsonIfExists = async (file, fallback) => {
  try {
    const txt = await fsp.readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (fallback !== undefined) {
        await ensureDir(path.dirname(file));
        await fsp.writeFile(file, JSON.stringify(fallback, null, 2));
        return fallback;
      }
      return undefined;
    }
    throw error;
  }
};

const readYamlFile = async (file, fallback = {}) => {
  try {
    const txt = await fsp.readFile(file, 'utf8');
    const parsed = YAML.parse(txt);
    return parsed ?? fallback;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
};

const writeYamlFile = async (file, data) => {
  await ensureDir(path.dirname(file));
  const content = YAML.stringify(data ?? {});
  await fsp.writeFile(file, content, 'utf8');
};

const readConnection = async () => readJsonIfExists(CONNECTION_FILE);
const writeConnection = async (record) => {
  await ensureDir(path.dirname(CONNECTION_FILE));
  await fsp.writeFile(CONNECTION_FILE, JSON.stringify(record, null, 2), 'utf8');
};
const deleteConnection = async () => {
  await fsp.rm(CONNECTION_FILE, { force: true });
};

const performHandshake = async (connectEndpoint, secret, siteId) => {
  const response = await fetch(connectEndpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ siteId, client: 'ual-local-admin', timestamp: new Date().toISOString() }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Handshake failed (${response.status})`);
  }
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const runCli = (...args) =>
  new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_ENTRY, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(stderr || `Command failed (${args.join(' ')})`));
      }
    });
  });

const findLatestZip = async () => {
  const entries = await fsp.readdir(DIST_DIR).catch(() => []);
  const withMeta = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.zip'))
      .map(async (entry) => {
        const filePath = path.join(DIST_DIR, entry);
        const stat = await fsp.stat(filePath);
        return { filePath, mtime: stat.mtimeMs };
      }),
  );
  const sorted = withMeta.sort((a, b) => b.mtime - a.mtime);
  return sorted[0]?.filePath;
};

const streamZipToRemote = async (zipPath, connection) => {
  const stream = fs.createReadStream(zipPath);
  const response = await fetch(connection.deployEndpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${connection.secret}`,
      'content-type': 'application/zip',
      'x-site-id': connection.siteId ?? 'default',
    },
    body: stream,
  });
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(text || `Remote rejected upload (${response.status})`);
  }
  return text || 'Deployed';
};

const sanitizeConnection = (record) =>
  record
    ? {
        baseUrl: record.baseUrl,
        endpoint: record.deployEndpoint,
        siteId: record.siteId ?? 'default',
        remoteName: record.remoteName,
        targetPath: record.targetPath,
        connectedAt: record.connectedAt,
        lastDeployAt: record.lastDeployAt,
      }
    : null;

const readSchema = async () => {
  const schema = await readJsonIfExists(SCHEMA_FILE, undefined);
  return schema ?? null;
};

const readContentSnapshot = async () => {
  const site = await readYamlFile(SITE_CONFIG_FILE, {});
  const pages = await fsp
    .readdir(PAGES_DIR)
    .then((entries) =>
      Promise.all(
        entries
          .filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
          .map(async (entry) => {
            const slug = entry.replace(/\.ya?ml$/, '');
            const data = await readYamlFile(path.join(PAGES_DIR, entry), {});
            return { slug, data };
          }),
      ),
    )
    .catch(() => []);
  return { site, pages };
};

const writeContentSnapshot = async (snapshot) => {
  if (snapshot?.site) {
    await writeYamlFile(SITE_CONFIG_FILE, snapshot.site);
  }
  if (Array.isArray(snapshot?.pages)) {
    await ensureDir(PAGES_DIR);
    await Promise.all(
      snapshot.pages.map(async (page) => {
        if (!page?.slug) return;
        const target = path.join(PAGES_DIR, `${page.slug}.yaml`);
        await writeYamlFile(target, page.data ?? {});
      }),
    );
  }
};

app.get('/api/content', async (_req, res) => {
  try {
    const [schema, content] = await Promise.all([readSchema(), readContentSnapshot()]);
    res.json({ ok: true, schema, content });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message ?? String(error) });
  }
});

app.post('/api/content', async (req, res) => {
  try {
    await writeContentSnapshot(req.body);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message ?? String(error) });
  }
});

app.get('/api/status', async (_req, res) => {
  const connection = await readConnection();
  res.json({ ok: true, connected: Boolean(connection), config: sanitizeConnection(connection) });
});

app.post('/api/connect', async (req, res) => {
  const { endpoint, secret, siteId = 'default' } = req.body ?? {};
  if (!endpoint || !secret) {
    res.status(400).json({ ok: false, error: 'Missing endpoint or secret' });
    return;
  }
  try {
    const baseUrl = normalizeEndpoint(endpoint);
    const connectEndpoint = `${baseUrl}/connect`;
    const deployEndpoint = `${baseUrl}/deploy`;
    const handshake = await performHandshake(connectEndpoint, secret, siteId);
    const timestamp = new Date().toISOString();
    const record = {
      baseUrl,
      connectEndpoint,
      deployEndpoint,
      secret,
      siteId,
      remoteName: handshake.remoteName,
      targetPath: handshake.targetPath,
      connectedAt: timestamp,
      lastVerifiedAt: timestamp,
    };
    await writeConnection(record);
    res.json({ ok: true, endpoint: baseUrl, siteId });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message ?? String(error) });
  }
});

app.post('/api/disconnect', async (_req, res) => {
  await deleteConnection();
  res.json({ ok: true });
});

app.post('/api/deploy', async (_req, res) => {
  try {
    const connection = await readConnection();
    if (!connection) {
      res.status(400).json({ ok: false, error: 'Not connected. Use Connect first.' });
      return;
    }
    if (!fs.existsSync(CLI_ENTRY)) {
      throw new Error('Missing build/cli.js. Run `pnpm build` first.');
    }
    await runCli('build');
    await runCli('package');
    const zipPath = await findLatestZip();
    if (!zipPath) {
      throw new Error('No zip bundle found. Did packaging succeed?');
    }
    const remoteMessage = await streamZipToRemote(zipPath, connection);
    const finishedAt = new Date().toISOString();
    const updated = { ...connection, lastDeployAt: finishedAt };
    await writeConnection(updated);
    res.json({ ok: true, message: remoteMessage });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message ?? String(error) });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(APP_PORT, () => {
  console.log(`UAL admin panel running at http://localhost:${APP_PORT}`);
});

