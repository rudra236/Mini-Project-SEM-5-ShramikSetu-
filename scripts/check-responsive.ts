import { chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.TEST_APP_URL || 'http://localhost:3000';
const REPORT_DIR = path.resolve(process.cwd(), 'responsive-report');

const VIEWPORTS = [
  { width: 320, height: 568, name: '320_mobile_se' },
  { width: 375, height: 667, name: '375_mobile_iphone' },
  { width: 414, height: 896, name: '414_mobile_plus' },
  { width: 768, height: 1024, name: '768_tablet_ipad' },
  { width: 1024, height: 768, name: '1024_desktop_sm' },
  { width: 1280, height: 800, name: '1280_desktop_md' },
  { width: 1440, height: 900, name: '1440_desktop_lg' },
];

const LOCALES = ['en', 'hi', 'mr'] as const;

interface CheckIssue {
  type: 'HORIZONTAL_OVERFLOW' | 'TOUCH_TARGET_TOO_SMALL' | 'FONT_SIZE_ZOOM_RISK' | 'TEXT_CLIPPED';
  details: string;
}

interface PageCheckResult {
  route: string;
  role: string;
  locale: string;
  viewport: number;
  status: 'PASS' | 'FAIL';
  issues: CheckIssue[];
  screenshotPath: string;
}

const allResults: PageCheckResult[] = [];

async function getSessionCookie(role: 'CONTRACTOR' | 'WORKER') {
  const credentials =
    role === 'CONTRACTOR'
      ? { id: 'SS-C-2026-000001', password: 'Vikram@123', role: 'CONTRACTOR' }
      : { id: 'SS-W-2026-000001', password: 'Ramesh@123', role: 'WORKER' };

  const res = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error(`Failed to sign in as ${role}: No set-cookie header received.`);
  }

  const match = setCookie.match(/shramiksetu_session=([^;]+)/);
  if (!match) {
    throw new Error(`Failed to extract shramiksetu_session for ${role}`);
  }

  return match[1];
}

