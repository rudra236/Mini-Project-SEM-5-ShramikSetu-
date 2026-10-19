/**
 * SHRAMIKSETU SQL SEED GENERATOR
 *
 * Converts in-memory seed dataset into clean, executable PostgreSQL SQL statements.
 */

import { CompleteSeedData } from './generator';

function escapeSql(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

export function generateSeedSql(data: CompleteSeedData): string {
  const lines: string[] = [];

  lines.push('-- ============================================================================');
  lines.push('-- SHRAMIKSETU DETERMINISTIC SEED SCRIPT (LIVING SYSTEM)');
  lines.push('-- ============================================================================');
  lines.push('-- Reset and populate: 1 jurisdiction, 1 inspector, 4 contractors,');
  lines.push('-- 8 projects, 40 workers, 60 days attendance, 12 disputes, balanced ledger,');
  lines.push('-- and complete end-to-end Ramesh Kumar narrative thread.');
  lines.push('-- ============================================================================');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  // 1. TRUNCATE CASCADE
  lines.push('-- 1. RESET EXISTING TABLES');
  lines.push('TRUNCATE TABLE');
  lines.push('    public.audit_events,');
  lines.push('    public.dispute_resolutions,');
  lines.push('    public.dispute_evidence_snapshots,');
  lines.push('    public.disputes,');
  lines.push('    public.job_completion_statements,');
  lines.push('    public.ledger_entries,');
  lines.push('    public.payment_transactions,');
  lines.push('    public.wallet_accounts,');
  lines.push('    public.attendance_events,');
  lines.push('    public.attendance_tokens,');
  lines.push('    public.employment_relationships,');
  lines.push('    public.contract_acceptances,');
  lines.push('    public.contract_versions,');
  lines.push('    public.compliance_check_logs,');
  lines.push('    public.minimum_wage_rules,');
  lines.push('    public.work_contracts,');
  lines.push('    public.supervisor_project_assignments,');
  lines.push('    public.worksites,');
  lines.push('    public.projects,');
  lines.push('    public.institutional_users,');
  lines.push('    public.supervisors,');
  lines.push('    public.workers,');
  lines.push('    public.contractors,');
  lines.push('    public.organizations,');
  lines.push('    public.profiles,');
  lines.push('    public.users');
  lines.push('CASCADE;');
  lines.push('');

  // 2. AUTH.USERS
  lines.push('-- 2. SEED AUTH.USERS');
  for (const u of data.authUsers) {
    lines.push(
      `INSERT INTO auth.users (id, phone, email, raw_user_meta_data, created_at, updated_at, instance_id, aud, role) ` +
      `VALUES (${escapeSql(u.id)}, ${escapeSql(u.phone)}, ${escapeSql(u.email || null)}, '{"seeded":true}'::jsonb, NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated') ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 3. USERS
  lines.push('-- 3. SEED PUBLIC USERS');
  for (const u of data.users) {
    lines.push(
      `INSERT INTO public.users (id, phone, email, role, locale, is_active) ` +
      `VALUES (${escapeSql(u.id)}, ${escapeSql(u.phone)}, ${escapeSql(u.email || null)}, ${escapeSql(u.role)}, ${escapeSql(u.locale)}, ${escapeSql(u.is_active)}) ` +
      `ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, phone = EXCLUDED.phone;`
    );
  }
  lines.push('');

  // 4. PROFILES
  lines.push('-- 4. SEED PROFILES');
  for (const p of data.profiles) {
    lines.push(
      `INSERT INTO public.profiles (id, phone, email, role, full_name, locale, is_active) ` +
      `VALUES (${escapeSql(p.id)}, ${escapeSql(p.phone)}, ${escapeSql(p.email || null)}, ${escapeSql(p.role)}, ${escapeSql(p.full_name)}, ${escapeSql(p.locale)}, ${escapeSql(p.is_active)}) ` +
      `ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;`
    );
  }
  lines.push('');

  // 5. ORGANIZATIONS
  lines.push('-- 5. SEED ORGANIZATIONS');
  for (const o of data.organizations) {
    lines.push(
      `INSERT INTO public.organizations (id, name, org_type, registration_number, contact_email, contact_phone, address, is_active) ` +
      `VALUES (${escapeSql(o.id)}, ${escapeSql(o.name)}, ${escapeSql(o.org_type)}, ${escapeSql(o.registration_number)}, ${escapeSql(o.contact_email || null)}, ${escapeSql(o.contact_phone || null)}, ${escapeSql(o.address || null)}, ${escapeSql(o.is_active)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 6. CONTRACTORS
  lines.push('-- 6. SEED CONTRACTORS');
  for (const c of data.contractors) {
    lines.push(
      `INSERT INTO public.contractors (id, user_id, organization_id, full_name, company_name, license_number) ` +
      `VALUES (${escapeSql(c.id)}, ${escapeSql(c.user_id)}, ${escapeSql(c.organization_id)}, ${escapeSql(c.full_name)}, ${escapeSql(c.company_name)}, ${escapeSql(c.license_number)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 7. WORKERS
  lines.push('-- 7. SEED WORKERS');
  for (const w of data.workers) {
    lines.push(
      `INSERT INTO public.workers (id, user_id, full_name, internal_worker_id, occupation, skill_category, emergency_contact) ` +
      `VALUES (${escapeSql(w.id)}, ${escapeSql(w.user_id)}, ${escapeSql(w.full_name)}, ${escapeSql(w.internal_worker_id)}, ${escapeSql(w.occupation)}, ${escapeSql(w.skill_category)}, ${escapeSql(w.emergency_contact)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 8. SUPERVISORS
  lines.push('-- 8. SEED SUPERVISORS');
  for (const s of data.supervisors) {
    lines.push(
      `INSERT INTO public.supervisors (id, user_id, contractor_id, full_name, badge_number) ` +
      `VALUES (${escapeSql(s.id)}, ${escapeSql(s.user_id)}, ${escapeSql(s.contractor_id)}, ${escapeSql(s.full_name)}, ${escapeSql(s.badge_number)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 9. INSTITUTIONAL USERS
  lines.push('-- 9. SEED INSTITUTIONAL USERS');
  for (const iu of data.institutionalUsers) {
    lines.push(
      `INSERT INTO public.institutional_users (id, user_id, organization_id, full_name, official_designation, jurisdiction_region) ` +
      `VALUES (${escapeSql(iu.id)}, ${escapeSql(iu.user_id)}, ${escapeSql(iu.organization_id)}, ${escapeSql(iu.full_name)}, ${escapeSql(iu.official_designation)}, ${escapeSql(iu.jurisdiction_region)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 10. PROJECTS
  lines.push('-- 10. SEED PROJECTS');
  for (const p of data.projects) {
    lines.push(
      `INSERT INTO public.projects (id, contractor_id, name, description, status, start_date, end_date) ` +
      `VALUES (${escapeSql(p.id)}, ${escapeSql(p.contractor_id)}, ${escapeSql(p.name)}, ${escapeSql(p.description)}, ${escapeSql(p.status)}, ${escapeSql(p.start_date)}, ${escapeSql(p.end_date)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 11. WORKSITES
  lines.push('-- 11. SEED WORKSITES');
  for (const ws of data.worksites) {
    lines.push(
      `INSERT INTO public.worksites (id, project_id, name, latitude, longitude, allowed_radius_meters, address, city, state, pincode) ` +
      `VALUES (${escapeSql(ws.id)}, ${escapeSql(ws.project_id)}, ${escapeSql(ws.name)}, ${escapeSql(ws.latitude)}, ${escapeSql(ws.longitude)}, ${escapeSql(ws.allowed_radius_meters)}, ${escapeSql(ws.address)}, ${escapeSql(ws.city)}, ${escapeSql(ws.state)}, ${escapeSql(ws.pincode)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 12. SUPERVISOR ASSIGNMENTS
  lines.push('-- 12. SEED SUPERVISOR ASSIGNMENTS');
  for (const sa of data.supervisorAssignments) {
    lines.push(
      `INSERT INTO public.supervisor_project_assignments (id, supervisor_id, project_id, is_active, assigned_at) ` +
      `VALUES (${escapeSql(sa.id)}, ${escapeSql(sa.supervisor_id)}, ${escapeSql(sa.project_id)}, ${escapeSql(sa.is_active)}, ${escapeSql(sa.assigned_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 13. MINIMUM WAGE RULES
  lines.push('-- 13. SEED MINIMUM WAGE RULES');
  for (const mr of data.minimumWageRules) {
    lines.push(
      `INSERT INTO public.minimum_wage_rules (id, version, state, district, worker_category, skill_level, wage_type, minimum_amount_paise, effective_from, source_reference, is_active) ` +
      `VALUES (${escapeSql(mr.id)}, ${escapeSql(mr.version)}, ${escapeSql(mr.state)}, ${escapeSql(mr.district)}, ${escapeSql(mr.worker_category)}, ${escapeSql(mr.skill_level)}, ${escapeSql(mr.wage_type)}, ${escapeSql(mr.minimum_amount_paise)}, ${escapeSql(mr.effective_from)}, ${escapeSql(mr.source_reference)}, ${escapeSql(mr.is_active)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 14. WORK CONTRACTS
  lines.push('-- 14. SEED WORK CONTRACTS');
  for (const c of data.contracts) {
    lines.push(
      `INSERT INTO public.work_contracts (id, contract_code, worker_id, contractor_id, project_id, worksite_id, work_type, daily_wage, expected_working_hours, payment_frequency, start_date, end_date, status, current_version_number, join_token) ` +
      `VALUES (${escapeSql(c.id)}, ${escapeSql(c.contract_code)}, ${escapeSql(c.worker_id)}, ${escapeSql(c.contractor_id)}, ${escapeSql(c.project_id)}, ${escapeSql(c.worksite_id)}, ${escapeSql(c.work_type)}, ${escapeSql(c.daily_wage)}, ${escapeSql(c.expected_working_hours)}, ${escapeSql(c.payment_frequency)}, ${escapeSql(c.start_date)}, ${escapeSql(c.end_date)}, ${escapeSql(c.status)}, ${escapeSql(c.current_version_number)}, ${escapeSql(c.join_token)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 15. CONTRACT VERSIONS
  lines.push('-- 15. SEED CONTRACT VERSIONS');
  for (const cv of data.contractVersions) {
    lines.push(
      `INSERT INTO public.contract_versions (id, contract_id, version_number, daily_wage, expected_working_hours, payment_frequency, work_type, effective_date, change_reason, terms_snapshot, created_by) ` +
      `VALUES (${escapeSql(cv.id)}, ${escapeSql(cv.contract_id)}, ${escapeSql(cv.version_number)}, ${escapeSql(cv.daily_wage)}, ${escapeSql(cv.expected_working_hours)}, ${escapeSql(cv.payment_frequency)}, ${escapeSql(cv.work_type)}, ${escapeSql(cv.effective_date)}, ${escapeSql(cv.change_reason)}, ${escapeSql(cv.terms_snapshot)}, ${escapeSql(cv.created_by)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 16. CONTRACT ACCEPTANCES
  lines.push('-- 16. SEED CONTRACT ACCEPTANCES');
  for (const ca of data.contractAcceptances) {
    lines.push(
      `INSERT INTO public.contract_acceptances (id, contract_id, contract_version_id, worker_id, response, rejection_reason, ip_address, user_agent, responded_at) ` +
      `VALUES (${escapeSql(ca.id)}, ${escapeSql(ca.contract_id)}, ${escapeSql(ca.contract_version_id)}, ${escapeSql(ca.worker_id)}, ${escapeSql(ca.response)}, ${escapeSql(ca.rejection_reason || null)}, ${escapeSql(ca.ip_address || null)}, ${escapeSql(ca.user_agent || null)}, ${escapeSql(ca.responded_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 17. EMPLOYMENT RELATIONSHIPS
  lines.push('-- 17. SEED EMPLOYMENT RELATIONSHIPS');
  for (const er of data.employmentRelationships) {
    lines.push(
      `INSERT INTO public.employment_relationships (id, contract_id, contract_version_id, acceptance_id, worker_id, contractor_id, project_id, status, start_date, end_date) ` +
      `VALUES (${escapeSql(er.id)}, ${escapeSql(er.contract_id)}, ${escapeSql(er.contract_version_id)}, ${escapeSql(er.acceptance_id || null)}, ${escapeSql(er.worker_id)}, ${escapeSql(er.contractor_id)}, ${escapeSql(er.project_id)}, ${escapeSql(er.status)}, ${escapeSql(er.start_date)}, ${escapeSql(er.end_date || null)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 18. ATTENDANCE TOKENS
  lines.push('-- 18. SEED ATTENDANCE TOKENS');
  for (const tok of data.attendanceTokens) {
    lines.push(
      `INSERT INTO public.attendance_tokens (id, token, project_id, worksite_id, created_by, expires_at, max_uses, used_count, is_active) ` +
      `VALUES (${escapeSql(tok.id)}, ${escapeSql(tok.token)}, ${escapeSql(tok.project_id)}, ${escapeSql(tok.worksite_id)}, ${escapeSql(tok.created_by)}, ${escapeSql(tok.expires_at)}, ${escapeSql(tok.max_uses || null)}, ${escapeSql(tok.used_count)}, ${escapeSql(tok.is_active)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 19. ATTENDANCE EVENTS (Chunked for performance)
  lines.push('-- 19. SEED ATTENDANCE EVENTS');
  for (const ae of data.attendanceEvents) {
    lines.push(
      `INSERT INTO public.attendance_events (id, worker_id, contractor_id, project_id, worksite_id, contract_id, date, worker_latitude, worker_longitude, worksite_latitude, worksite_longitude, calculated_distance_meters, status) ` +
      `VALUES (${escapeSql(ae.id)}, ${escapeSql(ae.worker_id)}, ${escapeSql(ae.contractor_id)}, ${escapeSql(ae.project_id)}, ${escapeSql(ae.worksite_id)}, ${escapeSql(ae.contract_id)}, ${escapeSql(ae.date)}, ${escapeSql(ae.worker_latitude)}, ${escapeSql(ae.worker_longitude)}, ${escapeSql(ae.worksite_latitude)}, ${escapeSql(ae.worksite_longitude)}, ${escapeSql(ae.calculated_distance_meters)}, ${escapeSql(ae.status)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 20. WALLET ACCOUNTS
  lines.push('-- 20. SEED WALLET ACCOUNTS');
  for (const wa of data.walletAccounts) {
    lines.push(
      `INSERT INTO public.wallet_accounts (id, account_type, owner_id, currency, is_active) ` +
      `VALUES (${escapeSql(wa.id)}, ${escapeSql(wa.account_type)}, ${escapeSql(wa.owner_id)}, ${escapeSql(wa.currency)}, ${escapeSql(wa.is_active)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 21. PAYMENT TRANSACTIONS
  lines.push('-- 21. SEED PAYMENT TRANSACTIONS');
  for (const pt of data.paymentTransactions) {
    lines.push(
      `INSERT INTO public.payment_transactions (id, transaction_ref, idempotency_key, sender_account_id, receiver_account_id, worker_id, contractor_id, contract_id, project_id, amount_paise, payment_source, notes, status, initiated_by, created_at) ` +
      `VALUES (${escapeSql(pt.id)}, ${escapeSql(pt.transaction_ref)}, ${escapeSql(pt.idempotency_key)}, ${escapeSql(pt.sender_account_id)}, ${escapeSql(pt.receiver_account_id)}, ${escapeSql(pt.worker_id)}, ${escapeSql(pt.contractor_id)}, ${escapeSql(pt.contract_id)}, ${escapeSql(pt.project_id)}, ${escapeSql(pt.amount_paise)}, ${escapeSql(pt.payment_source)}, ${escapeSql(pt.notes || null)}, ${escapeSql(pt.status)}, ${escapeSql(pt.initiated_by)}, ${escapeSql(pt.created_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 22. LEDGER ENTRIES
  lines.push('-- 22. SEED LEDGER ENTRIES (DOUBLE-ENTRY ROWS)');
  for (const le of data.ledgerEntries) {
    lines.push(
      `INSERT INTO public.ledger_entries (id, transaction_id, account_id, direction, amount_paise, created_at) ` +
      `VALUES (${escapeSql(le.id)}, ${escapeSql(le.transaction_id)}, ${escapeSql(le.account_id)}, ${escapeSql(le.direction)}, ${escapeSql(le.amount_paise)}, ${escapeSql(le.created_at)});`
    );
  }
  lines.push('');

  // 23. DISPUTES
  lines.push('-- 23. SEED DISPUTES');
  for (const d of data.disputes) {
    lines.push(
      `INSERT INTO public.disputes (id, dispute_ref, worker_id, contractor_id, project_id, contract_id, category, description, status, priority, raised_by_user_id, created_at, updated_at) ` +
      `VALUES (${escapeSql(d.id)}, ${escapeSql(d.dispute_ref)}, ${escapeSql(d.worker_id)}, ${escapeSql(d.contractor_id)}, ${escapeSql(d.project_id)}, ${escapeSql(d.contract_id)}, ${escapeSql(d.category)}, ${escapeSql(d.description)}, ${escapeSql(d.status)}, ${escapeSql(d.priority)}, ${escapeSql(d.raised_by_user_id)}, ${escapeSql(d.created_at)}, ${escapeSql(d.updated_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 24. DISPUTE EVIDENCE SNAPSHOTS
  lines.push('-- 24. SEED DISPUTE EVIDENCE SNAPSHOTS');
  for (const des of data.disputeEvidenceSnapshots) {
    lines.push(
      `INSERT INTO public.dispute_evidence_snapshots (id, dispute_id, contract_snapshot, contract_versions_snapshot, worker_acceptance_snapshot, attendance_snapshot, payment_transactions_snapshot, automated_analysis, created_at) ` +
      `VALUES (${escapeSql(des.id)}, ${escapeSql(des.dispute_id)}, ${escapeSql(des.contract_snapshot)}, ${escapeSql(des.contract_versions_snapshot)}, ${escapeSql(des.worker_acceptance_snapshot)}, ${escapeSql(des.attendance_snapshot)}, ${escapeSql(des.payment_transactions_snapshot)}, ${escapeSql(des.automated_analysis)}, ${escapeSql(des.created_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 25. DISPUTE RESOLUTIONS
  lines.push('-- 25. SEED DISPUTE RESOLUTIONS');
  for (const dr of data.disputeResolutions) {
    lines.push(
      `INSERT INTO public.dispute_resolutions (id, dispute_id, decision, reason, resolution_notes, reviewer_user_id, resolved_at) ` +
      `VALUES (${escapeSql(dr.id)}, ${escapeSql(dr.dispute_id)}, ${escapeSql(dr.decision)}, ${escapeSql(dr.reason)}, ${escapeSql(dr.resolution_notes || null)}, ${escapeSql(dr.reviewer_user_id)}, ${escapeSql(dr.resolved_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 26. COMPLIANCE CHECK LOGS
  lines.push('-- 26. SEED COMPLIANCE CHECK LOGS');
  for (const ccl of data.complianceCheckLogs) {
    lines.push(
      `INSERT INTO public.compliance_check_logs (id, contract_id, rule_id, rule_version, rule_snapshot, inputs, calculation, result, explanation) ` +
      `VALUES (${escapeSql(ccl.id)}, ${escapeSql(ccl.contract_id)}, ${escapeSql(ccl.rule_id)}, ${escapeSql(ccl.rule_version)}, ${escapeSql(ccl.rule_snapshot)}, ${escapeSql(ccl.inputs)}, ${escapeSql(ccl.calculation)}, ${escapeSql(ccl.result)}, ${escapeSql(ccl.explanation)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 27. JOB COMPLETION STATEMENTS
  lines.push('-- 27. SEED JOB COMPLETION STATEMENTS');
  for (const jcs of data.jobCompletionStatements) {
    lines.push(
      `INSERT INTO public.job_completion_statements (id, employment_relationship_id, contract_id, worker_id, contractor_id, project_id, work_type, contract_period_start, contract_period_end, acceptance_date, daily_wage_paise, verified_workdays, total_earned_paise, total_paid_paise, outstanding_paise, total_disputes, open_disputes, resolved_disputes, settlement_status, generated_at, generated_by) ` +
      `VALUES (${escapeSql(jcs.id)}, ${escapeSql(jcs.employment_relationship_id)}, ${escapeSql(jcs.contract_id)}, ${escapeSql(jcs.worker_id)}, ${escapeSql(jcs.contractor_id)}, ${escapeSql(jcs.project_id)}, ${escapeSql(jcs.work_type)}, ${escapeSql(jcs.contract_period_start)}, ${escapeSql(jcs.contract_period_end || null)}, ${escapeSql(jcs.acceptance_date)}, ${escapeSql(jcs.daily_wage_paise)}, ${escapeSql(jcs.verified_workdays)}, ${escapeSql(jcs.total_earned_paise)}, ${escapeSql(jcs.total_paid_paise)}, ${escapeSql(jcs.outstanding_paise)}, ${escapeSql(jcs.total_disputes)}, ${escapeSql(jcs.open_disputes)}, ${escapeSql(jcs.resolved_disputes)}, ${escapeSql(jcs.settlement_status)}, ${escapeSql(jcs.generated_at)}, ${escapeSql(jcs.generated_by)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // 28. AUDIT EVENTS
  lines.push('-- 28. SEED AUDIT EVENTS');
  for (const ae of data.auditEvents) {
    lines.push(
      `INSERT INTO public.audit_events (id, sequence_number, actor_id, action, entity_type, entity_id, payload, previous_hash, current_hash, created_at) ` +
      `VALUES (${escapeSql(ae.id)}, ${escapeSql(ae.sequence_number)}, ${escapeSql(ae.actor_id)}, ${escapeSql(ae.action)}, ${escapeSql(ae.entity_type)}, ${escapeSql(ae.entity_id)}, ${escapeSql(ae.payload)}, ${escapeSql(ae.previous_hash)}, ${escapeSql(ae.current_hash)}, ${escapeSql(ae.created_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  lines.push('COMMIT;');
  lines.push('');

  return lines.join('\n');
}
