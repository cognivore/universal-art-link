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
    const sessionBefore = await readJson(await productionFetch('/__ual/auth/session'));
    assert.strictEqual(sessionBefore.authenticated, true, 'Santa JWT should authenticate before disabling');
    assert.strictEqual(sessionBefore.isSanta, true, 'Session must be Santa-authenticated');

    const originalState = await readJson(
      await productionFetch('/__ual/api/admin/settings/staging-bypass'),
    );
    assert.strictEqual(
      originalState.enabled,
      true,
      'Santa bypass must be enabled before running this test',
    );

    try {
      await readJson(
        await productionFetch('/__ual/api/admin/settings/staging-bypass', {
          method: 'POST',
          body: JSON.stringify({ enabled: false }),
        }),
      );

      const sessionAfterDisable = await readJson(await productionFetch('/__ual/auth/session'));
      assert.strictEqual(
        sessionAfterDisable.authenticated,
        false,
        'Santa JWT should be rejected when bypass is disabled',
      );
    } finally {
      await readJson(
        await productionFetch('/__ual/api/admin/settings/staging-bypass', {
          method: 'POST',
          body: JSON.stringify({ enabled: true }),
        }),
      );
    }

    const sessionAfterRestore = await readJson(await productionFetch('/__ual/auth/session'));
    assert.strictEqual(sessionAfterRestore.authenticated, true, 'Santa JWT should work after restore');
  });
});


