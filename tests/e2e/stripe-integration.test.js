/**
 * Honest E2E tests for Stripe integration.
 *
 * These tests leave visible artifacts in the Stripe dashboard using a
 * TEST_INVOCATION_ID so humans can inspect them.
 */

import assert from 'node:assert';
import { describe, test } from 'node:test';

const STAGING_URL = process.env.UAL_STAGING_URL;
const STAGING_JWT = process.env.UAL_STAGING_JWT;

if (!STAGING_URL) {
  console.error('ERROR: UAL_STAGING_URL is required');
  process.exit(1);
}

if (!STAGING_JWT) {
  console.error('ERROR: UAL_STAGING_JWT is required');
  process.exit(1);
}

const TEST_INVOCATION_ID = process.env.TEST_INVOCATION_ID ?? `e2e-${Date.now().toString(36)}`;
const PRODUCT_LABELS = ['ALPHA', 'BETA', 'GAMMA'];

const API_BASE = `${STAGING_URL}/__ual/api`;
const AUTH_BASE = `${STAGING_URL}/__ual/auth`;

console.log('');
console.log('═'.repeat(72));
console.log('🧪 Honest Stripe Integration Tests');
console.log('═'.repeat(72));
console.log(`📍 Staging URL: ${STAGING_URL}`);
console.log(`🔑 JWT: ${STAGING_JWT.substring(0, 20)}...`);
console.log(`🧬 TEST_INVOCATION_ID: ${TEST_INVOCATION_ID}`);
console.log('═'.repeat(72));
console.log('');

const createdProducts = [];
let uploadedImageUrl = null;
let checkoutSessionId = null;

const authFetch = async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `ual_session=${STAGING_JWT}`,
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
};

const createTestImageBase64 = () => {
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe,
    0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return pngBytes.toString('base64');
};

const createProductPayload = (label, index) => ({
  name: `E2E_${TEST_INVOCATION_ID}_Product_${label}`,
  description: `Stripe E2E product ${label} (${TEST_INVOCATION_ID})`,
  imageUrl: uploadedImageUrl ? `${STAGING_URL}${uploadedImageUrl}` : `https://via.placeholder.com/512x512.png?text=${label}`,
  type: 'one_time',
  priceAmountCents: 2500 + index * 500,
  currency: 'USD',
  isActive: true,
  metadata: {
    test_invocation_id: TEST_INVOCATION_ID,
    test_label: label,
  },
});

const getProductByLabel = (label) => {
  const product = createdProducts.find((p) => p.label === label);
  if (!product) {
    throw new Error(`Unknown product label: ${label}`);
  }
  return product;
};

const verifyStripeProduct = async (stripeProductId, expectedName) => {
  const response = await authFetch(`${API_BASE}/stripe/verify-product/${stripeProductId}`);
  assert.strictEqual(response.status, 200, `Stripe product ${stripeProductId} not found`);
  const data = await response.json();
  assert.strictEqual(data.name, expectedName);
  assert.strictEqual(data.metadata?.test_invocation_id, TEST_INVOCATION_ID);
  return data;
};

const verifyStripeSession = async (sessionId) => {
  const response = await authFetch(`${API_BASE}/stripe/verify-session/${sessionId}`);
  assert.strictEqual(response.status, 200, `Stripe session ${sessionId} not found`);
  const data = await response.json();
  assert.strictEqual(data.metadata?.test_invocation_id, TEST_INVOCATION_ID);
  return data;
};

