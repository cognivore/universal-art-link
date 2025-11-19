import fs from 'fs-extra';
import http from 'node:http';
import path from 'node:path';
import { Logger } from './logger.js';

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

type DevServerOptions = {
  readonly distDir: string;
  readonly port: number;
  readonly logger: Logger;
};

export type DevServer = {
  readonly notifyReload: () => void;
  readonly close: () => Promise<void>;
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

const serveStatic = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  distDir: string,
): Promise<void> => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const decoded = decodeURIComponent(url.pathname);
  const targetPath = decoded === '/' ? '/index.html' : decoded;
  const filePath = path.join(distDir, targetPath);

  const exists = await fs.pathExists(filePath);
  if (!exists) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');

  if (ext === '.html') {
    const html = await fs.readFile(filePath, 'utf8');
    res.end(injectLiveReload(html));
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
};

export const startDevServer = ({ distDir, port, logger }: DevServerOptions): DevServer => {
  const clients = new Set<LiveReloadClient>();

  const server = http.createServer(async (req, res) => {
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

    try {
      await serveStatic(req, res, distDir);
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

  return { notifyReload, close };
};

