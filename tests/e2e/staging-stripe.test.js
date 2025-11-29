/**
 * E2E Tests for UAL Staging with Stripe Commerce
 *
 * These tests run against a live staging server and verify:
 * 1. Authentication bypass via is_santa JWT
 * 2. Product CRUD operations
 * 3. Content/article management
 * 4. Stripe checkout flow with test cards
 *
 * Prerequisites:
 * - UAL_STAGING_URL environment variable set
 * - UAL_STAGING_JWT environment variable set (is_santa bypass token)
 * - Staging server running with --single-tenant-stripe --stripe-mode=staging
 *
 * Usage:
 * UAL_STAGING_URL=https://staging.example.com \
 * UAL_STAGING_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
 *   node tests/e2e/staging-stripe.test.js
 */

import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';

const STAGING_URL = process.env.UAL_STAGING_URL;
const STAGING_JWT = process.env.UAL_STAGING_JWT;

if (!STAGING_URL) {
  console.error('ERROR: UAL_STAGING_URL environment variable is required');
  process.exit(1);
}

if (!STAGING_JWT) {
  console.error('ERROR: UAL_STAGING_JWT environment variable is required');
  process.exit(1);
}

const API_BASE = `${STAGING_URL}/__ual/api`;
const AUTH_BASE = `${STAGING_URL}/__ual/auth`;

/**
 * Make authenticated request with staging JWT
 */
const authFetch = async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `ual_session=${STAGING_JWT}`,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  return response;
};

// Test data
let createdProductId = null;
let createdCheckoutSessionId = null;

