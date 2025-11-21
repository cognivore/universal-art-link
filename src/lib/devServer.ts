import fs from 'fs-extra';
import http from 'node:http';
import path from 'node:path';
import { Logger } from './logger.js';
import { AdminService } from './adminService.js';
import { readContentSnapshot, readSchemaDefinition, writeContentSnapshot } from './contentStore.js';
import type { ContentSnapshot } from './contentStore.js';
import { PathConfig } from './paths.js';

const mimeMap: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

type LiveReloadClient = http.ServerResponse<http.IncomingMessage>;

export type AdminRuntimeConfig = {
  readonly previewBaseUrl: string;
  readonly previewHealthPath: string;
  readonly apiBaseUrl: string;
  readonly adminBaseUrl: string;
  readonly strapiUrl: string;
  readonly previewPaths: ReadonlyArray<string>;
};

type DevServerOptions = {
  readonly distDir: string;
  readonly adminAssetsDir?: string;
  readonly port: number;
  readonly logger: Logger;
  readonly adminService: AdminService;
  readonly paths: PathConfig;
  readonly runtimeConfig: AdminRuntimeConfig;
};

export type DevServer = {
  readonly notifyReload: () => void;
  readonly close: () => Promise<void>;
  readonly updateRuntimeConfig: (patch: Partial<AdminRuntimeConfig>) => void;
};

const injectLiveReload = (html: string): string => {
  const snippet = `
    <script>
      (() => {
        const source = new EventSource('/__ual/live');
        source.addEventListener('message', (event) => {
          if (event.data === 'reload') {
            window.location.reload();
          }
        });
      })();
    </script>
  `;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${snippet}</body>`);
  }
  return `${html}${snippet}`;
};

const injectRuntimeConfig = (html: string, runtime: AdminRuntimeConfig): string => {
  const script = `<script>window.__UAL_RUNTIME__ = ${JSON.stringify(runtime)};</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}</head>`);
  }
  return `${script}${html}`;
};

const respondJson = (res: http.ServerResponse<http.IncomingMessage>, status: number, payload: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: http.IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 1 * 1024 * 1024;
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const handleAdminApi = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  adminService: AdminService,
  paths: PathConfig,
): Promise<boolean> => {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (!requestUrl.pathname.startsWith('/__ual/api')) {
    return false;
  }

  try {
    if (requestUrl.pathname === '/__ual/api/state' && req.method === 'GET') {
      const state = await adminService.getState();
      respondJson(res, 200, { apiAvailable: true, ...state });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/connect' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const connection = await adminService.connect({
        baseUrl: String(body.baseUrl ?? ''),
        secret: String(body.secret ?? ''),
      });
      respondJson(res, 200, { connection });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/content' && req.method === 'GET') {
      const [schema, content] = await Promise.all([readSchemaDefinition(paths), readContentSnapshot(paths)]);
      respondJson(res, 200, { ok: true, schema, content });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/content' && req.method === 'POST') {
      const body = (await readJsonBody(req)) as ContentSnapshot;
      await writeContentSnapshot(paths, body);
      respondJson(res, 200, { ok: true });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/disconnect' && req.method === 'POST') {
      await adminService.disconnect();
      respondJson(res, 200, { status: 'disconnected' });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/deploy' && req.method === 'POST') {
      const result = await adminService.deploy();
      respondJson(res, 200, { status: 'success', ...result });
      return true;
    }

    respondJson(res, 404, { message: 'Unknown admin endpoint' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    respondJson(res, 400, { message });
    return true;
  }
};

type StaticOptions = {
  readonly adminAssetsDir?: string;
  readonly runtimeConfig: AdminRuntimeConfig;
};

const serveStatic = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  distDir: string,
  options: StaticOptions,
): Promise<void> => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const decoded = decodeURIComponent(url.pathname);
  const isAdminRequest = decoded === '/admin' || decoded.startsWith('/admin/');
  const useAlternateRoot = Boolean(isAdminRequest && options.adminAssetsDir);
  const assetRoot = useAlternateRoot ? options.adminAssetsDir ?? distDir : distDir;
  const relativePath = useAlternateRoot ? decoded.replace('/admin', '') || '/' : decoded;
  const normalized = relativePath === '/' ? '/index.html' : relativePath;
  let filePath = path.join(assetRoot, normalized);

  const exists = await fs.pathExists(filePath);
  if (!exists) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const stats = await fs.stat(filePath);
  if (stats.isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    const hasIndex = await fs.pathExists(indexPath);
    if (!hasIndex) {
      res.statusCode = 403;
      res.end('Directory listing not allowed');
      return;
    }
    filePath = indexPath;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');

  if (ext === '.html') {
    let html = await fs.readFile(filePath, 'utf8');
    html = injectLiveReload(html);
    if (isAdminRequest) {
      html = injectRuntimeConfig(html, options.runtimeConfig);
    }
    res.end(html);
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', (error) => {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : 'File stream failed');
  });
  stream.pipe(res);
};

export const startDevServer = ({
  distDir,
  adminAssetsDir,
  port,
  logger,
  adminService,
  paths,
  runtimeConfig,
}: DevServerOptions): DevServer => {
  const clients = new Set<LiveReloadClient>();
  const runtimeState: AdminRuntimeConfig = { ...runtimeConfig };

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (requestUrl.pathname === '/__ual/healthz') {
      respondJson(res, 200, { ok: true, ts: Date.now() });
      return;
    }

    if (requestUrl.pathname === '/__ual/runtime' && req.method === 'GET') {
      respondJson(res, 200, runtimeState);
      return;
    }

    if ((req.url ?? '').startsWith('/__ual/live')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      });
      res.write('\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (requestUrl.pathname.startsWith('/__ual/api')) {
      try {
        const handled = await handleAdminApi(req, res, adminService, paths);
        if (handled) {
          return;
        }
      } catch (error) {
        logger.error('Admin API failed', error);
        respondJson(res, 500, { message: 'Admin API error' });
        return;
      }
    }

    try {
      await serveStatic(req, res, distDir, { adminAssetsDir, runtimeConfig: runtimeState });
    } catch (error) {
      logger.error('Error serving request', error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.listen(port, () => {
    logger.info(`dev server listening on http://localhost:${port}`);
  });

  const notifyReload = (): void => {
    for (const client of clients) {
      client.write('data: reload\n\n');
    }
  };

  const close = async (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

  const updateRuntimeConfig = (patch: Partial<AdminRuntimeConfig>): void => {
    Object.assign(runtimeState, patch);
  };

  return { notifyReload, close, updateRuntimeConfig };
};

