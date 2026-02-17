import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, stopServer } from './setup.js';
import { createTestTenantWithOwner } from './helpers.js';

let baseUrl: string;

beforeAll(async () => {
  baseUrl = await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe('Stripe API', () => {
  it('GET /api/stripe/status returns disconnected for new tenant', async () => {
    const { client } = await createTestTenantWithOwner(baseUrl, 'stripe-test-1', 'stripe1@test.com');
    const res = await client.get<{ connected: boolean; mode: string }>('/api/stripe/status');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.mode).toBe('payment_links');
  });

  it('POST /api/stripe/connect/start returns 501 when not configured', async () => {
    const { client } = await createTestTenantWithOwner(baseUrl, 'stripe-test-2', 'stripe2@test.com');
    const res = await client.post('/api/stripe/connect/start');
    expect(res.status).toBe(501);
  });

  it('POST /api/stripe/checkout/create-session rejects in payment_links mode', async () => {
    const { client } = await createTestTenantWithOwner(baseUrl, 'stripe-test-3', 'stripe3@test.com');
    const res = await client.post('/api/stripe/checkout/create-session', {
      lineItems: [{ priceId: 'price_123', quantity: 1 }],
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
    });
    expect(res.status).toBe(400);
  });
});
