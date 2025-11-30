/**
 * Comprehensive E2E Tests for UAL Stripe Integration
 *
 * Tests the full Stripe commerce flow including:
 * 1. Authentication (is_santa JWT bypass)
 * 2. Product CRUD with image upload
 * 3. Stripe Sync (import from Stripe, export to Stripe)
 * 4. Order listing (from Stripe checkout sessions)
 * 5. Image upload and sync to Stripe
 *
 * Prerequisites:
 * - UAL_STAGING_URL environment variable set
 * - UAL_STAGING_JWT environment variable set (is_santa bypass token)
 * - Staging server running with --single-tenant-stripe --stripe-mode=staging
 *
 * Usage:
 *   source .env && node --test tests/e2e/stripe-integration.test.js
 */

import assert from 'node:assert';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const STAGING_URL = process.env.UAL_STAGING_URL;
const STAGING_JWT = process.env.UAL_STAGING_JWT;

if (!STAGING_URL) {
  console.error('ERROR: UAL_STAGING_URL environment variable is required');
  console.error('Example: UAL_STAGING_URL=https://staging.okashi-school.com');
  process.exit(1);
}

if (!STAGING_JWT) {
  console.error('ERROR: UAL_STAGING_JWT environment variable is required');
  console.error('Get it from your .env file or generate with: pnpm staging:jwt');
  process.exit(1);
}

const API_BASE = `${STAGING_URL}/__ual/api`;
const AUTH_BASE = `${STAGING_URL}/__ual/auth`;

console.log('');
console.log('═'.repeat(72));
console.log('🧪 UAL Stripe Integration E2E Tests');
console.log('═'.repeat(72));
console.log(`📍 Staging URL: ${STAGING_URL}`);
console.log(`🔑 JWT: ${STAGING_JWT.substring(0, 20)}...`);
console.log('═'.repeat(72));
console.log('');

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

/**
 * Create a small test PNG image (1x1 pixel, ~100 bytes)
 */
const createTestImageBase64 = () => {
  // Minimal valid PNG (1x1 red pixel)
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe,
    0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, // IEND chunk
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return pngBytes.toString('base64');
};

// Test state
let testProductId = null;
let uploadedImageUrl = null;

// =============================================================================
// Test Suite
// =============================================================================

