import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

import { createAdminClient } from '@/lib/supabase/admin';

const ARTIFACT_DIR = 'C:/Users/Rudra/.gemini/antigravity-ide/brain/4beffbb1-575a-44de-839d-5cc3ff0d56b9';
const PROJECT_ID = '66666666-6666-6666-6666-666666666602'; // Goregaon Flyover Widening Section B
const WORKER_LOGIN_ID = 'SS-W-2026-000001'; // Ramesh Kumar
const CONTRACTOR_LOGIN_ID = 'SS-C-2026-000001'; // Metro Rail Infra Corp

test.describe('Worker Assignment Acceptance Lifecycle & Enforcement E2E', () => {
  test.setTimeout(90000);

  test.beforeEach(async () => {
    const admin = createAdminClient();
    const { data: user } = await admin.from('users').select('id').eq('login_id', WORKER_LOGIN_ID).maybeSingle();
    if (user) {
      const { data: worker } = await admin.from('workers').select('id').eq('user_id', user.id).maybeSingle();
      if (worker) {
        await admin.from('work_contracts').delete().eq('project_id', PROJECT_ID).eq('worker_id', worker.id);
      }
    }
  });

  test('Contractor invites worker -> Pending on roster -> Worker accepts -> Accepted on both sides -> Reject flow with reason', async ({ browser }) => {
    // ── 1. CONTRACTOR INVITES WORKER ──────────────────────────────────────────
    const contractorContext = await browser.newContext();
    const contractorPage = await contractorContext.newPage();

    // Sign in as contractor
    await contractorPage.goto('/signin?role=contractor');
    await contractorPage.waitForLoadState('networkidle');
    await contractorPage.getByRole('tab', { name: /Contractor/i }).click();
    await contractorPage.locator('#signin-login-id').fill(CONTRACTOR_LOGIN_ID);
    await contractorPage.locator('#signin-password').fill('Vikram@123');
    await contractorPage.locator('button[type="submit"]').click();
    await contractorPage.waitForURL(/\/contractor/, { timeout: 15000 });

    // Navigate to Project page
    await contractorPage.goto(`/contractor/projects/${PROJECT_ID}`);
    await contractorPage.waitForLoadState('networkidle');

    // Click Add Worker / Contract
    await contractorPage.locator('a[href$="/contracts/new"]').first().click();
    await contractorPage.waitForURL(/\/contracts\/new/, { timeout: 15000 });
    await contractorPage.waitForLoadState('networkidle');

    // Fill contract details
    await contractorPage.locator('input[placeholder*="SS-W-"]').fill(WORKER_LOGIN_ID);
    await contractorPage.locator('input[placeholder*="Masonry"]').fill('Reinforcement Barbender');
    const wageInput = contractorPage.locator('input[type="number"]').first();
    await wageInput.fill('750');

    // Submit contract invite
    const submitBtn = contractorPage.getByRole('button', { name: /ISSUE|ADD|DISPATCH/i });
    await submitBtn.click();

    // Roster shows the newly invited worker with PENDING badge
    await contractorPage.waitForURL(new RegExp(`/contractor/projects/${PROJECT_ID}`), { timeout: 15000 });
    await contractorPage.waitForLoadState('networkidle');

    // Verify PENDING status badge and CANCEL INVITE button
    const workerRow = contractorPage.locator('tr').filter({ hasText: /Ramesh Kumar/i });
    await expect(workerRow).toBeVisible();
    await expect(workerRow.locator('text=PENDING').first()).toBeVisible();
    await expect(workerRow.getByRole('button', { name: /CANCEL INVITE/i })).toBeVisible();
    await contractorPage.screenshot({ path: path.join(ARTIFACT_DIR, '01_contractor_roster_pending.png'), fullPage: true });

    // ── 2. WORKER SEES REQUEST IN BELL & PENDING SECTION ──────────────────────
    const workerContext = await browser.newContext();
    const workerPage = await workerContext.newPage();

    // Worker signs in
    await workerPage.goto('/signin?role=worker');
    await workerPage.waitForLoadState('networkidle');
    await workerPage.getByRole('tab', { name: /Worker/i }).click();
    await workerPage.locator('#signin-login-id').fill(WORKER_LOGIN_ID);
    await workerPage.locator('#signin-password').fill('Ramesh@123');
    await workerPage.locator('button[type="submit"]').click();
    await workerPage.waitForURL(/\/worker/, { timeout: 15000 });

    // Header bell icon shows unread count and clicking opens notification
    const bellBtn = workerPage.locator('button[aria-label="Notifications"]');
    await expect(bellBtn).toBeVisible();
    await bellBtn.click();
    await workerPage.waitForTimeout(500);
    await workerPage.screenshot({ path: path.join(ARTIFACT_DIR, '02_worker_bell_notification.png') });

    // Navigate to Contracts tab
    await workerPage.goto('/worker/contracts');
    await workerPage.waitForLoadState('networkidle');

    // Confirm Pending requests section is prominently visible at top
    await expect(workerPage.locator('text=PENDING YOUR DECISION').first()).toBeVisible();
    await expect(workerPage.getByText(/Goregaon Flyover Widening Section B/i).first()).toBeVisible();
    await expect(workerPage.getByText(/₹750\/day/i).first()).toBeVisible();
    const acceptBtn = workerPage.getByRole('button', { name: /^(\s*Accept|\s*स्वीकार करें|\s*स्वीकारा)/i }).first();
    const rejectBtn = workerPage.getByRole('button', { name: /^(\s*Reject|\s*अस्वीकार करें|\s*नाकारा)/i }).first();
    await expect(acceptBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();
    await workerPage.screenshot({ path: path.join(ARTIFACT_DIR, '03_worker_pending_requests_card.png'), fullPage: true });

    // ── 3. WORKER ACCEPTS ASSIGNMENT ──────────────────────────────────────────
    await acceptBtn.click();

    // Verify it moves to Ongoing tab with ACCEPTED status
    await expect(workerPage.locator('text=PENDING YOUR DECISION')).not.toBeVisible({ timeout: 10000 });
    const ongoingRow = workerPage.locator('div').filter({ hasText: /Goregaon Flyover/i }).first();
    await expect(ongoingRow).toBeVisible();
    await workerPage.screenshot({ path: path.join(ARTIFACT_DIR, '04_worker_accepted_ongoing.png'), fullPage: true });

    // ── 4. CONTRACTOR ROSTER UPDATES TO ACCEPTED ──────────────────────────────
    await contractorPage.reload();
    await contractorPage.waitForLoadState('networkidle');
    const updatedWorkerRow = contractorPage.locator('tr').filter({ hasText: /Ramesh Kumar/i });
    await expect(updatedWorkerRow.locator('text=ACCEPTED').first()).toBeVisible();
    await expect(updatedWorkerRow.getByRole('button', { name: /REMOVE/i })).toBeVisible();
    await contractorPage.screenshot({ path: path.join(ARTIFACT_DIR, '05_contractor_roster_accepted.png'), fullPage: true });

    // ── 5. CONTRACTOR ISSUES NEW INVITATION FOR REJECT FLOW ──────────────────
    const admin = createAdminClient();
    const { data: userRec } = await admin.from('users').select('id').eq('login_id', WORKER_LOGIN_ID).single();
    const { data: workerRec } = await admin.from('workers').select('id').eq('user_id', userRec!.id).single();
    await admin.from('work_contracts').delete().eq('project_id', PROJECT_ID).eq('worker_id', workerRec!.id);

    // Re-invite worker
    await contractorPage.goto(`/contractor/projects/${PROJECT_ID}/contracts/new`);
    await contractorPage.waitForLoadState('networkidle');
    await contractorPage.locator('input[placeholder*="SS-W-"]').fill(WORKER_LOGIN_ID);
    await contractorPage.locator('input[placeholder*="Masonry"]').fill('Reinforcement Barbender');
    const newWageInput = contractorPage.locator('input[type="number"]').first();
    await newWageInput.fill('750');
    const newSubmitBtn = contractorPage.getByRole('button', { name: /ISSUE|ADD|DISPATCH/i });
    await newSubmitBtn.click();
    await contractorPage.waitForURL(new RegExp(`/contractor/projects/${PROJECT_ID}`), { timeout: 15000 });
    await contractorPage.waitForLoadState('networkidle');

    // ── 6. WORKER REJECTS INVITATION WITH REASON ──────────────────────────────
    await workerPage.reload();
    await workerPage.waitForLoadState('networkidle');
    await expect(workerPage.locator('text=PENDING YOUR DECISION').first()).toBeVisible();
    const rejectBtnAgain = workerPage.getByRole('button', { name: /^(\s*Reject|\s*अस्वीकार करें|\s*नाकारा)/i }).first();
    await rejectBtnAgain.click();

    // Rejection reason modal
    await workerPage.waitForSelector('textarea', { state: 'visible', timeout: 5000 });
    const reasonText = 'Already committed to another project this week';
    await workerPage.locator('textarea').fill(reasonText);
    const confirmRejectBtn = workerPage.getByRole('button', { name: /अस्वीकृति की पुष्टि करें|Confirm Reject|नाकारा पुष्टी/i });
    await confirmRejectBtn.click();
    await workerPage.waitForLoadState('networkidle');
    await expect(workerPage.locator('text=PENDING YOUR DECISION')).not.toBeVisible({ timeout: 10000 });
    await workerPage.screenshot({ path: path.join(ARTIFACT_DIR, '06_worker_rejected_history.png'), fullPage: true });

    // ── 7. CONTRACTOR SEES REJECTED STATUS + REASON ON ROSTER ─────────────────
    await contractorPage.reload();
    await contractorPage.waitForLoadState('networkidle');
    const rejectedRow = contractorPage.locator('tr').filter({ hasText: /Ramesh Kumar/i }).first();
    await expect(rejectedRow.locator('text=REJECTED').first()).toBeVisible();
    await expect(rejectedRow.locator(`text=${reasonText}`)).toBeVisible();
    await expect(rejectedRow.getByRole('button', { name: /RE-INVITE/i })).toBeVisible();
    await contractorPage.screenshot({ path: path.join(ARTIFACT_DIR, '07_contractor_roster_rejected_with_reason.png'), fullPage: true });

    // Clean contexts
    await contractorContext.close();
    await workerContext.close();
  });
});
