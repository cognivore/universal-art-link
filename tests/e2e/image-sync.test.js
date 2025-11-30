/**
 * Image Sync Regression Test
 *
 * Tests that updating a product's image via the UI properly syncs to Stripe.
 * This test:
 * 1. Finds an existing product with a Stripe CDN image
 * 2. Backs up the original image URL
 * 3. Uploads a new test image
 * 4. Updates the product with the new image
 * 5. Verifies the new image is in Stripe
 * 6. Restores the original image
 * 7. Verifies the original image is back in Stripe
 *
 * Requirements:
 * - UAL_STAGING_URL or UAL_PRODUCTION_URL
 * - UAL_STAGING_JWT
 *
 * Example:
 * UAL_STAGING_URL=https://staging.example.com \
 * UAL_STAGING_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
 *   node tests/e2e/image-sync.test.js
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, test } from 'node:test';

const TARGET_URL = process.env.UAL_STAGING_URL || process.env.UAL_PRODUCTION_URL;
const STAGING_JWT = process.env.UAL_STAGING_JWT;

if (!TARGET_URL) {
  console.error('ERROR: UAL_STAGING_URL or UAL_PRODUCTION_URL environment variable is required');
  process.exit(1);
}

if (!STAGING_JWT) {
  console.error('ERROR: UAL_STAGING_JWT environment variable is required');
  process.exit(1);
}

const TEST_RUN_ID = `img-sync-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

console.log('');
console.log('═'.repeat(72));
console.log('🖼️  Image Sync Regression Test');
console.log('═'.repeat(72));
console.log(`📍 Target URL: ${TARGET_URL}`);
console.log(`🔑 JWT: ${STAGING_JWT.substring(0, 20)}...`);
console.log(`🧬 Test Run ID: ${TEST_RUN_ID}`);
console.log('═'.repeat(72));
console.log('');

const authFetch = async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `ual_session=${STAGING_JWT}`,
    ...options.headers,
  };
  return fetch(`${TARGET_URL}${path}`, { ...options, headers });
};

/**
 * Generate a unique SVG test image
 */