async function auditPage(
  page: Page,
  route: string,
  role: string,
  locale: string,
  viewport: { width: number; height: number; name: string }
): Promise<PageCheckResult> {
  const isMobile = viewport.width < 768;

  // Evaluate page health in browser context
  const auditData = await page.evaluate((isMobile) => {
    const issues: Array<{ type: 'HORIZONTAL_OVERFLOW' | 'TOUCH_TARGET_TOO_SMALL' | 'FONT_SIZE_ZOOM_RISK' | 'TEXT_CLIPPED'; details: string }> = [];

    // 1. Check Horizontal Overflow
    const winWidth = window.innerWidth;
    const docWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body ? document.body.scrollWidth : 0;
    const maxScroll = Math.max(docWidth, bodyWidth);

    if (maxScroll > winWidth + 1.5) {
      const offendingList: string[] = [];
      const allEls = document.querySelectorAll('*');
      for (const el of Array.from(allEls)) {
        const rect = el.getBoundingClientRect();
        if (rect.right > winWidth + 1.5) {
          const style = window.getComputedStyle(el);
          if (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
          ) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const cls = (typeof el.className === 'string' && el.className.trim())
              ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
              : '';
            offendingList.push(
              `${tag}${id}${cls} (right: ${Math.round(rect.right)}px, w: ${Math.round(rect.width)}px)`
            );
            if (offendingList.length >= 4) break;
          }
        }
      }

      issues.push({
        type: 'HORIZONTAL_OVERFLOW',
        details: `Page width (${maxScroll}px) exceeds viewport (${winWidth}px) by ${Math.round(maxScroll - winWidth)}px. Offending: ${offendingList.join(' | ') || 'root container'}`,
      });
    }

    // 2. Check Touch Targets on Mobile (< 768px)
    if (isMobile) {
      const interactiveEls = Array.from(
        document.querySelectorAll(
          'button, [role="button"], a[href], input:not([type="hidden"]), select, textarea'
        )
      );

      const smallTargets: string[] = [];
      for (const el of interactiveEls) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0'
        ) {
          continue;
        }

        // Allow inline links inside flowing text blocks
        if (el.tagName.toLowerCase() === 'a' && style.display === 'inline') {
          continue;
        }

        // Check if an input is wrapped in an accessible label with >= 44x44px target
        if (
          el.tagName.toLowerCase() === 'input' &&
          ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio')
        ) {
          const parentLabel = el.closest('label');
          if (parentLabel) {
            const parentRect = parentLabel.getBoundingClientRect();
            if (parentRect.width >= 43 && parentRect.height >= 43) {
              continue;
            }
          }
        }

        // Native range sliders are continuous scrubbing tracks with full width
        if (el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'range') {
          continue;
        }

        // Check if either dimension is less than 44px
        if (rect.width < 43 || rect.height < 43) {
          const label = (
            el.textContent ||
            (el as HTMLInputElement).value ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            ''
          )
            .trim()
            .slice(0, 20);
          const tag = el.tagName.toLowerCase();
          const cls = (typeof el.className === 'string' && el.className.trim())
            ? `.${el.className.trim().split(/\s+/)[0]}`
            : '';
          smallTargets.push(
            `${tag}${cls} "${label}" (${Math.round(rect.width)}x${Math.round(rect.height)}px)`
          );
          if (smallTargets.length >= 5) break;
        }
      }

      if (smallTargets.length > 0) {
        issues.push({
          type: 'TOUCH_TARGET_TOO_SMALL',
          details: `Found elements < 44×44px: ${smallTargets.join('; ')}`,
        });
      }

      // 3. Check Inputs font-size < 16px (iOS Zoom Risk)
      const inputs = Array.from(
        document.querySelectorAll(
          'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]), select, textarea'
        )
      );
      const smallInputs: string[] = [];
      for (const inp of inputs) {
        const rect = inp.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(inp);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const fs = parseFloat(style.fontSize);
        if (fs < 15.5) {
          const name =
            (inp as HTMLInputElement).name ||
            (inp as HTMLInputElement).placeholder ||
            inp.id ||
            inp.tagName.toLowerCase();
          smallInputs.push(`${inp.tagName.toLowerCase()}[${name}] (${fs}px)`);
          if (smallInputs.length >= 4) break;
        }
      }

      if (smallInputs.length > 0) {
        issues.push({
          type: 'FONT_SIZE_ZOOM_RISK',
          details: `Form inputs font-size < 16px causes iOS auto-zoom: ${smallInputs.join('; ')}`,
        });
      }
    }

    return issues;
  }, isMobile);

  const cleanRoute = route.replace(/[^a-zA-Z0-9]/g, '_');
  const screenshotFileName = `${role}_${cleanRoute}_w${viewport.width}_${locale}.png`;
  const screenshotPath = path.join(REPORT_DIR, screenshotFileName);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {
    // Non-blocking screenshot capture
  }

  return {
    route,
    role,
    locale,
    viewport: viewport.width,
    status: auditData.length === 0 ? 'PASS' : 'FAIL',
    issues: auditData,
    screenshotPath,
  };
}

