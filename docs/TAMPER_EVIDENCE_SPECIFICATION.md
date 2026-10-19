# ShramikSetu Cryptographic Tamper-Evidence Specification

## 1. Executive Summary & The Honesty Rule

ShramikSetu employs SHA-256 cryptographic hash-chaining across both financial double-entry ledger entries and attendance muster events, anchored daily via binary Merkle trees stored in an append-only registry and mirrored to a public transparency log.

### **The Honesty Rule: What This Proves vs. What It Does Not Prove**

| Dimension | What This Cryptographic Implementation Proves | What This Cryptographic Implementation DOES NOT Prove |
| :--- | :--- | :--- |
| **Post-Capture Immutability** | **PROVES** that once a ledger entry or attendance punch is written, any retroactive edit, deletion, insertion, or reordering breaks the SHA-256 chain and invalidates the daily Merkle root. | **DOES NOT PROVE** that physical labor occurred. A mathematically untampered attendance punch does not prove a worker worked. |
| **Tamper Localization** | **PROVES** the exact database record ID, chain index, and field discrepancy where the tampering occurred. | **DOES NOT PREVENT** initial supervisor collusion if an authorized supervisor scans or shares QR tokens with an absent worker off-site. |
| **Database-Level Protection** | **PROVES** that PostgreSQL triggers reject `UPDATE` and `DELETE` queries at the database engine level (SQLSTATE `27000`), with privileges revoked for application roles. | **DOES NOT GUARANTEE** hardware GPS veracity against low-level OS spoofing prior to transmission (though Haversine geofences and anti-fraud heuristics flag suspicious devices). |
| **Public Verifiability** | **PROVES** independent third parties (banks, courts, trade unions) can verify the Merkle root without requiring access to private database credentials. | **DOES NOT CONVERT** private contractor attestations into statutory government endorsements. |

---

## 2. Cryptographic Architecture

### 2.1 Ledger Hash-Chaining
Each double-entry ledger entry chains to the preceding entry's SHA-256 hash:
$$\text{hash}_n = \text{SHA-256}\left(\text{prev\_hash}_n \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{canonicalize}(\text{row}_n)\right)$$
Where the genesis hash is:
$$\text{GENESIS\_HASH} = \text{"0000000000000000000000000000000000000000000000000000000000000000"}$$
And canonical serialization is deterministic:
$$\text{canonicalize}(\text{ledger}) = \text{transaction\_id} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{debit\_account} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{credit\_account} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{amount\_paise} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{ref\_type} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{ref\_id} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{created\_at}$$

### 2.2 Attendance Muster Hash-Chaining
Attendance events chain similarly:
$$\text{canonicalize}(\text{attendance}) = \text{worker\_id} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{contract\_id} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{project\_id} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{worksite\_id} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{date} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{punch\_type} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{lat} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{lng} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{status} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{created\_at}$$

### 2.3 Binary Merkle Tree Daily Anchors
1. Daily entries from both chains are sorted chronologically.
2. Leaves $L_0, L_1, \dots, L_{n-1}$ form the binary tree.
3. If odd, the trailing leaf is duplicated:
$$\text{parent}_{i} = \text{SHA-256}\left(\text{child}_{2i} \mathbin{\Vert} \text{":"} \mathbin{\Vert} \text{child}_{2i+1}\right)$$
4. The Merkle root is committed to the append-only `anchors` table with counts and boundary hashes.
5. Published to the public transparency log endpoint: `/api/audit/transparency-log`.

---

## 3. Database Engine Hardening

PostgreSQL triggers and role permissions enforce immutability:
1. `REVOKE UPDATE, DELETE ON ledger_entries FROM anon, authenticated;`
2. `REVOKE UPDATE, DELETE ON attendance_events FROM anon, authenticated;`
3. `REVOKE UPDATE, DELETE ON anchors FROM anon, authenticated;`
4. Triggers `trg_prevent_update_or_delete_*` execute `prevent_append_only_tampering()`, raising exception:
   `TAMPER_PREVENTION_ERROR: Table <name> is strictly append-only.`

---

## 4. Verification Endpoint

`GET /api/audit/verify` recomputes both chains sequentially from genesis. If any record differs from its recomputed SHA-256 hash or has an invalid `prev_hash`:
- Verification halts immediately at the first invalid node.
- Reports `table`, `brokenRowId`, `brokenIndex`, `failureReason`, `expectedHash`, and `actualHash`.

---

## 5. Exit Check Protocol

If an administrator or database operator directly mutates a single byte of a ledger row (e.g. altering `amount_paise` from `60000` to `90000`):
1. The verification engine computes `computeLedgerRowHash(row.prev_hash, row)`.
2. The recomputed hash differs from stored `row.hash`.
3. The response flags `isValid: false`, `table: "ledger_entries"`, and `brokenRowId: <exact_row_id>`.
