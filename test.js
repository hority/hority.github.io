// test.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  // Create a browser instance
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Create a new page
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1280, height: 800 });
  
  // Go to the file (using file protocol)
  const filePath = `file://${path.join(process.cwd(), 'ix9party.html')}`;
  await page.goto(filePath, { waitUntil: 'networkidle0' });
  
  // Take screenshot of Japanese version
  await page.screenshot({ path: 'screenshots/ix9party-japanese.png', fullPage: true });
  console.log('Japanese screenshot taken');
  
  // Click the language switch
  await page.click('#lang-switch');
  
  // Wait for the language to switch
  await page.waitForTimeout(1000);
  
  // Take screenshot of English version
  await page.screenshot({ path: 'screenshots/ix9party-english.png', fullPage: true });
  console.log('English screenshot taken');
  
  // Close the browser
  await browser.close();
  
  console.log('Screenshots saved to /screenshots directory');
})();