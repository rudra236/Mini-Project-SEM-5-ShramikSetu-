import { chromium } from 'playwright';
import path from 'path';

async function captureScreenshots() {
  const artifactDir = 'C:\\Users\\Rudra\\.gemini\\antigravity-ide\\brain\\55ac7dd1-c31d-47d6-8348-fc1f9aad645c';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  console.log('Launching Edge browser for QA visual documentation...');
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile_375px', width: 375, height: 812 }
  ];

  const langs = ['en', 'hi', 'mr'];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();

    for (const lang of langs) {
      await context.addCookies([{
        name: 'shramiksetu_locale',
        value: lang,
        domain: 'localhost',
        path: '/'
      }]);

      await page.goto('http://localhost:3000/signin');
      await page.waitForTimeout(600);

      const filename = `signin_${vp.name}_${lang}.png`;
      const fullPath = path.join(artifactDir, filename);
      await page.screenshot({ path: fullPath, fullPage: true });
      console.log(`✓ Saved screenshot: ${filename}`);
    }

    // Capture invalid error state on desktop EN
    if (vp.name === 'desktop') {
      await page.fill('input[type="text"]', 'SS-W-2026-000001');
      await page.fill('input[type="password"]', 'WrongPassword123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
      const errPath = path.join(artifactDir, 'signin_error_state_desktop.png');
      await page.screenshot({ path: errPath, fullPage: true });
      console.log('✓ Saved screenshot: signin_error_state_desktop.png');
    }

    await context.close();
  }

  await browser.close();
  console.log('All QA screenshots generated successfully!');
}

captureScreenshots().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
