const { chromium } = require('playwright-core');

async function test() {
  try {
    const browser = await chromium.launch({ headless: true });
    console.log('Playwright Chromium launched successfully!');
    const page = await browser.newPage();
    await page.setContent('<h1>Hello ShramikSetu</h1>');
    const pdfBuffer = await page.pdf({ format: 'A4' });
    console.log('PDF generated! Size:', pdfBuffer.length);
    await browser.close();
  } catch (err) {
    console.error('Playwright launch error:', err);
  }
}

test();
