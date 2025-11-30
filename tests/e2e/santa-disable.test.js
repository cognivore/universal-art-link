/**
 * Security regression test ensuring Santa bypass can be disabled on production.
 *
 * Requires:
 * - UAL_PRODUCTION_URL
 * - UAL_STAGING_JWT (shared Santa token)
 *
 * Example:
 * UAL_PRODUCTION_URL=https://prod.example.com \
 * UAL_STAGING_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
 *   node tests/e2e/santa-disable.test.js
 */

import assert from 'node:assert';
import { describe, test } from 'node:test';

const PRODUCTION_URL = process.env.UAL_PRODUCTION_URL;
const SANTA_JWT = process.env.UAL_STAGING_JWT;

if (!PRODUCTION_URL) {
  console.error('ERROR: UAL_PRODUCTION_URL environment variable is required');
  process.exit(1);
}

if (!SANTA_JWT) {
  console.error('ERROR: UAL_STAGING_JWT environment variable is required');
  process.exit(1);
}

const createAuthedFetch = (baseUrl) => async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `ual_session=${SANTA_JWT}`,
    ...options.headers,
  };
  return fetch(`${baseUrl}${path}`, { ...options, headers });
};

const readJson = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error ?? body.message ?? response.statusText;
    throw new Error(message);
  }
  return body;
};

const productionFetch = createAuthedFetch(PRODUCTION_URL);

describe('Production Santa bypass guard', () => {
  test('disabling Santa bypass blocks Santa JWT access', async () => {
    // Step 1: Verify Santa JWT works initially
    const sessionBefore = await readJson(await productionFetch('/__ual/auth/session'));
    assert.strictEqual(sessionBefore.authenticated, true, 'Santa JWT should authenticate before disabling');
    assert.strictEqual(sessionBefore.isSanta, true, 'Session must be Santa-authenticated');
    console.log('   ✅ Santa JWT authentication working');

    // Step 2: Check bypass is enabled
    const originalState = await readJson(
      await productionFetch('/__ual/api/admin/settings/staging-bypass'),
    );
    assert.strictEqual(
      originalState.enabled,
      true,
      'Santa bypass must be enabled before running this test',
    );
    console.log('   ✅ Santa bypass is enabled');

    // Step 3: Disable Santa bypass
    const disableResult = await readJson(
      await productionFetch('/__ual/api/admin/settings/staging-bypass', {
        method: 'POST',
        body: JSON.stringify({ enabled: false }),
      }),
    );
    assert.strictEqual(disableResult.enabled, false, 'Bypass should be disabled');
    console.log('   ✅ Santa bypass disabled successfully');

    // Step 4: Verify Santa JWT is now rejected
    const sessionAfterDisable = await readJson(await productionFetch('/__ual/auth/session'));
    assert.strictEqual(
      sessionAfterDisable.authenticated,
      false,
      'Santa JWT should be rejected when bypass is disabled',
    );
    console.log('   ✅ Santa JWT correctly rejected after disable');

    // Step 5: Try to re-enable bypass - this proves the security is working
    // Since Santa JWT is blocked, we can't use it to re-enable.
    // We'll try anyway and expect it to fail.
    const reEnableResponse = await productionFetch('/__ual/api/admin/settings/staging-bypass', {
      method: 'POST',
      body: JSON.stringify({ enabled: true }),
    });

    // The re-enable should fail with 401 or 403 (Santa JWT blocked)
    assert.ok(
      reEnableResponse.status === 401 || reEnableResponse.status === 403,
      `Re-enable should fail when Santa is blocked (got ${reEnableResponse.status})`,
    );
    console.log('   ✅ Cannot re-enable bypass with blocked Santa JWT (security working)');

    // Step 6: The server needs a restart to reset bypass.
    // This is intentional - if Santa bypass is disabled, you need server access to re-enable.
    console.log('');
    console.log('   ⚠️  NOTE: Santa bypass is now DISABLED on production.');
    console.log('   ⚠️  Re-run deploy/install-ual.ysh to restore it.');
  });
});


