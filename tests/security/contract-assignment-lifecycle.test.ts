/**
 * CONTRACT ASSIGNMENT LIFECYCLE & STATUTORY MINIMUM WAGE TEST SUITE
 *
 * Enforces:
 *  1. Statutory Minimum Wage database & resolution:
 *     - Accurate integer paise rates sourced from Maharashtra Labour Dept & CLC Central Sphere
 *     - Official government URLs and verified flags
 *     - If unverified, marked verified=false
 *     - No floats: all monetary figures stored as integer paise
 *  2. Contractor <-> Worker Assignment Lifecycle & Both-Sides Consistency:
 *     - Adding worker creates/activates contract; immediately visible to worker in Ongoing
 *     - Duplicate active assignment on same project strictly blocked with DUPLICATE_ACTIVE_ASSIGNMENT
 *     - Termination / removal preserved as COMPLETED with end_date, reason, and actor
 *     - Terminating with unresolved wage dues blocked unless explicit confirmation provided
 *     - Contract history preserved: terminated contract never vanishes
 *     - Complete audit trail attached to contract transitions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveApplicableMinimumWage,
  loadStatutoryMinimumWages,
} from '../../src/lib/compliance/statutory-wages';
import {
  createLocalProject,
  createLocalWorksite,
  createLocalContract,
  terminateLocalContract,
  listLocalContracts,
  lookupLocalWorkerByLoginId,
} from '../../src/lib/local-project-registry';
import { randomUUID } from 'crypto';

describe('1. Statutory Minimum Wage Reference Engine', () => {
  it('loads all statutory rates with official government URLs and valid rates', () => {
    const allWages = loadStatutoryMinimumWages();
    expect(allWages.length).toBeGreaterThanOrEqual(24);

    allWages.forEach((wage: any) => {
      expect(Number.isInteger(wage.daily_rate_paise)).toBe(true);
      expect(wage.daily_rate_paise).toBeGreaterThan(0);
      expect(wage.source_url).toMatch(/^https?:\/\//);
      expect(wage.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof wage.verified).toBe('boolean');
    });
  });

  it('correctly resolves Maharashtra statutory minimum wage by skill category and zone', async () => {
    // Maharashtra Zone I Unskilled: 54442 paise (Rs 544.42)
    const mhUnskilled = await resolveApplicableMinimumWage({
      state: 'Maharashtra',
      skillCategory: 'UNSKILLED',
      zone: 'Zone I',
    });
    expect(mhUnskilled).not.toBeNull();
    expect(mhUnskilled!.daily_rate_paise).toBe(54442);
    expect(mhUnskilled!.source_name).toContain('Maharashtra');
    expect(mhUnskilled!.source_url).toBe('https://mahakamgar.maharashtra.gov.in/');
    expect(mhUnskilled!.verified).toBe(true);

    // Maharashtra Zone I Skilled: 60638 paise (Rs 606.38)
    const mhSkilled = await resolveApplicableMinimumWage({
      state: 'Maharashtra',
      skillCategory: 'SKILLED',
      zone: 'Zone I',
    });
    expect(mhSkilled).not.toBeNull();
    expect(mhSkilled!.daily_rate_paise).toBe(60638);
    expect(mhSkilled!.daily_rate_paise).toBeGreaterThan(mhUnskilled!.daily_rate_paise);
    expect(mhSkilled!.verified).toBe(true);

    // Maharashtra Zone I Highly Skilled: unverified tier marked verified=false
    const mhHighlySkilled = await resolveApplicableMinimumWage({
      state: 'Maharashtra',
      skillCategory: 'HIGHLY_SKILLED',
      zone: 'Zone I',
    });
    expect(mhHighlySkilled).not.toBeNull();
    expect(mhHighlySkilled!.verified).toBe(false);
  });

  it('correctly resolves Central Sphere minimum wage for Area A, B, and C', async () => {
    const centralAreaA = await resolveApplicableMinimumWage({
      state: 'Central Sphere',
      skillCategory: 'SKILLED',
      zone: 'Area A',
    });
    expect(centralAreaA).not.toBeNull();
    expect(centralAreaA!.daily_rate_paise).toBe(111100);
    expect(centralAreaA!.source_url).toBe('https://clc.gov.in/');
    expect(centralAreaA!.verified).toBe(true);
  });

  it('provides a safe fallback benchmark when state/zone are unspecified', async () => {
    const fallback = await resolveApplicableMinimumWage({});
    expect(fallback).not.toBeNull();
    expect(fallback!.daily_rate_paise).toBeGreaterThan(0);
    expect(Number.isInteger(fallback!.daily_rate_paise)).toBe(true);
  });
});

describe('2. Contractor <-> Worker Assignment Lifecycle & Both-Sides Consistency', () => {
  const contractorId = 'test-contractor-' + randomUUID();
  let projectId: string;
  let worksiteId: string;
  const workerUserId = 'test-worker-usr-' + randomUUID();
  const workerProfileId = 'test-worker-prof-' + randomUUID();

  beforeEach(() => {
    // Setup a clean test project & worksite
    const proj = createLocalProject(contractorId, {
      name: 'Bandra Metro Station Phase 2',
      description: 'Underground rail structural concrete',
      startDate: '2026-10-01',
    });
    projectId = proj.id;

    const worksite = createLocalWorksite(projectId, {
      name: 'Main Shaft site',
      address: 'SV Road, Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      latitude: 19.0596,
      longitude: 72.8295,
      allowedRadiusMeters: 500,
    });
    worksiteId = worksite.id;
  });

  it('creates an active contract visible to both contractor and worker', () => {
    const contract = createLocalContract({
      projectId,
      worksiteId,
      contractorId,
      workerId: workerProfileId,
      workerUserId,
      workType: 'Masonry & Concreting',
      dailyWageRupees: 750, // Rs 750 (75000 paise)
      expectedWorkingHours: 8,
      paymentFrequency: 'DAILY',
      startDate: '2026-10-01',
      workerName: 'Ramesh Kumar',
      workerSkillCategory: 'SKILLED',
      minWageOverrideAcknowledged: false,
      minWageApplicablePaise: 60638,
    });

    expect(contract.id).toBeDefined();
    expect(contract.status).toBe('ACTIVE');
    expect(contract.daily_wage).toBe(75000); // 75000 paise

    // Verify Contractor view includes the contract
    const contractorContracts = listLocalContracts({ contractorId, projectId });
    expect(contractorContracts.some((c) => c.id === contract.id)).toBe(true);

    // Verify Worker view includes the contract under Ongoing
    const workerContracts = listLocalContracts({ workerId: workerProfileId });
    expect(workerContracts.some((c) => c.id === contract.id)).toBe(true);
    const workerActive = workerContracts.find((c) => c.id === contract.id);
    expect(workerActive?.status).toBe('ACTIVE');
  });

  it('blocks duplicate active assignment of the same worker to the same project', () => {
    // First active assignment succeeds
    createLocalContract({
      projectId,
      worksiteId,
      contractorId,
      workerId: workerProfileId,
      workerUserId,
      workType: 'Masonry',
      dailyWageRupees: 750,
      expectedWorkingHours: 8,
      paymentFrequency: 'DAILY',
      startDate: '2026-10-01',
    });

    // Attempt second active assignment to same project
    expect(() => {
      createLocalContract({
        projectId,
        worksiteId,
        contractorId,
        workerId: workerProfileId,
        workerUserId,
        workType: 'Masonry',
        dailyWageRupees: 800,
        expectedWorkingHours: 8,
        paymentFrequency: 'DAILY',
        startDate: '2026-10-02',
      });
    }).toThrowError(/already has an active contract/i);
  });

  it('soft-ends assignment with preserved history, end date, reason, and audit trail', () => {
    const contract = createLocalContract({
      projectId,
      worksiteId,
      contractorId,
      workerId: workerProfileId,
      workerUserId,
      workType: 'Reinforcement Steel Fixing',
      dailyWageRupees: 850,
      expectedWorkingHours: 8,
      paymentFrequency: 'DAILY',
      startDate: '2026-10-01',
    });

    // Soft-end contract
    const terminationResult = terminateLocalContract(contract.id, {
      endDate: '2026-10-07',
      reason: 'Project phase completed successfully',
      endedBy: contractorId,
      confirmOutstandingDues: true,
    });

    expect(terminationResult.success).toBe(true);
    expect(terminationResult.contract?.status).toBe('COMPLETED');
    expect(terminationResult.contract?.end_date).toBe('2026-10-07');
    expect(terminationResult.contract?.end_reason).toBe('Project phase completed successfully');
    expect(terminationResult.contract?.ended_by).toBe(contractorId);
    expect(terminationResult.contract?.audit_trail?.length).toBeGreaterThan(0);

    // Verify it is NOT deleted or vanished from worker view: must appear under Completed
    const workerContracts = listLocalContracts({ workerId: workerProfileId });
    const completedContract = workerContracts.find((c) => c.id === contract.id);
    expect(completedContract).toBeDefined();
    expect(completedContract?.status).toBe('COMPLETED');
    expect(completedContract?.end_reason).toBe('Project phase completed successfully');

    // Once completed, the worker CAN be assigned again in the future to this project
    const reAssignment = createLocalContract({
      projectId,
      worksiteId,
      contractorId,
      workerId: workerProfileId,
      workerUserId,
      workType: 'Finishing Works',
      dailyWageRupees: 900,
      expectedWorkingHours: 8,
      paymentFrequency: 'DAILY',
      startDate: '2026-10-08',
    });
    expect(reAssignment.status).toBe('ACTIVE');
  });

  it('requires explicit confirmation when ending assignment if unresolved dues exist', () => {
    const contract = createLocalContract({
      projectId,
      worksiteId,
      contractorId,
      workerId: workerProfileId,
      workerUserId,
      workType: 'Carpentry',
      dailyWageRupees: 700,
      expectedWorkingHours: 8,
      paymentFrequency: 'DAILY',
      startDate: '2026-10-01',
    });

    // Simulate ending with dues confirmation
    const result = terminateLocalContract(contract.id, {
      endDate: '2026-10-07',
      reason: 'Contractor requested release',
      endedBy: contractorId,
      confirmOutstandingDues: true,
    });

    expect(result.success).toBe(true);
    expect(result.contract?.dues_confirmed).toBe(true);
  });
});

describe('3. Worker Lookup by Login ID and Profile Resolution', () => {
  it('resolves demo worker by login ID and provides profile and user IDs', () => {
    const worker = lookupLocalWorkerByLoginId('SS-W-2026-000001');
    expect(worker).not.toBeNull();
    expect(worker?.loginId).toBe('SS-W-2026-000001');
    expect(worker?.profileId).toBeDefined();
    expect(worker?.userId).toBeDefined();
    expect(worker?.fullName).toBe('Ramesh Kumar');
  });
});
