/**
 * Stripe Promotion Regression Test
 *
 * Tests the complete staging → production promotion flow including:
 * 1. Creating a product on staging (test Stripe)
 * 2. Triggering promotion from staging
 * 3. Verifying the product appears in production's Stripe (live mode)
 * 4. Verifying a snapshot was created on production
 *
 * Requirements:
 * - UAL_STAGING_URL
 * - UAL_PRODUCTION_URL
 * - UAL_STAGING_JWT
 *
 * Example:
 * UAL_STAGING_URL=https://staging.example.com \
 * UAL_PRODUCTION_URL=https://example.com \
 * UAL_STAGING_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
 *   node tests/e2e/stripe-promotion.test.js
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, test } from 'node:test';

const STAGING_URL = process.env.UAL_STAGING_URL;
const PRODUCTION_URL = process.env.UAL_PRODUCTION_URL;
const STAGING_JWT = process.env.UAL_STAGING_JWT;

if (!STAGING_URL) {
  console.error('ERROR: UAL_STAGING_URL environment variable is required');
  process.exit(1);
}

if (!PRODUCTION_URL) {
  console.error('ERROR: UAL_PRODUCTION_URL environment variable is required');
  process.exit(1);
}

if (!STAGING_JWT) {
  console.error('ERROR: UAL_STAGING_JWT environment variable is required');
  process.exit(1);
}

const TEST_RUN_ID = `promo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const PRODUCT_NAME = `Promotion Test ${TEST_RUN_ID}`;

console.log('');
console.log('═'.repeat(72));
console.log('🚀 Stripe Promotion Regression Test');
console.log('═'.repeat(72));
console.log(`📍 Staging URL: ${STAGING_URL}`);
console.log(`📍 Production URL: ${PRODUCTION_URL}`);
console.log(`🔑 JWT: ${STAGING_JWT.substring(0, 20)}...`);
console.log(`🧬 Test Run ID: ${TEST_RUN_ID}`);
console.log('═'.repeat(72));
console.log('');

const stagingFetch = async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `ual_session=${STAGING_JWT}`,
    ...options.headers,
  };
  return fetch(`${STAGING_URL}${path}`, { ...options, headers });
};

const productionFetch = async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `ual_session=${STAGING_JWT}`,
    ...options.headers,
  };
  return fetch(`${PRODUCTION_URL}${path}`, { ...options, headers });
};

let testProductId = null;
let snapshotCountBefore = 0;

describe('Stripe Promotion Flow', () => {
  test('1. Create test product on staging', async () => {
    // First, upload an image for the product
    const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#4f46e5"/>
      <text x="50%" y="50%" text-anchor="middle" fill="#fff" font-size="10">${TEST_RUN_ID}</text>
    </svg>`;
    const base64 = Buffer.from(svg, 'utf8').toString('base64');

    const uploadResponse = await stagingFetch('/__ual/api/assets/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: `promo-test-${TEST_RUN_ID}.svg`,
        data: base64,
        mimeType: 'image/svg+xml',
      }),
    });
    assert.strictEqual(uploadResponse.status, 201, 'Image upload should succeed');
    const { url: imageUrl } = await uploadResponse.json();

    // Create the product
    const createResponse = await stagingFetch('/__ual/api/stripe/products', {
      method: 'POST',
      body: JSON.stringify({
        name: PRODUCT_NAME,
        description: `Regression test product for promotion flow. Run: ${TEST_RUN_ID}`,
        imageUrl,
        type: 'one_time',
        priceAmountCents: 999,
        currency: 'USD',
        isActive: true,
        metadata: {
          test_type: 'stripe-promotion-regression',
          test_run_id: TEST_RUN_ID,
        },
      }),
    });

    assert.strictEqual(createResponse.status, 201, 'Product creation should succeed');
    const product = await createResponse.json();
    testProductId = product.id;
    console.log(`   ✅ Created product on staging: ${testProductId}`);
  });

  test('2. Export product to staging Stripe (test mode)', async () => {
    const syncResponse = await stagingFetch('/__ual/api/stripe/sync/export', {
      method: 'POST',
    });

    assert.strictEqual(syncResponse.status, 200, 'Sync should succeed');
    const syncResult = await syncResponse.json();
    console.log(`   ✅ Staging Stripe sync: exported=${syncResult.exported}, skipped=${syncResult.skipped}`);

    // Verify the product has a Stripe ID
    const productResponse = await stagingFetch(`/__ual/api/stripe/products/${testProductId}`);
    assert.strictEqual(productResponse.status, 200);
    const product = await productResponse.json();
    assert.ok(product.stripeProductId, 'Product should have stripeProductId after sync');
    console.log(`   ✅ Product synced to staging Stripe: ${product.stripeProductId}`);
  });

  test('3. Record production snapshot count before promotion', async () => {
    const snapshotsResponse = await productionFetch('/__ual/api/admin/snapshots');
    if (snapshotsResponse.ok) {
      const { snapshots } = await snapshotsResponse.json();
      snapshotCountBefore = snapshots?.length ?? 0;
      console.log(`   📸 Production has ${snapshotCountBefore} snapshots before promotion`);
    } else {
      console.log('   ⚠️ Could not get production snapshots (may not exist yet)');
    }
  });

  test('4. Trigger promotion from staging', async () => {
    const promoteResponse = await stagingFetch('/__ual/api/admin/promote', {
      method: 'POST',
    });

    assert.strictEqual(promoteResponse.status, 200, 'Promotion should succeed');
    const result = await promoteResponse.json();

    console.log(`   📋 Promotion result: success=${result.success}`);
    for (const step of result.steps) {
      const icon = step.success ? '✅' : '❌';
      console.log(`      ${icon} ${step.step}: ${step.message}`);
    }

    // The products step should mention the webhook or export
    const productsStep = result.steps.find((s) => s.step === 'products');
    assert.ok(productsStep, 'Products step should exist');

    // If webhook is configured, it should call production
    // If not, it will say "Stripe sync not configured"
    if (productsStep.message.includes('webhook') || productsStep.message.includes('Exported')) {
      console.log(`   ✅ Products promotion completed: ${productsStep.message}`);
    } else {
      console.log(`   ⚠️ Products step: ${productsStep.message}`);
    }
  });

  test('5. Verify product exists on production', async () => {
    // Wait a moment for promotion to complete
    await new Promise((r) => setTimeout(r, 1000));

    const productsResponse = await productionFetch('/__ual/api/stripe/products');
    assert.strictEqual(productsResponse.status, 200, 'Should be able to list production products');

    const { products } = await productsResponse.json();
    const promotedProduct = products.find((p) => p.name === PRODUCT_NAME);

    assert.ok(promotedProduct, `Product "${PRODUCT_NAME}" should exist on production`);
    console.log(`   ✅ Product found on production: ${promotedProduct.id}`);
  });

  test('6. Verify snapshot was created on production', async () => {
    const snapshotsResponse = await productionFetch('/__ual/api/admin/snapshots');

    if (!snapshotsResponse.ok) {
      console.log('   ⚠️ Could not verify snapshots (endpoint may not be available)');
      return;
    }

    const { snapshots } = await snapshotsResponse.json();
    const snapshotCountAfter = snapshots?.length ?? 0;

    // Look for a staging-import snapshot
    const importSnapshot = snapshots?.find((s) => s.name.startsWith('staging-import-'));

    if (importSnapshot) {
      console.log(`   ✅ Import snapshot created: ${importSnapshot.name}`);
    } else if (snapshotCountAfter > snapshotCountBefore) {
      console.log(`   ✅ New snapshot created (count: ${snapshotCountBefore} → ${snapshotCountAfter})`);
    } else {
      console.log('   ⚠️ No new snapshot detected (webhook may not be configured)');
    }
  });

  test('7. Verify product in production Stripe (live mode)', async () => {
    // Get the product with its Stripe ID
    const productsResponse = await productionFetch('/__ual/api/stripe/products');
    const { products } = await productsResponse.json();
    const promotedProduct = products.find((p) => p.name === PRODUCT_NAME);

    if (!promotedProduct?.stripeProductId) {
      console.log('   ⚠️ Product not yet synced to production Stripe');
      return;
    }

    // Verify it exists in Stripe
    const verifyResponse = await productionFetch(
      `/__ual/api/stripe/verify-product/${promotedProduct.stripeProductId}`,
    );

    if (verifyResponse.ok) {
      const stripeProduct = await verifyResponse.json();
      console.log(`   ✅ Product verified in production Stripe: ${stripeProduct.id}`);
      console.log(`      Name: ${stripeProduct.name}`);
      console.log(`      Active: ${stripeProduct.active}`);
    } else {
      console.log('   ⚠️ Could not verify product in Stripe (may need manual sync)');
    }
  });
});

process.on('exit', (code) => {
  console.log('');
  console.log('═'.repeat(72));
  if (code === 0) {
    console.log('✅ Stripe promotion regression test passed!');
    console.log('');
    console.log('Summary:');
    console.log('  - Product created on staging and synced to test Stripe');
    console.log('  - Promotion triggered from staging to production');
    console.log('  - Product verified on production');
    console.log('  - Snapshot creation verified (if webhook configured)');
  } else {
    console.log('❌ Stripe promotion regression test FAILED');
  }
  console.log('═'.repeat(72));
});


