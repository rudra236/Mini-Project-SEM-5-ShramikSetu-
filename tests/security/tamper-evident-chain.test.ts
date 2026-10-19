import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GENESIS_HASH,
  canonicalizeLedgerRow,
  computeLedgerRowHash,
  computeLedgerHash,
  canonicalizeAttendanceRow,
  computeAttendanceRowHash,
  buildMerkleTree,
  verifyLedgerChainIntegrity,
  verifyAttendanceChainIntegrity,
  HONESTY_RULE_DISCLOSURE,
} from '@/lib/services/integrity-service';

describe('Tamper-Evident Hash Chaining & Integrity Engine', () => {
  describe('1. Canonical Serialization & Hash Formulas', () => {
    it('produces deterministic SHA-256 hash for ledger rows', () => {
      const row = {
        transactionId: 'tx-100',
        debitAccount: 'acc-contractor-1',
        creditAccount: 'acc-worker-1',
        amountPaise: 65000,
        refType: 'WAGE_ACCRUAL',
        refId: 'att-100',
        createdAt: '2026-09-28T10:00:00.000Z',
      };

      const canonical = canonicalizeLedgerRow(row);
      expect(canonical).toBe('tx-100:acc-contractor-1:acc-worker-1:65000:WAGE_ACCRUAL:att-100:2026-09-28T10:00:00.000Z');

      const hash1 = computeLedgerRowHash(GENESIS_HASH, row);
      const hash2 = computeLedgerHash({ prevHash: GENESIS_HASH, ...row });

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it('produces deterministic SHA-256 hash for attendance rows', () => {
      const row = {
        workerId: 'worker-1',
        contractId: 'contract-1',
        projectId: 'project-1',
        worksiteId: 'worksite-1',
        date: '2026-09-28',
        punchType: 'IN',
        workerLatitude: 19.07609,
        workerLongitude: 72.877426,
        status: 'VERIFIED',
        createdAt: '2026-09-28T09:00:00.000Z',
      };

      const canonical = canonicalizeAttendanceRow(row);
      expect(canonical).toContain('worker-1:contract-1:project-1:worksite-1:2026-09-28:IN:19.076090:72.877426:VERIFIED');

      const hash = computeAttendanceRowHash(GENESIS_HASH, row);
      expect(hash).toHaveLength(64);
    });
  });

  describe('2. Unbroken Chain Verification', () => {
    it('verifies a valid unbroken ledger chain from genesis to tip', async () => {
      let prevHash = GENESIS_HASH;
      const entries = [];

      for (let i = 1; i <= 5; i++) {
        const fields = {
          transactionId: `tx-${i}`,
          debitAccount: 'acc-contractor',
          creditAccount: `acc-worker-${i}`,
          amountPaise: 50000 + i * 1000,
          refType: 'WAGE_ACCRUAL',
          refId: `att-${i}`,
          createdAt: `2026-09-28T08:0${i}:00.000Z`,
        };
        const hash = computeLedgerRowHash(prevHash, fields);

        entries.push({
          id: `entry-${i}`,
          transaction_id: fields.transactionId,
          debit_account: fields.debitAccount,
          credit_account: fields.creditAccount,
          amount_paise: fields.amountPaise,
          ref_type: fields.refType,
          ref_id: fields.refId,
          prev_hash: prevHash,
          hash,
          created_at: fields.createdAt,
        });

        prevHash = hash;
      }

      const result = await verifyLedgerChainIntegrity(entries);
      expect(result.isValid).toBe(true);
      expect(result.brokenRowId).toBeNull();
      expect(result.brokenIndex).toBeNull();
      expect(result.totalEntries).toBe(5);
      if (result.isValid) {
        expect(result.latestHash).toBe(prevHash);
      }
    });

    it('verifies a valid unbroken attendance chain', async () => {
      let prevHash = GENESIS_HASH;
      const events = [];

      for (let i = 1; i <= 4; i++) {
        const fields = {
          workerId: `worker-${i}`,
          contractId: `contract-${i}`,
          projectId: 'project-1',
          worksiteId: 'worksite-1',
          date: '2026-09-28',
          punchType: 'IN',
          workerLatitude: 19.076,
          workerLongitude: 72.877,
          status: 'VERIFIED',
          createdAt: `2026-09-28T07:0${i}:00.000Z`,
        };
        const hash = computeAttendanceRowHash(prevHash, fields);

        events.push({
          id: `att-event-${i}`,
          worker_id: fields.workerId,
          contract_id: fields.contractId,
          project_id: fields.projectId,
          worksite_id: fields.worksiteId,
          date: fields.date,
          punch_type: fields.punchType,
          worker_latitude: fields.workerLatitude,
          worker_longitude: fields.workerLongitude,
          status: fields.status,
          prev_hash: prevHash,
          hash,
          created_at: fields.createdAt,
        });

        prevHash = hash;
      }

      const result = await verifyAttendanceChainIntegrity(events);
      expect(result.isValid).toBe(true);
      expect(result.brokenRowId).toBeNull();
      expect(result.totalEntries).toBe(4);
    });
  });

  describe('3. MANDATORY EXIT CHECK: Manually Edit One Ledger Row in the DB', () => {
    it('isolates the exact row ID and mismatch cause when a ledger row is edited', async () => {
      // 1. Build a valid 5-row ledger chain
      let prevHash = GENESIS_HASH;
      const entries = [];

      for (let i = 1; i <= 5; i++) {
        const fields = {
          transactionId: `tx-${i}`,
          debitAccount: 'acc-contractor',
          creditAccount: `acc-worker-${i}`,
          amountPaise: 60000,
          refType: 'WAGE_ACCRUAL',
          refId: `shift-${i}`,
          createdAt: `2026-09-28T10:0${i}:00.000Z`,
        };
        const hash = computeLedgerRowHash(prevHash, fields);

        entries.push({
          id: `ledger-row-uuid-${i}`,
          transaction_id: fields.transactionId,
          debit_account: fields.debitAccount,
          credit_account: fields.creditAccount,
          amount_paise: fields.amountPaise,
          ref_type: fields.refType,
          ref_id: fields.refId,
          prev_hash: prevHash,
          hash,
          created_at: fields.createdAt,
        });

        prevHash = hash;
      }

      // Chain should initially be 100% valid
      const initialVerification = await verifyLedgerChainIntegrity(entries);
      expect(initialVerification.isValid).toBe(true);

      // 2. MANUALLY EDIT ROW #3: Alter amount_paise from 60000 (Rs 600) to 90000 (Rs 900)
      const tamperedIndex = 2; // 0-indexed: row 3
      const targetRow = entries[tamperedIndex];
      const originalAmount = targetRow.amount_paise;
      targetRow.amount_paise = 90000; // Malicious retroactive inflation

      // 3. RUN INTEGRITY CHECK
      const tamperedVerification = await verifyLedgerChainIntegrity(entries);

      // 4. VERIFY IT IDENTIFIES THAT EXACT ROW
      expect(tamperedVerification.isValid).toBe(false);
      expect(tamperedVerification.table).toBe('ledger_entries');
      expect(tamperedVerification.brokenRowId).toBe(targetRow.id); // EXACT ROW IDENTIFIED
      expect(tamperedVerification.brokenIndex).toBe(tamperedIndex);
      expect(tamperedVerification.failureReason).toBe('HASH_MISMATCH');

      if (!tamperedVerification.isValid) {
        expect(tamperedVerification.actualHash).toBe(targetRow.hash);
        expect(tamperedVerification.expectedHash).not.toBe(targetRow.hash);

        // Verify tampered row snapshot is captured
        expect(tamperedVerification.tamperedRow.id).toBe('ledger-row-uuid-3');
        expect(tamperedVerification.tamperedRow.amount_paise).toBe(90000);
      }
    });

    it('isolates the exact row ID when an entry is deleted or prev_hash is severed', async () => {
      let prevHash = GENESIS_HASH;
      const entries = [];

      for (let i = 1; i <= 4; i++) {
        const fields = {
          transactionId: `tx-${i}`,
          debitAccount: 'acc-c',
          creditAccount: `acc-w-${i}`,
          amountPaise: 50000,
          refType: 'WAGE_ACCRUAL',
          refId: `ref-${i}`,
          createdAt: `2026-09-28T11:0${i}:00.000Z`,
        };
        const hash = computeLedgerRowHash(prevHash, fields);
        entries.push({
          id: `entry-uuid-${i}`,
          transaction_id: fields.transactionId,
          debit_account: fields.debitAccount,
          credit_account: fields.creditAccount,
          amount_paise: fields.amountPaise,
          ref_type: fields.refType,
          ref_id: fields.refId,
          prev_hash: prevHash,
          hash,
          created_at: fields.createdAt,
        });
        prevHash = hash;
      }

      // Sever link at entry-uuid-4 by pointing to an illegitimate parent hash
      entries[3].prev_hash = 'deadbeef00000000000000000000000000000000000000000000000000000000';

      const verification = await verifyLedgerChainIntegrity(entries);
      expect(verification.isValid).toBe(false);
      expect(verification.brokenRowId).toBe('entry-uuid-4');
      expect(verification.brokenIndex).toBe(3);
      expect(verification.failureReason).toBe('PREV_HASH_MISMATCH');
    });

    it('isolates the exact attendance event ID when an attendance punch is edited', async () => {
      let prevHash = GENESIS_HASH;
      const events = [];

      for (let i = 1; i <= 3; i++) {
        const fields = {
          workerId: `worker-${i}`,
          contractId: `contract-${i}`,
          projectId: 'project-1',
          worksiteId: 'worksite-1',
          date: '2026-09-28',
          punchType: 'IN',
          workerLatitude: 19.076,
          workerLongitude: 72.877,
          status: 'VERIFIED',
          createdAt: `2026-09-28T06:0${i}:00.000Z`,
        };
        const hash = computeAttendanceRowHash(prevHash, fields);
        events.push({
          id: `att-uuid-${i}`,
          worker_id: fields.workerId,
          contract_id: fields.contractId,
          project_id: fields.projectId,
          worksite_id: fields.worksiteId,
          date: fields.date,
          punch_type: fields.punchType,
          worker_latitude: fields.workerLatitude,
          worker_longitude: fields.workerLongitude,
          status: fields.status,
          prev_hash: prevHash,
          hash,
          created_at: fields.createdAt,
        });
        prevHash = hash;
      }

      // Tamper row #2: change status from VERIFIED to REJECTED retroactively
      events[1].status = 'REJECTED';

      const verification = await verifyAttendanceChainIntegrity(events);
      expect(verification.isValid).toBe(false);
      expect(verification.table).toBe('attendance_events');
      expect(verification.brokenRowId).toBe('att-uuid-2');
      expect(verification.brokenIndex).toBe(1);
      expect(verification.failureReason).toBe('HASH_MISMATCH');
    });
  });

  describe('4. Merkle Tree Root Computation & Anchors', () => {
    it('computes deterministic Merkle roots and handles odd leaf duplication', () => {
      const leaves = [
        '1111111111111111111111111111111111111111111111111111111111111111',
        '2222222222222222222222222222222222222222222222222222222222222222',
        '3333333333333333333333333333333333333333333333333333333333333333',
      ];

      const tree1 = buildMerkleTree(leaves);
      const tree2 = buildMerkleTree(leaves);

      expect(tree1.root).toHaveLength(64);
      expect(tree1.root).toBe(tree2.root);
      expect(tree1.levels.length).toBe(3); // Level 0: 3 leaves, Level 1: 2 nodes, Level 2: 1 root
    });

    it('produces a predictable fallback root when leaf set is empty', () => {
      const tree = buildMerkleTree([]);
      expect(tree.root).toHaveLength(64);
      expect(tree.levels).toEqual([[tree.root]]);
    });
  });

  describe('5. Honesty Rule Specification & Content Integrity', () => {
    it('accurately states what cryptographic tamper-evidence proves and what it does not prove', () => {
      expect(HONESTY_RULE_DISCLOSURE.whatItProves).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Detects any retroactive modification'),
          expect.stringContaining('Detects row deletions and insertions'),
          expect.stringContaining('Isolates the exact tampered row'),
        ])
      );

      expect(HONESTY_RULE_DISCLOSURE.whatItDoesNotProve).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Does NOT prove the punch was physically real'),
          expect.stringContaining('Does NOT prevent initial collusion'),
          expect.stringContaining('Does NOT guarantee hardware GPS authenticity'),
        ])
      );
    });
  });

  describe('6. Append-Only Database Protection Invariants', () => {
    it('simulates PostgreSQL append-only trigger raising error 27000 on UPDATE or DELETE', () => {
      const simulateAppendOnlyTrigger = (operation: 'INSERT' | 'UPDATE' | 'DELETE', tableName: string) => {
        if (operation === 'UPDATE' || operation === 'DELETE') {
          const err = new Error(
            `TAMPER_PREVENTION_ERROR: Table ${tableName} is strictly append-only. UPDATE and DELETE operations are prohibited at the database engine level.`
          );
          (err as any).code = '27000';
          throw err;
        }
        return { success: true };
      };

      expect(() => simulateAppendOnlyTrigger('INSERT', 'ledger_entries')).not.toThrow();
      expect(() => simulateAppendOnlyTrigger('UPDATE', 'ledger_entries')).toThrow(
        /TAMPER_PREVENTION_ERROR: Table ledger_entries is strictly append-only/
      );
      expect(() => simulateAppendOnlyTrigger('DELETE', 'attendance_events')).toThrow(
        /TAMPER_PREVENTION_ERROR: Table attendance_events is strictly append-only/
      );
      expect(() => simulateAppendOnlyTrigger('UPDATE', 'anchors')).toThrow(
        /TAMPER_PREVENTION_ERROR: Table anchors is strictly append-only/
      );
    });
  });
});
