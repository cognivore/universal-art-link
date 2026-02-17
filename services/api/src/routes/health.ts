import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@ual/storage';

export const registerHealthRoutes = (app: FastifyInstance, pool: DbPool) => {
  app.get('/healthz', async (_req, reply) => {
    return reply.send({ status: 'ok' });
  });

  app.get('/readyz', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.send({ status: 'ready' });
    } catch {
      return reply.status(503).send({ status: 'not ready' });
    }
  });
};
