# ShramikSetu Worker Portal — Testing & Verification Guide

This guide details setup instructions, demo credentials, mobile access commands, and step-by-step test workflows for the worker portal on **ShramikSetu** (trilingual: Hindi / Marathi / English).

---

## 1. Environment & Database Setup

Ensure your `.env.local` contains:
```env
NEXT_PUBLIC_SUPABASE_URL=https://eejxpmptgvrqxxfmhnqa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_pgzANtDwwdoPBiE1KQuGTg_sevV8YR1
SUPABASE_SERVICE_ROLE_KEY=sb_service_role_key_for_local_dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENABLE_DEV_AUTH=true
ENABLE_DEMO_SEED=true
NEXT_PUBLIC_DEV_AUTH=true
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
```

### Database Migration
The migration file is located at `supabase/migrations/20261003000026_worker_password_auth.sql`:
- Adds `password_hash` to `workers` (bcrypt hash storage).
- Adds `attendance_method` (`qr` | `otp`) to `attendance_events`.
- Adds performance index on `internal_worker_id`.

### Seed Demo Data
To populate the database with realistic demo workers, contracts, attendance history, wallet ledger, and disputes, run:
```bash
npm run seed:demo
```
This script is **completely idempotent** and can be run at any time to reset or re-populate test data.

---

## 2. Seeded Demo Worker Credentials

| Worker ID | Password | Name | Role & Test Scenario |
| :--- | :--- | :--- | :--- |
| **`WRK-MH-2026-0001`** | `Ramesh@123` | Ramesh Kumar | **Full Features**: 1 Ongoing (`Mumbai Metro Line 4`) + 1 Completed contract (`BKC Flyover`), 14 verified attendance shifts, ₹11,900 wage ledger with ₹3,000 withdrawal payout, 4 disputes covering all 4 statuses (`OPEN`, `UNDER_REVIEW`, `RESOLVED`, `REJECTED`). |
| **`WRK-MH-2026-0002`** | `Sunita@123` | Sunita Devi | **Moderate State**: 1 Active contract (`Bar Bender`), 5 shifts, 1 dispute. |
| **`WRK-MH-2026-0003`** | `Mohammad@123` | Mohammad Ansari | **Empty States**: Zero contracts, zero attendance records, zero wallet transactions, zero disputes. Used to test localized empty states. |

*Quick Fill*: The login screen at `/login` includes quick-fill buttons for each demo worker.

---

## 3. Mobile Access & Camera QR Scanning

The worker application is optimized for mobile screens (375px+ viewports, $\ge$48px touch targets).

### Step 1: Start Dev Server
The dev server is bound to `0.0.0.0`:
```bash
npm run dev
```

### Step 2: Display LAN IP & Terminal QR Code
Run the mobile access helper in a separate terminal:
```bash
npm run mobile
```
This prints your local LAN URL (e.g. `http://192.168.0.103:3000`) and renders an ASCII QR code in your terminal. You can scan it directly with your phone camera to open the app on your local Wi-Fi.

### Step 3: HTTPS Tunnel for Mobile Camera
Modern mobile browsers (iOS Safari and Android Chrome) require HTTPS to grant camera permissions for `navigator.mediaDevices.getUserMedia`.

To get an instant, free public HTTPS link:
```bash
# Option A (Cloudflare Tunnel - Recommended)
npx cloudflared tunnel --url http://localhost:3000

# Option B (Localtunnel)
npx localtunnel --port 3000
```
Open the generated `https://...` link on your phone. Camera scanner permissions will now work immediately.

---

## 4. Step-by-Step Feature Testing Guide

### A. Worker Authentication (Worker ID + Password)
1. Navigate to `/login`.
2. Select the **Worker (श्रमिक)** role tab.
3. Observe localized labels (`Worker ID / श्रमिक पहचान संख्या` and `Password / पासवर्ड`).
4. **Show/Hide Password**: Type a password and click the eye/toggle icon to view and hide the plaintext.
5. **Invalid Credentials**: Try logging in with invalid credentials (e.g., `WRK-MH-2026-0001` / `WrongPass123`). Observe the generic localized error message (`Invalid Worker ID or password`).
6. **Rate Limiting**: Attempt 5 consecutive failed logins. Observe the 15-minute rate limit lockout message (`Too many failed login attempts. Please wait 15 minutes before retrying.`).
7. **Successful Login**: Click the `Ramesh Kumar` quick-fill pill (`WRK-MH-2026-0001` / `Ramesh@123`) and click **Sign In**.
8. Verify you are redirected to `/worker`.
9. Verify that clicking **Logout** in the header redirects back to `/login` and protected routes (`/worker/*`) are blocked.

### B. Contracts Tab
1. Click the **CONTRACTS (अनुबंध)** tab in the navigation.
2. Observe the segmented control with count badges:
   - **Ongoing (सक्रिय)**: Shows active contract (`Mumbai Metro Line 4 - Thane Extension`, `Lead Tile Mason`, ₹850/day).
   - **Completed (पूर्ण)**: Shows past completed contract (`Bandra-Kurla Complex Flyover Pier 9`, `Mason`, ₹750/day).
3. Click on any contract card to view the **Contract Detail View**:
   - Full terms, working hours (8 hrs), pay schedule (Weekly).
   - Linked attendance summary card showing verified days worked and total accrued earnings.
4. **Empty State Test**: Log out and log in as `WRK-MH-2026-0003` (`Mohammad@123`). Navigate to Contracts: verify friendly localized empty states for both Ongoing and Completed tabs.
5. **IDOR Security Isolation**: Open another worker's contract URL (e.g. `/api/contracts/55555555-5555-5555-5555-555555555503` belonging to Sunita while logged in as Mohammad). Verify the server returns `403 Forbidden` (`FORBIDDEN_CONTRACT_ACCESS`).

