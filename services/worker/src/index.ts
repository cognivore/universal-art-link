import PgBoss from 'pg-boss';
import pino from 'pino';
import {
  createPool,
  createSnapshotRepo,
  createTenantRepo,
  createDomainRepo,
} from '@ual/storage';
import { createPorkbunAdapter, createCaddyAdapter } from '@ual/provisioning';
import { handlePublish, type PublishJobData } from './publishHandler.js';
import { handleProvision, type ProvisionJobData } from './provisionHandler.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://ual:ual_dev@localhost:5432/ual';
const BASE_DOMAIN = process.env['UAL_BASE_DOMAIN'] ?? 'localhost';
const PORKBUN_API_KEY = process.env['PORKBUN_API_KEY'] ?? '';
const PORKBUN_SECRET_KEY = process.env['PORKBUN_SECRET_KEY'] ?? '';
const CADDY_ADMIN_URL = process.env['CADDY_ADMIN_URL'] ?? 'http://127.0.0.1:2019';
const API_UPSTREAM = process.env['API_UPSTREAM'] ?? 'http://127.0.0.1:3000';
const REALTIME_UPSTREAM = process.env['REALTIME_UPSTREAM'] ?? 'http://127.0.0.1:3001';

const main = async () => {
  const pool = createPool(DATABASE_URL);
  const snapshotRepo = createSnapshotRepo(pool);
  const tenantRepo = createTenantRepo(pool);
  const domainRepo = createDomainRepo(pool);

  const porkbun = createPorkbunAdapter(PORKBUN_API_KEY, PORKBUN_SECRET_KEY);
  const caddy = createCaddyAdapter(CADDY_ADMIN_URL, API_UPSTREAM, REALTIME_UPSTREAM);

  const boss = new PgBoss(DATABASE_URL);
  await boss.start();

  const publishFn = handlePublish(snapshotRepo);
  await boss.work<PublishJobData>('publish', async (jobs) => {
    for (const job of jobs) await publishFn(job.data);
  });
  log.info('Registered publish job handler');

  const provisionFn = handleProvision(tenantRepo, domainRepo, porkbun, caddy, BASE_DOMAIN);
  await boss.work<ProvisionJobData>('provision_tenant', async (jobs) => {
    for (const job of jobs) await provisionFn(job.data);
  });
  log.info('Registered provision_tenant job handler');

  log.info('Worker started, waiting for jobs...');

  const shutdown = async () => {
    log.info('Shutting down worker...');
    await boss.stop();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main().catch((err) => {
  log.error({ err }, 'Worker failed to start');
  process.exit(1);
});
