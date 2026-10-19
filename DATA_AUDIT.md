# DATA AUDIT: End-to-End Persistence and Single Source of Truth

**Application**: ShramikSetu Web Application  
**Database**: PostgreSQL 17 / PostgREST (Single Source of Truth)  
**Audit Scope**: All forms, mutations, client/server boundaries, storage locations, field mapping, money representation, date handling, identity guarantees, and constraint validation.

---

## 1. Mutation & Form Audit Matrix

| Form / Mutation | UI Field | Payload Key | Route / Handler | DB Table.Column | Persisted? | Audit Notes & Root Cause Analysis |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Worker Registration** | Full Name | `fullName` | `POST /api/auth/register` → `registerUser` | `workers.full_name`, `profiles.full_name` | Yes | Unicode UTF-8 supported for Devanagari (Hindi/Marathi). Min 2 chars validated. |
| | Mobile Number | `phone` | `POST /api/auth/register` → `registerUser` | `users.phone`, `profiles.phone` | Yes | Normalized to E.164 `+91XXXXXXXXXX`. Regex validated server-side. |
| | Password | `password` | `POST /api/auth/register` → `registerUser` | `users.password_hash`, `workers.password_hash` | Yes | Never stored in plain text. Hashed using `bcrypt` (cost 12). |
| | Occupation / Trade | `occupation` | `POST /api/auth/register` → `registerUser` | `workers.occupation` | Yes | Defaults to 'Worker' if empty. |
| | Skill Tier | `skillCategory` | `POST /api/auth/register` → `registerUser` | `workers.skill_category` | Yes | Enum constrained (`UNSKILLED`, `SEMI_SKILLED`, `SKILLED`, `HIGHLY_SKILLED`). |
| | Emergency Contact | `emergencyContact` | `POST /api/auth/register` → `registerUser` | `workers.emergency_contact` | Yes | Persisted as nullable text. |
| | Language Preference | `locale` | `POST /api/auth/register` → `registerUser` | `users.locale`, `profiles.locale` | Yes | Enum constrained (`en`, `hi`, `mr`). |
| | *(Generated System ID)* | `loginId` | `unified-auth.ts:generateUniqueId` | `users.login_id`, `workers.internal_worker_id` | Yes | Unique formatted `SS-W-YYYY-XXXXXX` generated once in DB, retry on collision. |
| **Contractor Registration** | Company / Enterprise Name | `companyName` | `POST /api/auth/register` → `registerUser` | `contractors.company_name` | Yes | Min 2 chars validated. Stored in UTF-8. |
| | Contact Person Name | `fullName` | `POST /api/auth/register` → `registerUser` | `contractors.full_name`, `profiles.full_name` | Yes | Stored in UTF-8. |
| | License / Govt Registration | `licenseNumber` | `POST /api/auth/register` → `registerUser` | `contractors.license_number` | Yes | Persisted as text. |
| | Mobile Number | `phone` | `POST /api/auth/register` → `registerUser` | `users.phone`, `profiles.phone` | Yes | Normalized to E.164 `+91XXXXXXXXXX`. Unique constraint enforced. |
| | Password | `password` | `POST /api/auth/register` → `registerUser` | `users.password_hash`, `contractors.password_hash` | Yes | Hashed using `bcrypt` (cost 12). |
| | Language Preference | `locale` | `POST /api/auth/register` → `registerUser` | `users.locale`, `profiles.locale` | Yes | Enum constrained (`en`, `hi`, `mr`). |
| | *(Generated System ID)* | `loginId` | `unified-auth.ts:generateUniqueId` | `users.login_id`, `contractors.internal_contractor_id` | Yes | Unique formatted `SS-C-YYYY-XXXXXX` generated once in DB, retry on collision. |
| **Worker Profile Edit** | Full Name | `fullName` | `POST /api/workers/profile` | `workers.full_name`, `profiles.full_name` | Yes | Updated in DB. Server auth verifies ownership. |
| | Mobile Number | `phone` | `POST /api/workers/profile` | `users.phone`, `profiles.phone` | Yes | Validated against Indian phone regex. |
| | Occupation | `occupation` | `POST /api/workers/profile` | `workers.occupation` | Yes | Persisted to DB. |
| | Skill Category | `skillCategory` | `POST /api/workers/profile` | `workers.skill_category` | Yes | Enum validated. |
| | Emergency Contact | `emergencyContact` | `POST /api/workers/profile` | `workers.emergency_contact` | Yes | Persisted to DB. |
| | Profile Photo URL | `profilePhotoUrl` | `POST /api/workers/profile` | `workers.profile_photo_url` | Yes | Validated URL format. |
| **Contractor Profile Edit** | Company Name | `companyName` | `PUT /api/contractors/profile` | `contractors.company_name` | Yes | Server checks `requireContractorAccess`. |
| | Contact Person Name | `fullName` | `PUT /api/contractors/profile` | `contractors.full_name`, `profiles.full_name` | Yes | Stored in UTF-8. |
| | License Number | `licenseNumber` | `PUT /api/contractors/profile` | `contractors.license_number` | Yes | Persisted to DB. |
| | Phone Number | `phone` | `PUT /api/contractors/profile` | `users.phone`, `profiles.phone` | Yes | Validated and persisted. |
| **Project Create / Edit** | Project Designation | `name` | `POST /api/projects`, `PUT /api/projects/[id]` | `projects.name` | Yes | Persisted to PostgreSQL `projects`. Non-empty check. |
| | Description | `description` | `POST /api/projects`, `PUT /api/projects/[id]` | `projects.description` | Yes | Nullable text in DB. |
| | Start Date | `startDate` | `POST /api/projects`, `PUT /api/projects/[id]` | `projects.start_date` | Yes | Stored as ISO `YYYY-MM-DD` date. |
| | End Date | `endDate` | `POST /api/projects`, `PUT /api/projects/[id]` | `projects.end_date` | Yes | Check constraint `end_date >= start_date`. |
| | Worksite Name | `worksiteName` | `POST /api/projects` | `worksites.name` | Yes | Automatically creates primary worksite. |
| | Latitude / Longitude | `latitude`, `longitude` | `POST /api/projects` | `worksites.latitude`, `worksites.longitude` | Yes | Check constraints `latitude BETWEEN -90 AND 90`, `longitude BETWEEN -180 AND 180`. |
| | Geofence Radius | `geofenceRadiusMeters` | `POST /api/projects` | `worksites.allowed_radius_meters` | Yes | Bounded between 10m and 5000m. |
| | Worksite Address | `address`, `city`, `state`, `pincode` | `POST /api/projects` | `worksites.address`, `city`, `state`, `pincode` | Yes | Persisted to `worksites` table. |
| **Contract / Add Worker** | Worker Selector | `workerLoginId` / `workerPhone` | `POST /api/contracts` | `work_contracts.worker_id` | Yes | Resolved to real Worker UUID in Postgres. Short ID display only. |
| | Work Type / Trade | `workType` | `POST /api/contracts` | `work_contracts.work_type` | Yes | Persisted. |
| | Daily Wage | `dailyWage` (₹) | `POST /api/contracts` | `work_contracts.daily_wage` (paise) | Yes | **Server owns money**: ₹ converted to integer paise (`dailyWage * 100`). Statutory minimum wage checked server-side. |
| | Working Hours | `expectedWorkingHours` | `POST /api/contracts` | `work_contracts.expected_working_hours` | Yes | Checked `(0, 24]`. |
| | Payment Frequency | `paymentFrequency` | `POST /api/contracts` | `work_contracts.payment_frequency` | Yes | Enum constrained (`DAILY`, `WEEKLY`, `FORTNIGHTLY`, `MONTHLY`). |
| | Start Date / End Date | `startDate`, `endDate` | `POST /api/contracts` | `work_contracts.start_date`, `end_date` | Yes | Stored as `date`. Check constraint enforced. |
| | Statutory Override Ack | `acknowledgeBelowMinimumWage` | `POST /api/contracts` | `work_contracts.min_wage_override_acknowledged` | Yes | Persisted + logged in `audit_trail` JSONB. |
| | Status | `initialStatus` | `POST /api/contracts` | `work_contracts.status` | Yes | Created as `PENDING` / `OFFERED`. Duplicate active check prevents re-inviting. |
| **Accept / Reject Assignment** | Acceptance Decision | URL path (`/accept` or `/reject`) | `POST /api/worker/assignments/[id]/accept` or `.../reject` | `work_contracts.status` | Yes | Transitions to `ACCEPTED` or `REJECTED`. Server validates worker owns contract. |
| | Rejection Reason | `reason` / `rejectionReason` | `POST /api/worker/assignments/[id]/reject` | `work_contracts.rejection_reason` | Yes | Persisted to DB + contract_acceptances + contractor notification. |
| | Evidentiary Audit Trail | `ipAddress`, `userAgent` | `respondToContract` in `employment-service.ts` | `contract_acceptances.ip_hash`, `device_info`, `terms_hash`, `responded_at` | Yes | Full evidentiary record stored in PostgreSQL with SHA-256 hash chaining. |
| **Gate Token (Create / Renew)** | Project ID | `projectId` | `POST /api/attendance/token/create` | `attendance_tokens.project_id` | Yes | Verified contractor owns project. |
| | Worksite ID | `worksiteId` | `POST /api/attendance/token/create` | `attendance_tokens.worksite_id` | Yes | UUID foreign key. |
| | Validity Duration | `ttlSeconds` | `POST /api/attendance/token/create` | `attendance_tokens.ttl_seconds`, `expires_at` | Yes | Dynamic HMAC cryptographic token + 6-digit short code persisted with SHA-256 hashes. |
| **Attendance Check-In / Out** | QR Token / Manual Code | `qrToken` / `manualCode` | `POST /api/attendance/mark` | `attendance_tokens.id`, `attendance_events.token_id` | Yes | Verified against DB token hash. Verified contract is `ACCEPTED`/`ACTIVE`. |
| | Worker GPS Position | `latitude`, `longitude` | `POST /api/attendance/mark` | `attendance_events.worker_latitude`, `worker_longitude` | Yes | Server calculates haversine distance vs worksite GPS. |
| | Geofence Distance | *(Server-computed)* | `markAttendance` in `attendance-service.ts` | `attendance_events.calculated_distance_meters` | Yes | Compared to `allowed_radius_meters`. REJECTED if out of range. |
| | GPS Accuracy & Mock Flag | `gpsAccuracyMeters`, `mockLocationFlag` | `POST /api/attendance/mark` | `attendance_events.gps_accuracy_meters`, `mock_location_flag` | Yes | Persisted; flagged for review if simulated GPS detected. |
| | Punch Direction | `punchType` | `POST /api/attendance/mark` | `attendance_events.punch_type` | Yes | 'IN' or 'OUT'. Duplicate punches within 60s rejected. |
| | Attendance Date | *(Server-computed IST)* | `markAttendance` | `attendance_events.date` | Yes | IST date (`YYYY-MM-DD`). |
| | Integrity Hash | *(Server-computed)* | `attendance-service.ts` | `attendance_events.hash`, `prev_hash` | Yes | Tamper-evident cryptographic chain stored in Postgres. |
| **Wage Disbursement / Payment** | Transaction Reference | `idempotencyKey` | `POST /api/payments/initiate` | `payment_transactions.idempotency_key`, `transaction_ref` | Yes | Enforces idempotency via DB unique constraint. |
| | Payment Amount | `amountPaise` (integer) | `POST /api/payments/initiate` | `payment_transactions.amount_paise`, `ledger_entries.amount_paise` | Yes | **Server owns money**: integer paise only. No floats. |
| | Payment Method / Source | `paymentMethod`, `paymentSource` | `POST /api/payments/initiate` | `payment_transactions.payment_method`, `payment_source` | Yes | Persisted as DB columns/enums. |
| | Reference / Proof | `referenceNumber`, `proofUrl` | `POST /api/payments/initiate` | `payment_transactions.reference_number`, `proof_url` | Yes | Persisted as text in DB. |
| | Double-Entry Ledger | *(Server-computed)* | `initiatePayment` in `payment-service.ts` | `ledger_entries` (DEBIT + CREDIT) | Yes | Double-entry ledger committed atomically with running balances and SHA-256 hash chain. |
| **Dispute Management** | Dispute Category | `category` | `POST /api/disputes` | `disputes.category` | Yes | Enum constrained (`WAGE_THEFT`, `HOURS_DISCREPANCY`, etc.). |
| | Description | `description` | `POST /api/disputes` | `disputes.description` | Yes | Text stored in UTF-8. |
| | Claimed Amount | `amountClaimedPaise` | `POST /api/disputes` | `disputes.amount_claimed_paise` | Yes | Bigint paise in DB. |
| | Evidence Links | `evidencePhotoUrl`, `evidenceVoiceUrl` | `POST /api/disputes` | `disputes.evidence_photo_url`, `evidence_voice_url` | Yes | URLs persisted to DB. |
| | Audio Transcription | `voiceTranscription` | `POST /api/disputes` | `disputes.voice_transcription` | Yes | UTF-8 text persisted in DB. |
| | Linked Records | `linkedAttendanceEventIds`, `linkedLedgerEntryIds` | `POST /api/disputes` | `disputes.linked_attendance_event_ids`, `linked_ledger_entry_ids` | Yes | Persisted as JSONB arrays of UUIDs. |
| **Notification Read-State** | Target Notification | `notificationId` | `PATCH /api/notifications` | `notifications.read`, `notifications.read_at` | Yes | Updated in DB. Server verifies notification belongs to authenticated user. |
| **Language Preference** | Selected Language | `locale` | `POST /api/users/locale` | `users.locale`, `profiles.locale` | Yes *(Fixed)* | Formerly stored only in `localStorage`/cookie. Now persisted to PostgreSQL `users` & `profiles`. |

