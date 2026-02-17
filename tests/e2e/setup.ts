import { createPool } from '@ual/storage';
import { createApp, type AppHandle } from '../../services/api/src/app.js';
import type { FastifyInstance } from 'fastify';

const DATABASE_URL = 'postgresql://ual:ual_dev@localhost:5432/ual_test';
const STORAGE_PATH = './data/test';

let handle: AppHandle | null = null;
let baseUrl = '';

/**
 * Start the API server on an ephemeral port for testing.
 * Returns the base URL.
 */
export const startServer = async (): Promise<string> => {
  if (handle) return baseUrl;

  process.env['DATABASE_URL'] = DATABASE_URL;
  process.env['JWT_SECRET'] = 'test-jwt-secret-not-for-production';
  process.env['UAL_MODE'] = 'hosted';
  process.env['UAL_BASE_DOMAIN'] = 'localhost';

  const pool = createPool(DATABASE_URL);

  await cleanDatabase(pool);

  handle = await createApp({
    pool,
    databaseUrl: DATABASE_URL,
    storagePath: STORAGE_PATH,
    logger: false,
  });

  await handle.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = handle.app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  return baseUrl;
};

export const stopServer = async (): Promise<void> => {
  if (!handle) return;
  await handle.boss.stop({ timeout: 2000 });
  await handle.app.close();
  await handle.pool.end();
  handle = null;
};

export const getApp = (): FastifyInstance => {
  if (!handle) throw new Error('Server not started');
  return handle.app;
};

export const getPool = () => {
  if (!handle) throw new Error('Server not started');
  return handle.pool;
};

/**
 * Truncate all application tables to get a clean slate.
 */
const cleanDatabase = async (pool: ReturnType<typeof createPool>): Promise<void> => {
  await pool.query(`
    TRUNCATE
      published_revisions,
      publish_jobs,
      snapshots,
      crdt_updates,
      draft_docs,
      magic_link_tokens,
      media_assets,
      stripe_connections,
      domains,
      memberships,
      users,
      tenants
    CASCADE
  `);
};
