# ShramikSetu — 3-Minute Golden Path Demo Script

**Target Duration:** Exactly 3 Minutes (180 Seconds)  
**Persona Flow:** Worker (Ramesh) $\rightarrow$ Contractor (Apex Infra) $\rightarrow$ Worker (Ramesh) $\rightarrow$ Inspector (DLC Mumbai) $\rightarrow$ Worker (Passport) $\rightarrow$ Public Tamper Check  
**Pre-Demo Setup:** Run `npm run dev` and navigate to `http://localhost:3000`. Click **"DEMO MODE: AUTO-SEED"** or run `POST /api/demo/seed` once.

---

## Chronological Cue Sheet & Click-by-Click Walkthrough

```
  0:00                0:35             1:05             1:40               2:20             2:45        3:00
┌───────────────────┬────────────────┬────────────────┬──────────────────┬────────────────┬───────────┐
│ 1. Worker Punch   │ 2. Contractor  │ 3. Worker      │ 4. Inspector     │ 5. Passport    │ 6. Tamper │
│    & Low-Lit UI   │    Underpays   │    Dispute     │    Arbitration   │    Credential  │    Check  │
└───────────────────┴────────────────┴────────────────┴──────────────────┴────────────────┴───────────┘
```

---

### Step 1: The Problem & Worker Punch-In (0:00 – 0:35)
* **Narrative:** *"In India's unorganized construction sector, 90% of workers lack written records. Meet Ramesh Kumar, a semi-skilled mason on Mumbai Metro Line 4. He doesn't read English legal jargon—he needs an icon-first, voice-enabled record of his work."*
* **Exact Clicks:**
  1. Navigate to `/login`.
  2. Click tab **"DEV / TEST SIGN-IN"**.
  3. Click **"SIGN IN AS DEMO WORKER"**.
  4. Automatically lands on `/worker`.
  5. Click **"🔊 READ ALOUD (सुनें)"** at the top right of the Today's Shift card.
  6. Click **"RECORD SHIFT ATTENDANCE · हाजिरी लगाएं"** (navigates to `/worker/attendance`).
  7. Click **"CONFIRM ATTENDANCE PUNCH"** (simulates scanning supervisor's dynamic gate token within the 100m GPS geofence).
* **Expected Screen:**
  * Worker home displays green pill `PUNCH CONFIRMED · हाजिरी दर्ज`.
  * Today's shift card displays `Metro Line 4 Viaduct · Shift 08:00 - 17:00`.
  * Geofence tag displays `LOCATION: 19.0760° N, 72.8777° E (GEOFENCE VERIFIED)`.

---

### Step 2: Contractor Underpayment (0:35 – 1:05)
* **Narrative:** *"At end of shift, the contractor processes payments. The statutory Gazetted minimum wage for Mumbai semi-skilled masonry is ₹780 per day. But the contractor arbitrarily cuts the payment to ₹450."*
* **Exact Clicks:**
  1. Open `/login` (or click sign out).
  2. Click **"DEV / TEST SIGN-IN"** $\rightarrow$ **"SIGN IN AS DEMO CONTRACTOR"**.
  3. Redirects to `/contractor`.
  4. Click on project **"Metro Line 4 Elevated Viaduct"**.
  5. Under Active Roster, find worker **"Ramesh Kumar"** and click **"INITIATE WAGE REMITTANCE"**.
  6. Enter amount: `₹450` (or `45000` paise) instead of statutory `₹780`.
  7. Click **"DISBURSE TO WORKER LEDGER"**.
* **Expected Screen:**
  * Double-entry ledger creates transaction: Credit Ramesh Kumar ₹450, Arrears ₹330.
  * Compliance score warning indicator fires on contractor dashboard.

---

### Step 3: The Dispute & Voice Evidence (1:05 – 1:40)
* **Narrative:** *"Ramesh checks his mobile wallet. He immediately spots the ₹330 shortfall. Instead of relying on verbal arguments that contractor foremen ignore, he files a statutory grievance using his voice."*
* **Exact Clicks:**
  1. Open `/login` $\rightarrow$ **"DEV / TEST SIGN-IN"** $\rightarrow$ **"SIGN IN AS DEMO WORKER"**.
  2. Click bottom navigation item **"WALLET · बटुआ"** (`/worker/wallet`).
  3. Notice `UNDERPAYMENT ALERT: ₹330 SHORTFALL AGAINST MINIMUM WAGE`.
  4. Click button **"FILE STATUTORY GRIEVANCE · विवाद दर्ज करें"** (`/worker/disputes`).
  5. Under Dispute Category, select **"Underpayment / Wage Shortfall"**.
  6. Click **"🎙️ RECORD VOICE DESCRIPTION"** (speech-to-text fills: *"Masterji gave ₹450 instead of agreed ₹780 minimum rate"*).
  7. Click **"SUBMIT STATUTORY DISPUTE · शिकायत भेजें"**.
* **Expected Screen:**
  * Dispute created with ID `DISP-2026-XXXX`.
  * Status badge: `PENDING_REVIEW` with an active 48-Hour Conciliation SLA timer.
  * Cryptographic Evidence Snapshot attached: GPS coordinates, QR token hash, contract version.

---

### Step 4: The Labour Inspector Rules (1:40 – 2:20)
* **Narrative:** *"Under the Code on Wages 2019, statutory inspectors have conciliation authority. The inspector doesn't need to dig through paper muster rolls—the platform presents transparent, explainable evidence."*
* **Exact Clicks:**
  1. Open `/login` $\rightarrow$ **"DEV / TEST SIGN-IN"** $\rightarrow$ **"SIGN IN AS LABOUR INSPECTOR"**.
  2. Automatically lands on `/inspector`.
  3. Review the **Enforcement Overview**: notice Apex Infrastructure Ltd has Risk Score `88 (HIGH RISK)`.
  4. Click top sub-tab **"ARBITRATION DESK · विवाद निवारण"** (`/inspector/disputes`).
  5. Select Ramesh Kumar's dispute `DISP-2026-XXXX`.
  6. Review Explainable Evidence:
     * *Evidence Row 1:* Gate Token Punch timestamp verified at Metro Line 4 Worksites.
     * *Evidence Row 2:* Statutory Minimum Wage Gazette Rule `MH-MIN-2026-SEMI` = ₹780.00.
     * *Evidence Row 3:* Ledger Entry shows only ₹450.00 credited.
  7. In the Arbitration Decision box, click **"ORDER FULL REMITTANCE (₹330 + PENALTY)"**.
  8. Click **"ISSUE BINDING ARBITRATION ORDER"**.
* **Expected Screen:**
  * Dispute status transitions to `RESOLVED · BINDING ORDER ISSUED`.
  * Double-entry ledger writes compensating credit entry: `₹330.00` from Contractor Escrow to Ramesh Kumar.
  * Audit log event cryptographically chained.

---

### Step 5: The Employment Passport Updates (2:20 – 2:45)
* **Narrative:** *"Ramesh's work history is his asset. Every resolved dispute and verified shift updates his portable Employment Passport—a digital credential he carries to his next job."*
* **Exact Clicks:**
  1. Open `/worker/passport`.
  2. Review the **Verified Work History** card:
     * Completed Shifts: `+1 Verified Shift`.
     * Total Cumulative Wages: Updated with full ₹780 settlement.
     * Skill Rating: `SEMI-SKILLED MASON (VERIFIED)`.
  3. Click **"VIEW PUBLIC VERIFIABLE CREDENTIAL"** (opens `/verify/REF-CRED-2026-001`).
* **Expected Screen:**
  * Public Verification Certificate with green badge: `VERIFIED AUTHENTIC · CRYPTOGRAPHICALLY ANCHORED`.
  * Clear statutory disclaimer: *"Verified employment record issued by ShramikSetu. Not a government-issued identity card."*

---

### Step 6: The Tamper Check & External Audit (2:45 – 3:00)
* **Narrative:** *"Finally, how do we know neither the contractor nor an insider altered the database? We verify the cryptographic hash chain."*
* **Exact Clicks:**
  1. Navigate to `/admin/integrity` (or open `/api/audit/verify` in a browser tab).
  2. Point to the **Chain Verification Status**:
     * Total Ledger Entries: `480+ Entries Verified`.
     * Broken Links: `0 Broken Links`.
     * Status: `LEDGER INTEGRITY VERIFIED (SHA-256)`.
  3. Explain the honest claim: *"This guarantees that once written, no contractor or supervisor can alter historical punches or wages. It proves integrity of records—not that the punch was physically made without coercion."*
* **Expected Screen:**
  * Green audit summary card: `CHAIN STATUS: VALID`.
  * Latest Merkle Root anchor hash displayed with daily ISO timestamp.

---

## Rapid Demo Reset Command
If resetting between demo sessions:
```bash
curl -X POST http://localhost:3000/api/demo/seed
```
This restores all 480 ledger rows, 24 dispute states, and contractor risk scores in under **1.2 seconds**.
