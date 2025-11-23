import fs from 'fs-extra';
import http from 'node:http';
import path from 'node:path';
import { Logger } from './logger.js';
import { AdminService } from './adminService.js';
import { readContentSnapshot, readSchemaDefinition, writeContentSnapshot } from './contentStore.js';
import type { ContentSnapshot } from './contentStore.js';
import type { CatalogInput } from '../types/commerce.js';
import { PathConfig } from './paths.js';
import {
  createMerchant,
  createMerchantItem,
  deleteMerchant,
  deleteMerchantItem,
  readCommerceData,
  saveCatalogConfig,
  updateMerchant,
  updateMerchantItem,
} from './commerceStore.js';

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
        console.log('[UAL] Initializing live reload client');
        let source = null;
        let reconnectAttempts = 0;
        const maxReconnects = 3;

        const connect = () => {
          if (source) {
            console.log('[UAL] Closing existing EventSource before reconnect');
            source.close();
          }

          console.log('[UAL] Connecting to live reload server (attempt ' + (reconnectAttempts + 1) + ')');
          source = new EventSource('/__ual/live');

          source.addEventListener('open', () => {
            console.log('[UAL] Live reload connected');
            reconnectAttempts = 0;
          });

          source.addEventListener('message', (event) => {
            console.log('[UAL] Received reload signal');
            if (event.data === 'reload') {
              window.location.reload();
            }
          });

          source.addEventListener('error', (error) => {
            console.log('[UAL] EventSource error, closing connection');
            source.close();
            if (reconnectAttempts < maxReconnects) {
              reconnectAttempts++;
              console.log('[UAL] Will retry connection in 2 seconds');
              setTimeout(connect, 2000);
            } else {
              console.log('[UAL] Max reconnection attempts reached');
            }
          });
        };

        connect();

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
          console.log('[UAL] Page unloading, closing live reload connection');
          if (source) {
            source.close();
            source = null;
          }
        });

        // Cleanup on visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
          if (document.hidden && source) {
            console.log('[UAL] Tab hidden, closing live reload connection');
            source.close();
            source = null;
          } else if (!document.hidden && !source) {
            console.log('[UAL] Tab visible, reconnecting live reload');
            reconnectAttempts = 0;
            connect();
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

const DEFAULT_OWNER_ID = 'local-admin';

const handleCommerceApi = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  paths: PathConfig,
  requestUrl: URL,
): Promise<boolean> => {
  if (!requestUrl.pathname.startsWith('/__ual/api/commerce')) {
    return false;
  }

  const subPath = requestUrl.pathname.replace('/__ual/api/commerce', '').replace(/^\/+/, '');
  const segments = subPath ? subPath.split('/').filter(Boolean) : [];
  const method = req.method ?? 'GET';

  try {
    if (segments.length === 0 && method === 'GET') {
      const snapshot = await readCommerceData(paths);
      respondJson(res, 200, { ok: true, ...snapshot });
      return true;
    }

    if (segments[0] === 'merchants') {
      if (segments.length === 1 && method === 'POST') {
        const body = await readJsonBody(req);
        const merchant = await createMerchant(paths, {
          name: String(body.name ?? ''),
          slug: body.slug ? String(body.slug) : undefined,
          shopDomain: String(body.shopDomain ?? ''),
          logoUrl: body.logoUrl ? String(body.logoUrl) : undefined,
          description: body.description ? String(body.description) : undefined,
          isActive: body.isActive === undefined ? true : Boolean(body.isActive),
          ownerUserId: body.ownerUserId ? String(body.ownerUserId) : DEFAULT_OWNER_ID,
        });
        respondJson(res, 201, merchant);
        return true;
      }

      if (segments.length === 2) {
        const merchantId = segments[1]!;
        if (method === 'PATCH') {
          const body = await readJsonBody(req);
          const merchant = await updateMerchant(paths, merchantId, {
            name: body.name ? String(body.name) : undefined,
            slug: body.slug ? String(body.slug) : undefined,
            shopDomain: body.shopDomain ? String(body.shopDomain) : undefined,
            description: body.description ? String(body.description) : undefined,
            logoUrl: body.logoUrl ? String(body.logoUrl) : undefined,
            isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
          });
          respondJson(res, 200, merchant);
          return true;
        }
        if (method === 'DELETE') {
          await deleteMerchant(paths, merchantId);
          res.statusCode = 204;
          res.end();
          return true;
        }
      }

      if (segments.length === 3 && segments[2] === 'items' && method === 'POST') {
        const merchantId = segments[1]!;
        const body = await readJsonBody(req);
        const item = await createMerchantItem(paths, merchantId, {
          merchantId,
          title: String(body.title ?? ''),
          description: body.description ? String(body.description) : undefined,
          imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
          shopifyVariantId: String(body.shopifyVariantId ?? ''),
          displayPrice: body.displayPrice ? String(body.displayPrice) : undefined,
          isActive: body.isActive === undefined ? true : Boolean(body.isActive),
          sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
        });
        respondJson(res, 201, item);
        return true;
      }
    }

    if (segments[0] === 'items' && segments.length === 2) {
      const itemId = segments[1]!;
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const item = await updateMerchantItem(paths, itemId, {
          title: body.title ? String(body.title) : undefined,
          description: body.description ? String(body.description) : undefined,
          imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
          shopifyVariantId: body.shopifyVariantId ? String(body.shopifyVariantId) : undefined,
          displayPrice: body.displayPrice ? String(body.displayPrice) : undefined,
          isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
          sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
        });
        respondJson(res, 200, item);
        return true;
      }
      if (method === 'DELETE') {
        await deleteMerchantItem(paths, itemId);
        res.statusCode = 204;
        res.end();
        return true;
      }
    }

    if (segments[0] === 'catalog' && method === 'POST') {
      const body = await readJsonBody(req);
      const catalog = await saveCatalogConfig(paths, body as CatalogInput);
      respondJson(res, 200, catalog);
      return true;
    }

    respondJson(res, 404, { message: 'Unknown commerce endpoint' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Commerce request failed';
    respondJson(res, 400, { message });
    return true;
  }
};
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
    if (requestUrl.pathname.startsWith('/__ual/api/commerce')) {
      const handled = await handleCommerceApi(req, res, paths, requestUrl);
      if (handled) {
        return true;
      }
    }

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
    if (!isAdminRequest) {
      html = injectLiveReload(html);
    }
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
    const requestMethod = req.method ?? 'GET';
    const requestPath = requestUrl.pathname;

    logger.info(`[devserver] ${requestMethod} ${requestPath}`);

    if (requestUrl.pathname === '/__ual/healthz') {
      logger.info('[devserver] Health check');
      respondJson(res, 200, { ok: true, ts: Date.now() });
      return;
    }

    if (requestUrl.pathname === '/__ual/runtime' && req.method === 'GET') {
      logger.info('[devserver] Runtime config requested');
      respondJson(res, 200, runtimeState);
      return;
    }

    if ((req.url ?? '').startsWith('/__ual/live')) {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      logger.info(`[devserver] Live reload client connected (id: ${clientId}, total: ${clients.size + 1})`);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });
      res.write(': keepalive\n\n');
      clients.add(res);

      // Send keepalive heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': heartbeat\n\n');
        }
      }, 30000);

      req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
        logger.info(`[devserver] Live reload client disconnected (id: ${clientId}, remaining: ${clients.size})`);
      });

      req.on('error', (error) => {
        clearInterval(heartbeat);
        clients.delete(res);
        logger.error(`[devserver] Live reload client error (id: ${clientId})`, error);
      });

      return;
    }

    if (requestUrl.pathname.startsWith('/__ual/api')) {
      logger.info(`[devserver] Admin API: ${requestMethod} ${requestPath}`);
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
      logger.info(`[devserver] Serving static: ${requestPath} from ${distDir}`);
      await serveStatic(req, res, distDir, { adminAssetsDir, runtimeConfig: runtimeState });
    } catch (error) {
      logger.error('Error serving request', error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.listen(port, () => {
    logger.info(`[devserver] HTTP server listening on http://localhost:${port}`);
    logger.info(`[devserver] Serving from: ${distDir}`);
    logger.info(`[devserver] Admin assets: ${adminAssetsDir ?? 'none'}`);
  });

  const notifyReload = (): void => {
    logger.info(`[devserver] Notifying ${clients.size} client(s) to reload`);
    for (const client of clients) {
      try {
        client.write('data: reload\n\n');
      } catch (error) {
        logger.error('[devserver] Failed to notify client', error);
      }
    }
  };

  const close = async (): Promise<void> =>
    new Promise((resolve, reject) => {
      logger.info('[devserver] Closing HTTP server...');
      server.close((error) => {
        if (error) {
          logger.error('[devserver] Error closing HTTP server', error);
          reject(error);
        } else {
          logger.info('[devserver] HTTP server closed successfully');
          resolve();
        }
      });
    });

  const updateRuntimeConfig = (patch: Partial<AdminRuntimeConfig>): void => {
    Object.assign(runtimeState, patch);
  };

  return { notifyReload, close, updateRuntimeConfig };
};

