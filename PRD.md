# PRD.md — ShramikSetu
## Unorganized Sector Wage Enforcement & Benefit Ledger

**This PRD is the source of truth for product scope.** IMPLEMENTATION.md must implement exactly what's here; PROGRESS.md tracks it 1:1; AGENTS.md enforces it. Nothing here contradicts those three files — they were used as the baseline when writing this document.

---

## 1. Document Control

| Field | Value |
|---|---|
| Document | PRD.md |
| Project | ShramikSetu |
| Scope | Semester 1 (12-week, 4-developer college mini-project) |
| Companion docs | IMPLEMENTATION.md (how), PROGRESS.md (tracking), AGENTS.md (engineering rules) |
| Status | Approved for build |
| Change process | Any scope change is logged in Section 30 (Architecture / Scope Decisions) before implementation begins |

---

## 2. Executive Summary

ShramikSetu is a digital employment, attendance, wage, and dispute-resolution ledger for daily-wage workers. It converts a currently informal, verbal hiring-and-payment relationship into a structured digital record: a contractor creates a project and a digital contract, a worker accepts it, attendance is verified with GPS + a short-lived token, wages are calculated automatically from verified attendance, earnings are tracked in a Digital Wage Wallet, payments are recorded and reconciled against expected earnings, and any discrepancy can be raised as a dispute with a tamper-evident evidence timeline. The Semester 1 MVP delivers one complete, demoable lifecycle end-to-end — not the full 60-module long-term vision.

---

## 3. Product Vision

A worker should always be able to see and verify the important employment information recorded about them — who hired them, what was agreed, whether they were paid what they earned, and whether that pay meets the wage they were promised. Over time, ShramikSetu aims to be the portable, verifiable employment history a daily-wage worker carries between contractors and projects.

---

## 4. Problem Statement

Daily-wage employment in the unorganized sector runs almost entirely on informal, verbal arrangements. This produces five recurring failure modes:

1. **Wage disputes** — a contractor claims 6 days worked, the worker claims 10; there is no reliable record to settle it.
2. **No employment history** — workers have no portable proof of who they worked for, what they earned, or what was paid.
3. **Payment disputes** — informal cash payments leave no record of amount, date, or worker acknowledgement.
4. **No wage verification** — workers can't easily check whether their pay meets applicable minimum-wage standards.
5. **No evidence trail** — when a dispute happens, "evidence" is scattered across memory, paper registers, and informal messages.

---

## 5. Target Users

1. **Worker** — daily-wage labourer (construction, agriculture, infrastructure, and similar informal work).
2. **Contractor** — hires workers, creates projects and contracts, records payments.
3. **Supervisor** — on-site role; issues attendance tokens for a project.
4. **Labour / Institutional Inspector** — reviews escalated disputes and compliance/outstanding-payment patterns.
5. **Admin** — system administration (accounts, minimum-wage benchmark data, oversight).

---

## 6. Personas

