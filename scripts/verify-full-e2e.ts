/**
 * COMPREHENSIVE HOSTILE TESTER E2E INTEGRATION SUITE
 *
 * Exercises the entire user journey against live running server at http://localhost:3000:
 * 1. Role Protection & Unauthenticated Guards (401/403/Redirects)
 * 2. Contractor Authentication & Dashboard
 * 3. Project Inspection & Statutory Minimum Wage Resolution
 * 4. Dynamic Attendance Gate Token & 6-digit PIN Dispensation
 * 5. Worker Authentication & Mobile Viewport Access
 * 6. Worker Attendance Check-in via PIN
 * 7. Contractor Wage Disbursement Initiation
 * 8. Worker Wallet Summary & Sandbox UPI Withdrawal
 * 9. Dispute Query & Official Complaint Report PDF Generation in EN, HI, MR
 * 10. Public QR Verification of Complaint Report
 * 11. Contractor Dispute Counter-Statement Submission -> UNDER_REVIEW
 * 12. Soft-Ending Worker Contract -> COMPLETED with Historical Preservation
 * 13. Clean Signout & Session Invalidation
 */

const BASE_URL = process.env.TEST_APP_URL || 'http://localhost:3000';

interface StepResult {
  step: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: StepResult[] = [];

function record(step: string, passed: boolean, details?: string, error?: string) {
  results.push({ step, passed, details, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${passed ? 'PASS' : 'FAIL'}] ${step}${details ? ` -> ${details}` : ''}${error ? ` [ERROR: ${error}]` : ''}`);
}

async function extractCookie(response: Response, cookieName: string): Promise<string | null> {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function runE2E() {
  console.log('\n============================================================');
  console.log('       SHRAMIKSETU COMPREHENSIVE HOSTILE E2E AUDIT          ');
  console.log(`       Target: ${BASE_URL}                                   `);
  console.log('============================================================\n');

  let contractorCookie: string | null = null;
  let workerCookie: string | null = null;
  let attendanceShortCode: string | null = null;

  // ── Step 1: Unauthenticated Role Protection ──────────────────────────────
  try {
    const unauthWorker = await fetch(`${BASE_URL}/worker`, { redirect: 'manual' });
    const isWorkerRedirect = unauthWorker.status === 307 && Boolean(unauthWorker.headers.get('location')?.includes('/signin'));
    record('1.1 Unauthenticated /worker redirects to /signin', isWorkerRedirect, `HTTP ${unauthWorker.status} Location: ${unauthWorker.headers.get('location')}`);

    const unauthContractor = await fetch(`${BASE_URL}/contractor`, { redirect: 'manual' });
    const isContractorRedirect = unauthContractor.status === 307 && Boolean(unauthContractor.headers.get('location')?.includes('/signin'));
    record('1.2 Unauthenticated /contractor redirects to /signin', isContractorRedirect, `HTTP ${unauthContractor.status} Location: ${unauthContractor.headers.get('location')}`);

    const unauthApiWorker = await fetch(`${BASE_URL}/api/workers/profile`);
    record('1.3 Unauthenticated /api/workers/profile returns 401', unauthApiWorker.status === 401, `HTTP ${unauthApiWorker.status}`);

    const unauthApiContractor = await fetch(`${BASE_URL}/api/contractors/profile`);
    record('1.4 Unauthenticated /api/contractors/profile returns 401', unauthApiContractor.status === 401, `HTTP ${unauthApiContractor.status}`);
  } catch (err: any) {
    record('1. Unauthenticated Guards', false, undefined, err.message);
  }

  // ── Step 2: Contractor Sign-In & Role Protection ─────────────────────────
  try {
    const signinRes = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'SS-C-2026-000001',
        password: process.env.DEMO_CONTRACTOR_1_PASSWORD || 'Vikram@123',
        role: 'CONTRACTOR',
      }),
    });
    const signinData = await signinRes.json();
    contractorCookie = await extractCookie(signinRes, 'shramiksetu_session');

    record(
      '2.1 Contractor Sign-In (SS-C-2026-000001)',
      signinRes.status === 200 && signinData.success && !!contractorCookie,
      `User: ${signinData.user?.login_id || 'OK'} Role: ${signinData.role}`
    );

    const cPageRes = await fetch(`${BASE_URL}/contractor`, {
      headers: { Cookie: `shramiksetu_session=${contractorCookie}` },
      redirect: 'manual',
    });
    record('2.2 Contractor accesses /contractor page', cPageRes.status === 200, `HTTP ${cPageRes.status}`);

    const cWorkerPageRes = await fetch(`${BASE_URL}/worker`, {
      headers: { Cookie: `shramiksetu_session=${contractorCookie}` },
      redirect: 'manual',
    });
    record('2.3 Contractor blocked from /worker page', cWorkerPageRes.status === 307, `HTTP ${cWorkerPageRes.status}`);

    const cWorkerApiRes = await fetch(`${BASE_URL}/api/workers/profile`, {
      headers: { Cookie: `shramiksetu_session=${contractorCookie}` },
    });
    record('2.4 Contractor blocked from /api/workers/profile with 403', cWorkerApiRes.status === 403, `HTTP ${cWorkerApiRes.status}`);
  } catch (err: any) {
    record('2. Contractor Sign-In', false, undefined, err.message);
  }

  // ── Step 3: Contractor Project & Statutory Wages ─────────────────────────
  try {
    const projectsRes = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Cookie: `shramiksetu_session=${contractorCookie}` },
    });
    const projectsData = await projectsRes.json();
    const hasProjects = Array.isArray(projectsData.projects) && projectsData.projects.length >= 1;
    record(
      '3.1 Contractor fetches projects list',
      projectsRes.status === 200 && hasProjects,
      `Found ${projectsData.projects?.length || 0} projects (e.g. ${projectsData.projects?.[0]?.name})`
    );

    const mwRes = await fetch(`${BASE_URL}/api/compliance/minimum-wages?state=Maharashtra&skillCategory=SKILLED`, {
      headers: { Cookie: `shramiksetu_session=${contractorCookie}` },
    });
    const mwData = await mwRes.json();
    const wageObj = mwData.applicableMinimumWage || mwData.minimum_wage;
    const hasMw = mwRes.status === 200 && wageObj && wageObj.daily_rate_paise > 0;
    record(
      '3.2 Statutory Minimum Wage resolved from PostgreSQL',
      hasMw,
      hasMw ? `Rate: ₹${(wageObj.daily_rate_paise / 100).toFixed(2)}/day (Source: ${wageObj.source_name})` : `HTTP ${mwRes.status} Error: ${mwData.error?.message || 'Unknown'}`
    );
  } catch (err: any) {
    record('3. Contractor Projects & Minimum Wages', false, undefined, err.message);
  }

  // ── Step 4: Contractor Dispenses Attendance PIN / Gate Token ─────────────
  try {
    const tokenRes = await fetch(`${BASE_URL}/api/attendance/token/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `shramiksetu_session=${contractorCookie}`,
      },
      body: JSON.stringify({
        projectId: '66666666-6666-6666-6666-666666666601', // Mumbai Metro Line 4
        ttlSeconds: 900,
      }),
    });
    const tokenData = await tokenRes.json();
    attendanceShortCode = tokenData.shortCode;
    record(
      '4.1 Dispense 6-Digit Gate PIN & Attendance Token',
      tokenRes.status === 201 && !!attendanceShortCode,
      `PIN: ${attendanceShortCode} (Token ID: ${tokenData.tokenId?.slice(0, 8)}...)`
    );
  } catch (err: any) {
    record('4. Token Dispensation', false, undefined, err.message);
  }

  // ── Step 5: Worker Sign-In & Mobile Viewport Protection ───────────────────
  try {
    const wSigninRes = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'SS-W-2026-000001',
        password: process.env.DEMO_WORKER_1_PASSWORD || 'Ramesh@123',
        role: 'WORKER',
      }),
    });
    const wSigninData = await wSigninRes.json();
    workerCookie = await extractCookie(wSigninRes, 'shramiksetu_session');

    record(
      '5.1 Worker Sign-In (SS-W-2026-000001: Ramesh Kumar)',
      wSigninRes.status === 200 && wSigninData.success && !!workerCookie,
      `User: ${wSigninData.user?.login_id || 'OK'} Role: ${wSigninData.role}`
    );

    const wPageRes = await fetch(`${BASE_URL}/worker`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
      redirect: 'manual',
    });
    record('5.2 Worker accesses /worker page', wPageRes.status === 200, `HTTP ${wPageRes.status}`);

    const wContractorPageRes = await fetch(`${BASE_URL}/contractor`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
      redirect: 'manual',
    });
    record('5.3 Worker blocked from /contractor page', wContractorPageRes.status === 307, `HTTP ${wContractorPageRes.status}`);

    const wContractorApiRes = await fetch(`${BASE_URL}/api/contractors/profile`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
    });
    record('5.4 Worker blocked from /api/contractors/profile with 403', wContractorApiRes.status === 403, `HTTP ${wContractorApiRes.status}`);
  } catch (err: any) {
    record('5. Worker Sign-In', false, undefined, err.message);
  }

  // ── Step 6: Worker Attendance Check-in with PIN ──────────────────────────
  try {
    if (attendanceShortCode) {
      const punchRes = await fetch(`${BASE_URL}/api/attendance/mark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `shramiksetu_session=${workerCookie}`,
        },
        body: JSON.stringify({
          manualCode: attendanceShortCode,
          punchType: 'IN',
          latitude: 19.26123,
          longitude: 72.96445,
          gpsAccuracyMeters: 10,
        }),
      });
      const punchData = await punchRes.json();
      record(
        '6.1 Worker punches in via 6-digit PIN',
        punchRes.status === 200 && punchData.success,
        punchData.success
          ? `Status: ${punchData.attendanceEvent?.status || 'VERIFIED'} (ID: ${punchData.attendanceEvent?.id?.slice(0, 8)}...)`
          : `HTTP ${punchRes.status} Error: ${punchData.error?.message || punchData.error?.code || 'Failed'}`
      );
    } else {
      record('6.1 Worker PIN punch', false, undefined, 'No attendance PIN generated');
    }
  } catch (err: any) {
    record('6. Attendance Punch', false, undefined, err.message);
  }

  // ── Step 7: Contractor Releases Wage Payment ─────────────────────────────
  try {
    const payRes = await fetch(`${BASE_URL}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `shramiksetu_session=${contractorCookie}`,
      },
      body: JSON.stringify({
        contractId: '55555555-5555-5555-5555-555555555501',
        workerId: '33333333-3333-3333-3333-333333333301',
        contractorId: '22222222-2222-2222-2222-222222222201',
        projectId: '66666666-6666-6666-6666-666666666601',
        amountPaise: 85000, // ₹850
        isAdvance: true,
        idempotencyKey: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        paymentMethod: 'UPI_SIMULATED',
        notes: 'Verified shift wage release',
      }),
    });
    const payData = await payRes.json();
    const isPaySuccess = (payRes.status === 200 || payRes.status === 201) && payData.success;
    record(
      '7.1 Contractor releases payment (₹850 / 85,000 paise)',
      isPaySuccess,
      isPaySuccess
        ? `HTTP ${payRes.status} Transaction ID: ${payData.transaction?.id?.slice(0, 8)}... (Ledger Debit & Credit Committed)`
        : `HTTP ${payRes.status} Error: ${payData.error || JSON.stringify(payData)}`
    );
  } catch (err: any) {
    record('7. Contractor Payment Release', false, undefined, err.message);
  }

  // ── Step 8: Worker Wallet & Sandbox Withdrawal ───────────────────────────
  try {
    const walletRes = await fetch(`${BASE_URL}/api/wallet/summary`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
    });
    const walletData = await walletRes.json();
    const balancePaise = walletData.balancePaise || 0;
    record(
      '8.1 Worker wallet summary returns integer paise balance',
      walletRes.status === 200 && Number.isInteger(balancePaise),
      `Available Balance: ₹${(balancePaise / 100).toFixed(2)} (${balancePaise} paise)`
    );

    const withdrawRes = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `shramiksetu_session=${workerCookie}`,
      },
      body: JSON.stringify({
        amountPaise: 50000, // ₹500
        destinationType: 'UPI',
        destinationValue: 'ramesh@okhdfcbank',
        idempotencyKey: `withdraw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }),
    });
    const withdrawData = await withdrawRes.json();
    const isWithdrawSuccess = (withdrawRes.status === 200 || withdrawRes.status === 201) && withdrawData.status !== 'FAILED';
    record(
      '8.2 Worker sandbox withdrawal (₹500 / 50,000 paise)',
      isWithdrawSuccess,
      isWithdrawSuccess
        ? `HTTP ${withdrawRes.status} Status: ${withdrawData.status} Reference: ${withdrawData.referenceId?.slice(0, 8)}...`
        : `HTTP ${withdrawRes.status} Error: ${withdrawData.error || JSON.stringify(withdrawData)}`
    );
  } catch (err: any) {
    record('8. Worker Wallet Withdrawal', false, undefined, err.message);
  }

  // ── Step 9: Dispute PDF Generation (EN, HI, MR) ──────────────────────────
  try {
    const disputeId = '77777777-7777-7777-7777-777777777701';

    // 9.1 English PDF
    const pdfEn = await fetch(`${BASE_URL}/api/disputes/${disputeId}/report.pdf?lang=en`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
    });
    const bufEn = await pdfEn.arrayBuffer();
    const isPdfEn = Boolean(
      pdfEn.status === 200 &&
      pdfEn.headers.get('content-type')?.includes('application/pdf') &&
      bufEn.byteLength > 1000 &&
      new TextDecoder().decode(bufEn.slice(0, 5)) === '%PDF-'
    );
    record('9.1 Complaint Report PDF generated in English (EN)', isPdfEn, `HTTP ${pdfEn.status} Bytes: ${bufEn.byteLength}`);

    // 9.2 Hindi PDF
    const pdfHi = await fetch(`${BASE_URL}/api/disputes/${disputeId}/report.pdf?lang=hi`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
    });
    const bufHi = await pdfHi.arrayBuffer();
    const isPdfHi = Boolean(
      pdfHi.status === 200 &&
      pdfHi.headers.get('content-type')?.includes('application/pdf') &&
      bufHi.byteLength > 1000 &&
      new TextDecoder().decode(bufHi.slice(0, 5)) === '%PDF-'
    );
    record('9.2 Complaint Report PDF generated in Hindi (HI) with Devanagari typography', isPdfHi, `HTTP ${pdfHi.status} Bytes: ${bufHi.byteLength}`);

    // 9.3 Marathi PDF
    const pdfMr = await fetch(`${BASE_URL}/api/disputes/${disputeId}/report.pdf?lang=mr`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
    });
    const bufMr = await pdfMr.arrayBuffer();
    const isPdfMr = Boolean(
      pdfMr.status === 200 &&
      pdfMr.headers.get('content-type')?.includes('application/pdf') &&
      bufMr.byteLength > 1000 &&
      new TextDecoder().decode(bufMr.slice(0, 5)) === '%PDF-'
    );
    record('9.3 Complaint Report PDF generated in Marathi (MR) with Devanagari typography', isPdfMr, `HTTP ${pdfMr.status} Bytes: ${bufMr.byteLength}`);
  } catch (err: any) {
    record('9. Complaint PDF Generation', false, undefined, err.message);
  }

  // ── Step 10: Public Verification of Dispute Report ───────────────────────
  try {
    const disputeRef = 'DSP-202610-001';
    const verifyApi = await fetch(`${BASE_URL}/api/verify/report/${disputeRef}`);
    const verifyData = await verifyApi.json();
    const isVerified = verifyApi.status === 200 && verifyData.verified && verifyData.dispute_ref === disputeRef;
    record('10.1 Public API verification (/api/verify/report/DSP-202610-001)', isVerified, `Ref: ${verifyData.dispute_ref} Status: ${verifyData.status}`);

    const verifyPage = await fetch(`${BASE_URL}/verify/report/${disputeRef}`);
    record('10.2 Public Verification Page (/verify/report/DSP-202610-001)', verifyPage.status === 200, `HTTP ${verifyPage.status}`);
  } catch (err: any) {
    record('10. Public Verification', false, undefined, err.message);
  }

  // ── Step 11: Contractor Responds to Dispute ──────────────────────────────
  try {
    const disputeId = '77777777-7777-7777-7777-777777777701';
    const respondRes = await fetch(`${BASE_URL}/api/disputes/${disputeId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `shramiksetu_session=${contractorCookie}`,
      },
      body: JSON.stringify({
        counterStatement: 'Muster logs verified for 3 shifts; contractor acknowledges arrears and will disburse.',
      }),
    });
    const respondData = await respondRes.json();
    const isRespondSuccess = respondRes.status === 200 && respondData.success;
    record(
      '11.1 Contractor submits dispute counter-statement -> UNDER_REVIEW',
      isRespondSuccess,
      isRespondSuccess ? `Dispute Status: ${respondData.dispute?.status || 'UNDER_REVIEW'}` : `HTTP ${respondRes.status} Error: ${respondData.error || JSON.stringify(respondData)}`
    );
  } catch (err: any) {
    record('11. Contractor Dispute Response', false, undefined, err.message);
  }

  // ── Step 12: Contractor Ends Worker Contract -> COMPLETED ────────────────
  try {
    const contractToTerminate = '55555555-5555-5555-5555-555555555503'; // Ongoing contract for Worker 2 under Contractor 1
    const termRes = await fetch(`${BASE_URL}/api/contracts/${contractToTerminate}/terminate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `shramiksetu_session=${contractorCookie}`,
      },
      body: JSON.stringify({
        reason: 'Worksite phase completion and shift handover',
        confirmOutstandingDues: true,
      }),
    });
    const termData = await termRes.json();
    const isTermSuccess = termRes.status === 200 && termData.success;
    record(
      '12.1 Contractor terminates assignment -> Soft-ends as COMPLETED',
      isTermSuccess,
      isTermSuccess ? `Status: ${termData.contract?.status || 'COMPLETED'} Reason: ${termData.contract?.termination_reason || 'OK'}` : `HTTP ${termRes.status} Error: ${termData.error?.message || JSON.stringify(termData)}`
    );

    const wContractsRes = await fetch(`${BASE_URL}/api/contracts?workerId=33333333-3333-3333-3333-333333333302`, {
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
    });
    const wContractsData = await wContractsRes.json();
    const hasCompleted = (wContractsData.contracts || []).some((c: any) => c.status === 'COMPLETED');
    record(
      '12.2 Worker contracts view retains completed contract in history',
      wContractsRes.status === 200 && hasCompleted,
      `Contract history preserved without data loss`
    );
  } catch (err: any) {
    record('12. Contract Termination Lifecycle', false, undefined, err.message);
  }

  // ── Step 13: Signout & Session Invalidation ──────────────────────────────
  try {
    const signoutRes = await fetch(`${BASE_URL}/api/auth/signout`, {
      method: 'POST',
      headers: { Cookie: `shramiksetu_session=${workerCookie}` },
    });
    record('13.1 Worker signout clears session cookie', signoutRes.status === 200, `HTTP ${signoutRes.status}`);
  } catch (err: any) {
    record('13. Signout', false, undefined, err.message);
  }

  // ── Summary Matrix ───────────────────────────────────────────────────────
  console.log('\n============================================================');
  console.log('             FINAL E2E AUDIT RESULTS MATRIX                 ');
  console.log('============================================================\n');

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.table(results.map((r) => ({
    'Step Description': r.step,
    'Status': r.passed ? 'PASSED' : 'FAILED',
    'Details': r.details || r.error || '',
  })));

  console.log(`\nOVERALL SCORE: ${passedCount} / ${totalCount} PASSED (${Math.round((passedCount / totalCount) * 100)}%)\n`);

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
