import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

import { createAdminClient } from '../src/lib/supabase/admin';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface VerificationRow {
  field: string;
  sent: string;
  stored: string;
  status: 'OK' | 'FAIL';
}

const rows: VerificationRow[] = [];

function record(field: string, sent: any, stored: any) {
  const sentStr = String(sent ?? '');
  const storedStr = String(stored ?? '');
  const status: 'OK' | 'FAIL' = sentStr === storedStr ? 'OK' : 'FAIL';
  rows.push({ field, sent: sentStr, stored: storedStr, status });
}

function parseCookie(setCookieHeaders: string[] | string | null, name: string): string | null {
  if (!setCookieHeaders) return null;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const h of headers) {
    const parts = h.split(';');
    for (const part of parts) {
      const [k, v] = part.trim().split('=');
      if (k === name) return v;
    }
  }
  return null;
}

async function apiCall(endpoint: string, options: RequestInit = {}, cookie?: string) {
  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  const res = await fetch(url, { ...options, headers });
  const rawText = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = { raw: rawText };
  }
  return { status: res.status, headers: res.headers, data: json };
}

async function run() {
  console.log('\n============================================================');
  console.log('       SHRAMIKSETU END-TO-END PERSISTENCE VERIFICATION      ');
  console.log('       (Real PostgreSQL Database Source of Truth)           ');
  console.log('============================================================\n');

  const admin = createAdminClient();
  const timestamp = Date.now();

  // ─── 1. REGISTER CONTRACTOR VIA REAL API ───
  console.log('1. Registering Contractor with Devanagari details...');
  const contractorPayload = {
    role: 'CONTRACTOR' as const,
    companyName: `मुंबई मेट्रो इन्फ्रास्ट्रक्चर-${timestamp.toString().slice(-4)}`,
    fullName: 'विक्रम शर्मा (ठेकेदार)',
    licenseNumber: `MH-LIC-${timestamp.toString().slice(-6)}`,
    phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
    password: 'Contractor@Secure2026',
    locale: 'hi' as const,
  };

  const cRegRes = await apiCall('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(contractorPayload),
  });

  if (cRegRes.status !== 200) {
    console.error('Contractor registration failed:', cRegRes.data);
    process.exit(1);
  }

  const contractorLoginId = cRegRes.data.loginId;
  const contractorUserId = cRegRes.data.user?.id || cRegRes.data.id;
  const rawSetCookieC = cRegRes.headers.get('set-cookie');
  const contractorSession = parseCookie(rawSetCookieC, 'shramiksetu_session');
  const contractorCookie = `shramiksetu_session=${contractorSession}`;

  console.log(`   ✓ Contractor created: Login ID = ${contractorLoginId}, User ID = ${contractorUserId}`);

  // ─── 2. REGISTER WORKER VIA REAL API ───
  console.log('2. Registering Worker with Devanagari details...');
  const workerPayload = {
    role: 'WORKER' as const,
    fullName: 'रमेश कुमार (कामगार)',
    phone: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
    occupation: 'मेसन / Mason',
    skillCategory: 'SKILLED' as const,
    emergencyContact: '+919711002233',
    password: 'Worker@Secure2026',
    locale: 'mr' as const,
  };

  const wRegRes = await apiCall('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(workerPayload),
  });

  if (wRegRes.status !== 200) {
    console.error('Worker registration failed:', wRegRes.data);
    process.exit(1);
  }

  const workerLoginId = wRegRes.data.loginId;
  const workerUserId = wRegRes.data.user?.id || wRegRes.data.id;
  const rawSetCookieW = wRegRes.headers.get('set-cookie');
  const workerSession = parseCookie(rawSetCookieW, 'shramiksetu_session');
  const workerCookie = `shramiksetu_session=${workerSession}`;

  console.log(`   ✓ Worker created: Login ID = ${workerLoginId}, User ID = ${workerUserId}`);

  // ─── 3. CREATE PROJECT VIA REAL API ───
  console.log('3. Contractor creating Project with Geofenced Worksite...');
  const todayStr = new Date().toISOString().split('T')[0];
  const projectPayload = {
    name: 'बांद्रा टर्मिनस पुनर्निर्माण प्रकल्प',
    description: 'मेट्रो स्थानक आणि पायाभूत सुविधा बांधकाम',
    startDate: todayStr,
    worksiteName: 'गेट क्र. २ - बांद्रा पूर्व',
    latitude: 19.0596,
    longitude: 72.8295,
    geofenceRadiusMeters: 200,
    address: 'Bandra East Highway Junction',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400051',
  };

  const pRes = await apiCall('/api/projects', {
    method: 'POST',
    body: JSON.stringify(projectPayload),
  }, contractorCookie);

  if (pRes.status !== 201) {
    console.error('Project creation failed:', pRes.data);
    process.exit(1);
  }

  const project = pRes.data.project;
  const worksite = pRes.data.worksite;
  console.log(`   ✓ Project created: ID = ${project.id}, Worksite ID = ${worksite?.id}`);

  // ─── 4. CONTRACTOR INVITES WORKER (CREATE CONTRACT) ───
  console.log('4. Contractor inviting Worker to Project...');
  const contractPayload = {
    workerLoginId,
    projectId: project.id,
    worksiteId: worksite?.id,
    workType: 'मेसन / Mason',
    dailyWage: 750, // ₹750/day (75000 paise)
    expectedWorkingHours: 8,
    paymentFrequency: 'DAILY' as const,
    startDate: todayStr,
    acknowledgeBelowMinimumWage: false,
  };

  const ctrRes = await apiCall('/api/contracts', {
    method: 'POST',
    body: JSON.stringify(contractPayload),
  }, contractorCookie);

  if (ctrRes.status !== 201) {
    console.error('Contract creation failed:', ctrRes.data);
    process.exit(1);
  }

  const contract = ctrRes.data.contract;
  console.log(`   ✓ Contract created: ID = ${contract.id}, Code = ${contract.contract_code}, Status = ${contract.status}`);

  // ─── 5. WORKER ACCEPTS CONTRACT ───
  console.log('5. Worker accepting contract assignment...');
  const acceptRes = await apiCall(`/api/worker/assignments/${contract.id}/accept`, {
    method: 'POST',
  }, workerCookie);

  if (acceptRes.status !== 200) {
    console.error('Contract acceptance failed:', acceptRes.data);
    process.exit(1);
  }
  console.log(`   ✓ Contract accepted: Status = ${acceptRes.data.contract.status}`);

  // ─── 6. CONTRACTOR GENERATES GATE TOKEN ───
  console.log('6. Contractor generating active Gate Token...');
  const tokenPayload = {
    projectId: project.id,
    worksiteId: worksite?.id,
    ttlSeconds: 900,
  };

  const tokRes = await apiCall('/api/attendance/token/create', {
    method: 'POST',
    body: JSON.stringify(tokenPayload),
  }, contractorCookie);

  if (tokRes.status !== 201) {
    console.error('Gate token generation failed:', tokRes.data);
    process.exit(1);
  }

  const gateToken = tokRes.data.token;
  const shortCode = tokRes.data.shortCode;
  const tokenId = tokRes.data.tokenId;
  console.log(`   ✓ Gate token created: Token ID = ${tokenId}, Code = ${shortCode}`);

  // ─── 7. WORKER MARKS ATTENDANCE (CHECK-IN) ───
  console.log('7. Worker scanning QR Gate Token to Check-In...');
  const punchPayload = {
    qrToken: gateToken,
    latitude: 19.0596,
    longitude: 72.8295,
    gpsAccuracyMeters: 5,
    punchType: 'IN' as const,
    mockLocationFlag: false,
    deviceFingerprint: 'verification-fingerprint-v1',
  };

  const punchRes = await apiCall('/api/attendance/mark', {
    method: 'POST',
    body: JSON.stringify(punchPayload),
  }, workerCookie);

  if (punchRes.status !== 200) {
    console.error('Attendance punch failed:', punchRes.data);
    process.exit(1);
  }

  const attendanceEvent = punchRes.data.attendanceEvent;
  console.log(`   ✓ Attendance recorded: ID = ${attendanceEvent.id}, Status = ${attendanceEvent.status}, Distance = ${attendanceEvent.calculated_distance_meters}m`);

  // ─── 8. CONTRACTOR RECORDS PAYMENT ───
  console.log('8. Contractor recording wage disbursement in integer paise...');
  // Fetch worker profile id
  const { data: workerProf } = await admin.from('workers').select('id').eq('user_id', workerUserId).single();
  const { data: contractorProf } = await admin.from('contractors').select('id').eq('user_id', contractorUserId).single();

  const payPayload = {
    contractId: contract.id,
    workerId: workerProf.id,
    contractorId: contractorProf.id,
    projectId: project.id,
    amountPaise: 75000, // ₹750 in integer paise
    idempotencyKey: `PERSIST-PAY-${timestamp}`,
    paymentMethod: 'UPI_SIMULATED' as const,
    paymentSource: 'PLATFORM_TRANSFER' as const,
    notes: 'दैनिक मजुरी प्रदान (Daily wage payout)',
    isAdvance: true,
  };

  const payRes = await apiCall('/api/payments/initiate', {
    method: 'POST',
    body: JSON.stringify(payPayload),
  }, contractorCookie);

  if (payRes.status !== 201) {
    console.error('Payment initiation failed:', payRes.data);
    process.exit(1);
  }

  const paymentTx = payRes.data.transaction;
  console.log(`   ✓ Payment recorded: Ref = ${paymentTx.transaction_ref}, Amount = ₹${paymentTx.amount_paise / 100}`);

  // ─── 9. WORKER RAISES DISPUTE ───
  console.log('9. Worker raising dispute...');
  const disputePayload = {
    projectId: project.id,
    contractId: contract.id,
    contractorId: contractorProf.id,
    category: 'WAGE' as const,
    description: 'ओव्हरटाईम मजुरी अद्याप प्रलंबित आहे (Overtime wage pending)',
    amountClaimedPaise: 15000, // ₹150 in integer paise
    priority: 'MEDIUM' as const,
  };

  const dispRes = await apiCall('/api/disputes', {
    method: 'POST',
    body: JSON.stringify(disputePayload),
  }, workerCookie);

  if (dispRes.status !== 201) {
    console.error('Dispute creation failed:', dispRes.data);
    process.exit(1);
  }

  const dispute = dispRes.data.dispute;
  console.log(`   ✓ Dispute recorded: Ref = ${dispute.dispute_ref}, Category = ${dispute.category}`);

  // ─── 10. UPDATE USER LOCALE VIA REAL API ───
  console.log('10. Worker updating language preference...');
  const locRes = await apiCall('/api/users/locale', {
    method: 'POST',
    body: JSON.stringify({ locale: 'hi' }),
  }, workerCookie);

  if (locRes.status !== 200) {
    console.error('Locale update failed:', locRes.data);
    process.exit(1);
  }
  console.log(`   ✓ Locale updated to: ${locRes.data.locale}`);

  // =========================================================================
  // ─── 11. DIRECT POSTGRESQL QUERY & COMPARISON TABLE (field | sent | stored | OK/FAIL) ───
  // =========================================================================
  console.log('\n--- 11. DIRECT POSTGRESQL QUERY & FIELD-BY-FIELD AUDIT ---');

  // Contractor User & Profile
  const { data: dbContractorUser } = await admin.from('users').select('*').eq('id', contractorUserId).single();
  const { data: dbContractor } = await admin.from('contractors').select('*').eq('user_id', contractorUserId).single();

  record('contractor.login_id', contractorLoginId, dbContractorUser.login_id);
  record('contractor.role', contractorPayload.role, dbContractorUser.role);
  record('contractor.phone', contractorPayload.phone, dbContractorUser.phone);
  record('contractor.locale', contractorPayload.locale, dbContractorUser.locale);
  record('contractor.company_name', contractorPayload.companyName, dbContractor.company_name);
  record('contractor.full_name', contractorPayload.fullName, dbContractor.full_name);
  record('contractor.license_number', contractorPayload.licenseNumber, dbContractor.license_number);

  // Worker User & Profile
  const { data: dbWorkerUser } = await admin.from('users').select('*').eq('id', workerUserId).single();
  const { data: dbWorker } = await admin.from('workers').select('*').eq('user_id', workerUserId).single();

  record('worker.login_id', workerLoginId, dbWorkerUser.login_id);
  record('worker.role', workerPayload.role, dbWorkerUser.role);
  record('worker.phone', workerPayload.phone, dbWorkerUser.phone);
  record('worker.locale (updated)', 'hi', dbWorkerUser.locale);
  record('worker.full_name', workerPayload.fullName, dbWorker.full_name);
  record('worker.occupation', workerPayload.occupation, dbWorker.occupation);
  record('worker.skill_category', workerPayload.skillCategory, dbWorker.skill_category);
  record('worker.emergency_contact', workerPayload.emergencyContact, dbWorker.emergency_contact);

  // Project & Worksite
  const { data: dbProject } = await admin.from('projects').select('*').eq('id', project.id).single();
  const { data: dbWorksite } = await admin.from('worksites').select('*').eq('id', worksite?.id).single();

  record('project.name', projectPayload.name, dbProject.name);
  record('project.description', projectPayload.description, dbProject.description);
  record('project.start_date', projectPayload.startDate, dbProject.start_date);
  record('project.contractor_id', contractorProf.id, dbProject.contractor_id);
  record('worksite.name', projectPayload.worksiteName, dbWorksite.name);
  record('worksite.latitude', projectPayload.latitude, Number(dbWorksite.latitude));
  record('worksite.longitude', projectPayload.longitude, Number(dbWorksite.longitude));
  record('worksite.allowed_radius_meters', projectPayload.geofenceRadiusMeters, Number(dbWorksite.allowed_radius_meters));
  record('worksite.address', projectPayload.address, dbWorksite.address);
  record('worksite.city', projectPayload.city, dbWorksite.city);
  record('worksite.state', projectPayload.state, dbWorksite.state);

  // Work Contract
  const { data: dbContract } = await admin.from('work_contracts').select('*').eq('id', contract.id).single();
  record('contract.work_type', contractPayload.workType, dbContract.work_type);
  record('contract.daily_wage_paise', contractPayload.dailyWage * 100, Number(dbContract.daily_wage));
  record('contract.status_after_acceptance', 'ACCEPTED', acceptRes.data.contract.status);
  record('contract.status_after_dispute', 'DISPUTED', dbContract.status);
  record('contract.worker_id', workerProf.id, dbContract.worker_id);
  record('contract.project_id', project.id, dbContract.project_id);

  // Attendance Event
  const { data: dbAttendance } = await admin.from('attendance_events').select('*').eq('id', attendanceEvent.id).single();
  record('attendance.punch_type', punchPayload.punchType, dbAttendance.punch_type);
  record('attendance.worker_latitude', punchPayload.latitude, Number(dbAttendance.worker_latitude));
  record('attendance.worker_longitude', punchPayload.longitude, Number(dbAttendance.worker_longitude));
  record('attendance.mock_location_flag', punchPayload.mockLocationFlag, dbAttendance.mock_location_flag);
  record('attendance.status', attendanceEvent.status, dbAttendance.status);

  // Gate Token
  const { data: dbToken } = await admin.from('attendance_tokens').select('*').eq('id', tokenId).single();
  record('gate_token.short_code', shortCode, dbToken.short_code);
  record('gate_token.project_id', project.id, dbToken.project_id);

  // Payment Transaction & Ledger
  const { data: dbPayment } = await admin.from('payment_transactions').select('*').eq('id', paymentTx.id).single();
  record('payment.amount_paise', payPayload.amountPaise, Number(dbPayment.amount_paise));
  record('payment.idempotency_key', payPayload.idempotencyKey, dbPayment.idempotency_key);
  record('payment.payment_method', payPayload.paymentMethod, dbPayment.payment_method);
  record('payment.payment_source', payPayload.paymentSource, dbPayment.payment_source);
  record('payment.notes', payPayload.notes, dbPayment.notes);

  // Dispute
  const { data: dbDispute } = await admin.from('disputes').select('*').eq('id', dispute.id).single();
  record('dispute.category', disputePayload.category, dbDispute.category);
  record('dispute.description', disputePayload.description, dbDispute.description);
  record('dispute.amount_claimed_paise', disputePayload.amountClaimedPaise, Number(dbDispute.amount_claimed_paise));
  record('dispute.status', 'OPEN', dbDispute.status);

  // JSON File Storage Assertion
  const jsonRegPath = path.resolve(process.cwd(), '.registered_projects.json');
  const jsonExists = fs.existsSync(jsonRegPath);
  record('no_business_data_in_json_file', 'NO_JSON_DATA', jsonExists ? 'JSON_FILE_EXISTS' : 'NO_JSON_DATA');

  // Print Formatted Table
  console.log('\n| Field | Sent / Expected | Stored in PostgreSQL | Status |');
  console.log('| :--- | :--- | :--- | :---: |');
  let allOk = true;
  for (const r of rows) {
    console.log(`| ${r.field} | ${r.sent} | ${r.stored} | ${r.status} |`);
    if (r.status !== 'OK') allOk = false;
  }

  if (allOk) {
    console.log('\n✓ ALL 38 FIELD CHECKS PASSED: 100% POSTGRESQL PERSISTENCE VERIFIED!\n');
    process.exit(0);
  } else {
    console.error('\n✗ PERSISTENCE AUDIT FAILED ON ONE OR MORE FIELDS.\n');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during persistence verification:', err);
  process.exit(1);
});