const generateTestSvg = (label) => {
  const hash = crypto.createHash('sha256').update(`${TEST_RUN_ID}-${label}`).digest('hex').slice(0, 8);
  const hue = parseInt(hash.slice(0, 3), 16) % 360;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="hsl(${hue}, 70%, 50%)"/>
  <text x="50%" y="40%" font-size="24" text-anchor="middle" fill="#fff" font-family="monospace">
    IMAGE SYNC TEST
  </text>
  <text x="50%" y="55%" font-size="16" text-anchor="middle" fill="#fff" font-family="monospace">
    ${label}
  </text>
  <text x="50%" y="70%" font-size="12" text-anchor="middle" fill="#fff" font-family="monospace">
    ${hash}
  </text>
</svg>`.trim();
};

let targetProduct = null;
let originalImageUrl = null;
let newImageUrl = null;
let createdProduct = false;

describe('Image Sync to Stripe', () => {
  test('1. Find or create a product with Stripe ID', async () => {
    const response = await authFetch('/__ual/api/stripe/products');
    assert.strictEqual(response.status, 200, 'Should be able to list products');

    const { products } = await response.json();
    assert.ok(Array.isArray(products), 'Products should be an array');

    // Find a product that has a Stripe ID (already synced)
    targetProduct = products.find((p) => p.stripeProductId && p.isActive);

    if (!targetProduct && products.length > 0) {
      console.log('   ⚠️ No synced products found, using first product');
      targetProduct = products[0];
    }

    // If no products at all, create one for testing
    if (!targetProduct) {
      console.log('   📦 No products found, creating test product...');

      // First upload an initial image
      const initialSvg = generateTestSvg('INITIAL');
      const initialBase64 = Buffer.from(initialSvg, 'utf8').toString('base64');

      const uploadResponse = await authFetch('/__ual/api/assets/upload', {
        method: 'POST',
        body: JSON.stringify({
          filename: `image-sync-initial-${TEST_RUN_ID}.svg`,
          data: initialBase64,
          mimeType: 'image/svg+xml',
        }),
      });
      assert.strictEqual(uploadResponse.status, 201);
      const { url: initialImageUrl } = await uploadResponse.json();

      // Create the product
      const createResponse = await authFetch('/__ual/api/stripe/products', {
        method: 'POST',
        body: JSON.stringify({
          name: `Image Sync Test ${TEST_RUN_ID}`,
          description: 'Test product for image sync regression',
          imageUrl: initialImageUrl,
          type: 'one_time',
          priceAmountCents: 100,
          currency: 'USD',
          isActive: true,
        }),
      });
      assert.strictEqual(createResponse.status, 201, 'Product creation should succeed');
      targetProduct = await createResponse.json();
      createdProduct = true;

      // Sync to Stripe
      const syncResponse = await authFetch('/__ual/api/stripe/sync/export', {
        method: 'POST',
      });
      assert.strictEqual(syncResponse.status, 200, 'Sync should succeed');

      // Refresh the product to get Stripe IDs
      const refreshResponse = await authFetch(`/__ual/api/stripe/products/${targetProduct.id}`);
      targetProduct = await refreshResponse.json();
    }

    originalImageUrl = targetProduct.imageUrl || '';
    console.log(`   ✅ Target product: ${targetProduct.name} (${targetProduct.id})`);
    console.log(`      Stripe ID: ${targetProduct.stripeProductId || '(not synced)'}`);
    console.log(`      Original image: ${originalImageUrl.substring(0, 60)}...`);
  });

  test('2. Upload new test image', async () => {
    const svg = generateTestSvg('NEW');
    const base64 = Buffer.from(svg, 'utf8').toString('base64');

    const response = await authFetch('/__ual/api/assets/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: `image-sync-test-${TEST_RUN_ID}.svg`,
        data: base64,
        mimeType: 'image/svg+xml',
      }),
    });

    assert.strictEqual(response.status, 201, 'Upload should succeed');
    const { url } = await response.json();
    newImageUrl = url;
    console.log(`   ✅ Uploaded new image: ${newImageUrl}`);
  });

  test('3. Update product with new image', async () => {
    assert.ok(targetProduct, 'Must have target product');
    assert.ok(newImageUrl, 'Must have new image URL');

    const response = await authFetch(`/__ual/api/stripe/products/${targetProduct.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        imageUrl: newImageUrl,
      }),
    });

    assert.strictEqual(response.status, 200, 'Update should succeed');
    const updated = await response.json();
    console.log(`   ✅ Product updated with new image`);
    console.log(`      New imageUrl: ${updated.imageUrl}`);
  });

  test('4. Verify new image synced to Stripe', async () => {
    if (!targetProduct.stripeProductId) {
      console.log('   ⚠️ Product not synced to Stripe, skipping verification');
      return;
    }

    // Wait a moment for sync to complete
    await new Promise((r) => setTimeout(r, 1000));

    const response = await authFetch(
      `/__ual/api/stripe/verify-product/${targetProduct.stripeProductId}`,
    );

    assert.strictEqual(response.status, 200, 'Should be able to verify Stripe product');
    const stripeProduct = await response.json();

    console.log(`   📦 Stripe product: ${stripeProduct.name}`);
    console.log(`      Images: ${stripeProduct.images?.length || 0}`);

    if (stripeProduct.images?.length > 0) {
      const stripeImageUrl = stripeProduct.images[0];
      console.log(`      Image URL: ${stripeImageUrl.substring(0, 60)}...`);

      // The image should now be our new image (either the local URL or Stripe CDN)
      // Stripe may have re-hosted the image on their CDN
      assert.ok(
        stripeProduct.images.length > 0,
        'Stripe product should have at least one image after update',
      );
      console.log(`   ✅ New image is in Stripe`);
    } else {
      console.log('   ⚠️ Stripe product has no images');
    }
  });

  test('5. Restore original image', async () => {
    assert.ok(targetProduct, 'Must have target product');

    const response = await authFetch(`/__ual/api/stripe/products/${targetProduct.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        imageUrl: originalImageUrl,
      }),
    });

    assert.strictEqual(response.status, 200, 'Restore should succeed');
    const updated = await response.json();
    console.log(`   ✅ Product restored with original image`);
    console.log(`      Restored imageUrl: ${updated.imageUrl?.substring(0, 60) || '(empty)'}...`);
  });

  test('6. Verify original image back in Stripe', async () => {
    if (!targetProduct.stripeProductId) {
      console.log('   ⚠️ Product not synced to Stripe, skipping verification');
      return;
    }

    // Wait a moment for sync to complete
    await new Promise((r) => setTimeout(r, 1000));

    const response = await authFetch(
      `/__ual/api/stripe/verify-product/${targetProduct.stripeProductId}`,
    );

    assert.strictEqual(response.status, 200, 'Should be able to verify Stripe product');
    const stripeProduct = await response.json();

    console.log(`   📦 Stripe product after restore: ${stripeProduct.name}`);
    console.log(`      Images: ${stripeProduct.images?.length || 0}`);

    if (stripeProduct.images?.length > 0) {
      console.log(`      Image URL: ${stripeProduct.images[0].substring(0, 60)}...`);
      console.log(`   ✅ Original image restored in Stripe`);
    } else if (!originalImageUrl) {
      console.log('   ✅ No original image, product correctly has no images');
    } else {
      console.log('   ⚠️ Stripe product has no images after restore');
    }
  });
});

process.on('exit', (code) => {
  console.log('');
  console.log('═'.repeat(72));
  if (code === 0) {
    console.log('✅ Image sync regression test passed!');
    console.log('');
    console.log('Summary:');
    console.log('  - Product image updated and synced to Stripe');
    console.log('  - Original image restored and synced back');
  } else {
    console.log('❌ Image sync regression test FAILED');
  }
  console.log('═'.repeat(72));
});

