const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

(async () => {
  // Launch the browser
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Go to the page
  await page.goto(`file://${__dirname}/ix9party.html`);
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Take screenshot of Japanese version
  await page.screenshot({ path: path.join(screenshotsDir, 'ix9party-japanese.png'), fullPage: true });
  
  // Click language switch button
  await page.click('#lang-switch');
  
  // Wait for the language to switch
  await page.waitForTimeout(1000);
  
  // Take screenshot of English version
  await page.screenshot({ path: path.join(screenshotsDir, 'ix9party-english.png'), fullPage: true });

  // Close browser
  await browser.close();
  
  console.log('Screenshots taken successfully!');
  console.log(`- Japanese version: ${path.join(screenshotsDir, 'ix9party-japanese.png')}`);
  console.log(`- English version: ${path.join(screenshotsDir, 'ix9party-english.png')}`);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});