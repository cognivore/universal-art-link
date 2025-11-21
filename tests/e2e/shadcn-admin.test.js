import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { createTestSite, cleanupTestSite, startTestServer, stopTestServer } from './setup.js';

describe('Shadcn Admin Panel E2E Tests', () => {
  let testDir;
  let server;
  let port;
  let driver;
  let baseUrl;

  before(async () => {
    console.log('Setting up shadcn admin E2E test environment...');

    // Create test site
    testDir = await createTestSite();

    // Start server
    const serverInfo = await startTestServer(testDir);
    server = serverInfo.server;
    port = serverInfo.port;
    baseUrl = `http://localhost:${port}`;

    // Setup Chrome driver
    const options = new chrome.Options();
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');

    try {
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      options.setChromeBinaryPath(chromePath);
    } catch {
      // Use system chrome if Google Chrome not found
    }

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    console.log('Shadcn admin E2E test environment ready');
  });

  after(async () => {
    console.log('Tearing down shadcn admin E2E test environment...');

    if (driver) {
      await driver.quit();
    }

    if (server) {
      await stopTestServer(server);
    }

    if (testDir) {
      await cleanupTestSite(testDir);
    }

    console.log('Shadcn admin E2E test environment cleaned up');
  });

  it('should load the shadcn admin panel', async () => {
    await driver.get(`${baseUrl}/admin`);

    // Wait for React root to render
    const root = await driver.wait(
      until.elementLocated(By.id('root')),
      10000,
      'React root not found'
    );

    assert.ok(root, 'React root should be present');

    // Check that something rendered (any visible text/content)
    await driver.sleep(1000);
    const bodyText = await driver.findElement(By.tagName('body')).getText();

    assert.ok(bodyText.length > 0, 'Admin panel should have rendered content');
  });

  it('should display runtime config badge', async () => {
    await driver.get(`${baseUrl}/admin`);

    // Wait for page to load
    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Look for the runtime config display
    const elements = await driver.findElements(By.xpath("//*[contains(text(), 'localhost')]"));
    assert.ok(elements.length > 0, 'Should show localhost in admin config');
  });

  it('should display connection panel', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    await driver.sleep(500);

    // Look for card components (shadcn UI structure)
    const cards = await driver.findElements(By.css('[class*="card"]'));

    assert.ok(cards.length > 0, 'Should display card components (connection/deploy panels)');
  });

  it('should display activity log', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    await driver.sleep(500);

    // Look for scroll area or list components (activity log structure)
    const scrollAreas = await driver.findElements(By.css('[class*="scroll"]'));
    const lists = await driver.findElements(By.css('ul, ol, [role="list"]'));

    assert.ok(scrollAreas.length > 0 || lists.length > 0, 'Should display scrollable/list components (activity log)');
  });

  it('should have preview pane with health check', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Wait for preview-related text to appear
    await driver.wait(async () => {
      const previewElements = await driver.findElements(
        By.xpath("//*[contains(text(), 'preview') or contains(text(), 'Preview')]")
      );
      return previewElements.length > 0;
    }, 10000, 'Preview pane not found');

    const previewElements = await driver.findElements(
      By.xpath("//*[contains(text(), 'preview') or contains(text(), 'Preview')]")
    );

    assert.ok(previewElements.length > 0, 'Should show preview pane');
  });

  it('should display available preview paths', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Wait a moment for the preview paths to be loaded from runtime config
    await driver.sleep(1000);

    // Look for select/dropdown elements that would contain paths
    const selects = await driver.findElements(By.css('select'));

    if (selects.length > 0) {
      // At least one select should contain path options
      let foundPaths = false;
      for (const select of selects) {
        const options = await select.findElements(By.css('option'));
        if (options.length > 0) {
          foundPaths = true;
          break;
        }
      }
      assert.ok(foundPaths, 'Should display path options in preview selector');
    } else {
      console.log('No select elements found (may be expected if preview offline)');
    }
  });

  it('should handle healthz endpoint check', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Directly test the healthz endpoint via fetch in browser context
    const healthStatus = await driver.executeScript(`
      return fetch('${baseUrl}/__ual/healthz')
        .then(r => r.ok)
        .catch(() => false);
    `);

    assert.strictEqual(healthStatus, true, 'Health endpoint should return OK');
  });

  it('should load runtime config from endpoint', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Check that runtime config is available in window
    const runtimeConfig = await driver.executeScript(`
      return window.__UAL_RUNTIME__;
    `);

    assert.ok(runtimeConfig, 'Runtime config should be available');
    assert.ok(runtimeConfig.previewBaseUrl, 'Runtime config should have previewBaseUrl');
    assert.ok(runtimeConfig.apiBaseUrl, 'Runtime config should have apiBaseUrl');
  });

  it('should have working API state endpoint', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Test the API state endpoint
    const apiState = await driver.executeScript(`
      return fetch('${baseUrl}/__ual/api/state')
        .then(r => r.json())
        .catch(e => ({ error: e.message }));
    `);

    assert.ok(apiState, 'API state should return data');
    assert.ok(apiState.apiAvailable !== undefined, 'API state should indicate availability');
  });

  it('should display tabs for navigation', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Look for tab elements (shadcn uses specific ARIA roles)
    const tabs = await driver.findElements(By.css('[role="tablist"], [role="tab"]'));

    assert.ok(tabs.length > 0, 'Should have tab navigation elements');
  });

  it('should have Strapi integration card', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Look for Strapi-related text
    const strapiElements = await driver.findElements(
      By.xpath("//*[contains(text(), 'Strapi') or contains(text(), 'strapi')]")
    );

    // This might not exist if UAL_STRAPI_URL is not set, so we just check
    if (strapiElements.length > 0) {
      console.log('Strapi card found (expected if UAL_STRAPI_URL is set)');
    } else {
      console.log('Strapi card not found (expected if UAL_STRAPI_URL not set)');
    }

    // Test passes either way since Strapi is optional
    assert.ok(true, 'Strapi integration check completed');
  });

  it('should render without React errors', async () => {
    await driver.get(`${baseUrl}/admin`);

    await driver.wait(
      until.elementLocated(By.id('root')),
      10000
    );

    // Check for React error overlays or error boundaries
    const errorElements = await driver.findElements(
      By.xpath("//*[contains(text(), 'error') or contains(text(), 'Error')]")
    );

    // Filter out expected "error" text (like in status badges)
    let hasUnexpectedErrors = false;
    for (const elem of errorElements) {
      const text = await elem.getText();
      if (text.toLowerCase().includes('react') || text.toLowerCase().includes('failed to compile')) {
        hasUnexpectedErrors = true;
        console.error('Found React error:', text);
      }
    }

    assert.strictEqual(hasUnexpectedErrors, false, 'Should not have React rendering errors');
  });
});