### C. Attendance (QR Scan or 6-Digit OTP, Zero Geo-Tagging)
1. **Notice**: Geolocation permissions are **NOT requested**, and coordinates are not stored.
2. In a desktop or second browser tab, open the **Supervisor Worksite Kiosk**:
   `http://localhost:3000/dev/attendance-demo`
   This displays today's live rotating **HMAC-signed QR code** and the **6-digit manual OTP**.
3. In your worker session, navigate to the **ATTENDANCE (हाजिरी)** tab.
4. **Today's Status Card**: Displays today's date and whether attendance has already been recorded.
5. **Option 1: QR Scan**:
   - Point your camera at the QR code displayed on `/dev/attendance-demo`.
   - *Fallback*: If camera hardware is unavailable, click **"Select QR Image File"** and upload an image of the QR code.
6. **Option 2: 6-Digit OTP**:
   - Click the **"Enter 6-Digit Code"** tab.
   - Enter the 6-digit OTP from the supervisor screen (e.g. copy from `/dev/attendance-demo`).
   - Click **Submit Attendance**.
7. **Idempotent Duplicate Prevention**:
   - Re-submit the same OTP or scan the QR code again for today.
   - Verify the system returns a friendly green response: **"Already Marked / हाजिरी पहले से दर्ज है"** without throwing errors.
8. **OTP Rate Limiting / Lockout**:
   - Enter 5 incorrect 6-digit OTP guesses.
   - Verify the system triggers a 15-minute security lockout window with a clear warning notice.
9. **Monthly Register**:
   - Scroll down to the **Monthly Attendance Register** card.
   - Verify that all verified shifts for the month are listed with date, status badge, and check-in method (`QR` or `OTP`).

### D. Wallet & Wages (Sandbox Mode)
1. Navigate to the **WALLET & WAGES (खाता और मजदूरी)** tab.
2. Observe the prominent **`⚠️ TEST MODE ACTIVE — WALLET & WAGES SANDBOX`** banner at the top of the screen (gated by `DEMO_MODE=true`).
3. View the balance cards:
   - **Total Unpaid Wages**: Derived from attendance shifts minus confirmed withdrawals.
   - **Total Earned**: Sum of all verified shift wages.
   - **Confirmed Received**: Payouts received by worker.
4. **Transaction History Filters**:
   - Click **"All Transactions"**: Displays both accruals and withdrawals.
   - Click **"Wage Credits"**: Filters strictly to attendance wage accruals (+₹850).
   - Click **"Withdrawals"**: Filters strictly to payouts (-₹3,000).
5. **Test Sandbox Controls**:
   - Under the **Sandbox / Dev Tools** box, click **"+ Credit Test Wages (3 Days)"**.
   - Notice immediate confirmation, and unpaid balance increases by ₹2,550 (3 x ₹850).
   - Click **"💸 Simulate Payout Withdrawal"**.
   - Notice a simulated UPI payout of ₹1,500 is credited and confirmed, debiting the unpaid balance.
   - Check the **"Simulate payout failure / decline"** checkbox and click simulate withdrawal again: observe the simulated bank decline error banner.

### E. Disputes
1. Navigate to the **DISPUTES (शिकायतें)** tab.
2. **Filter Tabs**:
   - Click **All**: Shows 4 disputes.
   - Click **Open**: Shows `DSP-2026-0001` (Overtime wages).
   - Click **Under Review**: Shows `DSP-2026-0002` (Gate scanner failure).
   - Click **Resolved**: Shows `DSP-2026-0003` (August rain delay shortfall settled for ₹1,800).
   - Click **Rejected**: Shows `DSP-2026-0004` (Safety boots reimbursement dismissed under contract terms).
3. **Dispute Detail Timeline**:
   - Click on any dispute card.
   - The detail modal opens with the resolution timeline:
     - Stage 1: Dispute Filed by Worker.
     - Stage 2: Assigned to Labour Conciliation Officer.
     - Stage 3: Statutory Decision & Officer Resolution Notes.
4. **File New Dispute**:
   - Click **"Open New Dispute"**.
   - Select contract, choose grievance category (e.g. `Wage Shortfall`, `Attendance Not Marked`, `Unsafe Conditions`, or `Other`).
   - Enter description (or use the microphone icon for voice speech input).
   - Optionally select a photo.
   - Click **"Submit Grievance to Registrar"**.
   - Verify the new dispute appears in the list under the **Open** tab.

### F. Language Switch (HI / MR / EN)
1. On any worker screen, click the language switcher in the header (`HI · हिन्दी`, `MR · मराठी`, `EN · English`).
2. Verify that all tabs, forms, buttons, error messages, and tooltips switch seamlessly into the selected language with zero bilingual subtitle clutter.
3. Verify `npm run audit:i18n` passes with 284 keys verified and 0 missing entries.

---

## 5. Automated Test Suites

Run the full automated test suite:
```bash
npx vitest run
```
Specific tests for the deliverables:
- **Worker Password Auth & Rate Limiting**: `npx vitest run tests/security/worker-password-auth.test.ts`
- **Contract Authorization & IDOR Isolation**: `npx vitest run tests/security/worker-contract-authorization.test.ts`
- **Attendance Verification & OTP Lockout**: `npx vitest run tests/security/worker-attendance.test.ts`
- **Double-Entry Ledger & Arrears Integrity**: `npx vitest run tests/security/atomic-double-entry-ledger.test.ts`
- **i18n Completeness Audit**: `npm run audit:i18n`
