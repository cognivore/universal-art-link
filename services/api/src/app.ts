import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import PgBoss from 'pg-boss';

import { emptyContext } from './context.js';
import type { DbPool } from '@ual/storage';
import {
  createTenantRepo,
  createUserRepo,
  createDraftRepo,
  createSnapshotRepo,
  createMediaRepo,
  createMagicLinkRepo,
  createDomainRepo,
  createFilesystemStorage,
  createStripeConnectionRepo,
} from '@ual/storage';

import { registerTenantResolver } from './middleware/tenantResolver.js';
import { registerSessionResolver } from './middleware/sessionResolver.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSiteRoutes } from './routes/site.js';
import { registerMetaRoutes } from './routes/meta.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerStripeRoutes } from './routes/stripe.js';

export type AppDeps = {
  pool: DbPool;
  databaseUrl: string;
  storagePath: string;
  logger?: boolean | { level: string };
};

export type AppHandle = {
  app: FastifyInstance;
  boss: PgBoss;
  pool: DbPool;
};

/**
 * Create and configure the Fastify app with all routes.
 * Separated from index.ts so tests can create app instances directly.
 */
export const createApp = async (deps: AppDeps): Promise<AppHandle> => {
  const app = Fastify({
    logger: deps.logger ?? false,
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.addHook('onRequest', async (request) => {
    request.ctx = emptyContext();
  });

  const { pool } = deps;
  const tenantRepo = createTenantRepo(pool);
  const userRepo = createUserRepo(pool);
  const draftRepo = createDraftRepo(pool);
  const snapshotRepo = createSnapshotRepo(pool);
  const mediaRepo = createMediaRepo(pool);
  const magicLinkRepo = createMagicLinkRepo(pool);
  const domainRepo = createDomainRepo(pool);
  const stripeConnectionRepo = createStripeConnectionRepo(pool);
  const storage = createFilesystemStorage(deps.storagePath);

  const boss = new PgBoss(deps.databaseUrl);
  await boss.start();

  registerTenantResolver(app, tenantRepo);
  registerSessionResolver(app, userRepo);

  registerHealthRoutes(app, pool);
  registerAuthRoutes(app, userRepo, magicLinkRepo);
  registerSiteRoutes(app, snapshotRepo, draftRepo, boss);
  registerMetaRoutes(app, userRepo, tenantRepo, boss, domainRepo, stripeConnectionRepo);
  registerMediaRoutes(app, mediaRepo, storage);
  registerStripeRoutes(app, stripeConnectionRepo);

  return { app, boss, pool };
};
