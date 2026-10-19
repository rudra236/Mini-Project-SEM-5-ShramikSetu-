# ShramikSetu — System Threat Model & Security Posture

**Classification:** Technical Security Architecture  
**Scope:** ShramikSetu Core Platform (Mobile Worker PWA, Supervisor Gate, Contractor Desk, Labour Inspector Portal, Double-Entry Wage Ledger, Cryptographic Merkle Anchoring)  
**Status:** Living Specification  

---

## 1. Assets (What We Protect)

| Asset ID | Asset Name | Description & Impact of Compromise |
| :--- | :--- | :--- |
| **A-1** | **Statutory Wage Ledger** | Append-only double-entry financial ledger (`ledger_entries`). Integrity breach allows contractor wage theft or fraudulent liability claims. |
| **A-2** | **Attendance Muster Events** | Cryptographically chained clock-in/out records (`attendance_events`). Fraud enables ghost worker syndicates and fictitious billing. |
| **A-3** | **Worker Identity & PII** | Mobile numbers, Aadhaar/Internal IDs, payment addresses, geo-coordinates. Leakage causes privacy violations and targeted exploitation. |
| **A-4** | **Employment Passports** | Cryptographic portable work history credentials (`portable_credentials`). Forgery harms worker market reputation and verified wage claims. |
| **A-5** | **Enforcement & Risk Metrics** | Contractor compliance scoring, explainable violation signals, SLA timers. Tampering blinds statutory labour commissioners. |

---

## 2. Actors & Threat Profiles

| Actor | Access Level | Threat Profile & Motivation |
| :--- | :--- | :--- |
| **Unregistered Public / Observer** | Unauthenticated | Reconnaissance, credential harvesting, public endpoint DoS, traffic interception. |
| **Worker (Unskilled / Semi-skilled)** | Authenticated (Mobile OTP) | Wage inflation, proxy attendance (punching for absent peers), contract disputes. |
| **Gate Supervisor** | Authenticated (Gate PIN/Auth) | Token theft, attendance relay, bribery from workers or contractor to falsify records. |
| **Contractor / Subcontractor** | Authenticated (Contractor Portal) | Underpayment, ghost worker creation, retro-active ledger manipulation, cash kickbacks. |
| **Labour Inspector / Arbitrator** | Authenticated (Institutional Desk) | Improper dispute settlement, unauthorized inspection data leakage, jurisdiction abuse. |
| **Internal Malicious Actor / DBA** | Direct Database / Infrastructure | Silent modification of historic ledger rows, table truncate, key compromise. |

---

## 3. Threat Analysis, Mitigations & Residual Risks

### Attack 1: GPS Spoofing & Mock Location
* **Attack Scenario:** A worker or supervisor uses Android Mock Location apps, Developer Mode location overrides, or browser DevTools GPS emulation to clock in from home rather than the construction site.
* **Mitigations Implemented:**
  1. High-accuracy W3C Geolocation API enforcement (`maximumAge: 0`, `enableHighAccuracy: true`).
  2. Great-circle Haversine geofence calculation strictly evaluated on the server against verified project worksite bounds ($r \le 100\text{ m}$). Punches outside the perimeter return HTTP 422 `OUTSIDE_GEOFENCE`.
  3. Ephemeral Dual-Coordinate Check: Both supervisor terminal coordinates and worker device coordinates must match the site polygon within $100\text{ m}$ during the same attendance handshake window.
* **Residual Risk (Plain Truth):**  
  **Kernel-level GPS spoofing cannot be completely prevented in a standard browser/PWA.** On a rooted Android handset with Magisk or customized ROMs that falsify hardware GPS NMEA sentences directly to the Linux kernel, the browser receives the spoofed coordinates as legitimate hardware GPS data. Preventing this would require native OS attestation (Google Play Integrity API / Apple App Attest), which compromises low-barrier browser accessibility for migrant workers.

---

