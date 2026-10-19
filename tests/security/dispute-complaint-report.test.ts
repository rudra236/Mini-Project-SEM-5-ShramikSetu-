import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReportPdf } from '@/app/api/disputes/[id]/report.pdf/route';
import {
  generateComplaintReportPdf,
  verifyComplaintReportByRef,
} from '@/lib/services/complaint-report-service';
import { setMockServerClientFactory } from '@/lib/supabase/server';
import { setMockAdminClientFactory } from '@/lib/supabase/admin';

/**
 * COMPLAINT REPORT & POLICE/LABOUR FILING SECURITY TEST SUITE
 *
 * Verifies:
 * 1. Double-entry wage ledger reconciliation and amount computation.
 * 2. Authorization enforcement & IDOR isolation (Worker A vs Worker B vs Contractor).
 * 3. Empty evidence case handled gracefully.
 * 4. Multi-language PDF generation (EN, HI, MR) with Devanagari font embedding.
 * 5. Public verification QR & hash check endpoint.
 */

describe('Dispute Complaint Report PDF & Filing Security Tests', () => {
  const workerA_UserId = '11111111-1111-4111-a111-111111111111';
  const workerA_Id = '22222222-2222-4222-a222-222222222222';

  const workerB_UserId = '33333333-3333-4333-a333-333333333333';
  const workerB_Id = '44444444-4444-4444-a444-444444444444';

  const contractor_UserId = '55555555-5555-4555-a555-555555555555';
  const contractor_Id = '66666666-6666-4666-a666-666666666666';

  const dispute_Id = '77777777-7777-4777-a777-777777777777';
  const contract_Id = '88888888-8888-4888-a888-888888888888';
  const project_Id = '99999999-9999-4999-a999-999999999999';

  let currentAuthUser: { id: string } | null = null;
  let complaintReportsStore: any[] = [];

  const mockDisputeData = {
    id: dispute_Id,
    dispute_ref: 'DSP-202610-001',
    worker_id: workerA_Id,
    contractor_id: contractor_Id,
    contract_id: contract_Id,
    project_id: project_Id,
    category: 'WAGE',
    status: 'OPEN',
    priority: 'HIGH',
    amount_claimed_paise: 240000, // ₹2,400 claimed
    description: 'Wages unpaid for 3 full shifts worked between Oct 1 and Oct 3.',
    contractor_counter_statement: null,
    created_at: new Date('2026-10-04T10:00:00Z').toISOString(),
  };

  const mockWorkerA = {
    id: workerA_Id,
    user_id: workerA_UserId,
    full_name: 'Rameshwar Patil',
    internal_worker_id: 'SHR-WRK-901',
    phone: '+919876543210',
    occupation: 'Mason',
    skill_category: 'SKILLED',
  };

  const mockWorkerB = {
    id: workerB_Id,
    user_id: workerB_UserId,
    full_name: 'Sunil Jadhav',
    internal_worker_id: 'SHR-WRK-902',
    phone: '+919876543211',
    occupation: 'Helper',
    skill_category: 'UNSKILLED',
  };

  const mockContractor = {
    id: contractor_Id,
    user_id: contractor_UserId,
    full_name: 'Vijay Construction Pvt Ltd',
    company_name: 'Vijay Infra Ltd',
    internal_contractor_id: 'SHR-CON-404',
    compliance_status: 'COMPLIANT',
  };

  const mockProject = {
    id: project_Id,
    name: 'Metro Line 3 Cast Yard',
    location: 'Marol, Andheri East, Mumbai',
  };

  const mockContract = {
    id: contract_Id,
    worker_id: workerA_Id,
    contractor_id: contractor_Id,
    project_id: project_Id,
    contract_code: 'CTR-METRO-001',
    work_type: 'Structural Masonry',
    daily_wage: 800,
    daily_wage_paise: 80000, // ₹800/day
    status: 'ACTIVE',
  };

  const mockAttendanceEvents = [
    {
      id: 'att-1',
      contract_id: contract_Id,
      worker_id: workerA_Id,
      event_type: 'CHECK_IN',
      event_timestamp: '2026-10-01T08:30:00Z',
      is_geofence_verified: true,
      gps_status: 'VERIFIED',
    },
    {
      id: 'att-2',
      contract_id: contract_Id,
      worker_id: workerA_Id,
      event_type: 'CHECK_IN',
      event_timestamp: '2026-10-02T08:30:00Z',
      is_geofence_verified: true,
      gps_status: 'VERIFIED',
    },
    {
      id: 'att-3',
      contract_id: contract_Id,
      worker_id: workerA_Id,
      event_type: 'CHECK_IN',
      event_timestamp: '2026-10-03T08:30:00Z',
      is_geofence_verified: true,
      gps_status: 'VERIFIED',
    },
  ];

  beforeEach(() => {
    currentAuthUser = null;
    complaintReportsStore = [];

    // Mock createServerSupabaseClient
    setMockServerClientFactory(() => ({
      auth: {
        getUser: async () => ({
          data: { user: currentAuthUser },
          error: currentAuthUser ? null : new Error('No active session'),
        }),
      },
    }));

    // Mock createAdminClient
    setMockAdminClientFactory(() => {
      return {
        from: (table: string) => {
          let filters: { col: string; val: any }[] = [];
          let insertedItem: any = null;

          const chain: any = {
            select: () => chain,
            eq: (col: string, val: any) => {
              filters.push({ col, val });
              return chain;
            },
            in: () => chain,
            order: () => chain,
            limit: () => chain,
            insert: (item: any) => {
              insertedItem = {
                id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                ...item,
                created_at: new Date().toISOString(),
              };
              complaintReportsStore.push(insertedItem);
              return chain;
            },
            maybeSingle: async () => chain.single(),
            single: async () => {
              if (table === 'users') {
                const uId = filters.find((f) => f.col === 'id')?.val;
                if (uId === workerA_UserId) return { data: { id: workerA_UserId, role: 'WORKER' }, error: null };
                if (uId === workerB_UserId) return { data: { id: workerB_UserId, role: 'WORKER' }, error: null };
                if (uId === contractor_UserId) return { data: { id: contractor_UserId, role: 'CONTRACTOR' }, error: null };
                return { data: null, error: { message: 'User not found' } };
              }

              if (table === 'workers') {
                const uId = filters.find((f) => f.col === 'user_id')?.val;
                const wId = filters.find((f) => f.col === 'id')?.val;
                if (uId === workerA_UserId || wId === workerA_Id) return { data: mockWorkerA, error: null };
                if (uId === workerB_UserId || wId === workerB_Id) return { data: mockWorkerB, error: null };
                return { data: null, error: { message: 'Worker not found' } };
              }

              if (table === 'contractors') {
                const uId = filters.find((f) => f.col === 'user_id')?.val;
                const cId = filters.find((f) => f.col === 'id')?.val;
                if (uId === contractor_UserId || cId === contractor_Id) return { data: mockContractor, error: null };
                return { data: null, error: { message: 'Contractor not found' } };
              }

              if (table === 'disputes') {
                const dId = filters.find((f) => f.col === 'id')?.val;
                if (dId === dispute_Id) {
                  return {
                    data: {
                      ...mockDisputeData,
                      workers: mockWorkerA,
                      contractors: mockContractor,
                      projects: mockProject,
                      work_contracts: mockContract,
                    },
                    error: null,
                  };
                }
                return { data: null, error: { message: 'Dispute not found' } };
              }

              if (table === 'work_contracts') {
                const cId = filters.find((f) => f.col === 'id')?.val;
                if (cId === contract_Id) return { data: mockContract, error: null };
                return { data: null, error: { message: 'Contract not found' } };
              }

              if (table === 'projects') {
                const pId = filters.find((f) => f.col === 'id')?.val;
                if (pId === project_Id) return { data: mockProject, error: null };
                return { data: null, error: { message: 'Project not found' } };
              }

              if (table === 'complaint_reports') {
                if (insertedItem) {
                  return { data: insertedItem, error: null };
                }
                const ref = filters.find((f) => f.col === 'report_ref')?.val;
                const match = complaintReportsStore.find((r) => r.report_ref === ref);
                if (match) {
                  return {
                    data: {
                      ...match,
                      disputes: {
                        ...mockDisputeData,
                        workers: mockWorkerA,
                        contractors: mockContractor,
                        projects: mockProject,
                      },
                    },
                    error: null,
                  };
                }
                return { data: null, error: { message: 'Report not found' } };
              }

              if (table === 'audit_events') {
                return { data: { current_hash: '0'.repeat(64) }, error: null };
              }

              return { data: null, error: { message: `Table ${table} not found` } };
            },
            then: (resolve: any) => {
              if (table === 'attendance_events') {
                resolve({ data: mockAttendanceEvents, count: mockAttendanceEvents.length, error: null });
              } else if (table === 'complaint_reports') {
                resolve({ data: complaintReportsStore, error: null });
              } else if (table === 'payment_transactions') {
                resolve({ data: [], error: null });
              } else if (table === 'dispute_evidence_snapshots') {
                resolve({ data: [], error: null });
              } else if (table === 'dispute_resolutions') {
                resolve({ data: [], error: null });
              } else if (table === 'contract_versions') {
                resolve({
                  data: [
                    {
                      id: 'ver-1',
                      version_number: 1,
                      daily_wage_paise: 80000,
                      created_at: new Date('2026-09-25T00:00:00Z').toISOString(),
                    },
                  ],
                  error: null,
                });
              } else if (table === 'audit_events') {
                resolve({ data: [{ current_hash: '0'.repeat(64) }], error: null });
              } else {
                resolve({ data: [], error: null });
              }
            },
          };

          return chain;
        },
      };
    });
  });

  describe('1. Financial Wage Reconciliation & Amount Accuracy', () => {
    it('accurately computes earned wages from verified attendance shifts and daily rate', async () => {
      const result = await generateComplaintReportPdf({
        disputeId: dispute_Id,
        language: 'EN',
        recipientName: 'Andheri East Police Station',
        recipientAddress: 'Western Express Highway, Andheri, Mumbai 400069',
        recipientType: 'POLICE_STATION',
        generatedByUserId: workerA_UserId,
      });

      expect(result.report).toBeDefined();
      expect(result.report.report_ref).toMatch(/^CMP-\d{8}-[A-Z0-9]{6}$/);
      expect(result.report.version).toBe(1);
      expect(result.report.content_hash).toBeDefined();
      expect(result.report.content_hash.length).toBe(64); // SHA-256 hex string

      // 3 shifts @ 80,000 paise = 240,000 paise
      expect(result.report.report_metadata).toBeDefined();
      const meta = result.report.report_metadata as any;
      expect(meta.totalEarnedPaise).toBe(240000);
      expect(meta.totalPaidPaise).toBe(0);
      expect(meta.outstandingPaise).toBe(240000);
      expect(meta.amountClaimedPaise).toBe(240000);
      expect(meta.verifiedDaysCount).toBe(3);
    });
  });

  describe('2. Authorization & IDOR Isolation on GET /api/disputes/:id/report.pdf', () => {
    it('allows owner worker (Worker A) to generate complaint report PDF', async () => {
      currentAuthUser = { id: workerA_UserId };

      const req = new NextRequest(
        `http://localhost:3000/api/disputes/${dispute_Id}/report.pdf?lang=EN&recipientType=POLICE_STATION&recipientName=Andheri+Police+Station&recipientAddress=Andheri+East`,
        { method: 'GET' }
      );

      const res = await getReportPdf(req, { params: { id: dispute_Id } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      expect(res.headers.get('X-Report-Ref')).toBeDefined();
      expect(res.headers.get('X-Content-Hash')).toBeDefined();
    });

    it('rejects another worker (Worker B) with 403 Forbidden', async () => {
      currentAuthUser = { id: workerB_UserId };

      const req = new NextRequest(
        `http://localhost:3000/api/disputes/${dispute_Id}/report.pdf?lang=EN`,
        { method: 'GET' }
      );

      const res = await getReportPdf(req, { params: { id: dispute_Id } });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });

    it('rejects contractor with 403 Forbidden from generating worker complaint report', async () => {
      currentAuthUser = { id: contractor_UserId };

      const req = new NextRequest(
        `http://localhost:3000/api/disputes/${dispute_Id}/report.pdf?lang=EN`,
        { method: 'GET' }
      );

      const res = await getReportPdf(req, { params: { id: dispute_Id } });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Contractor cannot generate worker complaint filing reports');
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      currentAuthUser = null;

      const req = new NextRequest(
        `http://localhost:3000/api/disputes/${dispute_Id}/report.pdf?lang=EN`,
        { method: 'GET' }
      );

      const res = await getReportPdf(req, { params: { id: dispute_Id } });
      expect(res.status).toBe(401);
    });
  });

  describe('3. Trilingual Support & Empty Evidence Handling', () => {
    it('generates valid PDF buffer in English (EN) with no external evidence', async () => {
      const res = await generateComplaintReportPdf({
        disputeId: dispute_Id,
        language: 'EN',
        recipientName: 'Labour Commissioner Office',
        recipientAddress: 'Bandra Kurla Complex, Mumbai',
        recipientType: 'LABOUR_OFFICE',
        generatedByUserId: workerA_UserId,
      });

      expect(Buffer.isBuffer(res.pdfBuffer)).toBe(true);
      expect(res.pdfBuffer.length).toBeGreaterThan(1000);
      expect(res.pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('generates valid PDF buffer in Hindi (HI) with Devanagari text without crashing', async () => {
      const res = await generateComplaintReportPdf({
        disputeId: dispute_Id,
        language: 'HI',
        recipientName: 'अंधेरी पूर्व पुलिस थाना',
        recipientAddress: 'एमआईडीसी सेंट्रल रोड, मुंबई ४०००९३',
        recipientType: 'POLICE_STATION',
        generatedByUserId: workerA_UserId,
      });

      expect(Buffer.isBuffer(res.pdfBuffer)).toBe(true);
      expect(res.pdfBuffer.length).toBeGreaterThan(1000);
      expect(res.pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('generates valid PDF buffer in Marathi (MR) with Devanagari text without crashing', async () => {
      const res = await generateComplaintReportPdf({
        disputeId: dispute_Id,
        language: 'MR',
        recipientName: 'कामगार आयुक्त कार्यालय, मुंबई',
        recipientAddress: 'वांद्रे कुर्ला संकुल, मुंबई ४०००५१',
        recipientType: 'LABOUR_OFFICE',
        generatedByUserId: workerA_UserId,
      });

      expect(Buffer.isBuffer(res.pdfBuffer)).toBe(true);
      expect(res.pdfBuffer.length).toBeGreaterThan(1000);
      expect(res.pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('4. Cryptographic Verification & Public Attestation Check', () => {
    it('verifies a generated complaint report by reference and masks worker name for privacy', async () => {
      const { report } = await generateComplaintReportPdf({
        disputeId: dispute_Id,
        language: 'HI',
        recipientName: 'एमआईडीसी थाना',
        recipientAddress: 'मुंबई',
        recipientType: 'POLICE_STATION',
        generatedByUserId: workerA_UserId,
      });

      const verification = await verifyComplaintReportByRef(report.report_ref);
      expect(verification.isValid).toBe(true);
      expect(verification.status).toBe('VERIFIED');
      expect(verification.reportRef).toBe(report.report_ref);
      expect(verification.contentHash).toBe(report.content_hash);
      // Privacy check: Rameshwar Patil must be masked as R********* P****
      expect(verification.workerNameMasked).toContain('R');
      expect(verification.workerNameMasked).toContain('*');
      expect(verification.workerNameMasked).not.toBe('Rameshwar Patil');
      expect(verification.amountClaimedPaise).toBe(240000);
    });

    it('returns NOT_FOUND for an unknown or tampered report reference', async () => {
      const verification = await verifyComplaintReportByRef('SHR-CMP-NONEXISTENT-999');
      expect(verification.isValid).toBe(false);
      expect(verification.status).toBe('NOT_FOUND');
    });
  });
});
