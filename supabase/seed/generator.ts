/**
 * SHRAMIKSETU DETERMINISTIC LIVING SYSTEM BUILDER
 *
 * Compiles all relational entities into a cohesive, perfectly reconciled state.
 */

import { SEED_IDS, WORKERS_ROSTER, MINIMUM_WAGE_BENCHMARKS, padZero, WorkerSeedDef } from './dataset';
import type {
  UserRole,
  ContractStatus,
  AttendanceStatus,
  PaymentStatus,
  LedgerDirection,
  DisputeCategoryEnum,
  DisputeStatusEnum,
  DisputePriorityEnum,
  SettlementStatusEnum,
} from '@/types/database.types';

export interface CompleteSeedData {
  authUsers: any[];
  users: any[];
  profiles: any[];
  organizations: any[];
  contractors: any[];
  workers: any[];
  supervisors: any[];
  institutionalUsers: any[];
  projects: any[];
  worksites: any[];
  supervisorAssignments: any[];
  minimumWageRules: any[];
  contracts: any[];
  contractVersions: any[];
  contractAcceptances: any[];
  employmentRelationships: any[];
  attendanceTokens: any[];
  attendanceEvents: any[];
  walletAccounts: any[];
  paymentTransactions: any[];
  ledgerEntries: any[];
  disputes: any[];
  disputeEvidenceSnapshots: any[];
  disputeResolutions: any[];
  complianceCheckLogs: any[];
  jobCompletionStatements: any[];
  auditEvents: any[];
}

