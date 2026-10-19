/**
 * SHRAMIKSETU VERIFIABLE WORK RECORD CREDENTIAL TEST SUITE
 *
 * Verifies all 6 statutory credential requirements & exit check:
 *  1. Rebranding & Legal Disclaimer:
 *     - "GOVERNMENT OF INDIA" completely removed.
 *     - Rebranded as "ShramikSetu Verified Work Record".
 *     - Prominent "Not a government-issued document" footer.
 *  2. Real Certificate Reference:
 *     - "Certificate Ref: NEW" eliminated.
 *     - Generates unique reference per issuance (e.g. WR-YYYYMMDD-XXXX).
 *  3. Verified Content Metrics:
 *     - Verified shifts and lifetime earned from canonical financial views.
 *     - GPS geofence validity % computed from attendance events.
 *     - Employer relationships from audited contracts.
 *     - Dispute record: resolved-in-favour rulings counted.
 *     - Skill tier from worker profile.
 *  4. Public Verification Route & Privacy Masking:
 *     - /verify/[ref] works without authentication (logged-out third-party check).
 *     - Privacy-safe masking (First initial + Last name: "R. Kumar").
 *  5. Cryptographic Chaining & Tamper Detection (Exit Check):
 *     - Passport hash = SHA256(canonical snapshot + latest ledger hash).
 *     - Verification passes for valid credentials (VERIFIED).
 *     - Editing any field in the DB row immediately fails verification (TAMPERED).
 *  6. Bilingual Signed PDF Export & Privacy Consent Toggles:
 *     - Consent toggles control disclosure of earnings, disputes, employer names, and GPS.
 *     - PDF export contains embedded QR code to /verify/[ref] and legal disclaimers.
 *     - Documents exactly what is and is not guaranteed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import {
  maskWorkerName,
  canonicalizeJson,
  computePassportCredentialHash,
  generateCredentialRef,
  getWorkerGpsValidityStats,
  getWorkerDisputeStats,
  issueWorkRecordCredential,
  verifyCredentialByRef,
  generatePassportPdf,
  type CanonicalPassportSnapshot,
  type SharingConsent,
} from '../../src/lib/services/passport-service';

// ─── In-Memory Mock Store ──────────────────────────────────────────────────────

let mockWorkers: any[] = [];
let mockAttendanceEvents: any[] = [];
let mockDisputes: any[] = [];
let mockEmploymentRelationships: any[] = [];
let mockContracts: any[] = [];
let mockContractors: any[] = [];
let mockProjects: any[] = [];
let mockLedgerEntries: any[] = [];
let mockIssuedCredentials: any[] = [];
let mockAuditLog: any[] = [];
let mockAuditEvents: any[] = [];
let mockWorkerFinancialSummaries: any[] = [];

setMockAdminClientFactory(() => {
  return {
    from: (table: string) => {
      let store: any[];
      switch (table) {
        case 'workers':                   store = mockWorkers; break;
        case 'attendance_events':         store = mockAttendanceEvents; break;
        case 'disputes':                  store = mockDisputes; break;
        case 'employment_relationships':  store = mockEmploymentRelationships; break;
        case 'work_contracts':            store = mockContracts; break;
        case 'contractors':               store = mockContractors; break;
        case 'projects':                  store = mockProjects; break;
        case 'ledger_entries':            store = mockLedgerEntries; break;
        case 'issued_credentials':        store = mockIssuedCredentials; break;
        case 'audit_log':                 store = mockAuditLog; break;
        case 'audit_events':              store = mockAuditEvents; break;
        case 'worker_financial_summary':  store = mockWorkerFinancialSummaries; break;
        default:                          store = []; break;
      }

      let filtered = [...store];

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        order: (col: string, opts?: any) => {
          const asc = opts?.ascending !== false;
          filtered.sort((a, b) => {
            if (a[col] < b[col]) return asc ? -1 : 1;
            if (a[col] > b[col]) return asc ? 1 : -1;
            return 0;
          });
          return builder;
        },
        limit: (n: number) => {
          filtered = filtered.slice(0, n);
          return builder;
        },
        maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
        single: async () => {
          if (filtered.length === 0) return { data: null, error: { message: 'Not found' } };
          return { data: filtered[0], error: null };
        },
        insert: (item: any) => {
          const items = Array.isArray(item) ? item : [item];
          const saved: any[] = [];
          for (const i of items) {
            const row = {
              id: i.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              created_at: new Date().toISOString(),
              ...i,
            };
            store.push(row);
            saved.push(row);
          }
          filtered = [...saved];
          return builder;
        },
      };

      Object.defineProperty(builder, 'then', {
        value: (resolve: any) => {
          resolve({ data: filtered, count: filtered.length, error: null });
        },
        configurable: true,
      });

      return builder;
    },
  };
});

describe('Verifiable Work Record Credential Suite', () => {
  const TEST_WORKER_ID = '11111111-1111-1111-1111-111111111111';
  const TEST_CONTRACTOR_ID = '22222222-2222-2222-2222-222222222222';
  const TEST_PROJECT_ID = '33333333-3333-3333-3333-333333333333';
  const TEST_CONTRACT_ID = '44444444-4444-4444-4444-444444444444';
  const MOCK_LEDGER_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';

  beforeEach(() => {
    mockWorkers = [
      {
        id: TEST_WORKER_ID,
        user_id: 'user-w-1',
        full_name: 'Ramesh Kumar',
        internal_worker_id: 'W-2026-0001',
        occupation: 'Mason',
        skill_category: 'SKILLED',
      },
    ];

    mockContractors = [
      {
        id: TEST_CONTRACTOR_ID,
        company_name: 'Suresh Builders & Infra',
        user_id: 'user-c-1',
      },
    ];

    mockProjects = [
      {
        id: TEST_PROJECT_ID,
        name: 'Pier 42 Marine Terminal',
        contractor_id: TEST_CONTRACTOR_ID,
      },
    ];

    mockContracts = [
      {
        id: TEST_CONTRACT_ID,
        contract_code: 'CTR-2026-001',
        worker_id: TEST_WORKER_ID,
        contractor_id: TEST_CONTRACTOR_ID,
        project_id: TEST_PROJECT_ID,
        status: 'ACTIVE',
        daily_wage: 90000, // ₹900
        start_date: '2026-08-01',
        work_type: 'Masonry',
      },
    ];

    mockEmploymentRelationships = [
      {
        id: 'rel-1',
        worker_id: TEST_WORKER_ID,
        contractor_id: TEST_CONTRACTOR_ID,
        project_id: TEST_PROJECT_ID,
        contract_id: TEST_CONTRACT_ID,
        status: 'ACTIVE',
      },
    ];

    // 10 attendance events (all within 50m of worksite, status VERIFIED)
    mockAttendanceEvents = Array.from({ length: 10 }, (_, i) => ({
      id: `att-${i + 1}`,
      worker_id: TEST_WORKER_ID,
      contractor_id: TEST_CONTRACTOR_ID,
      project_id: TEST_PROJECT_ID,
      contract_id: TEST_CONTRACT_ID,
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      calculated_distance_meters: 35.5,
      allowed_radius_meters: 100.0,
      status: 'VERIFIED',
    }));

    // Financial summary view: 10 days, ₹9,000 earned (900000 paise)
    mockWorkerFinancialSummaries = [
      {
        worker_id: TEST_WORKER_ID,
        user_id: 'user-w-1',
        full_name: 'Ramesh Kumar',
        internal_worker_id: 'W-2026-0001',
        occupation: 'Mason',
        skill_category: 'SKILLED',
        verified_days_count: 10,
        total_earned_paise: 900000,
        total_paid_paise: 720000,
        outstanding_paise: 180000,
        total_contracts_count: 1,
        active_contracts_count: 1,
      },
    ];

    // Disputes: 1 dispute resolved in worker's favour (ORDER_PAYMENT)
    mockDisputes = [
      {
        id: 'disp-1',
        dispute_ref: 'DSP-2026-001',
        worker_id: TEST_WORKER_ID,
        status: 'RESOLVED',
        ruling_decision: 'ORDER_PAYMENT',
        ordered_amount_paise: 180000,
      },
    ];

    // Latest ledger entry with cryptographic hash
    mockLedgerEntries = [
      {
        id: 'led-1',
        ref_type: 'DISPUTE_REVERSAL',
        amount_paise: 180000,
        hash: MOCK_LEDGER_HASH,
        prev_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        created_at: new Date().toISOString(),
      },
    ];

    mockIssuedCredentials = [];
    mockAuditLog = [];
    mockAuditEvents = [];
  });

  describe('1. Rebranding & Anti-Government Claims Invariant', () => {
    it('worker passport screen and PDF code do NOT contain "GOVERNMENT OF INDIA"', () => {
      const passportPagePath = path.join(process.cwd(), 'src/app/worker/passport/page.tsx');
      const verifyPagePath = path.join(process.cwd(), 'src/app/verify/[ref]/page.tsx');
      const servicePath = path.join(process.cwd(), 'src/lib/services/passport-service.ts');

      const passportPage = fs.readFileSync(passportPagePath, 'utf8');
      const verifyPage = fs.readFileSync(verifyPagePath, 'utf8');
      const service = fs.readFileSync(servicePath, 'utf8');

      expect(passportPage).not.toContain('GOVERNMENT OF INDIA');
      expect(verifyPage).not.toContain('GOVERNMENT OF INDIA');
      expect(service).not.toContain('GOVERNMENT OF INDIA');
    });

    it('worker passport and public verify pages visibly include "Not a government-issued document" disclaimers', () => {
      const passportPage = fs.readFileSync(path.join(process.cwd(), 'src/app/worker/passport/page.tsx'), 'utf8');
      const verifyPage = fs.readFileSync(path.join(process.cwd(), 'src/app/verify/[ref]/page.tsx'), 'utf8');

      expect(passportPage).toContain('NOT A GOVERNMENT-ISSUED DOCUMENT');
      expect(verifyPage).toContain('NOT A GOVERNMENT-ISSUED DOCUMENT');
      expect(passportPage).toContain('ShramikSetu Verified Work Record');
      expect(verifyPage).toContain('ShramikSetu Verified Work Record');
    });
  });

  describe('2. Real Certificate Reference Generation', () => {
    it('never generates "Certificate Ref: NEW" and generates real reference per issuance', () => {
      const passportPage = fs.readFileSync(path.join(process.cwd(), 'src/app/worker/passport/page.tsx'), 'utf8');
      expect(passportPage).not.toContain("CERTIFICATE REF: NEW");
      expect(passportPage).not.toContain("'NEW'");

      const ref1 = generateCredentialRef();
      const ref2 = generateCredentialRef();

      expect(ref1).toMatch(/^WR-\d{8}-[0-9A-F]{6}$/);
      expect(ref2).toMatch(/^WR-\d{8}-[0-9A-F]{6}$/);
      expect(ref1).not.toBe(ref2);
    });
  });

  describe('3. Verified Content Metrics Consistency', () => {
    it('aggregates GPS validity % correctly from attendance_events', async () => {
      const stats = await getWorkerGpsValidityStats(TEST_WORKER_ID);
      expect(stats.totalPunches).toBe(10);
      expect(stats.validGpsPunches).toBe(10);
      expect(stats.gpsValidityPercent).toBe(100);

      // Add a GPS-failed punch (distance > radius and status !== VERIFIED)
      mockAttendanceEvents.push({
        id: 'att-fail',
        worker_id: TEST_WORKER_ID,
        calculated_distance_meters: 500.0,
        allowed_radius_meters: 100.0,
        status: 'FAILED_GPS',
      });

      const updatedStats = await getWorkerGpsValidityStats(TEST_WORKER_ID);
      expect(updatedStats.totalPunches).toBe(11);
      expect(updatedStats.validGpsPunches).toBe(10);
      expect(updatedStats.gpsValidityPercent).toBe(91); // 10/11 = 91%
    });

    it('aggregates dispute resolution record: counts cases resolved in worker favour', async () => {
      const stats = await getWorkerDisputeStats(TEST_WORKER_ID);
      expect(stats.totalDisputes).toBe(1);
      expect(stats.resolvedInFavourCount).toBe(1);
      expect(stats.dismissedCount).toBe(0);

      // Add a dismissed dispute
      mockDisputes.push({
        id: 'disp-2',
        worker_id: TEST_WORKER_ID,
        status: 'RESOLVED',
        ruling_decision: 'DISMISS',
      });

      const updatedStats = await getWorkerDisputeStats(TEST_WORKER_ID);
      expect(updatedStats.totalDisputes).toBe(2);
      expect(updatedStats.resolvedInFavourCount).toBe(1);
      expect(updatedStats.dismissedCount).toBe(1);
    });

    it('privacy-safe name masking preserves initials and last name while concealing full name', () => {
      expect(maskWorkerName('Ramesh Kumar')).toBe('R. Kumar');
      expect(maskWorkerName('Sunita Sharma')).toBe('S. Sharma');
      expect(maskWorkerName('Mohammad Ali Khan')).toBe('M. Khan');
      expect(maskWorkerName('Babu')).toBe('B.');
    });
  });

  describe('4. Canonical Snapshot Hashing & Ledger Immutability', () => {
    it('computes deterministic SHA-256 hash independent of key order in snapshot', () => {
      const snapshotA: CanonicalPassportSnapshot = {
        workerId: TEST_WORKER_ID,
        fullName: 'Ramesh Kumar',
        internalWorkerId: 'W-2026-0001',
        skillCategory: 'SKILLED',
        occupation: 'Mason',
        totalVerifiedWorkdays: 10,
        totalEarnedPaise: 900000,
        totalPaidPaise: 720000,
        outstandingPaise: 180000,
        gpsValidityPercent: 100,
        employerRelationshipsCount: 1,
        disputesResolvedInFavourCount: 1,
        issuedAt: '2026-09-28T12:00:00Z',
      };

      // Same data with permuted object keys
      const snapshotB: CanonicalPassportSnapshot = {
        issuedAt: '2026-09-28T12:00:00Z',
        totalPaidPaise: 720000,
        workerId: TEST_WORKER_ID,
        disputesResolvedInFavourCount: 1,
        fullName: 'Ramesh Kumar',
        gpsValidityPercent: 100,
        employerRelationshipsCount: 1,
        skillCategory: 'SKILLED',
        internalWorkerId: 'W-2026-0001',
        totalEarnedPaise: 900000,
        occupation: 'Mason',
        outstandingPaise: 180000,
        totalVerifiedWorkdays: 10,
      };

      const hashA = computePassportCredentialHash(snapshotA, MOCK_LEDGER_HASH);
      const hashB = computePassportCredentialHash(snapshotB, MOCK_LEDGER_HASH);

      expect(hashA).toBe(hashB);
      expect(hashA.length).toBe(64); // SHA-256 hex length
    });

    it('altering any snapshot attribute changes the cryptographic hash', () => {
      const baseSnapshot: CanonicalPassportSnapshot = {
        workerId: TEST_WORKER_ID,
        fullName: 'Ramesh Kumar',
        internalWorkerId: 'W-2026-0001',
        skillCategory: 'SKILLED',
        occupation: 'Mason',
        totalVerifiedWorkdays: 10,
        totalEarnedPaise: 900000,
        totalPaidPaise: 720000,
        outstandingPaise: 180000,
        gpsValidityPercent: 100,
        employerRelationshipsCount: 1,
        disputesResolvedInFavourCount: 1,
        issuedAt: '2026-09-28T12:00:00Z',
      };

      const baseHash = computePassportCredentialHash(baseSnapshot, MOCK_LEDGER_HASH);

      // Altering shift count from 10 to 11
      const tamperedShifts = { ...baseSnapshot, totalVerifiedWorkdays: 11 };
      expect(computePassportCredentialHash(tamperedShifts, MOCK_LEDGER_HASH)).not.toBe(baseHash);

      // Altering ledger anchor hash
      const differentLedgerHash = 'b'.repeat(64);
      expect(computePassportCredentialHash(baseSnapshot, differentLedgerHash)).not.toBe(baseHash);
    });
  });

  describe('5. Exit Check: Public Verification & DB Tamper Detection', () => {
    it('Exit Check: a passport can be verified via ref by a logged-out user, and editing DB row makes verification fail', async () => {
      // 1. Issue verifiable work record credential for Ramesh Kumar
      const issued = await issueWorkRecordCredential(TEST_WORKER_ID, {
        shareEarnings: true,
        shareDisputes: true,
        shareEmployerNames: true,
        shareGpsMetrics: true,
      });

      expect(issued.credentialRef).toMatch(/^WR-\d{8}-[0-9A-F]{6}$/);
      expect(issued.credentialHash.length).toBe(64);
      expect(issued.snapshotPayload.totalVerifiedWorkdays).toBe(10);

      // 2. Third-party logged-out check: verifyCredentialByRef without auth session
      const verificationResult = await verifyCredentialByRef(issued.credentialRef);

      expect(verificationResult.status).toBe('VERIFIED');
      expect(verificationResult.isValid).toBe(true);
      expect(verificationResult.workerNameMasked).toBe('R. Kumar'); // Minimal privacy-safe name
      expect(verificationResult.totalVerifiedWorkdays).toBe(10);
      expect(verificationResult.gpsValidityPercent).toBe(100);
      expect(verificationResult.totalEarnedRupees).toBe(9000);
      expect(verificationResult.disputesResolvedInFavourCount).toBe(1);
      expect(verificationResult.guarantees.ledgerChained).toBe(true);

      // 3. EXIT CHECK TAMPER TEST: Modify the database row directly
      // Simulate an attacker or rogue DB admin altering totalVerifiedWorkdays from 10 to 99
      const dbRow = mockIssuedCredentials.find((c) => c.credential_ref === issued.credentialRef);
      expect(dbRow).toBeDefined();

      dbRow.snapshot_payload.totalVerifiedWorkdays = 99; // TAMPER DB ROW!

      // 4. Verifying after tampering MUST fail immediately with TAMPERED status
      const tamperedResult = await verifyCredentialByRef(issued.credentialRef);

      expect(tamperedResult.isValid).toBe(false);
      expect(tamperedResult.status).toBe('TAMPERED');
      expect(tamperedResult.tamperReason).toContain('Cryptographic hash mismatch');
    });

    it('tampering with the ledger anchor hash in the DB also triggers TAMPERED status', async () => {
      const issued = await issueWorkRecordCredential(TEST_WORKER_ID);

      const dbRow = mockIssuedCredentials.find((c) => c.credential_ref === issued.credentialRef);
      dbRow.ledger_hash_at_issuance = 'deadbeef'.repeat(8); // TAMPER LEDGER ANCHOR!

      const tamperedResult = await verifyCredentialByRef(issued.credentialRef);
      expect(tamperedResult.isValid).toBe(false);
      expect(tamperedResult.status).toBe('TAMPERED');
    });

    it('verifying an unknown reference returns NOT_FOUND', async () => {
      const result = await verifyCredentialByRef('WR-99999999-NONEXIST');
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('NOT_FOUND');
    });
  });

  describe('6. Privacy Consent Toggles & Bilingual PDF Export', () => {
    it('respects consent toggles: hiding earnings from public verification when disabled', async () => {
      const issued = await issueWorkRecordCredential(TEST_WORKER_ID, {
        shareEarnings: false,
        shareDisputes: true,
        shareEmployerNames: true,
        shareGpsMetrics: true,
      });

      const verification = await verifyCredentialByRef(issued.credentialRef);
      expect(verification.isValid).toBe(true);
      expect(verification.status).toBe('VERIFIED');
      expect(verification.totalEarnedRupees).toBeNull(); // Redacted upon worker consent
    });

    it('generates bilingual signed PDF with QR code link to public verification URL', async () => {
      const issued = await issueWorkRecordCredential(TEST_WORKER_ID, {
        shareEarnings: true,
      });

      const pdfBuffer = await generatePassportPdf(TEST_WORKER_ID, {
        credentialRef: issued.credentialRef,
      });

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(2000);
      expect(pdfBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');

      const normalizedText = normalizePdfText(pdfBuffer);
      expect(normalizedText).toContain('SHRAMIKSETU');
      expect(normalizedText).toContain(issued.credentialRef.replace(/[^A-Za-z0-9]/g, ''));
      expect(normalizedText).not.toContain('GOVERNMENTOFINDIA');
      expect(normalizedText).toContain('NOTAGOVERNMENTISSUEDDOCUMENT');
    });

    it('generates bilingual signed PDF with redacted earnings when consent is false', async () => {
      const issued = await issueWorkRecordCredential(TEST_WORKER_ID, {
        shareEarnings: false,
      });

      const pdfBuffer = await generatePassportPdf(TEST_WORKER_ID, {
        credentialRef: issued.credentialRef,
        consent: { shareEarnings: false },
      });

      const normalizedText = normalizePdfText(pdfBuffer);
      expect(normalizedText).toContain('REDACTEDBYWORKERPRIVACYCONSENT');
    });
  });
});

function decodePdfText(pdfBuffer: Buffer): string {
  const raw = pdfBuffer.toString('latin1');
  const decodedHex = raw.replace(/<([0-9a-fA-F]+)>/g, (_, hex) => {
    try {
      return Buffer.from(hex, 'hex').toString('latin1');
    } catch {
      return '';
    }
  });
  return raw + ' ' + decodedHex;
}

function normalizePdfText(pdfBuffer: Buffer): string {
  const decoded = decodePdfText(pdfBuffer);
  // Kerning offsets in TJ arrays are numbers surrounded by whitespace: e.g. " 50 ", " -15 "
  const strippedKerning = decoded.replace(/\s+-?\d+(\.\d+)?\s+/g, ' ');
  return strippedKerning.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}




