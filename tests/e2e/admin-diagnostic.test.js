import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { describe, it, before, after } from 'node:test';
import { createTestSite, cleanupTestSite, startTestServer, stopTestServer } from './setup.js';

describe('Admin Diagnostic Test', () => {
  let testDir;
  let server;
  let port;
  let driver;
  let baseUrl;

  before(async () => {
    console.log('Setting up diagnostic test...');
    testDir = await createTestSite();
    const serverInfo = await startTestServer(testDir);
    server = serverInfo.server;
    port = serverInfo.port;
    baseUrl = `http://localhost:${port}`;

    const options = new chrome.Options();
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--window-size=1920,1080');

    try {
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      options.setChromeBinaryPath(chromePath);
    } catch {
      // Use system chrome
    }

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    console.log('Diagnostic test ready');
  });

  after(async () => {
    if (driver) await driver.quit();
    if (server) await stopTestServer(server);
    if (testDir) await cleanupTestSite(testDir);
  });

  it('should diagnose admin rendering', async () => {
    await driver.get(`${baseUrl}/admin`);

    // Wait for root
    await driver.wait(until.elementLocated(By.id('root')), 10000);
    await driver.sleep(2000);

    // Get all the page info
    const htmlSource = await driver.getPageSource();
    const bodyText = await driver.findElement(By.tagName('body')).getText();
    const rootHTML = await driver.findElement(By.id('root')).getAttribute('innerHTML');

    console.log('\n=== DIAGNOSTIC INFO ===');
    console.log('Body text length:', bodyText.length);
    console.log('Body text preview:', bodyText.substring(0, 200));
    console.log('\nRoot innerHTML length:', rootHTML.length);
    console.log('Root innerHTML preview:', rootHTML.substring(0, 500));

    // Check for script errors
    const logs = await driver.manage().logs().get('browser');
    console.log('\nBrowser console logs:');
    logs.forEach(entry => {
      console.log(`[${entry.level.name}] ${entry.message}`);
    });

    console.log('=== END DIAGNOSTIC ===\n');
  });
});

