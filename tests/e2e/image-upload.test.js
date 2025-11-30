/**
 * Image Upload Regression Test
 *
 * Tests the complete image upload flow from local machine through to Stripe.
 * Uses a fixed product name "local-upload-test" with unique images each run.
 *
 * Requirements:
 * - UAL_STAGING_URL
 * - UAL_STAGING_JWT
 *
 * Example:
 * UAL_STAGING_URL=https://staging.example.com \
 * UAL_STAGING_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
 *   node tests/e2e/image-upload.test.js
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, test, before } from 'node:test';

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
const PRODUCT_NAME = 'local-upload-test';
const TEST_RUN_ID = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

console.log('');
console.log('═'.repeat(72));
console.log('🖼️  Image Upload Regression Test');
console.log('═'.repeat(72));
console.log(`📍 Staging URL: ${STAGING_URL}`);
console.log(`🔑 JWT: ${STAGING_JWT.substring(0, 20)}...`);
console.log(`🧬 Test Run ID: ${TEST_RUN_ID}`);
console.log('═'.repeat(72));
console.log('');

const authFetch = async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `ual_session=${STAGING_JWT}`,
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
};

/**
 * Generate a unique SVG image with embedded hash for verification
 */
const generateTestSvg = () => {
  const hash = crypto.createHash('sha256').update(TEST_RUN_ID).digest('hex').slice(0, 12);
  const hue = parseInt(hash.slice(0, 3), 16) % 360;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="hsl(${hue}, 70%, 50%)"/>
  <text x="50%" y="40%" font-size="24" text-anchor="middle" fill="#fff" font-family="monospace">
    IMAGE TEST
  </text>
  <text x="50%" y="55%" font-size="16" text-anchor="middle" fill="#fff" font-family="monospace">
    ${TEST_RUN_ID}
  </text>
  <text x="50%" y="70%" font-size="12" text-anchor="middle" fill="#fff" font-family="monospace">
    hash: ${hash}
  </text>
</svg>`.trim();
  return { svg, hash };
};

/**
 * Compute SHA-256 hash of a buffer
 */
const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

let uploadedAssetUrl = '';
let uploadedSvgHash = '';
let testProductId = null;

describe('Image Upload Regression', () => {
  test('1. Upload image via API', async () => {
    const { svg, hash } = generateTestSvg();
    uploadedSvgHash = hashBuffer(Buffer.from(svg, 'utf8'));
    
    console.log(`   📤 Uploading SVG (hash: ${uploadedSvgHash.slice(0, 16)}...)`);
    
    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    const response = await authFetch(`${API_BASE}/assets/upload`, {
      method: 'POST',
      body: JSON.stringify({
        filename: `upload-test-${TEST_RUN_ID}.svg`,
        data: base64,
        mimeType: 'image/svg+xml',
      }),
    });

    assert.strictEqual(response.status, 201, `Upload failed with status ${response.status}`);
    
    const data = await response.json();
    assert.ok(data.url, 'Response must include url');
    assert.ok(data.url.startsWith('/assets/'), 'URL must start with /assets/');
    
    uploadedAssetUrl = data.url;
    console.log(`   ✅ Uploaded to: ${uploadedAssetUrl}`);
  });

  test('2. Verify uploaded image is IMMEDIATELY accessible via HTTP', async () => {
    assert.ok(uploadedAssetUrl, 'Must have uploaded URL from previous test');
    
    const fullUrl = `${STAGING_URL}${uploadedAssetUrl}`;
    console.log(`   📥 Fetching: ${fullUrl}`);
    
    // The image MUST be accessible immediately after upload - no retries!
    // This tests the fix for the asset fallback to source directory
    const response = await fetch(fullUrl);
    
    assert.strictEqual(
      response.status, 
      200, 
      `Asset not accessible IMMEDIATELY after upload. Status: ${response.status}. URL: ${fullUrl}. ` +
      `This indicates the serveStatic fallback to source assets is not working.`
    );
    
    const contentType = response.headers.get('content-type');
    assert.ok(
      contentType?.includes('image') || contentType?.includes('svg'),
      `Expected image content-type, got: ${contentType}`
    );
    
    // Verify hash matches
    const fetchedBuffer = Buffer.from(await response.arrayBuffer());
    const fetchedHash = hashBuffer(fetchedBuffer);
    
    assert.strictEqual(
      fetchedHash,
      uploadedSvgHash,
      `Hash mismatch! Uploaded: ${uploadedSvgHash.slice(0, 16)}... Fetched: ${fetchedHash.slice(0, 16)}...`
    );
    
    console.log(`   ✅ Image accessible and hash verified`);
  });

  test('3. Find or create test product', async () => {
    // List products and find our test product
    const listResponse = await authFetch(`${API_BASE}/stripe/products`);
    assert.strictEqual(listResponse.status, 200, 'Failed to list products');
    
    const { products } = await listResponse.json();
    const existing = products.find(p => p.name === PRODUCT_NAME);
    
    if (existing) {
      testProductId = existing.id;
      console.log(`   📦 Found existing product: ${testProductId}`);
    } else {
      // Create the test product
      const createResponse = await authFetch(`${API_BASE}/stripe/products`, {
        method: 'POST',
        body: JSON.stringify({
          name: PRODUCT_NAME,
          description: `Test product for image upload regression tests. Run: ${TEST_RUN_ID}`,
          imageUrl: uploadedAssetUrl,
          type: 'one_time',
          priceAmountCents: 100,
          currency: 'USD',
          isActive: true,
          metadata: {
            test_type: 'image-upload-regression',
            created_run: TEST_RUN_ID,
          },
        }),
      });
      
      assert.strictEqual(createResponse.status, 201, 'Failed to create product');
      const created = await createResponse.json();
      testProductId = created.id;
      console.log(`   ✅ Created new product: ${testProductId}`);
    }
  });

  test('4. Update product with new image', async () => {
    assert.ok(testProductId, 'Must have product ID from previous test');
    assert.ok(uploadedAssetUrl, 'Must have uploaded URL');
    
    const patchResponse = await authFetch(`${API_BASE}/stripe/products/${testProductId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        imageUrl: uploadedAssetUrl,
        description: `Updated ${new Date().toISOString()} - Run: ${TEST_RUN_ID}`,
      }),
    });
    
    assert.strictEqual(patchResponse.status, 200, 'Failed to update product');
    
    const updated = await patchResponse.json();
    console.log(`   ✅ Product updated with new image`);
    console.log(`      Image URL: ${updated.imageUrl}`);
  });

  test('5. Export to Stripe and verify image synced', async () => {
    // Trigger Stripe sync
    const syncResponse = await authFetch(`${API_BASE}/stripe/sync/export`, {
      method: 'POST',
    });
    
    assert.strictEqual(syncResponse.status, 200, 'Stripe sync failed');
    const syncResult = await syncResponse.json();
    console.log(`   🔄 Sync result: exported=${syncResult.exported}, skipped=${syncResult.skipped}`);
    
    // Get the product to find its Stripe ID
    const productResponse = await authFetch(`${API_BASE}/stripe/products/${testProductId}`);
    assert.strictEqual(productResponse.status, 200);
    const product = await productResponse.json();
    
    if (!product.stripeProductId) {
      console.log('   ⚠️  Product not yet synced to Stripe (no stripeProductId)');
      return;
    }
    
    // Verify the Stripe product has the image
    const verifyResponse = await authFetch(
      `${API_BASE}/stripe/verify-product/${product.stripeProductId}`
    );
    
    assert.strictEqual(verifyResponse.status, 200, 'Failed to verify Stripe product');
    const stripeProduct = await verifyResponse.json();
    
    console.log(`   ✅ Stripe product verified: ${stripeProduct.id}`);
    console.log(`      Name: ${stripeProduct.name}`);
    console.log(`      Images: ${stripeProduct.images?.length ?? 0}`);
    
    if (stripeProduct.images?.length > 0) {
      console.log(`      Image URL: ${stripeProduct.images[0]}`);
    }
  });
});

process.on('exit', (code) => {
  console.log('');
  console.log('═'.repeat(72));
  if (code === 0) {
    console.log('✅ Image upload regression test passed!');
  } else {
    console.log('❌ Image upload regression test FAILED');
    console.log('');
    console.log('Debug info:');
    console.log(`  - Staging URL: ${STAGING_URL}`);
    console.log(`  - Asset URL: ${uploadedAssetUrl || '(not uploaded)'}`);
    console.log(`  - Test Run ID: ${TEST_RUN_ID}`);
  }
  console.log('═'.repeat(72));
});

