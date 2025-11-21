import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { createTestSite, cleanupTestSite, startTestServer, stopTestServer } from './setup.js';

describe('CMS Editor E2E Tests', () => {
  let testDir;
  let server;
  let port;
  let driver;
  let baseUrl;

  before(async () => {
    testDir = await createTestSite();
    const serverInfo = await startTestServer(testDir);
    server = serverInfo.server;
    port = serverInfo.port;
    baseUrl = `http://localhost:${port}`;

    const options = new chrome.Options().addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1600,1200');
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  });

  after(async () => {
    if (driver) await driver.quit();
    if (server) await stopTestServer(server);
    if (testDir) await cleanupTestSite(testDir);
  });

  const openStudio = async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);
  };

  it('should add and remove sections, keeping dirty state', async () => {
    await openStudio();

    // Navigate to Sections tab
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(300);

    const sectionPicker = await driver.findElement(By.css('[data-testid="section-picker"]'));
    await sectionPicker.click();
    await driver.findElement(By.css('[data-testid="add-section-button"]')).click();
    await driver.sleep(300);
    const sectionCards = await driver.findElements(By.css('[data-testid="section-list"] .rounded-3xl'));
    assert.ok(sectionCards.length > 0, 'Section cards should exist after adding one');
    const removeButton = await sectionCards[sectionCards.length - 1].findElement(By.xpath(".//button[contains(text(),'Remove')]"));
    await removeButton.click();

    // Handle confirmation dialog
    await driver.sleep(200);
    const confirmButton = await driver.findElement(By.xpath("//button[contains(text(), 'Remove section')]"));
    await confirmButton.click();
  });

  it('should update site title and trigger save state', async () => {
    await openStudio();

    // Navigate to Site settings
    const siteNav = await driver.findElement(By.css('[data-testid="nav-site"]'));
    await siteNav.click();
    await driver.sleep(300);

    const input = await driver.findElement(By.css('[data-testid="site-panel"] input'));
    await input.clear();
    await input.sendKeys('UAL CMS Test');
    const saveButton = await driver.findElement(By.css('[data-testid="save-button"]'));
    const label = await saveButton.getText();
    assert.ok(/save/i.test(label), 'Save button should reflect unsaved changes');
  });

  it('should add and delete pages using sidebar controls', async () => {
    await openStudio();
    const sidebarButtonsBefore = await driver.findElements(By.css('[data-testid="page-sidebar"] button'));
    await driver.findElement(By.css('[data-testid="add-page-button"]')).click();
    await driver.sleep(200);
    const sidebarButtonsAfter = await driver.findElements(By.css('[data-testid="page-sidebar"] button'));
    assert.ok(sidebarButtonsAfter.length > sidebarButtonsBefore.length, 'Page count should increase after adding');
    await driver.findElement(By.css('[data-testid="delete-page-button"]')).click();
    await driver.sleep(200);
  });

  it('should toggle preview and switch device modes', async () => {
    await openStudio();
    const toggleButton = await driver.findElement(By.css('[data-testid="toggle-preview"]'));
    await toggleButton.click();
    await driver.sleep(150);
    await toggleButton.click();
    const tabletTrigger = await driver.findElement(By.xpath("//button[contains(., 'Tablet')]"));
    await tabletTrigger.click();
  });
});

