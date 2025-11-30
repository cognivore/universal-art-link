/**
 * E2E test covering staging → production promotion workflow.
 *
 * Requirements:
 * - UAL_STAGING_URL (points to staging admin)
 * - UAL_PRODUCTION_URL (points to production admin)
 * - UAL_STAGING_JWT (Santa bypass token shared across envs)
 *
 * Example:
 * UAL_STAGING_URL=https://staging.example.com \
 * UAL_PRODUCTION_URL=https://prod.example.com \
 * UAL_STAGING_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
 *   node tests/e2e/promotion.test.js
 */

import assert from 'node:assert';
import { describe, test, before, after } from 'node:test';

const STAGING_URL = process.env.UAL_STAGING_URL;
const PRODUCTION_URL = process.env.UAL_PRODUCTION_URL;
const SANTA_JWT = process.env.UAL_STAGING_JWT;

if (!STAGING_URL) {
  console.error('ERROR: UAL_STAGING_URL environment variable is required');
  process.exit(1);
}

if (!PRODUCTION_URL) {
  console.error('ERROR: UAL_PRODUCTION_URL environment variable is required');
  process.exit(1);
}

if (!SANTA_JWT) {
  console.error('ERROR: UAL_STAGING_JWT environment variable is required');
  process.exit(1);
}

const STAGING_API_BASE = `${STAGING_URL}/__ual/api`;
const STAGING_AUTH_BASE = `${STAGING_URL}/__ual/auth`;
const PRODUCTION_API_BASE = `${PRODUCTION_URL}/__ual/api`;
const PRODUCTION_AUTH_BASE = `${PRODUCTION_URL}/__ual/auth`;

const MARKER_FIELD = '__promotionTestMarker';
const TEST_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const MARKER_VALUE = `promotion-e2e-${TEST_RUN_ID}`;
const SVG_TEMPLATE = (label) => `
<svg width="320" height="320" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" rx="20" fill="#b91c1c"/>
  <text x="50%" y="50%" font-size="24" text-anchor="middle" alignment-baseline="central" fill="#fff" font-family="monospace">
    ${label}
  </text>
</svg>
`.trim();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Find or create the home page data node.
 * Content pages are stored as an array: [{ file: "home.yaml", data: {...} }, ...]
 */
const ensureHomeNode = (content) => {
  if (!content.pages) {
    content.pages = [];
  }
  let homePage = content.pages.find((p) => p.file === 'home.yaml');
  if (!homePage) {
    homePage = { file: 'home.yaml', data: {} };
    content.pages.push(homePage);
  }
  if (!homePage.data) {
    homePage.data = {};
  }
  return homePage.data;
};

/**
 * Get the home page data from a content snapshot (read-only).
 */
const getHomeData = (content) => {
  const homePage = (content?.pages ?? []).find((p) => p.file === 'home.yaml');
  return homePage?.data ?? {};
};

const cloneContent = (content) => JSON.parse(JSON.stringify(content ?? {}));

const stagingApiFetch = createAuthedFetch(STAGING_API_BASE);
const stagingAuthFetch = createAuthedFetch(STAGING_AUTH_BASE);
const productionApiFetch = createAuthedFetch(PRODUCTION_API_BASE);
const productionAuthFetch = createAuthedFetch(PRODUCTION_AUTH_BASE);

let originalStagingMarker;
let originalProductionMarker;
let uploadedAssetPath = '';

before(async () => {
  const stagingSnapshot = await readJson(await stagingApiFetch('/content'));
  originalStagingMarker = getHomeData(stagingSnapshot.content)[MARKER_FIELD];

  const productionSnapshot = await readJson(await productionApiFetch('/content'));
  originalProductionMarker = getHomeData(productionSnapshot.content)[MARKER_FIELD];
});

const restoreMarker = async (apiFetch, value) => {
  try {
    const snapshot = await readJson(await apiFetch('/content'));
    const content = cloneContent(snapshot.content);
    const homeData = ensureHomeNode(content);
    if (value === undefined) {
      delete homeData[MARKER_FIELD];
    } else {
      homeData[MARKER_FIELD] = value;
    }
    await readJson(await apiFetch('/content', {
      method: 'POST',
      body: JSON.stringify(content),
    }));
  } catch (error) {
    console.error('⚠️  Failed to restore promotion marker:', error.message);
  }
};

after(async () => {
  await restoreMarker(stagingApiFetch, originalStagingMarker);
  await restoreMarker(productionApiFetch, originalProductionMarker);
});

describe('Staging → Production Promotion Flow', () => {
  test('Santa authentication works on staging and production', async () => {
    const stagingSession = await readJson(await stagingAuthFetch('/session'));
    assert.strictEqual(stagingSession.authenticated, true);
    assert.strictEqual(stagingSession.isSanta, true);

    const productionSession = await readJson(await productionAuthFetch('/session'));
    assert.strictEqual(productionSession.authenticated, true);
    assert.strictEqual(productionSession.isSanta, true);
  });

  test('prepare staging marker and asset', async () => {
    const stagingSnapshot = await readJson(await stagingApiFetch('/content'));
    const updatedContent = cloneContent(stagingSnapshot.content);
    const homeData = ensureHomeNode(updatedContent);
    homeData[MARKER_FIELD] = MARKER_VALUE;

    await readJson(await stagingApiFetch('/content', {
      method: 'POST',
      body: JSON.stringify(updatedContent),
    }));

    const svg = SVG_TEMPLATE(`PROMO-${TEST_RUN_ID}`);
    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    const assetResponse = await readJson(await stagingApiFetch('/assets/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: `promotion-${TEST_RUN_ID}.svg`,
        data: base64,
        mimeType: 'image/svg+xml',
      }),
    }));

    assert.ok(assetResponse.url.startsWith('/assets/'));
    uploadedAssetPath = assetResponse.url;
  });

  test('promotion environment is ready', async () => {
    const check = await readJson(await stagingApiFetch('/admin/promote/check'));
    assert.strictEqual(check.valid, true, `Promotion environment invalid: ${check.message}`);
  });

  test('run staging → production promotion', { timeout: 5 * 60 * 1000 }, async () => {
    const result = await readJson(await stagingApiFetch('/admin/promote', {
      method: 'POST',
    }));

    assert.strictEqual(result.success, true, 'Promotion did not succeed');
    const contentStep = result.steps.find((step) => step.step === 'content');
    const assetStep = result.steps.find((step) => step.step === 'assets');
    assert.ok(contentStep?.success, `Content promotion failed: ${contentStep?.message}`);
    assert.ok(assetStep?.success, `Asset promotion failed: ${assetStep?.message}`);
  });

  test('production content reflects promoted marker', async () => {
    let productionValue = null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const snapshot = await readJson(await productionApiFetch('/content'));
      productionValue = getHomeData(snapshot.content)[MARKER_FIELD];
      if (productionValue === MARKER_VALUE) {
        break;
      }
      await wait(2000);
    }

    assert.strictEqual(productionValue, MARKER_VALUE, 'Production content did not receive promoted marker');
  });

  test('uploaded asset is available on production', async () => {
    assert.ok(uploadedAssetPath, 'No asset uploaded during preparation step');
    const productionAssetUrl = `${PRODUCTION_URL}${uploadedAssetPath}`;

    let assetAvailable = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(productionAssetUrl);
      if (response.ok) {
        assetAvailable = true;
        break;
      }
      await wait(2000);
    }

    assert.ok(assetAvailable, `Asset ${uploadedAssetPath} not found on production`);
  });
});