### Attack 2: Collusion Between Supervisor and Contractor (Ghost Workers)
* **Attack Scenario:** A contractor and their site supervisor conspire to inflate labour costs. The supervisor dispenses valid tokens and clocks in non-existent "ghost workers" using simulated mobile sessions, claiming statutory payouts that the contractor pockets.
* **Mitigations Implemented:**
  1. Strict Separation of Roles: Contractors cannot dispense attendance tokens; supervisors cannot approve or disburse payments.
  2. Algorithmic Risk Detection Engine (`enforcement-service.ts`): Rule `GHOST_WORKER` flags any worker who received ledger credit without corresponding physical QR punches.
  3. Spatial-Temporal Impossible Velocity Rule: Flags any worker profile clocked into two non-contiguous job sites within an impossible travel time window.
  4. Immutable Ledger Revocation: PostgreSQL database triggers explicitly `RAISE EXCEPTION` on any `UPDATE` or `DELETE` attempt against `ledger_entries` or `attendance_events`, even by superuser application roles.
* **Residual Risk (Plain Truth):**  
  **Collusion with physical SIM control cannot be prevented by software alone.** If a contractor physically confiscates 20 migrant workers' SIM cards or phones and hands them to the supervisor on-site, the supervisor can generate valid SMS OTPs, register attendance, and punch them in on-site. Software verifies device and SIM presence, not physical human identity.

---

### Attack 3: QR Relay Attack (Proxy Punching & Token Sharing)
* **Attack Scenario:** A worker physically at the construction gate photographs the supervisor's attendance QR code and broadcasts it via WhatsApp/Telegram to absent co-workers across the city, who scan it from their screens to punch in.
* **Mitigations Implemented:**
  1. Time-Bound Dynamic TOTP: QR tokens embed an HMAC-SHA256 signature and expire strictly within 60 seconds (`EXPIRED_TOKEN` rejection).
  2. Single-Use Nonce Consumption: Each attendance token is invalidated immediately upon first redemption in atomic DB transaction (`TOKEN_ALREADY_USED`).
  3. Co-Presence Distance Calculation: Token redemption requires the scanning worker's device to submit its own live GPS fix, verified against the supervisor's terminal fix at token issue time.
* **Residual Risk (Plain Truth):**  
  **Sub-minute relay combined with location spoofing remains possible.** If an absent worker receives a screenshot within 20 seconds and concurrently uses GPS spoofing, the handshake passes cryptographic and geofence checks.

---

### Attack 4: Coerced Confirmation & Out-of-Band Cash Kickbacks
* **Attack Scenario:** A subcontractor complies with official minimum wages on the digital ledger to satisfy inspection algorithms, but threatens workers with termination unless they withdraw 30% of their digital wages in physical cash and return it to the foreman off-record.
* **Mitigations Implemented:**
  1. Minimum Wage Rule Enforcement at Contract Inception: System blocks drafting any contract below the statutory Gazetted rate (`MW_VIOLATION` detection).
  2. Low-Literacy Voice Grievance Channel: Workers can record audio grievances in Marathi/Hindi describing coercion; files are encrypted and submitted to the District Labour Commissioner.
  3. Transparent Contractor Risk Scoring: Dispute frequency and sudden mass attendance variance directly degrade the contractor's risk index, triggering unannounced physical labor inspections.
* **Residual Risk (Plain Truth):**  
  **Cryptographic ledgers cannot witness physical cash transactions.** An append-only ledger mathematically proves that ₹12,000 was disbursed to Ramesh Kumar's account. It cannot prevent a contractor from cornering Ramesh at an ATM and demanding ₹3,000 cash back. This remains a socioeconomic enforcement challenge requiring field inspections.

---

## 4. Honesty Rule: What Our Cryptography Proves vs. What It Doesn't

```
┌─────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│                    WHAT WE CAN PROVE                        │                   WHAT WE CANNOT PROVE                       │
├─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 1. Historical Immutability: An attacker cannot rewrite      │ 1. Ground Physical Truth: That a physical human was holding │
│    or delete ledger entries from 3 weeks ago undetected.    │    the phone during a valid GPS/QR punch.                   │
│ 2. Sequence Continuity: SHA-256 hash chains guarantee that  │ 2. Absence of Coercion: That a worker was not threatened     │
│    no ledger row was inserted or deleted retroactively.    │    offline into accepting underpayment or kicking back cash.│
│ 3. Independent External Audit: Daily Merkle roots published │ 3. Hardware Authenticity: That an Android GPS coordinate was│
│    to append-only anchors can be verified by 3rd parties.   │    not simulated by a rooted OS kernel module.              │
│ 4. Single-Use Nonce Security: Dynamic QR tokens cannot be   │ 4. Off-Record Side Payments: Cash paid or extorted outside   │
│    re-used or claimed more than once.                       │    the registered banking / wallet infrastructure.           │
└─────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘
```
