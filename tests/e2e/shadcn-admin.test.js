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

  it('should load the content studio with page sidebar', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);
    const sidebar = await driver.findElement(By.css('[data-testid="page-sidebar"]'));
    assert.ok(sidebar, 'Page sidebar should be visible');
  });

  it('should add a new section via the picker', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Navigate to Sections tab
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(300);

    await driver.wait(until.elementLocated(By.css('[data-testid="section-list"]')), 10000);
    const initialSections = await driver.findElements(By.css('[data-testid="section-list"] .rounded-3xl'));
    const picker = await driver.findElement(By.css('[data-testid="section-picker"]'));
    await picker.click();
    await driver.sleep(200);
    await driver.findElement(By.css('[data-testid="add-section-button"]')).click();
    await driver.sleep(500);
    const updatedSections = await driver.findElements(By.css('[data-testid="section-list"] .rounded-3xl'));
    assert.ok(updatedSections.length >= initialSections.length + 1, 'Section count should increase after adding');
  });

  it('should mark the editor dirty after editing a field', async () => {
    await driver.get(`${baseUrl}/admin`);

    // Navigate to Site settings
    const siteNav = await driver.wait(until.elementLocated(By.css('[data-testid="nav-site"]')), 10000);
    await siteNav.click();
    await driver.sleep(300);

    await driver.wait(until.elementLocated(By.css('[data-testid="site-panel"] input')), 10000);
    const siteTitleInput = await driver.findElement(By.css('[data-testid="site-panel"] input'));
    await siteTitleInput.clear();
    await siteTitleInput.sendKeys('Automated Test Title');
    await driver.sleep(200);
    const saveButton = await driver.findElement(By.css('[data-testid="save-button"]'));
    const saveLabel = await saveButton.getText();
    assert.ok(/save/i.test(saveLabel), 'Save button should indicate dirty state');
  });

  it('should switch preview paths', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="preview-path-select"]')), 10000);
    const select = await driver.findElement(By.css('[data-testid="preview-path-select"]'));
    const options = await select.findElements(By.css('option'));
    if (options.length > 1) {
      await select.sendKeys(options[options.length - 1].getText());
    }
    assert.ok(options.length > 0, 'Preview paths should be available');
  });

  it('should save changes successfully', async () => {
    await driver.get(`${baseUrl}/admin`);

    // Navigate to Site settings
    const siteNav = await driver.wait(until.elementLocated(By.css('[data-testid="nav-site"]')), 10000);
    await siteNav.click();
    await driver.sleep(300);

    await driver.wait(until.elementLocated(By.css('[data-testid="site-panel"] input')), 10000);
    const input = await driver.findElement(By.css('[data-testid="site-panel"] input'));
    await input.clear();
    await input.sendKeys('CMS Save Smoke');
    const saveButton = await driver.findElement(By.css('[data-testid="save-button"]'));
    await driver.wait(async () => !(await saveButton.getAttribute('disabled')), 2000);
    await driver.executeScript('arguments[0].click();', saveButton);
    await driver.wait(
      until.elementLocated(By.xpath("//*[contains(text(), 'Preview updated') or contains(text(), 'Saving')]")),
      10000
    );
  });
});

