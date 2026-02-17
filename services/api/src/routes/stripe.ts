import type { FastifyInstance } from 'fastify';
import type { StripeConnectionRepo } from '@ual/storage';
import {
  createConnectOAuthUrl,
  exchangeConnectCode,
  verifyWebhookEvent,
} from '@ual/stripe';
import { requireAuth, requireTenant, requireRole } from '../middleware/guards.js';
import { config } from '../config.js';

export const registerStripeRoutes = (
  app: FastifyInstance,
  stripeConnectionRepo: StripeConnectionRepo,
) => {
  app.get('/api/stripe/status', {
    preHandler: [requireAuth, requireTenant],
  }, async (request, reply) => {
    const conn = await stripeConnectionRepo.get(request.ctx.tenant!.id);
    return reply.send(conn
      ? { connected: true, mode: conn.mode, accountId: conn.connectAccountId }
      : { connected: false, mode: 'payment_links' },
    );
  });

  app.post('/api/stripe/connect/start', {
    preHandler: [requireAuth, requireTenant, requireRole('owner')],
  }, async (request, reply) => {
    const clientId = process.env['STRIPE_CONNECT_CLIENT_ID'];
    if (!clientId) return reply.status(501).send({ error: 'Connect not configured' });

    const redirectUri = `${request.protocol}://${request.hostname}/api/stripe/connect/callback`;
    const state = request.ctx.tenant!.id;
    const url = createConnectOAuthUrl(clientId, redirectUri, state);

    return reply.send({ url });
  });

  app.get('/api/stripe/connect/callback', async (request, reply) => {
    const { code, state: tenantId } = request.query as { code?: string; state?: string };
    if (!code || !tenantId) return reply.status(400).send({ error: 'Missing code or state' });

    const secretKey = process.env['STRIPE_SECRET_KEY'];
    if (!secretKey) return reply.status(501).send({ error: 'Stripe not configured' });

    const accountId = await exchangeConnectCode(secretKey, code);
    await stripeConnectionRepo.upsert(tenantId, 'connect', accountId);

    return reply.redirect('/admin');
  });

  app.post('/api/stripe/checkout/create-session', {
    preHandler: [requireTenant],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const conn = await stripeConnectionRepo.get(tenantId);

    if (!conn || conn.mode === 'payment_links') {
      return reply.status(400).send({ error: 'Checkout sessions not available in payment_links mode' });
    }

    return reply.status(501).send({ error: 'Checkout session creation delegated to @ual/stripe adapter' });
  });

  app.post('/api/stripe/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!webhookSecret) return reply.status(501).send({ error: 'Webhook not configured' });

    const sig = request.headers['stripe-signature'];
    if (!sig) return reply.status(400).send({ error: 'Missing signature' });

    try {
      const _event = verifyWebhookEvent(
        request.body as string,
        sig as string,
        webhookSecret,
      );
      return reply.send({ received: true });
    } catch {
      return reply.status(400).send({ error: 'Invalid signature' });
    }
  });
};