describe('UAL Staging E2E Tests', () => {
  // ==========================================================================
  // Health Check
  // ==========================================================================

  describe('Health Check', () => {
    test('staging server is reachable', async () => {
      const response = await fetch(`${STAGING_URL}/__ual/healthz`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.stripeMode, true);

      console.log('✅ Staging server is healthy');
    });
  });

  // ==========================================================================
  // Authentication
  // ==========================================================================

  describe('Authentication', () => {
    test('staging bypass JWT is accepted (is_santa claim)', async () => {
      const response = await authFetch(`${AUTH_BASE}/session`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.authenticated, true);
      assert.ok(data.user);
      assert.strictEqual(data.isSanta, true);

      console.log(`✅ Authenticated as: ${data.user.name} (is_santa=${data.isSanta}) 🎅`);
    });

    test('unauthenticated requests to admin are rejected', async () => {
      const response = await fetch(`${API_BASE}/stripe/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });

      // Should be 401 for POST without auth
      assert.strictEqual(response.status, 401);
      console.log('✅ Unauthenticated POST correctly rejected');
    });
  });

  // ==========================================================================
  // Product Management
  // ==========================================================================

  describe('Stripe Product CRUD', () => {
    test('create a new product', async () => {
      const product = {
        name: 'E2E Test Product',
        description: 'Created by automated E2E tests',
        type: 'one_time',
        priceAmountCents: 4242,
        currency: 'USD',
        isActive: true,
        metadata: { test: 'true', timestamp: Date.now().toString() },
      };

      const response = await authFetch(`${API_BASE}/stripe/products`, {
        method: 'POST',
        body: JSON.stringify(product),
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.ok(data.id);
      assert.strictEqual(data.name, product.name);
      assert.strictEqual(data.priceAmountCents, 4242);

      createdProductId = data.id;
      console.log(`✅ Created product: ${data.id} - ${data.name}`);
    });

    test('list products includes created product', async () => {
      const response = await authFetch(`${API_BASE}/stripe/products`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.products);
      assert.ok(data.publishableKey);

      const found = data.products.find((p) => p.id === createdProductId);
      assert.ok(found, 'Created product should be in the list');

      console.log(`✅ Found ${data.products.length} products (including our test product)`);
    });

    test('update product', async () => {
      const patch = {
        name: 'E2E Test Product (Updated)',
        priceAmountCents: 9999,
      };

      const response = await authFetch(`${API_BASE}/stripe/products/${createdProductId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.name, patch.name);
      assert.strictEqual(data.priceAmountCents, 9999);

      console.log(`✅ Updated product: ${data.name} ($${data.priceAmountCents / 100})`);
    });

    test('get single product', async () => {
      const response = await authFetch(`${API_BASE}/stripe/products/${createdProductId}`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.id, createdProductId);
      assert.strictEqual(data.priceAmountCents, 9999);

      console.log(`✅ Retrieved product: ${data.id}`);
    });
  });

  // ==========================================================================
  // Stripe Checkout
  // ==========================================================================

  describe('Stripe Checkout Flow', () => {
    test('create checkout session', async () => {
      // Note: We can use unauthenticated request for checkout (it's public)
      const response = await fetch(`${API_BASE}/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: createdProductId,
          quantity: 1,
          successUrl: `${STAGING_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${STAGING_URL}/shop`,
        }),
      });

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.sessionId);
      assert.ok(data.url);

      createdCheckoutSessionId = data.sessionId;
      console.log(`✅ Created checkout session: ${data.sessionId.substring(0, 20)}...`);
      console.log(`   Checkout URL: ${data.url.substring(0, 60)}...`);
    });

    test('orders list includes pending order', async () => {
      const response = await authFetch(`${API_BASE}/stripe/orders`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.orders);

      const found = data.orders.find((o) => o.stripeSessionId === createdCheckoutSessionId);
      assert.ok(found, 'Pending order should be in the list');
      assert.strictEqual(found.status, 'pending');

      console.log(`✅ Found pending order for session: ${createdCheckoutSessionId.substring(0, 20)}...`);
    });
  });

  // ==========================================================================
  // Content Management
  // ==========================================================================

  describe('Content Management', () => {
    test('fetch content schema and pages', async () => {
      const response = await authFetch(`${API_BASE}/content`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.ok);
      assert.ok(data.schema);
      assert.ok(data.content);

      console.log(`✅ Retrieved content schema and ${Object.keys(data.content).length} page(s)`);
    });

    test('can update page content', async () => {
      // First fetch current content
      const getResponse = await authFetch(`${API_BASE}/content`);
      const current = await getResponse.json();

      // Add a test field to demonstrate write capability
      const updatedContent = { ...current.content };

      // Update a simple field if we have pages
      if (updatedContent.pages && updatedContent.pages.home) {
        updatedContent.pages.home._e2eTestTimestamp = new Date().toISOString();
      }

      const response = await authFetch(`${API_BASE}/content`, {
        method: 'POST',
        body: JSON.stringify(updatedContent),
      });

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.ok);

      console.log('✅ Content update successful');
    });
  });

  // ==========================================================================
  // Stripe Config
  // ==========================================================================

  describe('Stripe Configuration', () => {
    test('public Stripe config is accessible', async () => {
      const response = await fetch(`${API_BASE}/stripe/config`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.publishableKey);
      assert.ok(data.publishableKey.startsWith('pk_test_'), 'Should be using test publishable key');

      console.log(`✅ Stripe publishable key: ${data.publishableKey.substring(0, 20)}...`);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('Cleanup', () => {
    test('delete test product', async () => {
      if (!createdProductId) {
        console.log('⚠️  No product to clean up');
        return;
      }

      const response = await authFetch(`${API_BASE}/stripe/products/${createdProductId}`, {
        method: 'DELETE',
      });

      assert.strictEqual(response.status, 204);
      console.log(`✅ Deleted test product: ${createdProductId}`);
    });
  });
});

// ==========================================================================
// Summary
// ==========================================================================

process.on('exit', (code) => {
  console.log('');
  console.log('═'.repeat(72));
  if (code === 0) {
    console.log('✅ All E2E tests passed!');
    console.log('');
    console.log('Summary:');
    console.log('  - Staging server health verified');
    console.log('  - is_santa JWT bypass working 🎅');
    console.log('  - Product CRUD operations successful');
    console.log('  - Checkout session creation working');
    console.log('  - Content management accessible');
    console.log('  - Stripe test keys configured correctly');
  } else {
    console.log('❌ Some tests failed. Check the output above.');
  }
  console.log('═'.repeat(72));
});

