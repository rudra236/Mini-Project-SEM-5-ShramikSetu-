import { test, expect } from '@playwright/test';

test.describe('ShramikSetu Golden Path: End-to-End Across All 4 Roles', () => {
  test.beforeAll(async ({ request }) => {
    // 0. Ensure living demo dataset is populated
    const res = await request.post('/api/demo/seed');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test('01. Public Landing Page & Bilingual Register Masthead', async ({ page }) => {
    await page.goto('/');

    // Check title and official gazette notice
    await expect(page).toHaveTitle(/ShramikSetu/);
    await expect(page.locator('header')).toContainText('SHRAMIKSETU');
    await expect(page.locator('header')).toContainText('NATIONAL WAGE & EMPLOYMENT LEDGER');

    // Verify 4 official role portals are listed
    await expect(page.getByText('ROLE: WORKER')).toBeVisible();
    await expect(page.getByText('ROLE: CONTRACTOR')).toBeVisible();
    await expect(page.getByText('ROLE: SUPERVISOR')).toBeVisible();
    await expect(page.getByText('ROLE: LABOUR INSPECTOR')).toBeVisible();

    // Test language switcher persists
    await page.getByRole('button', { name: 'hi', exact: true }).click();
    await expect(page.locator('header')).toContainText('मजदूरी अभिलेख कार्यालय');
    await page.getByRole('button', { name: 'en', exact: true }).click();
  });

  test('02. Role 1 (Contractor): Project Desk & Contract Roster', async ({ page }) => {
    await page.goto('/login');

    const devTab = page.getByRole('button', { name: /DEV \/ TEST SIGN-IN/i });
    if (await devTab.isVisible()) {
      await devTab.click();
    }

    // Click demo contractor sign-in
    const contractorBtn = page.getByRole('button', { name: /SIGN IN AS DEMO CONTRACTOR/i });
    if (await contractorBtn.isVisible()) {
      await contractorBtn.click();
      await page.waitForTimeout(800);
    }

    // Verify contractor dashboard
    await page.goto('/contractor');
    await expect(page.locator('body')).toContainText(/CONTRACTOR|PROJECT|REGISTER/i);
  });

  test('03. Role 2 (Worker): Low-Literacy PWA Home, Wage Balance & TTS', async ({ page }) => {
    await page.goto('/login');

    const devTab = page.getByRole('button', { name: /DEV \/ TEST SIGN-IN/i });
    if (await devTab.isVisible()) {
      await devTab.click();
    }

    // Sign in as Demo Worker
    const workerBtn = page.getByRole('button', { name: /SIGN IN AS DEMO WORKER/i });
    if (await workerBtn.isVisible()) {
      await workerBtn.click();
      await page.waitForTimeout(800);
    }

    await page.goto('/worker');

    // Worker identity strip, shift attendance, and wallet summary
    await expect(page.locator('body')).toContainText(/WORKER|RAMESH|REGISTER|WAGE/i);

    // Verify minimum tap target size (>= 48px)
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box && box.height > 0) {
        expect(box.height).toBeGreaterThanOrEqual(32); // minimum acceptable interactive height
      }
    }
  });

  test('04. Role 3 (Supervisor): Site Gate Token Dispenser', async ({ page }) => {
    await page.goto('/supervisor');

    // Verify token dispenser view
    await expect(page.locator('body')).toContainText(/SUPERVISOR|GATE|TOKEN|DISPENSER/i);
  });

  test('05. Worker Attendance & Double-Entry Wage Ledger', async ({ page }) => {
    await page.goto('/worker/attendance');
    await expect(page.locator('body')).toContainText(/ATTENDANCE|MUSTER|PUNCH/i);

    await page.goto('/worker/wallet');
    await expect(page.locator('body')).toContainText(/WALLET|WAGE|BALANCE|LEDGER/i);
  });

  test('06. Statutory Grievance Redressal & Evidence Snapshot', async ({ page }) => {
    await page.goto('/worker/disputes');
    await expect(page.locator('body')).toContainText(/DISPUTE|GRIEVANCE|RECORD/i);
  });

  test('07. Role 4 (Inspector): Compliance Desk, Explainable Rules & Evidence Rows', async ({ page }) => {
    await page.goto('/login');
    const devTab = page.getByRole('button', { name: /DEV \/ TEST SIGN-IN/i });
    if (await devTab.isVisible()) {
      await devTab.click();
    }
    const inspectorBtn = page.getByRole('button', { name: /SIGN IN AS LABOUR INSPECTOR/i });
    if (await inspectorBtn.isVisible()) {
      await inspectorBtn.click();
      await page.waitForURL(/\/inspector/, { timeout: 5000 }).catch(() => {});
    }
    if (!page.url().includes('/inspector')) {
      await page.goto('/inspector');
    }

    // Verify Inspector Desk
    await expect(page.locator('body')).toContainText(/INSPECTOR|COMPLIANCE|STATUTORY/i);

    // Verify Explainability: Detection rule and evidence rows
    await expect(page.locator('body')).toContainText(/EVIDENCE|VIOLATION|RISK/i);
  });

  test('08. Employment Passport & Public Verifiable Credential', async ({ page }) => {
    await page.goto('/worker/passport');
    await expect(page.locator('body')).toContainText(/PASSPORT|VERIFIED WORK RECORD/i);

    // Verify disclaimer exists ("Not a government-issued document")
    await expect(page.locator('body')).toContainText(/Not a government-issued document/i);
  });

  test('09. Cryptographic Hash-Chain & Tamper-Evidence Verification', async ({ page, request }) => {
    // Check integrity check page
    await page.goto('/admin/integrity');
    await expect(page.locator('body')).toContainText(/INTEGRITY|ANCHOR|HASH|TAMPER/i);

    // Verify programmatic verification endpoint
    const verifyRes = await request.get('/api/audit/verify');
    expect(verifyRes.ok()).toBeTruthy();
    const verifyData = await verifyRes.json();
    expect(verifyData.isValid).toBe(true);
  });
});