---

## 2. Hunt for Vulnerabilities & Root Causes

### 1. In-Memory Mock Account Interceptor (`unified-auth.ts`)
- **Found**: Lines 276-342 contained a hardcoded `demoAccounts` dictionary that intercepted logins when `DEMO_MODE=true` or `ENABLE_DEV_AUTH=true`.
- **Root Cause**: Bypassed PostgreSQL database completely during development, masking whether credentials, hashes, and profiles existed in real DB.
- **Fix Applied**: Removed the in-memory interceptor and in-memory `localUserRegistry`. All logins query PostgreSQL directly (`users`, `workers`, `contractors`), verify bcrypt cost-12 hashes, and sign session tokens from DB rows.

### 2. Client-Only Language Preference (`auth-context.tsx`)
- **Found**: Language switcher in UI wrote to `localStorage` and `document.cookie` but never sent an API mutation to persist `locale` to PostgreSQL.
- **Root Cause**: Missing dedicated locale update API route and hook in `auth-context.tsx`.
- **Fix Applied**: Created `POST /api/users/locale` which persists `users.locale` and `profiles.locale` in the database. `useAuth().setLocale` updates DB when user is authenticated. On page reload or fresh login, user's language is restored directly from PostgreSQL.

### 3. Residual File-Based Business Data (`.registered_projects.json`)
- **Found**: A 6,800-line legacy JSON file `.registered_projects.json` in the root directory.
- **Root Cause**: Leftover from an early mock prototype before PostgreSQL was connected.
- **Fix Applied**: Verified zero runtime imports of `local-project-registry.ts` in Next.js routes. Removed `.registered_projects.json` business data. PostgreSQL is 100% the sole store of projects, worksites, and contracts.

### 4. Money Representation (Paise vs Rupees)
- **Verified**: All database columns (`daily_wage`, `amount_paise`, `amount_claimed_paise`, `ordered_amount_paise`, `balance_after_paise`) store non-negative integer paise as `bigint`.
- **Integrity**: Check constraints enforce `amount_paise > 0` and `daily_wage > 0`. UI strictly formats from integer paise: `₹${(paise / 100).toLocaleString('en-IN')}`.

### 5. UUID Consistency
- **Verified**: All database UUID columns (`id`, `worker_id`, `contractor_id`, `project_id`, `worksite_id`, `contract_id`, `token_id`) receive only valid 36-character UUIDs. UI display IDs (e.g. `#${uuid.slice(0, 8).toUpperCase()}`) are purely cosmetic and never sent to API routes.
