import { createServer } from 'node:http';
import { parse as parseCookie } from 'node:querystring';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { encoding, decoding } from 'lib0';
import * as syncProtocol from 'y-protocols/sync';
import { createPool, createDraftRepo, createTenantRepo, createUserRepo } from '@ual/storage';
import { createDocManager } from './docManager.js';
import pino from 'pino';
import * as jose from 'jose';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const PORT = Number(process.env['PORT'] ?? '3001');
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://ual:ual_dev@localhost:5432/ual';
const JWT_SECRET = process.env['JWT_SECRET'] ?? '';
const BASE_DOMAIN = process.env['UAL_BASE_DOMAIN'] ?? 'localhost';

const jwtKey = () => new TextEncoder().encode(JWT_SECRET);

const pool = createPool(DATABASE_URL);
const draftRepo = createDraftRepo(pool);
const tenantRepo = createTenantRepo(pool);
const userRepo = createUserRepo(pool);
const docManager = createDocManager(draftRepo);

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

type AuthenticatedSocket = WebSocket & {
  tenantId?: string;
  userId?: string;
  isAlive?: boolean;
};

const authenticateRequest = async (
  cookie: string | undefined,
  host: string | undefined,
): Promise<{ tenantId: string; userId: string } | null> => {
  if (!cookie || !host) return null;

  const cookies = Object.fromEntries(
    cookie.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')] as const;
    }),
  );
  const token = cookies['ual_session'];
  if (!token) return null;

  try {
    const { payload } = await jose.jwtVerify(token, jwtKey());
    if (!payload.sub) return null;

    const hostname = host.split(':')[0]!;
    const suffix = '.' + BASE_DOMAIN;
    let tenant = null;

    if (hostname.endsWith(suffix)) {
      const slug = hostname.slice(0, -suffix.length);
      if (slug && !slug.includes('.')) {
        tenant = await tenantRepo.findBySlug(slug);
      }
    }
    if (!tenant) {
      tenant = await tenantRepo.findByDomain(hostname);
    }
    if (!tenant) return null;

    return { tenantId: tenant.id, userId: payload.sub };
  } catch {
    return null;
  }
};

const server = createServer((_req, res) => {
  if (_req.url === '/healthz') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/ws/crdt' });

wss.on('connection', async (ws: AuthenticatedSocket, req) => {
  const auth = await authenticateRequest(
    req.headers.cookie,
    req.headers.host,
  );

  if (!auth) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.tenantId = auth.tenantId;
  ws.userId = auth.userId;
  ws.isAlive = true;

  log.info({ tenantId: auth.tenantId, userId: auth.userId }, 'Client connected');

  const doc = await docManager.addClient(auth.tenantId, ws as unknown as globalThis.WebSocket);

  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, doc);
  ws.send(encoding.toUint8Array(syncEncoder));

  ws.on('message', async (data: Buffer) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MSG_SYNC) {
        const responseEncoder = encoding.createEncoder();
        encoding.writeVarUint(responseEncoder, MSG_SYNC);

        syncProtocol.readSyncMessage(
          decoder,
          responseEncoder,
          doc,
          ws as unknown as object,
        );

        if (encoding.length(responseEncoder) > 1) {
          ws.send(encoding.toUint8Array(responseEncoder));
        }
      }
    } catch (err) {
      log.error({ err }, 'Error handling WS message');
    }
  });

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === ws) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(encoder));
    }
  });

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('close', () => {
    docManager.removeClient(auth.tenantId, ws as unknown as globalThis.WebSocket);
    log.info({ tenantId: auth.tenantId }, 'Client disconnected');
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    const ews = ws as AuthenticatedSocket;
    if (!ews.isAlive) {
      ews.terminate();
      return;
    }
    ews.isAlive = false;
    ews.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  log.info(`Realtime server listening on port ${PORT}`);
});

const shutdown = () => {
  log.info('Shutting down realtime server...');
  clearInterval(heartbeat);
  wss.close();
  server.close();
  pool.end().then(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