export function buildCompleteSeedData(): CompleteSeedData {
  const authUsers: any[] = [];
  const users: any[] = [];
  const profiles: any[] = [];
  const organizations: any[] = [];
  const contractors: any[] = [];
  const workers: any[] = [];
  const supervisors: any[] = [];
  const institutionalUsers: any[] = [];
  const projects: any[] = [];
  const worksites: any[] = [];
  const supervisorAssignments: any[] = [];
  const minimumWageRules: any[] = [];
  const contracts: any[] = [];
  const contractVersions: any[] = [];
  const contractAcceptances: any[] = [];
  const employmentRelationships: any[] = [];
  const attendanceTokens: any[] = [];
  const attendanceEvents: any[] = [];
  const walletAccounts: any[] = [];
  const paymentTransactions: any[] = [];
  const ledgerEntries: any[] = [];
  const disputes: any[] = [];
  const disputeEvidenceSnapshots: any[] = [];
  const disputeResolutions: any[] = [];
  const complianceCheckLogs: any[] = [];
  const jobCompletionStatements: any[] = [];
  const auditEvents: any[] = [];

  const now = '2026-08-30T10:00:00Z';

  // 1. ADMIN USER
  authUsers.push({
    id: SEED_IDS.adminUserId,
    email: 'admin@shramiksetu.org',
    phone: '+919820000001',
    created_at: '2026-01-01T00:00:00Z',
  });
  users.push({
    id: SEED_IDS.adminUserId,
    phone: '+919820000001',
    email: 'admin@shramiksetu.org',
    role: 'ADMIN' as UserRole,
    locale: 'en',
    is_active: true,
  });
  profiles.push({
    id: SEED_IDS.adminUserId,
    phone: '+919820000001',
    email: 'admin@shramiksetu.org',
    role: 'ADMIN' as UserRole,
    full_name: 'Platform Administrator',
    locale: 'en',
    is_active: true,
  });

  // 2. JURISDICTION & INSPECTOR
  organizations.push({
    id: SEED_IDS.jurisdictionOrgId,
    name: 'Office of the Deputy Labour Commissioner, Mumbai Suburban',
    org_type: 'INSPECTORATE',
    registration_number: 'MH-LAB-MUM-SUB-01',
    contact_email: 'dlc.mumbaisuburban@maharashtra.gov.in',
    contact_phone: '+912226573001',
    address: 'Administrative Building, Bandra Kurla Complex, Mumbai 400051',
    is_active: true,
  });

  authUsers.push({
    id: SEED_IDS.inspectorUserId,
    email: 'dlc.mumbaisuburban@maharashtra.gov.in',
    phone: '+919820011001',
    created_at: '2026-01-01T00:00:00Z',
  });
  users.push({
    id: SEED_IDS.inspectorUserId,
    phone: '+919820011001',
    email: 'dlc.mumbaisuburban@maharashtra.gov.in',
    role: 'INSTITUTIONAL_USER' as UserRole,
    locale: 'en',
    is_active: true,
  });
  profiles.push({
    id: SEED_IDS.inspectorUserId,
    phone: '+919820011001',
    email: 'dlc.mumbaisuburban@maharashtra.gov.in',
    role: 'INSTITUTIONAL_USER' as UserRole,
    full_name: 'Vikram Jadhav',
    locale: 'en',
    is_active: true,
  });
  institutionalUsers.push({
    id: SEED_IDS.inspectorProfileId,
    user_id: SEED_IDS.inspectorUserId,
    organization_id: SEED_IDS.jurisdictionOrgId,
    full_name: 'Vikram Jadhav',
    official_designation: 'Labour Enforcement Officer - Mumbai Suburban',
    jurisdiction_region: 'Mumbai Suburban',
  });

  // 3. MINIMUM WAGE RULES
  for (const rule of MINIMUM_WAGE_BENCHMARKS) {
    minimumWageRules.push({
      id: rule.id,
      version: 1,
      state: rule.state,
      district: rule.district,
      worker_category: 'CONSTRUCTION',
      skill_level: rule.skillLevel,
      wage_type: 'DAILY',
      minimum_amount_paise: rule.minimumAmountPaise,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: rule.sourceReference,
      is_active: true,
    });
  }

  // 4. CONTRACTORS & SUPERVISORS
  for (const c of SEED_IDS.contractors) {
    // Org
    organizations.push({
      id: c.orgId,
      name: c.companyName,
      org_type: 'CONTRACTOR_FIRM',
      registration_number: c.license,
      contact_phone: c.phone,
      is_active: true,
    });

    // Contractor User & Profile
    authUsers.push({ id: c.userId, phone: c.phone });
    users.push({ id: c.userId, phone: c.phone, role: 'CONTRACTOR' as UserRole, locale: 'en', is_active: true });
    profiles.push({ id: c.userId, phone: c.phone, role: 'CONTRACTOR' as UserRole, full_name: c.fullName, locale: 'en', is_active: true });
    contractors.push({
      id: c.contractorId,
      user_id: c.userId,
      organization_id: c.orgId,
      full_name: c.fullName,
      company_name: c.companyName,
      license_number: c.license,
    });

    // Contractor Wallet
    walletAccounts.push({
      id: c.walletId,
      account_type: 'CONTRACTOR',
      owner_id: c.contractorId,
      currency: 'INR',
      is_active: true,
    });

    // Supervisor User & Profile
    authUsers.push({ id: c.supervisorUserId, phone: c.supervisorPhone });
    users.push({ id: c.supervisorUserId, phone: c.supervisorPhone, role: 'SUPERVISOR' as UserRole, locale: 'hi', is_active: true });
    profiles.push({ id: c.supervisorUserId, phone: c.supervisorPhone, role: 'SUPERVISOR' as UserRole, full_name: c.supervisorName, locale: 'hi', is_active: true });
    supervisors.push({
      id: c.supervisorId,
      user_id: c.supervisorUserId,
      contractor_id: c.contractorId,
      full_name: c.supervisorName,
      badge_number: `SUP-${c.license.slice(-4)}`,
    });
  }

  // 5. PROJECTS & WORKSITES & SUPERVISOR ASSIGNMENTS
  for (const p of SEED_IDS.projects) {
    const contractor = SEED_IDS.contractors[p.contractorIndex];
    projects.push({
      id: p.id,
      contractor_id: contractor.contractorId,
      name: p.name,
      description: p.description,
      status: p.status,
      start_date: p.startDate,
      end_date: p.endDate,
    });

    worksites.push({
      id: p.worksiteId,
      project_id: p.id,
      name: p.worksiteName,
      latitude: p.lat,
      longitude: p.lng,
      allowed_radius_meters: 100,
      address: p.worksiteName,
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400051',
    });

    // Assign Contractor's supervisor to the project
    supervisorAssignments.push({
      id: `aaaaaaaa-5555-5555-5555-${p.id.slice(-12)}`,
      supervisor_id: contractor.supervisorId,
      project_id: p.id,
      is_active: true,
      assigned_at: p.startDate,
    });

    // Create an active attendance QR token for the site
    attendanceTokens.push({
      id: `bbbbbbbb-6666-6666-6666-${p.id.slice(-12)}`,
      token: `cccccccc-6666-6666-6666-${p.id.slice(-12)}`,
      project_id: p.id,
      worksite_id: p.worksiteId,
      created_by: contractor.supervisorUserId,
      expires_at: '2026-12-31T23:59:59Z',
      max_uses: null,
      used_count: 50,
      is_active: true,
    });
  }

  // 6. 40 WORKERS & WALLETS
  for (const w of WORKERS_ROSTER) {
    authUsers.push({ id: w.userId, phone: w.phone });
    users.push({ id: w.userId, phone: w.phone, role: 'WORKER' as UserRole, locale: w.locale, is_active: true });
    profiles.push({ id: w.userId, phone: w.phone, role: 'WORKER' as UserRole, full_name: w.fullName, locale: w.locale, is_active: true });
    workers.push({
      id: w.workerId,
      user_id: w.userId,
      full_name: w.fullName,
      internal_worker_id: w.internalWorkerId,
      occupation: w.occupation,
      skill_category: w.skillCategory,
      emergency_contact: '+919820099999',
    });
    walletAccounts.push({
      id: w.walletId,
      account_type: 'WORKER',
      owner_id: w.workerId,
      currency: 'INR',
      is_active: true,
    });
  }

  // 7. CONTRACTS ASSIGNMENT
  // Contracts distribution across all 40 workers:
  // - Worker 1 (Ramesh): Contract with Suresh Builders on Pier 42 (narrative) -> COMPLETED
  // - Workers 2..30: ACTIVE contracts across contractors 1..4
  // - Workers 31..36: COMPLETED contracts
  // - Workers 37..38: PENDING contracts (awaiting worker acceptance)
  // - Workers 39..40: REJECTED contracts (terms rejected by worker)
  for (let i = 1; i <= 40; i++) {
    const worker = WORKERS_ROSTER[i - 1];
    const contractId = `88888888-8888-8888-8888-${padZero(i, 12)}`;
    const versionId = `99999999-9999-9999-9999-${padZero(i, 12)}`;
    const relationshipId = `55555555-5555-5555-5555-${padZero(i, 12)}`;
    const acceptanceId = `77777777-1111-1111-1111-${padZero(i, 12)}`;

    let contractorIdx = (i % 4); // 0: Suresh, 1: Apex, 2: Sahyadri, 3: Konkan
    let projectIdx = contractorIdx * 2 + (i % 2); // 0..7
    let status: ContractStatus = 'ACTIVE';

    if (i === 1) {
      // Ramesh Kumar
      contractorIdx = 0; // Suresh Builders
      projectIdx = 0; // Andheri Metro Pier 42
      status = 'COMPLETED';
    } else if (i >= 31 && i <= 36) {
      status = 'COMPLETED';
    } else if (i === 37 || i === 38) {
      status = 'PENDING_ACCEPTANCE';
    } else if (i === 39 || i === 40) {
      status = 'REJECTED';
    }

    const contractor = SEED_IDS.contractors[contractorIdx];
    const project = SEED_IDS.projects[projectIdx];

    // Determine wage:
    // Benchmark: Unskilled: 65,000 | Semi-skilled: 75,000 | Skilled: 85,000 | Highly skilled: 100,000
    // Underpaying contractors:
    // - Contractor 0 (Suresh): underpays on some unskilled (₹600 = 60,000 paise vs 65,000). For Ramesh (skilled), wage is ₹900.
    // - Contractor 2 (Sahyadri): underpays on semi-skilled (₹700 = 70,000 paise vs 75,000).
    // - Contractor 3 (Konkan): underpays on skilled (₹750 = 75,000 paise vs 85,000) and unskilled (₹550 = 55,000 paise vs 65,000).
    // - Contractor 1 (Apex): pays strictly above benchmark for all categories (110k, 95k, 80k, 70k).
    let dailyWagePaise = 80000;
    if (i === 1) {
      dailyWagePaise = 90000; // Ramesh: ₹900/day
    } else if (contractorIdx === 0 && worker.skillCategory === 'UNSKILLED') {
      dailyWagePaise = 60000; // UNDERPAYING (₹600 < ₹650)
    } else if (contractorIdx === 2 && worker.skillCategory === 'SEMI_SKILLED') {
      dailyWagePaise = 70000; // UNDERPAYING (₹700 < ₹750)
    } else if (contractorIdx === 3 && worker.skillCategory === 'SKILLED') {
      dailyWagePaise = 75000; // UNDERPAYING (₹750 < ₹850)
    } else if (contractorIdx === 3 && worker.skillCategory === 'UNSKILLED') {
      dailyWagePaise = 55000; // UNDERPAYING (₹550 < ₹650)
    } else if (contractorIdx === 1) {
      // Apex: compliant across all tiers
      if (worker.skillCategory === 'HIGHLY_SKILLED') dailyWagePaise = 110000;
      else if (worker.skillCategory === 'SKILLED') dailyWagePaise = 95000;
      else if (worker.skillCategory === 'SEMI_SKILLED') dailyWagePaise = 80000;
      else dailyWagePaise = 70000;
    } else {
      if (worker.skillCategory === 'HIGHLY_SKILLED') dailyWagePaise = 105000;
      else if (worker.skillCategory === 'SKILLED') dailyWagePaise = 90000;
      else if (worker.skillCategory === 'SEMI_SKILLED') dailyWagePaise = 80000;
      else dailyWagePaise = 70000;
    }

    contracts.push({
      id: contractId,
      contract_code: `CNT-2026-08-${padZero(i, 3)}`,
      worker_id: worker.workerId,
      contractor_id: contractor.contractorId,
      project_id: project.id,
      worksite_id: project.worksiteId,
      work_type: worker.occupation,
      daily_wage: dailyWagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      start_date: project.startDate,
      end_date: status === 'COMPLETED' ? '2026-08-20' : project.endDate,
      status,
      current_version_number: 1,
      join_token: `70000000-0000-0000-0000-${padZero(i, 12)}`,
    });

    contractVersions.push({
      id: versionId,
      contract_id: contractId,
      version_number: 1,
      daily_wage: dailyWagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      work_type: worker.occupation,
      effective_date: project.startDate,
      change_reason: 'Initial agreed statutory contract',
      terms_snapshot: { overtime_multiplier: 1.5, lunch_break_mins: 45 },
      created_by: contractor.userId,
    });

    if (status !== 'PENDING_ACCEPTANCE') {
      contractAcceptances.push({
        id: acceptanceId,
        contract_id: contractId,
        contract_version_id: versionId,
        worker_id: worker.workerId,
        response: status === 'REJECTED' ? 'REJECTED' : 'ACCEPTED',
        rejection_reason: status === 'REJECTED' ? 'Daily wage offered is below statutory expectation.' : null,
        ip_address: `192.168.1.${10 + i}`,
        user_agent: 'ShramikSetu PWA Client',
        responded_at: '2026-06-02T10:00:00Z',
      });

      if (status !== 'REJECTED') {
        employmentRelationships.push({
          id: relationshipId,
          contract_id: contractId,
          contract_version_id: versionId,
          acceptance_id: acceptanceId,
          worker_id: worker.workerId,
          contractor_id: contractor.contractorId,
          project_id: project.id,
          status: status === 'COMPLETED' ? 'TERMINATED' : 'ACTIVE',
          start_date: project.startDate,
          end_date: status === 'COMPLETED' ? '2026-08-20' : null,
        });
      }
    }

    // Compliance check log for each contract vs minimum wage
    const relevantRule = MINIMUM_WAGE_BENCHMARKS.find((r) => r.skillLevel === worker.skillCategory)!;
    const isUnderpaid = dailyWagePaise < relevantRule.minimumAmountPaise;
    complianceCheckLogs.push({
      id: `cc000000-0000-0000-0000-${padZero(i, 12)}`,
      contract_id: contractId,
      rule_id: relevantRule.id,
      rule_version: 1,
      rule_snapshot: relevantRule,
      inputs: { daily_wage_paise: dailyWagePaise, skill_level: worker.skillCategory },
      calculation: { benchmark_paise: relevantRule.minimumAmountPaise, difference_paise: dailyWagePaise - relevantRule.minimumAmountPaise },
      result: isUnderpaid ? 'POTENTIAL_NON_COMPLIANCE' : 'COMPLIANT',
      explanation: isUnderpaid
        ? `Contract daily wage ₹${dailyWagePaise / 100} is under statutory minimum wage of ₹${relevantRule.minimumAmountPaise / 100}.`
        : `Contract daily wage ₹${dailyWagePaise / 100} meets or exceeds statutory requirement.`,
    });
  }

  // 8. 60 DAYS OF ATTENDANCE (2026-07-01 to 2026-08-29)
  // Calendar dates: 60 days
  const calendarDates: string[] = [];
  const startEpoch = new Date('2026-07-01T00:00:00Z').getTime();
  for (let d = 0; d < 60; d++) {
    const dt = new Date(startEpoch + d * 86400000);
    const yyyy = dt.getUTCFullYear();
    const mm = padZero(dt.getUTCMonth() + 1);
    const dd = padZero(dt.getUTCDate());
    calendarDates.push(`${yyyy}-${mm}-${dd}`);
  }

  // Ramesh Kumar (Worker 1): exactly 10 verified shifts on Pier 42
  const rameshShiftDates = [
    '2026-08-01',
    '2026-08-03',
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-08',
    '2026-08-10',
    '2026-08-11',
    '2026-08-12',
  ];

  let attEventIdCounter = 1;

  for (let shiftIdx = 0; shiftIdx < rameshShiftDates.length; shiftIdx++) {
    const sDate = rameshShiftDates[shiftIdx];
    attendanceEvents.push({
      id: `aa000000-0000-0000-0001-${padZero(attEventIdCounter++, 12)}`,
      worker_id: WORKERS_ROSTER[0].workerId,
      contractor_id: SEED_IDS.contractors[0].contractorId,
      project_id: SEED_IDS.projects[0].id,
      worksite_id: SEED_IDS.projects[0].worksiteId,
      contract_id: contracts[0].id,
      date: sDate,
      worker_latitude: 19.1197,
      worker_longitude: 72.8468,
      worksite_latitude: 19.1197,
      worksite_longitude: 72.8468,
      calculated_distance_meters: 0,
      status: 'VERIFIED' as AttendanceStatus,
    });
  }

  // Attendance for active workers (Workers 2..36)
  for (let wIdx = 1; wIdx < 36; wIdx++) {
    const worker = WORKERS_ROSTER[wIdx];
    const contract = contracts[wIdx];
    if (contract.status !== 'ACTIVE' && contract.status !== 'COMPLETED') continue;

    // Pick 20-35 realistic shift dates, skipping Sundays
    for (let dayIdx = 0; dayIdx < calendarDates.length; dayIdx++) {
      const dtStr = calendarDates[dayIdx];
      const dayOfWeek = new Date(dtStr).getUTCDay();
      if (dayOfWeek === 0) continue; // Sunday off

      // Absence simulation (skip some days)
      if ((dayIdx + wIdx) % 3 === 0) continue;

      // GPS Fail simulation for 2% of punches
      const isGpsFail = (wIdx === 12 && dayIdx === 15) || (wIdx === 25 && dayIdx === 40);

      attendanceEvents.push({
        id: `aa000000-0000-0000-0002-${padZero(attEventIdCounter++, 12)}`,
        worker_id: worker.workerId,
        contractor_id: contract.contractor_id,
        project_id: contract.project_id,
        worksite_id: contract.worksite_id,
        contract_id: contract.id,
        date: dtStr,
        worker_latitude: isGpsFail ? 19.2500 : 19.1197,
        worker_longitude: isGpsFail ? 72.9500 : 72.8468,
        worksite_latitude: 19.1197,
        worksite_longitude: 72.8468,
        calculated_distance_meters: isGpsFail ? 1540 : 12,
        status: (isGpsFail ? 'FLAGGED' : 'VERIFIED') as AttendanceStatus,
      });
    }
  }

  // 9. RAMESH KUMAR TRANSACTIONS & REVERSING LEDGER ROW (PERFECT NARRATIVE THREAD)
  // 10 shifts @ ₹900 = ₹9,000 (900,000 paise)
  // Txn 1: Initial partial underpayment of ₹7,200 (720,000 paise). Underpaid by ₹1,800!
  const txnRamesh1Id = '99999999-9999-9999-9999-999999999901';
  const rameshWorkerWallet = WORKERS_ROSTER[0].walletId;
  const sureshContractorWallet = SEED_IDS.contractors[0].walletId;

  paymentTransactions.push({
    id: txnRamesh1Id,
    transaction_ref: 'TXN-20260813-0001',
    idempotency_key: 'idemp-ramesh-partial-001',
    sender_account_id: sureshContractorWallet,
    receiver_account_id: rameshWorkerWallet,
    worker_id: WORKERS_ROSTER[0].workerId,
    contractor_id: SEED_IDS.contractors[0].contractorId,
    contract_id: contracts[0].id,
    project_id: SEED_IDS.projects[0].id,
    amount_paise: 720000, // ₹7,200 (underpaid by ₹1,800)
    payment_source: 'PLATFORM_TRANSFER',
    notes: 'Partial shift disbursement (10 shifts calculated at partial rate)',
    status: 'SUCCESS' as PaymentStatus,
    initiated_by: SEED_IDS.contractors[0].userId,
    created_at: '2026-08-13T10:00:00Z',
  });

  ledgerEntries.push({
    id: '11111111-eeee-1111-0001-000000000001',
    transaction_id: txnRamesh1Id,
    account_id: sureshContractorWallet,
    direction: 'DEBIT' as LedgerDirection,
    amount_paise: 720000,
    created_at: '2026-08-13T10:00:00Z',
  });
  ledgerEntries.push({
    id: '11111111-eeee-1111-0001-000000000002',
    transaction_id: txnRamesh1Id,
    account_id: rameshWorkerWallet,
    direction: 'CREDIT' as LedgerDirection,
    amount_paise: 720000,
    created_at: '2026-08-13T10:00:00Z',
  });

  // Dispute 1 (Ramesh vs Suresh Builders for ₹1,800 underpayment)
  const disputeRameshId = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
  disputes.push({
    id: disputeRameshId,
    dispute_ref: 'DISP-2026-08-001',
    worker_id: WORKERS_ROSTER[0].workerId,
    contractor_id: SEED_IDS.contractors[0].contractorId,
    project_id: SEED_IDS.projects[0].id,
    contract_id: contracts[0].id,
    category: 'WAGE' as DisputeCategoryEnum,
    description: 'Worked 10 verified masonry shifts for Suresh Builders on Pier 42 (₹9,000 statutory contract wage). Disbursed only ₹7,200. Underpaid by ₹1,800.',
    status: 'RESOLVED' as DisputeStatusEnum,
    priority: 'HIGH' as DisputePriorityEnum,
    raised_by_user_id: WORKERS_ROSTER[0].userId,
    created_at: '2026-08-14T08:30:00Z',
    updated_at: '2026-08-16T10:30:00Z',
  });

  disputeEvidenceSnapshots.push({
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
    dispute_id: disputeRameshId,
    contract_snapshot: contracts[0],
    contract_versions_snapshot: [contractVersions[0]],
    worker_acceptance_snapshot: contractAcceptances[0],
    attendance_snapshot: attendanceEvents.slice(0, 10),
    payment_transactions_snapshot: [paymentTransactions[0]],
    automated_analysis: {
      verified_shifts_count: 10,
      agreed_daily_wage_paise: 90000,
      total_statutory_earned_paise: 900000,
      total_paid_paise: 720000,
      shortfall_arrears_paise: 180000,
      underpayment_confirmed: true,
    },
    created_at: '2026-08-14T08:30:00Z',
  });

  disputeResolutions.push({
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff01',
    dispute_id: disputeRameshId,
    decision: 'RESOLVED',
    reason: 'Biometric and GPS gate verification confirms 10 full shifts worked by Ramesh Kumar on Pier 42. Contractor Suresh Builders ordered to disburse ₹1,800 arrears immediately.',
    resolution_notes: 'Inspector resolution order issued under Section 15 of Minimum Wages Act. Reversing settlement transaction executed on platform ledger.',
    reviewer_user_id: SEED_IDS.inspectorUserId,
    resolved_at: '2026-08-16T10:30:00Z',
  });

  // Reversing / Settlement Ledger Entry for Ramesh: ₹1,800 (180,000 paise)
  const txnRamesh2Id = '99999999-9999-9999-9999-999999999902';
  paymentTransactions.push({
    id: txnRamesh2Id,
    transaction_ref: 'TXN-20260816-REV-0002',
    idempotency_key: 'idemp-rev-settle-disp-001',
    sender_account_id: sureshContractorWallet,
    receiver_account_id: rameshWorkerWallet,
    worker_id: WORKERS_ROSTER[0].workerId,
    contractor_id: SEED_IDS.contractors[0].contractorId,
    contract_id: contracts[0].id,
    project_id: SEED_IDS.projects[0].id,
    amount_paise: 180000, // Reversing settlement of ₹1,800
    payment_source: 'PLATFORM_TRANSFER',
    notes: 'Inspector resolution wage arrears settlement for Dispute DISP-2026-08-001',
    status: 'SUCCESS' as PaymentStatus,
    initiated_by: SEED_IDS.inspectorUserId,
    created_at: '2026-08-16T11:00:00Z',
  });

  ledgerEntries.push({
    id: '11111111-eeee-1111-0001-000000000003',
    transaction_id: txnRamesh2Id,
    account_id: sureshContractorWallet,
    direction: 'DEBIT' as LedgerDirection,
    amount_paise: 180000,
    created_at: '2026-08-16T11:00:00Z',
  });
  ledgerEntries.push({
    id: '11111111-eeee-1111-0001-000000000004',
    transaction_id: txnRamesh2Id,
    account_id: rameshWorkerWallet,
    direction: 'CREDIT' as LedgerDirection,
    amount_paise: 180000,
    created_at: '2026-08-16T11:00:00Z',
  });

  // Ramesh Job Completion Statement: 10 shifts, 900,000 earned, 900,000 paid, 0 outstanding, SETTLED
  jobCompletionStatements.push({
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc01',
    employment_relationship_id: employmentRelationships[0].id,
    contract_id: contracts[0].id,
    worker_id: WORKERS_ROSTER[0].workerId,
    contractor_id: SEED_IDS.contractors[0].contractorId,
    project_id: SEED_IDS.projects[0].id,
    work_type: 'Mason',
    contract_period_start: '2026-08-01',
    contract_period_end: '2026-08-20',
    acceptance_date: '2026-06-02T10:00:00Z',
    daily_wage_paise: 90000,
    verified_workdays: 10,
    total_earned_paise: 900000,
    total_paid_paise: 900000,
    outstanding_paise: 0,
    total_disputes: 1,
    open_disputes: 0,
    resolved_disputes: 1,
    settlement_status: 'SETTLED' as SettlementStatusEnum,
    generated_at: '2026-08-20T12:00:00Z',
    generated_by: SEED_IDS.contractors[0].userId,
  });

  // 10. TRANSACTIONS FOR OTHER WORKERS
  // Mix of fully paid, partially paid, and arrears
  let txnCounter = 3;
  for (let wIdx = 1; wIdx < 36; wIdx++) {
    const worker = WORKERS_ROSTER[wIdx];
    const contract = contracts[wIdx];
    const contractor = SEED_IDS.contractors.find((c) => c.contractorId === contract.contractor_id)!;

    // Count verified shifts for this worker
    const workerVerifiedShifts = attendanceEvents.filter(
      (a) => a.worker_id === worker.workerId && a.status === 'VERIFIED'
    ).length;

    if (workerVerifiedShifts === 0) continue;

    const totalEarnedPaise = workerVerifiedShifts * contract.daily_wage;
    let paymentAmountPaise = 0;

    if (contractor.contractorId === SEED_IDS.contractors[1].contractorId) {
      // Apex: 100% fully paid
      paymentAmountPaise = totalEarnedPaise;
    } else if (contractor.contractorId === SEED_IDS.contractors[2].contractorId) {
      // Sahyadri: Late-paying / partially paid (around 70% paid)
      paymentAmountPaise = Math.floor((totalEarnedPaise * 0.7) / 1000) * 1000;
    } else if (contractor.contractorId === SEED_IDS.contractors[3].contractorId) {
      // Konkan: Non-compliant / low paid (around 40% paid)
      paymentAmountPaise = Math.floor((totalEarnedPaise * 0.4) / 1000) * 1000;
    } else {
      // Suresh: 85% paid
      paymentAmountPaise = Math.floor((totalEarnedPaise * 0.85) / 1000) * 1000;
    }

    if (paymentAmountPaise > 0) {
      const txnId = `99999999-9999-9999-9999-${padZero(txnCounter++, 12)}`;
      paymentTransactions.push({
        id: txnId,
        transaction_ref: `TXN-202608-${padZero(txnCounter, 4)}`,
        idempotency_key: `idemp-gen-${txnCounter}`,
        sender_account_id: contractor.walletId,
        receiver_account_id: worker.walletId,
        worker_id: worker.workerId,
        contractor_id: contractor.contractorId,
        contract_id: contract.id,
        project_id: contract.project_id,
        amount_paise: paymentAmountPaise,
        payment_source: 'PLATFORM_TRANSFER',
        notes: `Wage disbursement for ${worker.fullName}`,
        status: 'SUCCESS' as PaymentStatus,
        initiated_by: contractor.userId,
        created_at: '2026-08-25T14:00:00Z',
      });

      // Double-entry ledger balance
      ledgerEntries.push({
        id: `ee000000-0000-0000-0001-${padZero(ledgerEntries.length + 1, 12)}`,
        transaction_id: txnId,
        account_id: contractor.walletId,
        direction: 'DEBIT' as LedgerDirection,
        amount_paise: paymentAmountPaise,
        created_at: '2026-08-25T14:00:00Z',
      });
      ledgerEntries.push({
        id: `ee000000-0000-0000-0001-${padZero(ledgerEntries.length + 1, 12)}`,
        transaction_id: txnId,
        account_id: worker.walletId,
        direction: 'CREDIT' as LedgerDirection,
        amount_paise: paymentAmountPaise,
        created_at: '2026-08-25T14:00:00Z',
      });
    }

    // Completion statement for completed contracts 31..36
    if (contract.status === 'COMPLETED') {
      const outstandingPaise = totalEarnedPaise - paymentAmountPaise;
      jobCompletionStatements.push({
        id: `cccccccc-cccc-cccc-cccc-${padZero(wIdx + 1, 12)}`,
        employment_relationship_id: `55555555-5555-5555-5555-${padZero(wIdx + 1, 12)}`,
        contract_id: contract.id,
        worker_id: worker.workerId,
        contractor_id: contractor.contractorId,
        project_id: contract.project_id,
        work_type: worker.occupation,
        contract_period_start: contract.start_date,
        contract_period_end: '2026-08-20',
        acceptance_date: '2026-06-02T10:00:00Z',
        daily_wage_paise: contract.daily_wage,
        verified_workdays: workerVerifiedShifts,
        total_earned_paise: totalEarnedPaise,
        total_paid_paise: paymentAmountPaise,
        outstanding_paise: outstandingPaise,
        total_disputes: 0,
        open_disputes: 0,
        resolved_disputes: 0,
        settlement_status: (outstandingPaise === 0 ? 'SETTLED' : 'OUTSTANDING_PAYMENT') as SettlementStatusEnum,
        generated_at: '2026-08-20T12:00:00Z',
        generated_by: contractor.userId,
      });
    }
  }

  // 11. 12 DISPUTES (4 OPEN, 4 UNDER_REVIEW, 4 RESOLVED)
  // Dispute 1 was Ramesh (RESOLVED). Now add 11 more:
  const disputeDefs = [
    // 4 OPEN
    { id: 2, workerIdx: 4, contractorIdx: 2, cat: 'WAGE', status: 'OPEN', prio: 'MEDIUM', desc: 'Overtime shifts performed on Malad canal excavation unpaid.' },
    { id: 3, workerIdx: 11, contractorIdx: 3, cat: 'ATTENDANCE', status: 'OPEN', prio: 'HIGH', desc: 'GPS kiosk punch repeatedly rejected worker attendance despite being at Gate 2.' },
    { id: 4, workerIdx: 17, contractorIdx: 0, cat: 'PARTIAL_PAYMENT', status: 'OPEN', prio: 'MEDIUM', desc: 'Partial wage paid; 4 verified shifts withheld for supposed tool fee.' },
    { id: 5, workerIdx: 24, contractorIdx: 3, cat: 'MISSING_PAYMENT', status: 'OPEN', prio: 'URGENT', desc: 'Zero wage disbursement for two consecutive fortnightly cycles.' },

    // 4 UNDER_REVIEW
    { id: 6, workerIdx: 6, contractorIdx: 2, cat: 'WAGE', status: 'UNDER_REVIEW', prio: 'HIGH', desc: 'Contract wage set below Maharashtra statutory minimum wage rate.' },
    { id: 7, workerIdx: 14, contractorIdx: 3, cat: 'CONTRACT_TERMS', status: 'UNDER_REVIEW', prio: 'MEDIUM', desc: 'Working hours extended to 11 hours without agreed overtime multiplier.' },
    { id: 8, workerIdx: 21, contractorIdx: 0, cat: 'PAYMENT', status: 'UNDER_REVIEW', prio: 'HIGH', desc: 'Bank transfer bounce; contractor has not re-initiated digital payout.' },
    { id: 9, workerIdx: 29, contractorIdx: 2, cat: 'ATTENDANCE', status: 'UNDER_REVIEW', prio: 'LOW', desc: 'Supervisor marked half-day attendance for full-day shift.' },

    // 3 more RESOLVED (to make 4 total with Ramesh)
    { id: 10, workerIdx: 1, contractorIdx: 1, cat: 'PAYMENT', status: 'RESOLVED', prio: 'MEDIUM', desc: 'Delayed weekly payout due to milestone verification delay.' },
    { id: 11, workerIdx: 8, contractorIdx: 2, cat: 'WAGE', status: 'RESOLVED', prio: 'HIGH', desc: 'Misclassification of semi-skilled tile layer as unskilled helper.' },
    { id: 12, workerIdx: 32, contractorIdx: 3, cat: 'WAGE', status: 'RESOLVED', prio: 'HIGH', desc: 'Unlawful deductions for drinking water and safety helmets.' },
  ];

  for (const d of disputeDefs) {
    const dId = `dddddddd-dddd-dddd-dddd-${padZero(d.id, 12)}`;
    const worker = WORKERS_ROSTER[d.workerIdx];
    const contract = contracts[d.workerIdx];
    const contractor = SEED_IDS.contractors[d.contractorIdx];

    disputes.push({
      id: dId,
      dispute_ref: `DISP-2026-08-${padZero(d.id, 3)}`,
      worker_id: worker.workerId,
      contractor_id: contractor.contractorId,
      project_id: contract.project_id,
      contract_id: contract.id,
      category: d.cat as DisputeCategoryEnum,
      description: d.desc,
      status: d.status as DisputeStatusEnum,
      priority: d.prio as DisputePriorityEnum,
      raised_by_user_id: worker.userId,
      created_at: '2026-08-10T10:00:00Z',
      updated_at: d.status === 'RESOLVED' ? '2026-08-18T16:00:00Z' : '2026-08-10T10:00:00Z',
    });

    disputeEvidenceSnapshots.push({
      id: `eeeeeeee-eeee-eeee-eeee-${padZero(d.id, 12)}`,
      dispute_id: dId,
      contract_snapshot: contract,
      contract_versions_snapshot: [contractVersions[d.workerIdx]],
      worker_acceptance_snapshot: contractAcceptances[d.workerIdx] || null,
      attendance_snapshot: attendanceEvents.filter((a) => a.worker_id === worker.workerId).slice(0, 10),
      payment_transactions_snapshot: paymentTransactions.filter((p) => p.worker_id === worker.workerId),
      automated_analysis: {
        dispute_id: dId,
        category: d.cat,
        status: d.status,
      },
      created_at: '2026-08-10T10:00:00Z',
    });

    if (d.status === 'RESOLVED') {
      disputeResolutions.push({
        id: `ffffffff-ffff-ffff-ffff-${padZero(d.id, 12)}`,
        dispute_id: dId,
        decision: 'RESOLVED',
        reason: `Labour officer inspection confirmed valid claim. Contractor ${contractor.companyName} directed to rectify.`,
        resolution_notes: 'Settled pursuant to mutual conciliation hearing.',
        reviewer_user_id: SEED_IDS.inspectorUserId,
        resolved_at: '2026-08-18T16:00:00Z',
      });
    }
  }

  // 12. AUDIT EVENTS TRAIL
  auditEvents.push({
    id: 'aa000000-0000-0000-0000-000000000001',
    sequence_number: 1,
    actor_id: SEED_IDS.inspectorUserId,
    action: 'role_assigned',
    entity_type: 'users',
    entity_id: SEED_IDS.inspectorUserId,
    payload: { role: 'INSTITUTIONAL_USER', jurisdiction: 'Mumbai Suburban' },
    previous_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    current_hash: 'genesis-hash-shramiksetu-mumbai-suburban-audit',
    created_at: '2026-06-01T00:00:00Z',
  });

  auditEvents.push({
    id: 'aa000000-0000-0000-0000-000000000002',
    sequence_number: 2,
    actor_id: SEED_IDS.inspectorUserId,
    action: 'dispute_resolved',
    entity_type: 'disputes',
    entity_id: disputeRameshId,
    payload: {
      dispute_ref: 'DISP-2026-08-001',
      worker: 'Ramesh Kumar',
      contractor: 'Suresh Builders',
      reversal_paise: 180000,
    },
    previous_hash: 'genesis-hash-shramiksetu-mumbai-suburban-audit',
    current_hash: 'hash-dispute-resolved-ramesh-kumar-underpayment-reversal',
    created_at: '2026-08-16T10:30:00Z',
  });

  return {
    authUsers,
    users,
    profiles,
    organizations,
    contractors,
    workers,
    supervisors,
    institutionalUsers,
    projects,
    worksites,
    supervisorAssignments,
    minimumWageRules,
    contracts,
    contractVersions,
    contractAcceptances,
    employmentRelationships,
    attendanceTokens,
    attendanceEvents,
    walletAccounts,
    paymentTransactions,
    ledgerEntries,
    disputes,
    disputeEvidenceSnapshots,
    disputeResolutions,
    complianceCheckLogs,
    jobCompletionStatements,
    auditEvents,
  };
}