describe('Stripe Integration E2E', () => {
  describe('1. Health & Authentication', () => {
    test('staging server is reachable and in Stripe mode', async () => {
      const response = await fetch(`${STAGING_URL}/__ual/healthz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.stripeMode, true);
      console.log('   ✅ Server healthy, Stripe mode enabled');
    });

    test('is_santa JWT authentication works', async () => {
      const response = await authFetch(`${AUTH_BASE}/session`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.authenticated, true);
      assert.strictEqual(data.isSanta, true);
      console.log(`   ✅ Authenticated as: ${data.user?.name ?? 'Santa'} 🎅`);
    });

    test('unauthenticated requests are rejected', async () => {
      const response = await fetch(`${API_BASE}/stripe/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Test' }),
      });
      assert.strictEqual(response.status, 401);
      console.log('   ✅ Auth protection working');
    });
  });

  describe('2. Image Upload', () => {
    test('upload a test image', async () => {
      const response = await authFetch(`${API_BASE}/assets/upload`, {
        method: 'POST',
        body: JSON.stringify({
          filename: `e2e-${TEST_INVOCATION_ID}.png`,
          data: createTestImageBase64(),
          mimeType: 'image/png',
        }),
      });
      assert.strictEqual(response.status, 201);
      const data = await response.json();
      assert.ok(data.url);
      uploadedImageUrl = data.url;
      console.log(`   ✅ Uploaded image: ${uploadedImageUrl}`);
    });

    test('uploaded image is publicly accessible', async () => {
      assert.ok(uploadedImageUrl, 'Image must be uploaded first');
      await new Promise((r) => setTimeout(r, 500));
      const response = await fetch(`${STAGING_URL}${uploadedImageUrl}`);
      assert.strictEqual(response.status, 200);
      const contentType = response.headers.get('content-type');
      assert.ok(contentType?.includes('image'));
      console.log('   ✅ Image accessible via HTTP');
    });
  });

  describe('3. Product Lifecycle', () => {
    test('create invocation-scoped products', async () => {
      for (const [index, label] of PRODUCT_LABELS.entries()) {
        const response = await authFetch(`${API_BASE}/stripe/products`, {
          method: 'POST',
          body: JSON.stringify(createProductPayload(label, index)),
        });
        assert.strictEqual(response.status, 201, `Product ${label} creation failed`);
        const data = await response.json();
        createdProducts.push({ label, localId: data.id, name: data.name });
        console.log(`   ✅ Created ${label}: ${data.id}`);
      }
    });

    test('export invocation products to Stripe live catalog', async () => {
      const response = await authFetch(`${API_BASE}/stripe/sync/export`, { method: 'POST' });
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.errors.length, 0, 'Stripe export must not error');
      console.log(`   ✅ Exported products (exported=${data.exported}, skipped=${data.skipped})`);
    });

    test('local products now have stripeProductId references', async () => {
      for (const product of createdProducts) {
        const response = await authFetch(`${API_BASE}/stripe/products/${product.localId}`);
        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.ok(data.stripeProductId, 'stripeProductId missing');
        assert.ok(data.stripePriceId, 'stripePriceId missing');
        product.stripeProductId = data.stripeProductId;
        product.stripePriceId = data.stripePriceId;
        console.log(`   ✅ ${product.label} -> ${product.stripeProductId}`);
      }
    });

    test('Stripe dashboard contains invocation products', async () => {
      for (const product of createdProducts) {
        const verify = await verifyStripeProduct(product.stripeProductId, product.name);
        assert.strictEqual(verify.active, true);
        console.log(`   ✅ Verified in Stripe: ${product.stripeProductId}`);
      }
    });
  });

  describe('4. Checkout & Orders', () => {
    test('create checkout session referencing exported Stripe product', async () => {
      const anchorProduct = getProductByLabel('ALPHA');
      const response = await fetch(`${API_BASE}/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: anchorProduct.localId,
          quantity: 1,
          successUrl: `${STAGING_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${STAGING_URL}/cancel`,
          testInvocationId: TEST_INVOCATION_ID,
        }),
      });
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok(data.sessionId);
      assert.ok(data.url.includes('checkout.stripe.com'));
      checkoutSessionId = data.sessionId;
      console.log(`   ✅ Checkout session created: ${checkoutSessionId}`);
    });

    test('Stripe session metadata references invocation and product', async () => {
      assert.ok(checkoutSessionId, 'Checkout session not created');
      const session = await verifyStripeSession(checkoutSessionId);
      assert.strictEqual(session.status, 'open');
      const lineItem = session.lineItems?.[0];
      const anchorProduct = getProductByLabel('ALPHA');
      assert.strictEqual(lineItem?.product, anchorProduct.stripeProductId);
      console.log('   ✅ Stripe session metadata verified');
    });

    test('order listing includes created session', async () => {
      const response = await authFetch(`${API_BASE}/stripe/orders?limit=20`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok(Array.isArray(data.orders));
      const found = data.orders.find((order) => order.stripeSessionId === checkoutSessionId);
      assert.ok(found, 'Order list must contain the checkout session');
      assert.strictEqual(found.status, 'pending');
      console.log('   ✅ Orders endpoint reflects Stripe session');
    });
  });

  describe('5. Content Management sanity check', () => {
    test('fetch and update content snapshot', async () => {
      const getResponse = await authFetch(`${API_BASE}/content`);
      assert.strictEqual(getResponse.status, 200);
      const snapshot = await getResponse.json();
      const updatedContent = { ...snapshot.content, __testInvocationId: TEST_INVOCATION_ID };
      const saveResponse = await authFetch(`${API_BASE}/content`, {
        method: 'POST',
        body: JSON.stringify(updatedContent),
      });
      assert.strictEqual(saveResponse.status, 200);
      console.log('   ✅ CMS write succeeded');
    });
  });
});

process.on('exit', (code) => {
  console.log('');
  console.log('═'.repeat(72));
  if (code === 0) {
    console.log('🎉 Honest Stripe Integration tests passed!');
    console.log('Artifacts visible in Stripe dashboard by searching TEST_INVOCATION_ID.');
  } else {
    console.log('❌ Tests failed. Inspect logs above.');
  }
  console.log('═'.repeat(72));
});