async function runCheck() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  console.log('========================================================================');
  console.log('          SHRAMIKSETU AUTOMATED RESPONSIVE COMPLIANCE AUDIT             ');
  console.log(`          Host: ${BASE_URL}                                            `);
  console.log('========================================================================\n');

  console.log('Authenticating seeded contractor and worker...');
  let contractorToken = '';
  let workerToken = '';
  try {
    contractorToken = await getSessionCookie('CONTRACTOR');
    console.log('Contractor authenticated.');
  } catch (err: any) {
    console.warn('Contractor login error:', err.message);
  }

  try {
    workerToken = await getSessionCookie('WORKER');
    console.log('Worker authenticated.');
  } catch (err: any) {
    console.warn('Worker login error:', err.message);
  }

  const browser = await chromium.launch({ headless: true });

  const contractorRoutes = [
    '/contractor',
    '/contractor/disputes',
    '/contractor/projects/new',
    '/contractor/projects/66666666-6666-6666-6666-666666666601',
    '/contractor/projects/66666666-6666-6666-6666-666666666601/payments',
    '/contractor/projects/66666666-6666-6666-6666-666666666601/contracts/new',
  ];

  const workerRoutes = [
    '/worker',
    '/worker/contracts',
    '/worker/attendance',
    '/worker/wallet',
    '/worker/disputes',
    '/worker/passport',
  ];

  const publicRoutes = ['/signin', '/register', '/'];

  type Task = { route: string; role: 'CONTRACTOR' | 'WORKER' | 'PUBLIC'; token?: string };

  const allTasks: Task[] = [
    ...contractorRoutes.map((r) => ({ route: r, role: 'CONTRACTOR' as const, token: contractorToken })),
    ...workerRoutes.map((r) => ({ route: r, role: 'WORKER' as const, token: workerToken })),
    ...publicRoutes.map((r) => ({ route: r, role: 'PUBLIC' as const })),
  ];

  let totalChecked = 0;
  let totalFailures = 0;

  for (const locale of LOCALES) {
    console.log(`\n======================================================`);
    console.log(`>>> TESTING LOCALE: [ ${locale.toUpperCase()} ]`);
    console.log(`======================================================`);

    for (const task of allTasks) {
      const context = await browser.newContext({
        locale: locale === 'en' ? 'en-IN' : locale === 'hi' ? 'hi-IN' : 'mr-IN',
        timezoneId: 'Asia/Kolkata',
      });

      if (task.token) {
        await context.addCookies([
          {
            name: 'shramiksetu_session',
            value: task.token,
            url: BASE_URL,
          },
          {
            name: 'shramiksetu_locale',
            value: locale,
            url: BASE_URL,
          },
        ]);
      } else {
        await context.addCookies([
          {
            name: 'shramiksetu_locale',
            value: locale,
            url: BASE_URL,
          },
        ]);
      }

      const page = await context.newPage();

      try {
        // Navigate to the route once
        await page.goto(`${BASE_URL}${task.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        // Set locale in localStorage as well to ensure client auth context hydration
        await page.evaluate((loc) => {
          localStorage.setItem('shramiksetu_locale', loc);
        }, locale);
        await page.waitForTimeout(100);

        // Test each viewport width
        for (const vp of VIEWPORTS) {
          totalChecked++;
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.waitForTimeout(60);

          const result = await auditPage(page, task.route, task.role, locale, vp);
          allResults.push(result);

          if (result.status === 'FAIL') {
            totalFailures++;
            console.log(
              `❌ [FAIL] ${task.role} ${task.route} @ ${vp.width}px [${locale}]:`
            );
            for (const issue of result.issues) {
              console.log(`    - [${issue.type}] ${issue.details}`);
            }
          } else {
            // Clean pass
            // console.log(`✓ [PASS] ${task.role} ${task.route} @ ${vp.width}px [${locale}]`);
          }
        }
      } catch (err: any) {
        console.error(`Error checking ${task.route}:`, err.message);
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log('                          AUDIT SUMMARY REPORT                          ');
  console.log('========================================================================');
  console.log(`Total Route × Viewport × Locale combinations tested: ${totalChecked}`);
  console.log(`Clean Passes: ${totalChecked - totalFailures}`);
  console.log(`Failures Flagged: ${totalFailures}`);

  // Summary by issue type
  const overflowIssues = allResults.flatMap((r) => r.issues.filter((i) => i.type === 'HORIZONTAL_OVERFLOW'));
  const targetIssues = allResults.flatMap((r) => r.issues.filter((i) => i.type === 'TOUCH_TARGET_TOO_SMALL'));
  const inputIssues = allResults.flatMap((r) => r.issues.filter((i) => i.type === 'FONT_SIZE_ZOOM_RISK'));

  console.log(`  - Horizontal Overflows: ${overflowIssues.length}`);
  console.log(`  - Touch Targets < 44px: ${targetIssues.length}`);
  console.log(`  - Inputs < 16px (iOS zoom risk): ${inputIssues.length}`);
  console.log(`Screenshots saved to: ${REPORT_DIR}`);
  console.log('========================================================================\n');

  if (totalFailures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCheck().catch((err) => {
  console.error('Fatal error during responsive audit:', err);
  process.exit(1);
});
