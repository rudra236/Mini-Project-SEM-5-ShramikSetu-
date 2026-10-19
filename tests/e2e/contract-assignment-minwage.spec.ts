import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/Rudra/.gemini/antigravity-ide/brain/4beffbb1-575a-44de-839d-5cc3ff0d56b9';

test.describe('Task Verification: Contractor <-> Worker Assignment Lifecycle & Statutory Minimum Wage', () => {
  test.setTimeout(90000);

  test.beforeEach(() => {
    try {
      const regFile = path.join(process.cwd(), '.registered_projects.json');
      if (fs.existsSync(regFile)) {
        const raw = JSON.parse(fs.readFileSync(regFile, 'utf-8'));
        if (raw.contracts) {
          raw.contracts = raw.contracts.filter(
            (c: any) =>
              !(
                c.project_id === 'b69c2146-5663-428c-9448-188a8c439a4c' &&
                (c.worker_id?.includes('33333333-3333-3333-3333-333333333301') ||
                  c.workers?.internal_worker_id === 'SS-W-2026-000001' ||
                  c.workers?.full_name === 'Ramesh Kumar')
              )
          );
          fs.writeFileSync(regFile, JSON.stringify(raw, null, 2), 'utf-8');
        }
      }
    } catch {
      // Ignored
    }
  });

  test('Complete Assignment Lifecycle, Min Wage Validation, and Both-Sides Consistency', async ({ page }) => {
    // ── STEP 1: Contractor Signs In ──
    await page.goto('/signin?role=contractor');
    await page.waitForLoadState('networkidle');

    await page.locator('#signin-login-id').fill('SS-C-2026-000001');
    await page.locator('#signin-password').fill('Vikram@123');
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/contractor/, { timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_contractor_dashboard.png'), fullPage: true });

    // ── STEP 2: Navigate to Project Page ──
    await page.goto('/contractor/projects/b69c2146-5663-428c-9448-188a8c439a4c');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toContainText(/Metro Line 4 Terminal/i);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_project_muster_initial.png'), fullPage: true });

    // ── STEP 3: Open Issue Contract / Add Worker Page ──
    const addWorkerLink = page.locator('a[href$="/contracts/new"]').first();
    await addWorkerLink.click();
    await page.waitForURL(/\/contracts\/new/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Verify statutory minimum wage benchmark
    await expect(page.locator('body')).toContainText(/Min Legal: ₹/i);
    await expect(page.locator('body')).toContainText(/Labour Commissioner/i);

    // ── STEP 4: Open and Verify Minimum Wages Register Modal ──
    await page.getByRole('button', { name: /VIEW MINIMUM WAGES REGISTER/i }).click();
    await expect(page.getByText(/Official Minimum Wages Register/i)).toBeVisible();
    await expect(page.locator('body')).toContainText(/Maharashtra Labour Department/i);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_minimum_wages_register_modal.png'), fullPage: true });

    // Close register modal
    await page.getByRole('button', { name: /CLOSE/i }).click();
    await expect(page.getByText(/Official Minimum Wages Register/i)).not.toBeVisible();

    // ── STEP 5: Test Statutory Underpayment Warning ──
    // Search worker
    await page.locator('input[placeholder*="SS-W-"]').fill('SS-W-2026-000001');
    // Work type
    await page.locator('input[placeholder*="Masonry"]').fill('Masonry');
    // Daily wage input (Rs 400 is below the legal minimum of Rs 606.38)
    const wageInput = page.locator('input[type="number"]').first();
    await wageInput.fill('400');

    // Button changes to DISPATCH WITH UNDERPAYMENT WARNING
    await page.locator('button[type="submit"]').click();

    // Verify Warning Modal appears
    await expect(page.getByText(/STATUTORY MINIMUM WAGE OVERRIDE WARNING/i)).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_statutory_underpayment_warning_modal.png'), fullPage: true });

    // Cancel and adjust wage
    await page.getByRole('button', { name: /CANCEL & ADJUST WAGE/i }).click();
    await expect(page.getByText(/STATUTORY MINIMUM WAGE OVERRIDE WARNING/i)).not.toBeVisible();

    // ── STEP 6: Enter Compliant Wage and Issue Contract ──
    await wageInput.fill('750');
    // Button now says DISPATCH CONTRACT
    await page.locator('button[type="submit"]').click();

    // Redirected back to project muster
    await page.waitForURL(/\/contractor\/projects\/b69c2146-5663-428c-9448-188a8c439a4c/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Verify Ramesh Kumar is in the Active Workforce roster
    await expect(page.locator('body')).toContainText('Ramesh Kumar');
    await expect(page.locator('body')).toContainText('ACTIVE');
    await expect(page.locator('body')).toContainText('₹750/day');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_contractor_muster_worker_active.png'), fullPage: true });

    // ── STEP 7: Worker Side - Verify Ongoing Tab ──
    await page.goto('/signin?role=worker');
    await page.waitForLoadState('networkidle');

    await page.locator('#signin-login-id').fill('SS-W-2026-000001');
    await page.locator('#signin-password').fill('Ramesh@123');
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/worker/, { timeout: 15000 });
    await page.goto('/worker/contracts');
    await page.waitForLoadState('networkidle');

    // Verify Ongoing tab has the contract
    await expect(page.locator('body')).toContainText('Metro Line 4 Terminal');
    await expect(page.locator('body')).toContainText('₹750/day');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_worker_contracts_ongoing.png'), fullPage: true });

    // ── STEP 8: Worker Side - Contract Detail & Statutory Wage Comparison ──
    const contractLink = page.locator('a[href^="/worker/contracts/"]').first();
    await contractLink.click();
    await page.waitForURL(/\/worker\/contracts\//, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Verify statutory wage comparison card
    await expect(page.locator('body')).toContainText(/STATUTORY WAGE COMPLIANCE/i);
    await expect(page.locator('body')).toContainText(/Your daily wage/i);
    await expect(page.locator('body')).toContainText(/vs legal minimum/i);
    await expect(page.locator('body')).toContainText(/Compliant/i);
    await expect(page.locator('body')).toContainText(/Labour Commissioner/i);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_worker_contract_statutory_comparison.png'), fullPage: true });

    // ── STEP 9: Contractor Side - Soft-End / Remove Worker ──
    await page.goto('/signin?role=contractor');
    await page.waitForLoadState('networkidle');

    await page.locator('#signin-login-id').fill('SS-C-2026-000001');
    await page.locator('#signin-password').fill('Vikram@123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/contractor/, { timeout: 15000 });

    await page.goto('/contractor/projects/b69c2146-5663-428c-9448-188a8c439a4c');
    await page.waitForLoadState('networkidle');

    // Click REMOVE on Ramesh Kumar's row
    const rameshRow = page.locator('tr:has-text("Ramesh Kumar")');
    await rameshRow.locator('button:has-text("REMOVE")').click();

    // Verify End Assignment Modal
    await expect(page.getByText(/END WORKER ASSIGNMENT/i)).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_contractor_removal_modal.png'), fullPage: true });

    // Fill reason and confirm dues acknowledgement
    await page.locator('textarea[placeholder*="Work package completed"]').fill('Structural concrete phase completed successfully');

    // If dues checkbox is present, check it
    const duesCheckbox = page.locator('input[type="checkbox"]');
    if (await duesCheckbox.isVisible()) {
      await duesCheckbox.check();
    }

    // Confirm removal
    await page.getByRole('button', { name: /CONFIRM & END ASSIGNMENT/i }).click();
    await page.waitForTimeout(1000);

    // Verify worker row in muster now shows COMPLETED status
    const rameshRowAfter = page.locator('tr:has-text("Ramesh Kumar")');
    await expect(rameshRowAfter).toContainText('COMPLETED');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '09_contractor_muster_completed_roster.png'), fullPage: true });

    // ── STEP 10: Worker Side - Verify Completed Tab & Persistence ──
    await page.goto('/signin?role=worker');
    await page.waitForLoadState('networkidle');

    await page.locator('#signin-login-id').fill('SS-W-2026-000001');
    await page.locator('#signin-password').fill('Ramesh@123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/worker/, { timeout: 15000 });

    await page.goto('/worker/contracts');
    await page.waitForLoadState('networkidle');

    // Click on the Completed tab (has text Completed or wp.completedTab)
    const completedTab = page.locator('button:has-text("Completed"), button:has-text("पूर्ण")').first();
    await completedTab.click();

    // Verify contract is present in Completed tab and has NOT vanished
    await expect(page.locator('body')).toContainText('Metro Line 4 Terminal');
    await expect(page.locator('body')).toContainText('COMPLETED');

    // Refresh to prove persistence across reloads
    await page.reload();
    await page.waitForLoadState('networkidle');
    const completedTabAfterReload = page.locator('button:has-text("Completed"), button:has-text("पूर्ण")').first();
    await completedTabAfterReload.click();
    await expect(page.locator('body')).toContainText('Metro Line 4 Terminal');
    await expect(page.locator('body')).toContainText('COMPLETED');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_worker_contracts_completed_persisted.png'), fullPage: true });
  });
});