- **Worker — Ramesh, construction labourer.** Wants proof he worked and was (or wasn't) paid correctly, in Hindi or Marathi, on a basic Android phone.
- **Contractor — Suresh, small-project contractor.** Manages 15–40 workers across 2–3 active sites; wants a fast way to log attendance and payments without a paper register.
- **Supervisor — Anita, site supervisor.** Issues the daily attendance token on-site; doesn't manage contracts or money.
- **Inspector — Deepak, labour department field officer.** Reviews flagged wage discrepancies and escalated disputes across contractors.
- **Admin — project team member.** Manages accounts and the minimum-wage benchmark dataset during the semester.

---

## 7. Stakeholders

- Development team (4 students, see Section "Team Structure" in PROGRESS.md).
- Faculty evaluators (academic assessment of the mini-project).
- End-user proxies for demo purposes (workers/contractors are simulated for the Semester 1 demo — no real statutory deployment).

---

## 8. Existing Problem / Current Workflow

Today: a contractor hires a worker verbally or via a paper register at the worksite; attendance is marked on paper or not at all; wages are calculated manually at the end of a period; payment (usually cash) is handed over with no digital receipt; if a dispute arises, there is no independent timeline of what happened and when.

---

## 9. Proposed Solution

Replace each informal step with a digital, auditable equivalent, while keeping the flow simple enough for low-literacy, low-connectivity users:

Contractor creates project → creates digital contract → worker accepts via QR/token → supervisor issues a short-lived attendance token on-site → worker marks attendance (GPS + token, both required) → server calculates wage from verified attendance → Digital Wage Wallet reflects earnings → contractor records payment → worker confirms or disputes → reconciliation shows outstanding amount → Employment Passport aggregates the worker's history → Inspector can review escalated disputes and compliance flags.

---

## 10. Product Principles

1. **Worker visibility first** — the worker can always see what's been recorded about them.
2. **Server is the source of truth** — no client ever writes a wage, balance, or compliance value directly.
3. **Tamper-evident, not tamper-proof** — append-only audit records and snapshots, no blockchain claims.
4. **Simple over impressive** — pick the smaller, demonstrable implementation when a requirement is ambiguous.
5. **Honest, simple claims** — no legal-advice claims, no production-readiness claims, no accuracy claims the system can't back up.
6. **Privacy by minimalism** — collect only what's needed; GPS only at the moment of attendance, never a location history.

---

## 11. Goals (Semester 1)

- Demonstrate one complete employment lifecycle, end to end, in a live deployed demo.
- Implement GPS + token attendance verification that cannot be spoofed by the client alone.
- Implement a wage wallet where the balance can never drift from its own transaction history.
- Implement payment reconciliation that always reflects expected vs. paid vs. outstanding.
- Implement a simple, honestly-labelled wage compliance indicator.
- Support English, Hindi, and Marathi across all worker/contractor-facing UI.
- Produce documentation (this PRD + IMPLEMENTATION.md + PROGRESS.md + AGENTS.md) that a future semester's team can pick up without reverse-engineering the codebase.

## 12. Non-Goals (Semester 1)

- No real money movement of any kind (no UPI, bank transfer, payment gateway, card, KYC).
- No continuous, background, or live GPS tracking, and no stored location history.
- No AI/ML (fraud detection, risk scoring, translation).
- No native mobile app (web/PWA only).
- No legally binding compliance determination — the compliance indicator is informational only.
- No nationwide/production-scale deployment.

---

## 13. Scope

**In scope (Semester 1):** the 22 MVP features in Section 14, covering the full Contract → Attendance → Wage → Wallet → Payment → Reconciliation → Dispute → Passport chain for five roles.

**Out of scope (Semester 1):** everything listed in Section 15 (Future Scope), including the remaining modules from the original 60-module long-term vision (offline sync, contractor risk scoring, geographic analytics, government integrations, assisted/voice access, etc.).

---

## 14. MVP Definition (Semester 1 — 22 features)

This list is authoritative and matches PROGRESS.md's Feature Checklist 1:1.

1. Authentication & RBAC
2. Worker registration & profile
3. Contractor registration & profile
4. Project & worksite creation
5. Digital work contract (+ simple versioning)
6. Contract QR/token
7. GPS geofencing (Haversine)
8. Temporary attendance token
9. Attendance recording
10. Wage calculation
11. Digital Wage Wallet
12. Payment recording
13. Payment reconciliation
14. Worker payment confirmation/dispute
15. Wage compliance indicator
16. Dispute management
17. Evidence/audit timeline
18. Employment Passport
19. Multilingual UI (English/Hindi/Marathi)
20. Inspector dashboard
21. In-app notifications
22. Audit logging

---

## 15. Future Scope (explicitly deferred, not deleted)

Grouped from the original 60-module vision and the reference specification. None of these may be implemented in Semester 1 without an explicit Decision Log entry (Section 30) and authorization — see AGENTS.md Rule 33.

**Financial / Identity integrations**
- Real payment gateway, UPI, bank transfer, card payments, cash withdrawal/deposit, KYC, bank account linking, cryptocurrency.
- Aadhaar / UWIN government identity integration.
- Government e-Shram integration, automated statutory data ingestion, government dashboards.

**Attendance / Location**
- Offline-first attendance sync and encrypted offline payload queue.
- Live/continuous/background GPS tracking, worker route/location history.
- Dynamic or advanced commercial geofencing beyond the fixed-radius Haversine check.

**Intelligence / Analytics**
- AI/ML fraud detection, contractor risk scoring, automatic dispute analysis.
- Geographic analytics, advanced predictive dashboards.

**Access / Language**
- Additional Indian languages beyond English/Hindi/Marathi.
- Voice assistant / voice translation, "assisted worker access" tooling.
- AI-based translation (MVP uses static i18n dictionaries only).

**Platform**
- Native mobile app (React Native or similar) — Semester 1 is web/PWA only.
- SMS/email/WhatsApp notification integrations (MVP is in-app only).
- Multi-state/national-scale deployment, production SLAs.

**Passport / History**
- Reliability scoring, verified-skills credentialing beyond a simple skill-category field.
- PDF export of the Employment Passport is a **stretch goal**, not a committed MVP deliverable (see Decision Log #4) — it ships only if time allows in Week 9–12; the in-app view is the committed deliverable.

---

## 16. MoSCoW Prioritization

**Must have:** Auth/RBAC, worker/contractor profiles, project/worksite creation, digital contract + acceptance, contract QR/token, GPS + Haversine, attendance token, attendance recording, wage calculation, wallet, payment recording, reconciliation, audit logging.

**Should have:** payment confirmation/dispute, compliance indicator, dispute management + evidence timeline, multilingual UI, inspector dashboard, notifications.

**Could have:** Employment Passport PDF export, contract versioning UI polish beyond the data model.

**Won't have (this semester):** everything in Section 15.

---

## 17. Complete Feature List

Semester 1 ships the 22 MVP features in Section 14. The remaining ~38 modules from the original long-term product vision are catalogued in Section 15 as Future Scope. No feature exists that is in neither list.

---

## 18. User Stories

- As a **worker**, I can view and accept or reject a digital contract so that my employment terms are recorded before I start work.
- As a **worker**, I can mark attendance only when I am physically at the worksite and holding a valid token, so my attendance can't be faked remotely.
- As a **worker**, I can see my wallet balance, pending wages, and full transaction history so I always know what I've earned and what's outstanding.
- As a **worker**, I can confirm or dispute a payment my contractor recorded, so unverified cash claims don't stand unchallenged.
- As a **worker**, I can raise a dispute over attendance, wage, or payment and see the evidence timeline behind it.
- As a **worker**, I can view my Employment Passport summarizing my history across contractors and projects.
- As a **contractor**, I can create a project, register its worksite, and create digital contracts for workers I hire.
- As a **contractor**, I can record a payment against a worker's outstanding wages.
- As a **supervisor**, I can issue a short-lived attendance token for a project so workers can check in on-site.
- As an **inspector**, I can view a dashboard of wage discrepancies, outstanding payments, and escalated disputes.
- As an **admin**, I can manage accounts and the minimum-wage benchmark dataset used by the compliance indicator.

---

## 19. User Journeys

**Primary demo journey** (matches IMPLEMENTATION.md Section 4/Architecture and PROGRESS.md milestones):

Contractor login → Create project → Register worksite → Create digital contract → Generate QR/contract token → Worker scans/accepts contract → Worker attends work → GPS + temporary attendance token verification → Attendance recorded → Wage automatically calculated → Earnings reflected in Digital Wage Wallet → Contractor records payment → Worker confirms/views payment → Wallet & payment reconciliation updated → Employment Passport updated → Optional dispute → Inspector reviews case/dashboard.

---

## 20. Functional Requirements

For every MVP feature: purpose, actor, preconditions, main flow, alternate flow, edge cases, validation, acceptance criteria.

### 20.1 Authentication & RBAC
- **Purpose:** identify the user and resolve their role server-side on every request.
- **Actor:** all roles.
- **Preconditions:** user has a registered account.
- **Main flow:** user authenticates via Supabase Auth (phone OTP primary; email/password as a dev-only fallback) → session established → role looked up server-side from `users` table on each request.
- **Alternate flow:** OTP resend on failed delivery.
- **Edge cases:** expired OTP, role change mid-session (re-checked on next request, not cached client-side).
- **Validation:** OTP format, phone number format.
- **Acceptance criteria:** an authenticated request without the correct role receives 403; role is never accepted from a client-supplied field.

### 20.2 Worker Registration & Profile
- **Purpose:** create a minimal worker identity.
- **Actor:** Worker.
- **Preconditions:** phone number verified via OTP.
- **Main flow:** worker submits name, occupation, skill category, preferred language, optional profile photo → system assigns an internal worker ID.
- **Alternate flow:** worker edits profile fields later.
- **Edge cases:** duplicate phone number registration attempt.
- **Validation:** required fields present; no sensitive government ID required for MVP (kept optional/omitted — see Decision Log #5).
- **Acceptance criteria:** worker record created with a unique internal ID; worker can view/edit own profile only.

### 20.3 Contractor Registration & Profile
- **Purpose:** create a contractor identity that can create projects and contracts.
- **Actor:** Contractor.
- **Main flow:** contractor submits org/name details → account created.
- **Edge cases:** contractor with zero projects attempting to create a contract (blocked — must create a project first).
- **Acceptance criteria:** contractor can create projects and contracts only after registration completes.

### 20.4 Project & Worksite Creation
- **Purpose:** define where and when work happens, and the attendance geofence.
- **Actor:** Contractor.
- **Main flow:** contractor submits name, description, work type, start/end date, worksite lat/lng, radius defaults to 100m.
- **Edge cases:** invalid/missing coordinates; end date before start date.
- **Validation:** radius is set by backend default and is only configurable through authorized backend logic — never a free client-editable field beyond the default.
- **Acceptance criteria:** project created with valid coordinates and a 100m default radius unless explicitly overridden through an authorized path.

### 20.5 Digital Work Contract (+ versioning)
- **Purpose:** record binding employment terms and their acceptance.
- **Actor:** Contractor creates; Worker accepts/rejects.
- **Main flow:** contractor selects worker + project, sets wage/dates/overtime rule/payment frequency → contract created in `pending` status → worker views and accepts or rejects → acceptance timestamp stored.
- **Alternate flow:** contractor edits contract terms after creation → a new version is recorded (previous terms preserved), worker re-acknowledges.
- **Edge cases:** worker rejects; contractor attempts to edit an already-accepted contract.
- **Validation:** wage > 0; dates valid; worker/contractor/project all exist.
- **Acceptance criteria:** contract status accurately reflects pending/accepted/rejected; version history is preserved, not overwritten.

### 20.6 Contract QR / Token
- **Purpose:** let a worker join/view a contract securely via QR without exposing contract details in the code itself.
- **Actor:** system generates; Worker scans.
- **Main flow:** backend issues an opaque `contract_join_token` → encoded as QR → worker scans → backend resolves token to contract → validates status/expiry → returns contract data only after validation.
- **Edge cases:** expired or already-used token; token for a contract not belonging to the scanning worker.
- **Acceptance criteria:** no contract details (wage, worker identity) are recoverable from the QR payload alone.

### 20.7 GPS Geofencing (Haversine)
- **Purpose:** verify a worker is physically at the registered worksite when marking attendance.
- **Actor:** Worker (submits location); server (verifies).
- **Main flow:** browser Geolocation API captures lat/lng → sent with attendance request → server computes Haversine distance against the project's registered coordinates → accepts only if distance ≤ radius_m.
- **Edge cases:** device denies location permission; GPS accuracy is poor; worker just outside radius.
- **Validation:** distance is always recomputed server-side; a client-sent distance value is never trusted.
- **Acceptance criteria:** attendance is rejected with `OUT_OF_RADIUS` if the server-computed distance exceeds the configured radius, regardless of what the client claims.

### 20.8 Temporary Attendance Token
- **Purpose:** prevent phantom/remote attendance by requiring a short-lived, on-site-issued token.
- **Actor:** Supervisor issues; Worker uses.
- **Main flow:** supervisor requests a token for their assigned project → server generates a token with a short TTL (10–15 min), tied to the project → worker uses the token when marking attendance → server validates the token is unexpired and unused by that worker within its window.
- **Edge cases:** expired token, already-used token, token requested by a supervisor not assigned to that project.
- **Acceptance criteria:** attendance is rejected with `TOKEN_EXPIRED` or `TOKEN_ALREADY_USED` as appropriate; token alone (without GPS-in-radius) is insufficient to mark attendance, and vice versa.

### 20.9 Attendance Recording
- **Purpose:** produce the single source-of-truth record that wage calculation depends on.
- **Actor:** Worker (authenticated).
- **Main flow:** worker + valid token + GPS-in-radius, all three required → attendance event recorded with date, timestamp, coordinates, distance, token verification result, and status.
- **Edge cases:** duplicate attendance for the same worker/project/day.
- **Validation:** duplicate same-day attendance is blocked unless routed through a defined correction workflow.
- **Acceptance criteria:** an attendance event exists only when all three conditions (GPS, token, authenticated worker) are satisfied.

### 20.10 Wage Calculation
- **Purpose:** deterministically compute expected earnings from verified attendance.
- **Actor:** system (triggered server-side).
- **Main flow:** on each verified attendance event, `expected_earnings = verified_workdays × contract.daily_wage` (overtime rule applied if defined) → an earnings record is written.
- **Edge cases:** contract has no overtime rule (rate applies flat); attendance verified after contract end date.
- **Validation:** calculation is server-side only, deterministic, no ML.
- **Acceptance criteria:** given N verified workdays at a known daily wage, expected earnings match the deterministic formula exactly.

### 20.11 Digital Wage Wallet
- **Purpose:** give the worker a single, trustworthy view of what they've earned and what remains pending — explicitly not a real financial wallet.
- **Actor:** Worker (views); system (writes).
- **Main flow:** every balance-changing event (wage verified, payment recorded, adjustment, refund) writes one `wallet_transactions` row with a type; displayed balance = `SUM(wallet_transactions.amount)` for that worker, computed on read.
- **Edge cases:** an adjustment/refund needed to correct an erroneous entry — handled as a new transaction, never an edit to a past one.
- **Validation:** no direct client-side balance write path exists anywhere in the system.
- **Acceptance criteria:** balance always equals the sum of that worker's transaction history; there is no stored, independently-mutable balance field.

### 20.12 Payment Recording
- **Purpose:** record that a contractor paid a worker against earned wages.
- **Actor:** Contractor.
- **Main flow:** contractor records worker + contract + amount + mode → linked to earnings and a wallet transaction → if cash, status is `RECORDED_UNVERIFIED` until worker confirms.
- **Edge cases:** payment amount exceeds outstanding balance (warn, do not block — contractor may be pre-paying or correcting).
- **Acceptance criteria:** every recorded payment produces exactly one linked wallet transaction; cash payments are never auto-marked confirmed.

### 20.13 Payment Reconciliation
- **Purpose:** show expected vs. paid vs. outstanding at any time.
- **Actor:** Worker, Contractor, Inspector (view).
- **Main flow:** `outstanding_amount = expected_earnings − SUM(confirmed payments)`, recomputed on read.
- **Edge cases:** unconfirmed cash payments are excluded from "confirmed" until the worker confirms them.
- **Acceptance criteria:** the value is never cached/stale — it reflects the current state of earnings and confirmed payments at query time.

### 20.14 Worker Payment Confirmation / Dispute
- **Purpose:** let the worker validate or contest a recorded payment.
- **Actor:** Worker.
- **Main flow:** worker views a recorded payment → confirms or disputes it.
- **Edge cases:** worker takes no action (payment remains in `recorded`/unverified state indefinitely — acceptable for MVP, no auto-expiry).
- **Acceptance criteria:** a disputed payment does not count toward "confirmed" in reconciliation.

### 20.15 Wage Compliance Indicator
- **Purpose:** give an informational (non-legal) signal of whether pay meets a statutory benchmark.
- **Actor:** system (computes); all scoped roles (view).
- **Main flow:** contract wage/effective pay compared against `minimum_wage_benchmarks` for the relevant state/zone/trade → status returned as COMPLIANT / REVIEW REQUIRED / POTENTIAL NON-COMPLIANCE / INSUFFICIENT DATA.
- **Edge cases:** no benchmark row exists for the trade/zone → INSUFFICIENT DATA, never a false COMPLIANT.
- **Validation:** UI and API responses must state this is a software indicator, not legal advice.
- **Acceptance criteria:** the indicator never returns a compliance claim without a matched benchmark row.

### 20.16 Dispute Management
- **Purpose:** structured handling of worker-raised disagreements.
- **Actor:** Worker raises; Contractor/authorized reviewer responds; Inspector reviews escalated cases.
- **Main flow:** worker raises a dispute tied to an attendance/wage/payment record with a reason → reviewer responds → status updated → optionally escalated to Inspector.
- **Edge cases:** dispute raised against a record with no linked contract.
- **Validation:** dispute must reference an existing record (400 if not).
- **Acceptance criteria:** dispute lifecycle (raised → responded → resolved/escalated) is fully tracked with timestamps.

### 20.17 Evidence / Audit Timeline
- **Purpose:** give reviewers an objective, chronological record behind a dispute.
- **Actor:** system (generates at dispute creation).
- **Main flow:** on dispute creation, server assembles a chronological timeline from contract, contract_versions, attendance_events, earnings_records, and wallet_transactions, and snapshots it into `dispute_evidence` (append-only).
- **Edge cases:** later events (e.g., a subsequent payment) do not alter the frozen snapshot.
- **Validation:** no claim of blockchain/cryptographic tamper-proofing — "tamper-evident" via append-only records only.
- **Acceptance criteria:** the evidence snapshot is immutable once created.

### 20.18 Employment Passport
- **Purpose:** portable summary of a worker's employment history.
- **Actor:** Worker (views/exports), Inspector (views).
- **Main flow:** read-only aggregation across the worker's contracts, attendance, earnings, and payments, rendered in-app.
- **Alternate flow:** PDF export, if achievable within the semester timeline (stretch goal, Section 15).
- **Acceptance criteria:** the in-app passport view is committed; PDF export is best-effort.

### 20.19 Multilingual UI
- **Purpose:** make the worker/contractor experience usable in English, Hindi, and Marathi.
- **Actor:** all roles.
- **Main flow:** locale selected and persisted on the user's profile; all worker/contractor-facing strings sourced from static i18n dictionaries.
- **Edge cases:** admin/inspector tooling may lag on translation (acceptable per Decision Log #6) — worker/contractor screens may not.
- **Acceptance criteria:** no hardcoded literal strings exist in worker- or contractor-facing components.

### 20.20 Inspector Dashboard
- **Purpose:** give inspectors a working view of discrepancies and escalated cases.
- **Actor:** Inspector.
- **Main flow:** dashboard aggregates workers, contractors, projects, wage discrepancies, outstanding payments, disputes, compliance indicators, and relevant audit events.
- **Acceptance criteria:** no predictive/advanced analytics — aggregation and filtering only.

### 20.21 In-App Notifications
- **Purpose:** inform users of state changes relevant to them.
- **Actor:** all roles.
- **Main flow:** state-changing events (contract offered, attendance token issued, payment recorded, dispute update) create a `notifications` row for the relevant user, fetched/polled on page load.
- **Acceptance criteria:** no SMS/email/WhatsApp dependency exists in the MVP code path.

### 20.22 Audit Logging
- **Purpose:** durable, insert-only record of state-changing actions for accountability and dispute evidence.
- **Actor:** system.
- **Main flow:** every domain service call that changes state writes one `audit_events` row (actor, action, entity, before/after, timestamp).
- **Acceptance criteria:** no update/delete endpoint exists for `audit_events` under any role, including Admin.

---

## 21. Non-Functional Requirements

- **Usability:** must be usable by low-literacy users on basic Android devices and slow connections; multilingual by default for worker/contractor screens.
- **Performance:** attendance marking and wallet/reconciliation reads should respond within a few seconds on typical mobile data; no specific SLA is claimed for a student project.
- **Reliability:** rely on Supabase-managed backups; no production uptime guarantee is claimed (see IMPLEMENTATION.md Section 35).
- **Maintainability:** TypeScript strict mode, consistent naming and endpoint conventions (AGENTS.md Sections 7–8).
- **Portability:** architecture (Section 36 of IMPLEMENTATION.md) leaves room for a future mobile app and offline sync without restructuring existing tables.

## 22. GPS Requirements

Collected only at the moment of attendance marking; never stored as a history; never used for continuous/background tracking; distance always recomputed server-side; radius defaults to 100m and is changeable only through authorized backend logic, never a raw client-editable field.

## 23. Multilingual Requirements

English, Hindi, Marathi via static JSON dictionaries; locale persists on the user profile; all worker/contractor-facing text must be translatable; no AI or voice translation in Semester 1.

## 24. Digital Wage Wallet Requirements

Not a real financial wallet. Balance is always derived as the sum of `wallet_transactions`; transaction types are `WAGE_CREDIT`, `PAYMENT_RECEIVED`, `ADJUSTMENT`, `REFUND`; no direct client-side balance mutation exists in any code path.

## 25. Payment / Reconciliation Requirements

No real money movement. Cash payments are `RECORDED_UNVERIFIED` until worker confirmation. Reconciliation (`expected − confirmed paid = outstanding`) is computed on read, never cached/stored as stale state.

## 26. Compliance Requirements

Uses a static, sourced `minimum_wage_benchmarks` dataset (state/zone/trade). Four statuses only: COMPLIANT, REVIEW REQUIRED, POTENTIAL NON-COMPLIANCE, INSUFFICIENT DATA. Always labelled as a software indicator, never legal advice.

## 27. Dispute Requirements

Disputes must reference an existing attendance/wage/payment record. Evidence timelines are snapshotted at creation and are append-only.

## 28. Employment Passport Requirements

Read-only aggregation of the worker's own contracts/attendance/earnings/payments. In-app view is MVP-committed; PDF export is best-effort/stretch.

## 29. RBAC

Five roles (Worker, Contractor, Supervisor, Inspector, Admin). Every endpoint declares its allowed role(s) explicitly. Role is resolved server-side from the `users` table on every request — never trusted from a client-supplied field. Ownership checks happen after the role check, inside the handler.

## 30. Security

Server-side RBAC plus Supabase Row-Level Security as defense-in-depth. Secrets only in environment variables. No wage, wallet, or compliance value is ever accepted as a direct client write.

## 31. Privacy

GPS coordinates live only on the originating `attendance_events` row — no separate location-history table, no map/trail UI. Worker financial/employment data is visible only to that worker, their contractor(s) on shared contracts, and Inspectors reviewing an escalated case.

## 32. Auditability

`audit_events` is insert-only; no update/delete path exists for it under any role. This is described as "tamper-evident" (append-only + restricted modification), never as cryptographically tamper-proof or blockchain-backed.

## 33. Database Requirements

Normalized Postgres schema (see IMPLEMENTATION.md Section 25) covering users, worker/contractor/supervisor profiles, projects, work_contracts (+ versions), attendance_tokens, attendance_events, earnings_records, wallet_transactions, payment_records, disputes (+ evidence), minimum_wage_benchmarks, compliance_checks, audit_events, notifications. Every API entity in Section 24 of IMPLEMENTATION.md maps to one of these tables — no orphan entities on either side.

## 34. API Requirements

REST-style endpoints under `/api/*`, plural nouns, each documenting Method / Purpose / Auth / Role / Request / Response / Errors before merge (see IMPLEMENTATION.md Section 24 for the representative table, and AGENTS.md Rule 15).

## 35. UI/UX Requirements

Role-scoped route groups only — no shared "god" dashboard across roles. All user-facing copy for worker/contractor screens goes through i18n.

## 36. Accessibility

Design for low-literacy users: icon + short-text combinations for status indicators (compliance colors, attendance status), large tap targets for on-site mobile use, minimal typing required for workers (QR scan and token-based flows over manual data entry wherever possible).

## 37. Notifications

In-app only for Semester 1. No SMS/email/WhatsApp dependency required for any MVP flow to function.

## 38. Success Metrics / KPIs (for the Semester 1 demo)

- The full primary demo journey (Section 19) runs end-to-end on the deployed staging/demo environment without manual database intervention.
- Attendance cannot be marked without both GPS-in-radius and a valid token (verified by the required rejection-path integration tests, AGENTS.md Rule 27).
- Wallet balance always equals the sum of its transaction history (verified by test).
- Reconciliation numbers match expected/paid/outstanding for at least one full worked example in the demo.
- All worker/contractor-facing UI is verified navigable in all three supported languages.

## 39. Risks

- **4-developer bandwidth vs. 22-feature scope in 12 weeks** — mitigated by the Week 1–12 plan front-loading the vertical slice (auth → contract → attendance → wage) before payments/disputes/dashboard.
- **GPS accuracy on low-end devices** could cause false `OUT_OF_RADIUS` rejections near the boundary — mitigated by keeping the 100m radius (not tighter) as the MVP default.
- **Minimum wage benchmark sourcing** is a known blocker for Feature 15 (flagged in PROGRESS.md Pending Decisions) — must be resolved before Week 6.
- **Scope creep toward the 60-module long-term vision** — mitigated by AGENTS.md Rule 33 (agents must not invent features) and this PRD's explicit Future Scope list.

## 40. Assumptions

- Workers and contractors are simulated by the team for demo purposes; no real statutory/legal deployment happens this semester.
- Supabase free tier is sufficient for the semester's data volume and uptime needs.
- All four team members have working knowledge of TypeScript/Next.js by Week 2.

## 41. Constraints

- 12-week timeline, 4 developers, no budget for paid infrastructure beyond free tiers.
- Must remain demoable on a standard web browser (desktop and mobile) — no native app build pipeline.

## 42. Acceptance Criteria (project-level)

The Semester 1 build is acceptable when: all 22 MVP features in Section 14 are implemented, tested per AGENTS.md Rule 27, deployed to staging (not just local), reflected as complete in PROGRESS.md, and the full primary demo journey (Section 19) can be run live without manual data patching.

## 43. Demo Journey

See Section 19 (User Journeys) — this is the single canonical demo script for faculty evaluation.

## 44. Semester 1 Roadmap

See PROGRESS.md "Semester 1 Milestones (12 Weeks)" — the week-by-week plan is authoritative there and is not repeated here to avoid drift between documents.

## 45. Semester 2 Extension (indicative, not committed)

If the project continues: offline-first attendance sync, contract versioning UI depth, PDF passport export (if not completed in Semester 1), additional minimum-wage benchmark coverage, SMS notification channel, and a first pass at a native mobile shell — all pulled from Section 15 Future Scope, none of it started without a fresh Decision Log entry.

## 46. Production Vision (long-term, non-committed)

The long-term vision (reflected in the original 60-module concept) is a portable, verifiable employment and benefits history that daily-wage workers carry across contractors, projects, and eventually geographies, with statutory integrations (e.g., e-Shram) and institutional dashboards for labour departments. Semester 1 deliberately builds only the foundational slice of this vision — the core ledger — so that later phases can be added without a schema rewrite (see IMPLEMENTATION.md Section 36, Future Extensibility).

## 47. Glossary

- **Attendance token:** short-lived, project-scoped code issued by a supervisor that a worker must present, alongside GPS-in-radius, to mark attendance.
- **Compliance indicator:** the system's informational (not legal) signal comparing contract wage to a statutory benchmark.
- **Digital Wage Wallet:** an in-app earnings/payment ledger, not a real financial wallet; balance is always derived from its transaction history.
- **Employment Passport:** a worker's aggregated, read-only employment history across contracts/projects.
- **Reconciliation:** expected earnings minus confirmed paid amount, computed on read.
- **Tamper-evident:** append-only, restricted-modification audit records; explicitly not a claim of cryptographic/blockchain tamper-proofing.
- **Verified attendance:** an attendance event that passed both the GPS-in-radius check and the token validity check for an authenticated worker.

---

## Architecture / Scope Decisions (Decision Log)

Contradictions found between the two reference source documents, and how they were resolved in favor of this PRD:

1. **Feature count.** The reference "Complete README" describes a 60-module long-term product vision; the reference "Project Specification" describes the same vision at a higher level. Neither is a 12-week-achievable scope on its own. **Decision:** Semester 1 MVP is the 22-feature subset in Section 14; the remainder is Future Scope (Section 15), not deleted.
2. **Platform.** Reference material implies a "mobile-first" experience and hints at offline-first native behavior. **Decision:** Semester 1 ships a responsive, PWA-installable Next.js web app only; native mobile and offline-first sync move to Future Scope, consistent with IMPLEMENTATION.md Section 1.
3. **Backend framework.** The task prompt's default technology list suggested FastAPI/Python as a fallback backend; the existing reference architecture (IMPLEMENTATION.md, already authored) uses Next.js Route Handlers on Node.js. **Decision:** kept the already-established Next.js Route Handler backend (single-repo, one language across the stack) rather than introducing a second language/framework, per AGENTS.md Section 4 ("do not introduce another framework... without a documented decision").
4. **Employment Passport PDF export.** Reference material treats PDF export as a core deliverable. **Decision:** demoted to best-effort/stretch for Semester 1 (in-app read-only view is the committed deliverable) — also reflected as a Pending Decision in PROGRESS.md, revisit by Week 9.
5. **Worker government ID (Aadhaar/UWIN).** Reference material lists an "optional government identifier" at registration. **Decision:** omitted from Semester 1 worker registration entirely to minimize PII collected (Product Principle 6 / Privacy by minimalism) and because Aadhaar/UWIN integration is itself Future Scope; the internal worker ID is sufficient for the MVP demo.
6. **Multilingual coverage of admin/inspector tooling.** Reference material implies all UI is multilingual. **Decision:** worker- and contractor-facing screens must be fully translatable (en/hi/mr); admin/inspector tooling may lag, since those roles are staffed by the team/institution during the demo and are not the target beneficiary population.
7. **Offline-first attendance.** Reference material specifies encrypted offline payload IDs and sequential sync. **Decision:** moved to Future Scope; Semester 1 attendance marking requires an active connection, which keeps the GPS+token verification path simple and testable within the timeline.
8. **Contractor/geographic risk dashboards and automatic dispute analysis.** Reference material lists these as core modules. **Decision:** moved to Future Scope as they require analytics/ML-adjacent logic explicitly excluded from Semester 1 (Non-Goals, Section 12).

---

# FINAL CONSISTENCY REPORT

- **Semester 1 MVP feature count:** 22 (Section 14), matching PROGRESS.md's Feature Checklist exactly and covered end-to-end in IMPLEMENTATION.md Sections 9–21 and the API/DB tables in Sections 24–25.
- **Number of Future Scope features/groups:** ~38 individual modules from the original 60-module vision, organized into 6 groups in Section 15 (Financial/Identity, Attendance/Location, Intelligence/Analytics, Access/Language, Platform, Passport/History).
- **Main architectural decisions:** single Next.js full-stack app on Supabase (Postgres/Auth/Storage); server-only computation of GPS distance, wage, wallet balance, and compliance status; wallet balance always derived (never stored) from `wallet_transactions`; audit trail is insert-only and described as tamper-evident, not tamper-proof.
- **Main assumptions:** simulated worker/contractor accounts for demo purposes; Supabase free tier is sufficient; team ramps on TypeScript/Next.js by Week 2.
- **Major risks:** 12-week bandwidth vs. 22-feature scope; GPS accuracy at the geofence boundary; minimum-wage benchmark data sourcing (blocks Feature 15 by Week 6); scope creep toward the full 60-module vision.
- **Realistically achievable in 12 weeks:** Yes, provided the Week 1–6 vertical slice (auth → contract → attendance → wage) lands on schedule per PROGRESS.md; Weeks 7–12 (wallet/payments/disputes/dashboard/hardening) are scoped to fit a 4-developer team at the Section 16 MoSCoW priority order.
- **Unresolved product decisions (tracked in PROGRESS.md "Pending Decisions"):** exact state/trade coverage for the `minimum_wage_benchmarks` seed dataset; final go/no-go on Employment Passport PDF export; final confirmation of the 4-developer role split against the actual team.
