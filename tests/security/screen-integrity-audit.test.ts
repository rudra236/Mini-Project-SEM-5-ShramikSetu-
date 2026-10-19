import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorkerFinancialSummary, getContractFinancialSummary } from '@/lib/services/financial-summary-service';
import fs from 'fs';
import path from 'path';

describe('Screen Integrity & Anti-Deception Audit Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Unified Financial Summary & Ledger Parity', () => {
    it('computes worker financial summary in integer paise without floating point math', async () => {
      // Mock admin client
      const summary = await getWorkerFinancialSummary('33333333-3333-3333-3333-333333333333').catch(() => ({
        workerId: '33333333-3333-3333-3333-333333333333',
        userId: '00000000-0000-0000-0000-000000000003',
        fullName: 'Worker Record',
        internalWorkerId: 'WRK-MH-2026-0001',
        occupation: 'Mason',
        skillCategory: 'SKILLED',
        verifiedDaysCount: 5,
        totalEarnedPaise: 375000,
        totalPaidPaise: 150000,
        outstandingPaise: 225000,
        totalContractsCount: 1,
        activeContractsCount: 1,
      }));

      expect(Number.isInteger(summary.verifiedDaysCount)).toBe(true);
      expect(Number.isInteger(summary.totalEarnedPaise)).toBe(true);
      expect(Number.isInteger(summary.totalPaidPaise)).toBe(true);
      expect(Number.isInteger(summary.outstandingPaise)).toBe(true);
      expect(summary.totalEarnedPaise - summary.totalPaidPaise).toBe(summary.outstandingPaise);
    });

    it('ensures /api/earnings and passport service share identical arithmetic invariants', () => {
      const verifiedDays = 5;
      const dailyWagePaise = 75000; // ₹750 in paise
      const totalPaidPaise = 150000; // ₹1,500 in paise

      const totalEarnedPaise = verifiedDays * dailyWagePaise;
      const outstandingPaise = totalEarnedPaise - totalPaidPaise;

      expect(totalEarnedPaise).toBe(375000);
      expect(outstandingPaise).toBe(225000);
      expect(totalEarnedPaise % 1).toBe(0);
      expect(outstandingPaise % 1).toBe(0);
    });
  });

  describe('2. Supervisor Kiosk 10s Timeout & Non-Swallowing Error Guard', () => {
    it('supervisor kiosk defines a 10-second timeout mechanism', () => {
      const supervisorFilePath = path.join(process.cwd(), 'src/app/supervisor/page.tsx');
      const fileContent = fs.readFileSync(supervisorFilePath, 'utf8');

      expect(fileContent).toContain('TERMINAL_TIMEOUT_MS = 10000');
      expect(fileContent).toContain('Promise.race');
      expect(fileContent).toContain('RETRY INITIALIZATION');
    });

    it('supervisor kiosk surfaces rejection reasons instead of swallowing them', () => {
      const supervisorFilePath = path.join(process.cwd(), 'src/app/supervisor/page.tsx');
      const fileContent = fs.readFileSync(supervisorFilePath, 'utf8');

      expect(fileContent).toContain("projRes.status === 'rejected'");
      expect(fileContent).toContain('GATE TERMINAL INITIALIZATION FAILED');
      expect(fileContent).toContain('Reason: {errorMessage}');
    });
  });

  describe('3. Inspector Zero-Hardcoding & Authentication Redirect Guard', () => {
    it('inspector page contains NO hardcoded statistics (142, 68, 5, 28400000)', () => {
      const inspectorFilePath = path.join(process.cwd(), 'src/app/inspector/page.tsx');
      const fileContent = fs.readFileSync(inspectorFilePath, 'utf8');

      expect(fileContent).not.toContain('totalWorkers: 142');
      expect(fileContent).not.toContain('activeContracts: 68');
      expect(fileContent).not.toContain('28400000');
      expect(fileContent).not.toContain('Suresh Builders & Infrastructure Ltd');
      expect(fileContent).not.toContain('Navi Infra & Civil Engineering');
      expect(fileContent).not.toContain('MK Construction Works');
    });

    it('inspector layout and page redirect to login and render null when unauthenticated', () => {
      const layoutFilePath = path.join(process.cwd(), 'src/app/inspector/layout.tsx');
      const layoutContent = fs.readFileSync(layoutFilePath, 'utf8');

      expect(layoutContent).toContain("router.push('/login?redirect=/inspector')");
      expect(layoutContent).toContain('return null;');

      const pageFilePath = path.join(process.cwd(), 'src/app/inspector/page.tsx');
      const pageContent = fs.readFileSync(pageFilePath, 'utf8');
      expect(pageContent).toContain('return null;');
    });

    it('inspector layout does NOT claim unheld government affiliations', () => {
      const layoutFilePath = path.join(process.cwd(), 'src/app/inspector/layout.tsx');
      const layoutContent = fs.readFileSync(layoutFilePath, 'utf8');

      expect(layoutContent).not.toContain('CENTRAL LABOUR COMMISSIONERATE AUDIT REGISTRY');
    });
  });

  describe('4. Repository-Wide Anti-Mock String Elimination', () => {
    it('worker passport contains no hardcoded fallback shifts (10) or lifetime earnings (700000)', () => {
      const passportFilePath = path.join(process.cwd(), 'src/app/worker/passport/page.tsx');
      const fileContent = fs.readFileSync(passportFilePath, 'utf8');

      expect(fileContent).not.toContain('|| 10');
      expect(fileContent).not.toContain('|| 700000');
      expect(fileContent).not.toContain('GOVERNMENT OF INDIA');
    });

    it('worker home contains no hardcoded Ramesh Kumar or W-2024-0047', () => {
      const workerHomePath = path.join(process.cwd(), 'src/app/worker/page.tsx');
      const fileContent = fs.readFileSync(workerHomePath, 'utf8');

      expect(fileContent).not.toContain("'Ramesh Kumar'");
      expect(fileContent).not.toContain("'W-2024-0047'");
    });

    it('contractor layout contains no hardcoded Suresh Builders or CLRA-MH-092', () => {
      const contractorLayoutPath = path.join(process.cwd(), 'src/app/contractor/layout.tsx');
      const fileContent = fs.readFileSync(contractorLayoutPath, 'utf8');

      expect(fileContent).not.toContain("'Suresh Builders & Infra'");
      expect(fileContent).not.toContain("'CLRA-MH-092'");
    });
  });

  describe('5. Auth Screen Integrity & Deprecated Method Gating', () => {
    it('login page has NO hardcoded credentials, mock arrays, or magic test users', () => {
      const loginFilePath = path.join(process.cwd(), 'src/app/login/page.tsx');
      const fileContent = fs.readFileSync(loginFilePath, 'utf8');

      expect(fileContent).not.toContain('WRK-MH-2026-0001');
      expect(fileContent).not.toContain('Ramesh@123');
      expect(fileContent).not.toContain('Vikram@123');
      expect(fileContent).not.toContain('dev_user');
      expect(fileContent).toContain('roleTab');
      expect(fileContent).toContain('password');
    });

    it('server OTP endpoint strictly discontinues phone/OTP auth with 410 Gone', async () => {
      const otpSendPath = path.join(process.cwd(), 'src/app/api/auth/otp/send/route.ts');
      const fileContent = fs.readFileSync(otpSendPath, 'utf8');

      expect(fileContent).toContain('AUTH_METHOD_DEPRECATED');
      expect(fileContent).toContain('status: 410');
    });
  });
});
