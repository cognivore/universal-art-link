import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { createTestSite, cleanupTestSite, startTestServer, stopTestServer } from './setup.js';

describe('Blog CMS E2E Tests', () => {
  let testDir;
  let server;
  let port;
  let driver;
  let baseUrl;

  before(async () => {
    console.log('Setting up blog CMS E2E test environment...');

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

    console.log('Blog CMS E2E test environment ready');
  });

  after(async () => {
    console.log('Tearing down blog CMS E2E test environment...');

    if (driver) {
      await driver.quit();
    }

    if (server) {
      await stopTestServer(server);
    }

    if (testDir) {
      await cleanupTestSite(testDir);
    }

    console.log('Blog CMS E2E test environment cleaned up');
  });

  it('should load journal page with blog-roll section', async () => {
    await driver.get(`${baseUrl}/admin`);

    // Check for console errors
    const logs = await driver.manage().logs().get('browser');
    if (logs.length > 0) {
      console.log('Browser console logs:', logs.map(log => `${log.level}: ${log.message}`).join('\n'));
    }

    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Find and click Journal page in sidebar
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Navigate to Sections tab
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(300);

    // Verify blog-roll section exists
    const sectionList = await driver.wait(until.elementLocated(By.css('[data-testid="section-list"]')), 10000);
    const sectionTypes = await sectionList.findElements(By.css('.text-xs.uppercase'));
    const sectionTexts = await Promise.all(sectionTypes.map(el => el.getText()));

    assert.ok(
      sectionTexts.some(text => text.toLowerCase().includes('blog-roll')),
      'Should have blog-roll section on journal page'
    );
  });

  it('should show Edit post tab when journal page is selected', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Click Journal page
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Check for Edit post tab
    const postTab = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(text(), 'Edit post')]")),
      10000
    );
    assert.ok(postTab, 'Edit post tab should be visible on journal page');
  });

  it('should display existing blog posts in blog-roll section', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Navigate to journal page
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Click Sections tab
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(500);

    // Verify post list exists in blog-roll section
    const postList = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-list"]')),
      10000
    );
    const postItems = await postList.findElements(By.css('button'));
    assert.ok(postItems.length > 0, 'Should have at least one blog post in blog-roll');
  });

  it('should allow selecting and editing a blog post', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Navigate to journal
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Go to Sections tab to find blog-roll
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(500);

    // Click first post in blog-roll to select it
    const postList = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-list"]')),
      10000
    );
    const firstPost = await postList.findElement(By.css('button'));
    await firstPost.click();
    await driver.sleep(500);

    // Switch to Edit post tab
    const postTab = await driver.findElement(By.xpath("//button[contains(text(), 'Edit post')]"));
    await postTab.click();
    await driver.sleep(500);

    // Verify editor is visible
    const postEditor = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-editor"]')),
      10000
    );
    assert.ok(postEditor, 'Post editor should be visible after selecting a post');

    // Check for title input
    const titleInput = await postEditor.findElement(By.css('input[type="text"]'));
    const titleValue = await titleInput.getAttribute('value');
    assert.ok(titleValue.length > 0, 'Post should have a title');
  });

  it('should allow adding a new blog post', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Navigate to journal
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Go to Sections tab
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(500);

    // Count initial posts in blog-roll
    const postList = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-list"]')),
      10000
    );
    const initialPosts = await postList.findElements(By.css('button'));
    const initialCount = initialPosts.length;

    // Click Add post button (in page header area)
    const addPostButton = await driver.findElement(By.css('[data-testid="add-post-button"]'));
    await addPostButton.click();
    await driver.sleep(1000);

    // Verify new post was added to the list
    const updatedPosts = await postList.findElements(By.css('button'));
    assert.ok(
      updatedPosts.length >= initialCount + 1,
      'Should have at least one more post after adding'
    );
  });

  it('should show block builder in post editor', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Navigate to journal
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Go to Sections tab and select a post from blog-roll
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(500);

    const postList = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-list"]')),
      10000
    );
    const firstPost = await postList.findElement(By.css('button'));
    await firstPost.click();
    await driver.sleep(500);

    // Switch to Edit post tab
    const postTab = await driver.findElement(By.xpath("//button[contains(text(), 'Edit post')]"));
    await postTab.click();
    await driver.sleep(500);

    // Check for block builder in post editor
    const blockBuilder = await driver.wait(
      until.elementLocated(By.css('[data-testid="block-builder"]')),
      10000
    );
    assert.ok(blockBuilder, 'Block builder should be present in post editor');
  });

  it('should allow adding blocks to a blog post', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Navigate to journal
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Go to Sections tab and select a post
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(500);

    const postList = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-list"]')),
      10000
    );
    const firstPost = await postList.findElement(By.css('button'));
    await firstPost.click();
    await driver.sleep(500);

    // Switch to Edit post tab
    const postTab = await driver.findElement(By.xpath("//button[contains(text(), 'Edit post')]"));
    await postTab.click();
    await driver.sleep(500);

    // Get initial block count
    const blockBuilder = await driver.wait(
      until.elementLocated(By.css('[data-testid="block-builder"]')),
      10000
    );
    const initialBlocks = await blockBuilder.findElements(By.css('.rounded-3xl.border-dashed'));
    const initialCount = initialBlocks.length;
    console.log(`Initial block count: ${initialCount}`);

    // Select block type and add
    const blockPicker = await blockBuilder.findElement(By.css('[data-testid="block-picker"]'));
    await blockPicker.click();
    await driver.sleep(200);

    const addBlockButton = await blockBuilder.findElement(By.css('[data-testid="add-block-button"]'));
    await addBlockButton.click();
    await driver.sleep(1500); // Longer wait for React state update

    // Verify block was added
    const updatedBlocks = await blockBuilder.findElements(By.css('.rounded-3xl.border-dashed'));
    console.log(`Updated block count: ${updatedBlocks.length}`);
    assert.ok(
      updatedBlocks.length >= initialCount + 1,
      `Should have at least one more block after adding (had ${initialCount}, now ${updatedBlocks.length})`
    );
  });

  it('should enable project builder mode for single-project sections', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Find a page with project layout (like project-orbit)
    const projectPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Orbit')]")),
      10000
    );
    await projectPageButton.click();
    await driver.sleep(500);

    // Navigate to Sections tab
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(300);

    // Verify section has block builder (project-builder mode)
    const sectionList = await driver.wait(until.elementLocated(By.css('[data-testid="section-list"]')), 10000);
    const sections = await sectionList.findElements(By.css('.rounded-3xl'));

    if (sections.length > 0) {
      // Check if any section contains project metadata fields
      const sectionContent = await sections[0].getText();
      assert.ok(
        sectionContent.includes('Role') || sectionContent.includes('Year') || sectionContent.includes('Title'),
        'Project section should have metadata fields'
      );
    }
  });

  it('should render blog detail pages with correct URLs', async () => {
    await driver.get(`${baseUrl}/journal`);
    await driver.wait(until.elementLocated(By.css('body')), 10000);

    // Check for blog entry links
    const entryLinks = await driver.findElements(By.css('.blog-entries__item a, .list-section__items a'));

    if (entryLinks.length > 0) {
      const firstLink = entryLinks[0];
      const href = await firstLink.getAttribute('href');
      assert.ok(href.includes('/journal/'), 'Blog entry link should point to journal slug');

      // Navigate to blog detail page
      await firstLink.click();
      await driver.wait(until.elementLocated(By.css('body.layout-blog')), 10000);

      const pageContent = await driver.findElement(By.css('body')).getText();
      assert.ok(pageContent.length > 0, 'Blog detail page should render content');
    }
  });

  it('should mark editor dirty when modifying blog post fields', async () => {
    await driver.get(`${baseUrl}/admin`);
    await driver.wait(until.elementLocated(By.css('[data-testid="page-sidebar"]')), 10000);

    // Navigate to journal
    const journalPageButton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., '/journal')]")),
      10000
    );
    await journalPageButton.click();
    await driver.sleep(500);

    // Go to Sections tab and select a post
    const sectionsTab = await driver.findElement(By.xpath("//button[contains(text(), 'Sections')]"));
    await sectionsTab.click();
    await driver.sleep(500);

    const postList = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-list"]')),
      10000
    );
    const firstPost = await postList.findElement(By.css('button'));
    await firstPost.click();
    await driver.sleep(500);

    // Switch to Edit post tab
    const postTab = await driver.findElement(By.xpath("//button[contains(text(), 'Edit post')]"));
    await postTab.click();
    await driver.sleep(500);

    // Edit title
    const postEditor = await driver.wait(
      until.elementLocated(By.css('[data-testid="blog-post-editor"]')),
      10000
    );
    const titleInput = await postEditor.findElement(By.css('input[type="text"]'));
    await titleInput.clear();
    await titleInput.sendKeys('Updated Test Post Title');
    await driver.sleep(500);

    // Check save button state
    const saveButton = await driver.findElement(By.css('[data-testid="save-button"]'));
    const saveLabel = await saveButton.getText();
    assert.ok(/save/i.test(saveLabel), 'Save button should indicate dirty state after editing post');
  });
});