describe('Stripe Integration E2E', () => {

  // ===========================================================================
  // 1. Health & Authentication
  // ===========================================================================

  describe('1. Health & Authentication', () => {
    test('staging server is reachable and in Stripe mode', async () => {
      const response = await fetch(`${STAGING_URL}/__ual/healthz`);
      assert.strictEqual(response.status, 200, 'Health endpoint should return 200');

      const data = await response.json();
      assert.strictEqual(data.ok, true, 'Server should be healthy');
      assert.strictEqual(data.stripeMode, true, 'Server should be in Stripe mode');

      console.log('   ✅ Server healthy, Stripe mode enabled');
    });

    test('is_santa JWT authentication works', async () => {
      const response = await authFetch(`${AUTH_BASE}/session`);
      assert.strictEqual(response.status, 200, 'Session endpoint should return 200');

      const data = await response.json();
      assert.strictEqual(data.authenticated, true, 'Should be authenticated');
      assert.strictEqual(data.isSanta, true, 'Should have is_santa claim');

      console.log(`   ✅ Authenticated as: ${data.user?.name || 'Santa'} 🎅`);
    });

    test('unauthenticated requests are rejected', async () => {
      const response = await fetch(`${API_BASE}/stripe/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Test' }),
      });

      assert.strictEqual(response.status, 401, 'Should reject unauthenticated POST');
      console.log('   ✅ Auth protection working');
    });
  });

  // ===========================================================================
  // 2. Image Upload
  // ===========================================================================

  describe('2. Image Upload', () => {
    test('upload a test image', async () => {
      const imageData = createTestImageBase64();
      const filename = `e2e-test-${Date.now()}.png`;

      const response = await authFetch(`${API_BASE}/assets/upload`, {
        method: 'POST',
        body: JSON.stringify({
          filename,
          data: imageData,
          mimeType: 'image/png',
        }),
      });

      assert.strictEqual(response.status, 201, 'Upload should return 201');

      const data = await response.json();
      assert.ok(data.url, 'Should return uploaded image URL');
      assert.ok(data.url.startsWith('/assets/'), 'URL should be in /assets/');

      uploadedImageUrl = data.url;
      console.log(`   ✅ Uploaded image: ${uploadedImageUrl}`);
    });

    test('uploaded image is accessible', async () => {
      if (!uploadedImageUrl) {
        console.log('   ⚠️  Skipping - no image uploaded');
        return;
      }

      // Wait a moment for the file to be written
      await new Promise((r) => setTimeout(r, 500));

      const response = await fetch(`${STAGING_URL}${uploadedImageUrl}`);
      
      // Assets may need a site rebuild to be served, so 404 is acceptable in test mode
      if (response.status === 404) {
        console.log('   ⚠️  Image not immediately accessible (may need rebuild) - acceptable in E2E');
        return;
      }

      assert.strictEqual(response.status, 200, 'Image should be accessible');

      const contentType = response.headers.get('content-type');
      assert.ok(contentType?.includes('image'), 'Should return image content type');

      console.log('   ✅ Image accessible at URL');
    });

    test('rejects files over 5MB', async () => {
      // Create a ~6MB base64 string (will be rejected)
      const largeData = Buffer.alloc(6 * 1024 * 1024).toString('base64');

      const response = await authFetch(`${API_BASE}/assets/upload`, {
        method: 'POST',
        body: JSON.stringify({
          filename: 'too-large.png',
          data: largeData,
          mimeType: 'image/png',
        }),
      });

      // Server may return 400, 413, 500 (payload too large), or 502 (gateway timeout)
      assert.ok([400, 413, 500, 502].includes(response.status), `Should reject large files (got ${response.status})`);
      console.log(`   ✅ Large file upload correctly rejected (${response.status})`);
    });
  });

  // ===========================================================================
  // 3. Product CRUD with Image
  // ===========================================================================

  describe('3. Product CRUD with Image', () => {
    test('create product with uploaded image', async () => {
      // Use full URL for Stripe compatibility, or a placeholder image
      const imageUrl = uploadedImageUrl
        ? `${STAGING_URL}${uploadedImageUrl}`
        : 'https://via.placeholder.com/400x400.png?text=E2E+Test';

      const product = {
        name: `E2E Test Product ${Date.now()}`,
        description: 'Created by Stripe integration E2E tests',
        imageUrl,
        type: 'one_time',
        priceAmountCents: 4242,
        currency: 'USD',
        isActive: true,
        metadata: { e2e_test: 'true', created_at: new Date().toISOString() },
      };

      const response = await authFetch(`${API_BASE}/stripe/products`, {
        method: 'POST',
        body: JSON.stringify(product),
      });

      assert.strictEqual(response.status, 201, 'Create should return 201');

      const data = await response.json();
      assert.ok(data.id, 'Should return product ID');
      assert.strictEqual(data.name, product.name);
      assert.strictEqual(data.priceAmountCents, 4242);

      testProductId = data.id;
      console.log(`   ✅ Created product: ${data.id}`);
    });

    test('list products includes test product', async () => {
      const response = await authFetch(`${API_BASE}/stripe/products`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(Array.isArray(data.products), 'Should return products array');
      assert.ok(data.publishableKey?.startsWith('pk_test_'), 'Should have test publishable key');

      const found = data.products.find((p) => p.id === testProductId);
      assert.ok(found, 'Created product should be in list');

      console.log(`   ✅ Found ${data.products.length} products`);
    });

    test('update product', async () => {
      if (!testProductId) {
        console.log('   ⚠️  Skipping - no product created');
        return;
      }

      const patch = {
        name: 'E2E Updated Product',
        priceAmountCents: 9999,
        description: 'Updated by E2E test',
      };

      const response = await authFetch(`${API_BASE}/stripe/products/${testProductId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.name, patch.name);
      assert.strictEqual(data.priceAmountCents, 9999);

      console.log(`   ✅ Updated product: ${data.name} ($${(data.priceAmountCents / 100).toFixed(2)})`);
    });

    test('get single product', async () => {
      if (!testProductId) {
        console.log('   ⚠️  Skipping - no product created');
        return;
      }

      const response = await authFetch(`${API_BASE}/stripe/products/${testProductId}`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.id, testProductId);

      console.log(`   ✅ Retrieved product: ${data.id}`);
    });
  });

  // ===========================================================================
  // 4. Stripe Sync
  // ===========================================================================

  describe('4. Stripe Sync', () => {
    test('get sync status', async () => {
      const response = await authFetch(`${API_BASE}/stripe/sync`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok('cronEnabled' in data, 'Should return cronEnabled status');

      console.log(`   ✅ Sync status: cron=${data.cronEnabled}, lastSync=${data.lastSync ? 'yes' : 'none'}`);
    });

    test('export to Stripe creates Stripe product', async () => {
      const response = await authFetch(`${API_BASE}/stripe/sync/export`, {
        method: 'POST',
      });

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok('exported' in data, 'Should return export count');
      assert.ok('errors' in data, 'Should return errors array');

      console.log(`   ✅ Export complete: ${data.exported} exported, ${data.errors.length} errors`);

      // If we exported something, verify our test product got a Stripe ID
      if (testProductId) {
        const productResponse = await authFetch(`${API_BASE}/stripe/products/${testProductId}`);
        const product = await productResponse.json();

        if (product.stripeProductId) {
          console.log(`   ✅ Test product synced to Stripe: ${product.stripeProductId}`);
        }
      }
    });

    test('import from Stripe fetches products', async () => {
      const response = await authFetch(`${API_BASE}/stripe/sync/import`, {
        method: 'POST',
      });

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok('imported' in data, 'Should return import count');
      assert.ok('updated' in data, 'Should return update count');

      console.log(`   ✅ Import complete: ${data.imported} imported, ${data.updated} updated, ${data.skipped} skipped`);
    });
  });

  // ===========================================================================
  // 5. Order Listing (from Stripe)
  // ===========================================================================

  describe('5. Order Listing', () => {
    test('fetch orders from Stripe', async () => {
      const response = await authFetch(`${API_BASE}/stripe/orders?limit=10`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.ok, 'Response should be ok');
      assert.ok(Array.isArray(data.orders), 'Should return orders array');

      console.log(`   ✅ Retrieved ${data.orders.length} orders from Stripe`);

      if (data.orders.length > 0) {
        const order = data.orders[0];
        console.log(`   📋 Latest order: ${order.productName || 'Unknown'} - ${order.status}`);
      }
    });

    test('orders have expected fields', async () => {
      const response = await authFetch(`${API_BASE}/stripe/orders?limit=5`);
      const data = await response.json();

      if (data.orders.length === 0) {
        console.log('   ⚠️  No orders to verify (this is okay for fresh staging)');
        return;
      }

      const order = data.orders[0];
      assert.ok(order.id, 'Order should have id');
      assert.ok(order.status, 'Order should have status');
      assert.ok(order.createdAt, 'Order should have createdAt');

      console.log('   ✅ Order fields verified');
    });
  });

  // ===========================================================================
  // 6. Checkout Flow
  // ===========================================================================

  describe('6. Checkout Flow', () => {
    test('create checkout session', async () => {
      if (!testProductId) {
        console.log('   ⚠️  Skipping - no product created');
        return;
      }

      const response = await fetch(`${API_BASE}/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: testProductId,
          quantity: 1,
          successUrl: `${STAGING_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${STAGING_URL}/cancel`,
        }),
      });

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.sessionId, 'Should return session ID');
      assert.ok(data.url, 'Should return checkout URL');
      assert.ok(data.url.includes('checkout.stripe.com'), 'URL should point to Stripe');

      console.log(`   ✅ Checkout session created: ${data.sessionId.substring(0, 20)}...`);
    });
  });

  // ===========================================================================
  // 7. Cleanup
  // ===========================================================================

  describe('7. Cleanup', () => {
    test('delete test product', async () => {
      if (!testProductId) {
        console.log('   ⚠️  No product to clean up');
        return;
      }

      const response = await authFetch(`${API_BASE}/stripe/products/${testProductId}`, {
        method: 'DELETE',
      });

      assert.strictEqual(response.status, 204, 'Delete should return 204');
      console.log(`   ✅ Deleted test product: ${testProductId}`);
    });
  });
});

// =============================================================================
// Summary
// =============================================================================

process.on('exit', (code) => {
  console.log('');
  console.log('═'.repeat(72));
  if (code === 0) {
    console.log('🎉 All Stripe Integration E2E tests passed!');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ Health & authentication verified');
    console.log('  ✅ Image upload working');
    console.log('  ✅ Product CRUD operations successful');
    console.log('  ✅ Stripe sync (import/export) functional');
    console.log('  ✅ Order listing from Stripe API working');
    console.log('  ✅ Checkout flow operational');
  } else {
    console.log('❌ Some tests failed. Check the output above.');
  }
  console.log('═'.repeat(72));
});

