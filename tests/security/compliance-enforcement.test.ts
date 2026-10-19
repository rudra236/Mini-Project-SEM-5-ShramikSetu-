import { describe, it, expect, beforeEach } from 'vitest';
import { buildCompleteSeedData, CompleteSeedData } from '../../supabase/seed/generator';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import {
  evaluateContractorRiskScore,
  runComplianceDetectionRules,
  getEnforcementFollowUpQueue,
  getFullEnforcementOverview,
  getContractorDrilldown,
  generateStatutoryAuditCsv,
} from '../../src/lib/services/enforcement-service';
import { paiseToRupees } from '../../src/types/payment.types';

describe('Compliance Enforcement & Fraud Detection Engine', () => {
  let dataset: CompleteSeedData;

  beforeEach(() => {
    dataset = buildCompleteSeedData();

    // Wire up in-memory mock client using the deterministic seed dataset
    setMockAdminClientFactory(() => ({
      from: (table: string) => {
        let store: any[] = [];
        switch (table) {
          case 'workers': store = dataset.workers; break;
          case 'contractors': store = dataset.contractors; break;
          case 'projects': store = dataset.projects; break;
          case 'worksites': store = dataset.worksites; break;
          case 'work_contracts': store = dataset.contracts.map((c) => {
            const w = dataset.workers.find((wrk) => wrk.id === c.worker_id);
            return {
              ...c,
              workers: w ? { id: w.id, full_name: w.full_name, internal_worker_id: w.internal_worker_id, occupation: w.occupation, skill_category: w.skill_category } : null,
            };
          }); break;
          case 'attendance_events': store = dataset.attendanceEvents.map((ae) => {
            const ws = dataset.worksites.find((w) => w.id === ae.worksite_id);
            const wrk = dataset.workers.find((w) => w.id === ae.worker_id);
            return {
              ...ae,
              worksites: ws ? { id: ws.id, name: ws.name, latitude: ws.latitude, longitude: ws.longitude } : null,
              workers: wrk ? { id: wrk.id, full_name: wrk.full_name } : null,
            };
          }); break;
          case 'payment_transactions': store = dataset.paymentTransactions.map((pt) => {
            const wrk = dataset.workers.find((w) => w.id === pt.worker_id);
            const prj = dataset.projects.find((p) => p.id === pt.project_id);
            return {
              ...pt,
              workers: wrk ? { id: wrk.id, full_name: wrk.full_name } : null,
              projects: prj ? { id: prj.id, name: prj.name } : null,
            };
          }); break;
          case 'ledger_entries': store = dataset.ledgerEntries; break;
          case 'disputes': store = dataset.disputes.map((d) => {
            const c = dataset.contractors.find((ctr) => ctr.id === d.contractor_id);
            const w = dataset.workers.find((wrk) => wrk.id === d.worker_id);
            return {
              ...d,
              contractors: c ? { company_name: c.company_name } : null,
              workers: w ? { full_name: w.full_name } : null,
            };
          }); break;
          case 'minimum_wage_rules': store = dataset.minimumWageRules; break;
          default: store = [];
        }

        let filtered = [...store];
        let isCount = false;
        let isHead = false;

        const chain: any = {
          select: (_fields?: string, opts?: any) => {
            if (opts?.count === 'exact') isCount = true;
            if (opts?.head === true) isHead = true;
            return chain;
          },
          eq: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] === val);
            return chain;
          },
          neq: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] !== val);
            return chain;
          },
          in: (field: string, vals: any[]) => {
            filtered = filtered.filter((r) => vals.includes(r[field]));
            return chain;
          },
          gte: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] >= val);
            return chain;
          },
          lte: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] <= val);
            return chain;
          },
          order: (_field: string, _opts?: any) => chain,
          limit: (n: number) => {
            filtered = filtered.slice(0, n);
            return chain;
          },
          single: async () => ({
            data: filtered[0] || null,
            error: filtered[0] ? null : { message: 'Row not found' },
          }),
          maybeSingle: async () => ({
            data: filtered[0] || null,
            error: null,
          }),
          then: (resolve: any) => {
            if (isCount && isHead) {
              return resolve({ data: null, count: filtered.length, error: null });
            }
            if (isCount) {
              return resolve({ data: filtered, count: filtered.length, error: null });
            }
            return resolve({ data: filtered, error: null });
          },
        };

        return chain;
      },
    }));
  });

  describe('1. Contractor Risk Score from Real Signals', () => {
    it('evaluates transparent 5-signal risk breakdown and components', async () => {
      const contractor = dataset.contractors[0]; // Suresh Builders
      const riskBreakdown = await evaluateContractorRiskScore(contractor.id);

      expect(riskBreakdown.contractorId).toBe(contractor.id);
      expect(riskBreakdown.compositeScore).toBeGreaterThanOrEqual(0);
      expect(riskBreakdown.compositeScore).toBeLessThanOrEqual(100);

      // Verify all 5 components are present
      const { onTimePayment, arrearsAge, disputeRate, minimumWageCompliance, flaggedPunchesFrequency } =
        riskBreakdown.components;

      expect(onTimePayment.weight).toBe(25);
      expect(onTimePayment.score).toBeLessThanOrEqual(25);

      expect(arrearsAge.weight).toBe(20);
      expect(arrearsAge.score).toBeLessThanOrEqual(20);

      expect(disputeRate.weight).toBe(20);
      expect(disputeRate.score).toBeLessThanOrEqual(20);

      expect(minimumWageCompliance.weight).toBe(20);
      expect(minimumWageCompliance.score).toBeLessThanOrEqual(20);

      expect(flaggedPunchesFrequency.weight).toBe(15);
      expect(flaggedPunchesFrequency.score).toBeLessThanOrEqual(15);

      // Verify composite score equals sum of components
      const componentSum =
        onTimePayment.score +
        arrearsAge.score +
        disputeRate.score +
        minimumWageCompliance.score +
        flaggedPunchesFrequency.score;

      expect(riskBreakdown.compositeScore).toBe(componentSum);

      // Verify explanations describe the deductions
      expect(riskBreakdown.summaryExplanations.length).toBeGreaterThan(0);
      expect(riskBreakdown.summaryExplanations.some((e) => e.includes('pts'))).toBe(true);
    });
  });

  describe('2. Detection Rules with Explanations & Evidence', () => {
    it('detects minimum wage violations with exact shortfall, explanation, and evidence row', async () => {
      const violations = await runComplianceDetectionRules({ ruleType: 'RULE_MINIMUM_WAGE' });
      const mwViolations = violations.filter((v) => v.ruleType === 'RULE_MINIMUM_WAGE');

      expect(mwViolations.length).toBeGreaterThan(0);

      const firstViolation = mwViolations[0];
      expect(firstViolation.ruleTitle).toBe('Statutory Minimum Wage Violation');
      expect(firstViolation.whyItFired).toContain('below statutory minimum wage');
      expect(firstViolation.whyItFired).toMatch(/₹\d+/);
      expect(firstViolation.regulatoryReference).toContain('Notification');

      // Verify structured evidence rows
      expect(firstViolation.evidenceRows.length).toBeGreaterThan(0);
      const ev = firstViolation.evidenceRows[0];
      expect(ev.table).toBe('work_contracts');
      expect(ev.details.shortfallPaise).toBeGreaterThan(0);
      expect(ev.details.statutoryWagePaise).toBeGreaterThan(ev.details.contractWagePaise);
    });

    it('detects ghost worker scenario (paid but zero muster records) with evidence', async () => {
      // Inject ghost worker payment: worker 30 gets paid under contractor 0 without any attendance events
      const ghostWorker = dataset.workers[29]; // worker 30
      const ghostContract = dataset.contracts.find((c) => c.worker_id === ghostWorker.id)!;

      dataset.paymentTransactions.push({
        id: 'txn-ghost-999',
        worker_id: ghostWorker.id,
        contractor_id: ghostContract.contractor_id,
        contract_id: ghostContract.id,
        project_id: ghostContract.project_id,
        amount_paise: 250000, // ₹2,500
        status: 'SUCCESS',
        claimed_at: '2026-08-15T10:00:00Z',
        workers: { id: ghostWorker.id, full_name: ghostWorker.full_name },
        projects: { id: ghostContract.project_id, name: 'Ghost Project Site' },
      });

      // Remove any attendance events for this worker on this contract
      dataset.attendanceEvents = dataset.attendanceEvents.filter(
        (ae) => !(ae.worker_id === ghostWorker.id && ae.contract_id === ghostContract.id)
      );

      const violations = await runComplianceDetectionRules({
        contractorId: ghostContract.contractor_id,
        ruleType: 'RULE_GHOST_WORKER',
      });

      const ghostViolations = violations.filter((v) => v.ruleType === 'RULE_GHOST_WORKER');
      expect(ghostViolations.length).toBeGreaterThan(0);

      const gv = ghostViolations[0];
      expect(gv.ruleTitle).toContain('Ghost Worker');
      expect(gv.whyItFired).toContain('zero verified attendance muster records');
      expect(gv.evidenceRows.some((er) => er.table === 'payment_transactions')).toBe(true);
    });

    it('detects duplicate worker across sites on the same day with impossible travel evidence', async () => {
      const worker = dataset.workers[1];
      const worksiteA = dataset.worksites[0];
      const worksiteB = dataset.worksites[1]; // Distance ~ 5 km apart

      // Inject simultaneous attendance punches at site A and site B on the same date
      dataset.attendanceEvents.push(
        {
          id: 'ae-dupe-1',
          worker_id: worker.id,
          contractor_id: dataset.contractors[0].id,
          worksite_id: worksiteA.id,
          date: '2026-08-25',
          punch_type: 'IN',
          worker_latitude: worksiteA.latitude,
          worker_longitude: worksiteA.longitude,
          status: 'VERIFIED',
          created_at: '2026-08-25T08:00:00Z',
          workers: { full_name: worker.full_name },
          worksites: { id: worksiteA.id, name: worksiteA.name },
        },
        {
          id: 'ae-dupe-2',
          worker_id: worker.id,
          contractor_id: dataset.contractors[0].id,
          worksite_id: worksiteB.id,
          date: '2026-08-25',
          punch_type: 'IN',
          worker_latitude: worksiteB.latitude,
          worker_longitude: worksiteB.longitude,
          status: 'VERIFIED',
          created_at: '2026-08-25T08:15:00Z',
          workers: { full_name: worker.full_name },
          worksites: { id: worksiteB.id, name: worksiteB.name },
        }
      );

      const violations = await runComplianceDetectionRules({
        contractorId: dataset.contractors[0].id,
        ruleType: 'RULE_DUPLICATE_WORKER',
      });

      const dupeViolations = violations.filter((v) => v.ruleType === 'RULE_DUPLICATE_WORKER');
      expect(dupeViolations.length).toBeGreaterThan(0);

      const dv = dupeViolations[0];
      expect(dv.severity).toBe('CRITICAL');
      expect(dv.whyItFired).toContain('Physically impossible travel conflict');
      expect(dv.evidenceRows.length).toBe(2);
      expect(dv.evidenceRows[0].table).toBe('attendance_events');
    });

    it('detects sudden attendance pattern anomalies on a worksite', async () => {
      const testWorksite = {
        id: 'ws-anomaly-site-99',
        project_id: dataset.projects[0].id,
        name: 'Isolated Anomaly Test Yard',
        latitude: 19.12,
        longitude: 72.85,
        allowed_radius_meters: 100,
        address: 'Test Site',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400051',
      };
      dataset.worksites.push(testWorksite);
      const contractor = dataset.contractors[0];

      // Inject baseline 2 punches/day across 3 days, and surge of 18 punches on day 4
      const dates = ['2026-08-01', '2026-08-02', '2026-08-03'];
      dates.forEach((d) => {
        for (let k = 0; k < 2; k++) {
          dataset.attendanceEvents.push({
            id: `ae-base-${d}-${k}`,
            worker_id: dataset.workers[k].id,
            contractor_id: contractor.id,
            worksite_id: testWorksite.id,
            date: d,
            status: 'VERIFIED',
            worksites: { id: testWorksite.id, name: testWorksite.name },
          });
        }
      });

      // Surge of 18 punches on 2026-08-04 (> 800% surge)
      for (let k = 0; k < 18; k++) {
        dataset.attendanceEvents.push({
          id: `ae-surge-${k}`,
          worker_id: dataset.workers[k % dataset.workers.length].id,
          contractor_id: contractor.id,
          worksite_id: testWorksite.id,
          date: '2026-08-04',
          status: 'VERIFIED',
          worksites: { id: testWorksite.id, name: testWorksite.name },
        });
      }

      const violations = await runComplianceDetectionRules({
        contractorId: contractor.id,
        ruleType: 'RULE_ATTENDANCE_ANOMALY',
      });

      const surgeViolations = violations.filter((v) => v.ruleType === 'RULE_ATTENDANCE_ANOMALY');
      expect(surgeViolations.length).toBeGreaterThan(0);
      expect(surgeViolations[0].whyItFired).toContain('surge over the baseline average');
    });
  });

  describe('3. Notification Follow-Up Queue with SLA Countdown Timers', () => {
    it('enqueues follow-up items with real hours remaining and SLA statuses', async () => {
      const queue = await getEnforcementFollowUpQueue();
      expect(queue.length).toBeGreaterThan(0);

      const firstItem = queue[0];
      expect(firstItem.id).toBeDefined();
      expect(firstItem.title).toBeDefined();
      expect(firstItem.slaDeadline).toBeDefined();
      expect(typeof firstItem.slaHoursRemaining).toBe('number');
      expect(['ON_TRACK', 'URGENT_ATTENTION', 'SLA_BREACHED']).toContain(firstItem.slaStatus);
      expect(firstItem.actionRequired).toBeDefined();
    });
  });

  describe('4. Full 4-Tier Drill-Down Hierarchy', () => {
    it('drills down from Contractor -> Workers -> Shifts -> Double-Entry Ledger Rows', async () => {
      const contractorId = dataset.contractors[0].id;
      const drilldown = await getContractorDrilldown(contractorId);

      expect(drilldown.contractor.id).toBe(contractorId);
      expect(drilldown.workers.length).toBeGreaterThan(0);

      const worker = drilldown.workers[0];
      expect(worker.workerName).toBeDefined();
      expect(worker.dailyWagePaise).toBeGreaterThan(0);
      expect(worker.statutoryWagePaise).toBeGreaterThan(0);

      // Verify shift and ledger rows
      if (worker.shifts.length > 0) {
        const shift = worker.shifts[0];
        expect(shift.date).toBeDefined();
        expect(shift.status).toBeDefined();
        expect(Array.isArray(shift.ledgerRows)).toBe(true);
      }
    });
  });

  describe('5. Statutory Audit Exporter', () => {
    it('generates formatted CSV audit ledger with all component columns', async () => {
      const overview = await getFullEnforcementOverview();
      const csv = generateStatutoryAuditCsv(overview);

      expect(csv).toContain('Contractor ID,Company Name,License Number');
      expect(csv).toContain('On-Time Payment (%)');
      expect(csv).toContain('Arrears (INR)');
      expect(csv).toContain('Dispute Count');
      expect(csv).toContain('Underpaid Contracts');
      expect(csv).toContain(dataset.contractors[0].company_name);
    });
  });

  describe('6. MANDATORY EXIT CHECK: Seeded Violations vs Compliant Entities', () => {
    it('detects each seeded violation with correct explanation, and has ZERO false flags on compliant contractor', async () => {
      const overview = await getFullEnforcementOverview();

      // Contractor 1: Apex Metro Infrastructure Ltd (DESIGNED TO BE FULLY COMPLIANT)
      const apexContractor = dataset.contractors[1];
      const apexScore = overview.contractorRiskRoster.find((c) => c.contractorId === apexContractor.id);

      expect(apexScore).toBeDefined();
      // Apex pays above benchmark across all categories, has 0 disputes, 0 arrears
      expect(apexScore!.riskLevel).toBe('GOOD_STANDING');
      expect(apexScore!.compositeScore).toBeGreaterThanOrEqual(85);

      // ASSERT ZERO FALSE FLAGS ON APEX (COMPLIANT CONTRACTOR)
      const apexViolations = overview.violations.filter((v) => v.contractorId === apexContractor.id);
      expect(apexViolations.length).toBe(0); // ZERO FALSE POSITIVES!

      // Contractor 0: Suresh Builders (Underpays unskilled workers ₹600 < ₹650)
      const sureshContractor = dataset.contractors[0];
      const sureshViolations = overview.violations.filter((v) => v.contractorId === sureshContractor.id);
      expect(sureshViolations.length).toBeGreaterThan(0);
      expect(
        sureshViolations.some((v) => v.ruleType === 'RULE_MINIMUM_WAGE' && v.whyItFired.includes('600'))
      ).toBe(true);

      // Contractor 2: Sahyadri Civil Works (Underpays semi-skilled workers ₹700 < ₹750)
      const sahyadriContractor = dataset.contractors[2];
      const sahyadriViolations = overview.violations.filter((v) => v.contractorId === sahyadriContractor.id);
      expect(sahyadriViolations.length).toBeGreaterThan(0);
      expect(
        sahyadriViolations.some((v) => v.ruleType === 'RULE_MINIMUM_WAGE' && v.whyItFired.includes('700'))
      ).toBe(true);

      // Contractor 3: Konkan Urban Developers (Underpays skilled ₹750 < ₹850 & unskilled ₹550 < ₹650)
      const konkanContractor = dataset.contractors[3];
      const konkanViolations = overview.violations.filter((v) => v.contractorId === konkanContractor.id);
      expect(konkanViolations.length).toBeGreaterThan(0);
      expect(
        konkanViolations.some((v) => v.ruleType === 'RULE_MINIMUM_WAGE' && (v.whyItFired.includes('750') || v.whyItFired.includes('550')))
      ).toBe(true);
    });
  });
});
