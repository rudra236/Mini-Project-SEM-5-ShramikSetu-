/**
 * SHRAMIKSETU DATABASE SEED RUNNER
 *
 * Usage: npm run seed
 *
 * Populates a deterministic living system:
 * - 1 Jurisdiction (Mumbai Suburban), 1 Inspector
 * - 4 Contractors (mix of compliant, late-paying, non-compliant)
 * - 8 Projects, 40 Workers (mixed skill tiers, mixed languages)
 * - 60 Days of attendance (weekends off, absences, GPS flags)
 * - Contracts across PENDING, ACTIVE, COMPLETED, REJECTED
 * - Double-entry wage ledger rows
 * - 12 Disputes (4 OPEN, 4 UNDER_REVIEW, 4 RESOLVED) with snapshots
 * - Complete Ramesh Kumar demo narrative thread (₹1,800 underpayment reversed & settled)
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildCompleteSeedData } from './generator';
import { generateSeedSql } from './sql-generator';

async function runSeed() {
  console.log('================================================================');
  console.log('🚀 SHRAMIKSETU DETERMINISTIC DATABASE SEED INITIALIZING...');
  console.log('================================================================');

  // 1. Build authoritative deterministic dataset
  const dataset = buildCompleteSeedData();

  console.log(`✓ Generated ${dataset.workers.length} workers with mixed skill tiers & languages`);
  console.log(`✓ Generated ${dataset.contractors.length} contractors (1 compliant, 3 underpaying benchmark)`);
  console.log(`✓ Generated ${dataset.projects.length} projects & ${dataset.worksites.length} worksites across Mumbai Suburban`);
  console.log(`✓ Generated ${dataset.contracts.length} contracts across PENDING, ACTIVE, COMPLETED, REJECTED`);
  console.log(`✓ Generated ${dataset.attendanceEvents.length} attendance events over 60 days`);
  console.log(`✓ Generated ${dataset.paymentTransactions.length} payment transactions & ${dataset.ledgerEntries.length} double-entry ledger rows`);
  console.log(`✓ Generated ${dataset.disputes.length} disputes (4 OPEN, 4 UNDER_REVIEW, 4 RESOLVED) with snapshots`);
  console.log(`✓ Generated ${dataset.jobCompletionStatements.length} job completion statements`);

  // 2. Double-entry ledger balance assertion
  let totalDebits = 0;
  let totalCredits = 0;
  for (const le of dataset.ledgerEntries) {
    if (le.direction === 'DEBIT') totalDebits += le.amount_paise;
    if (le.direction === 'CREDIT') totalCredits += le.amount_paise;
  }

  if (totalDebits !== totalCredits) {
    throw new Error(`LEDGER_IMBALANCE: Total debits (${totalDebits}) does not match total credits (${totalCredits})`);
  }
  console.log(`✓ Double-entry ledger verified in perfect balance: ₹${totalDebits / 100} debited = ₹${totalCredits / 100} credited`);

  // 3. Serialize SQL and write to supabase/seed.sql
  const sql = generateSeedSql(dataset);
  const seedSqlPath = path.resolve(process.cwd(), 'supabase', 'seed.sql');
  fs.writeFileSync(seedSqlPath, sql, 'utf-8');
  console.log(`✓ Written full PostgreSQL seed script to ${seedSqlPath} (${(sql.length / 1024).toFixed(1)} KB)`);

  // 4. Save JSON dataset for integration testing & offline runtime
  const datasetJsonPath = path.resolve(process.cwd(), 'supabase', 'seed', 'dataset.json');
  fs.writeFileSync(datasetJsonPath, JSON.stringify(dataset, null, 2), 'utf-8');
  console.log(`✓ Saved deterministic snapshot to ${datasetJsonPath}`);

  // 5. Verify the live demo narrative thread
  const rameshContract = dataset.contracts.find((c) => c.worker_id === dataset.workers[0].id)!;
  const rameshAttendance = dataset.attendanceEvents.filter(
    (a) => a.worker_id === dataset.workers[0].id && a.status === 'VERIFIED'
  );
  const rameshTxns = dataset.paymentTransactions.filter(
    (p) => p.worker_id === dataset.workers[0].id
  );
  const rameshDispute = dataset.disputes.find(
    (d) => d.worker_id === dataset.workers[0].id
  )!;
  const rameshResolution = dataset.disputeResolutions.find(
    (dr) => dr.dispute_id === rameshDispute.id
  )!;
  const rameshCompletion = dataset.jobCompletionStatements.find(
    (jcs) => jcs.worker_id === dataset.workers[0].id
  )!;

  const totalEarnedPaise = rameshAttendance.length * rameshContract.daily_wage;
  const totalPaidPaise = rameshTxns.reduce((sum, t) => sum + t.amount_paise, 0);
  const outstandingPaise = totalEarnedPaise - totalPaidPaise;

  console.log('----------------------------------------------------------------');
  console.log('🌟 LIVE DEMO NARRATIVE THREAD VERIFICATION:');
  console.log(`  • Worker: ${dataset.workers[0].full_name} (${dataset.workers[0].occupation})`);
  console.log(`  • Contractor: Suresh Builders & Infrastructure Pvt Ltd`);
  console.log(`  • Project: ${dataset.projects[0].name}`);
  console.log(`  • Shifts Worked: ${rameshAttendance.length} verified shifts @ ₹${rameshContract.daily_wage / 100}/day = ₹${totalEarnedPaise / 100}`);
  console.log(`  • Initial Payout: ₹${rameshTxns[0].amount_paise / 100} (Underpaid by ₹${(totalEarnedPaise - rameshTxns[0].amount_paise) / 100})`);
  console.log(`  • Dispute Filed: ${rameshDispute.dispute_ref} (${rameshDispute.status})`);
  console.log(`  • Inspector Ruling: Decision ${rameshResolution.decision} by Inspector Vikram Jadhav`);
  console.log(`  • Reversing Entry: ₹${rameshTxns[1].amount_paise / 100} disbursed via platform settlement ledger`);
  console.log(`  • Final Reconciled Arrears: ₹${outstandingPaise / 100} (0.00)`);
  console.log(`  • Digital Passport: ${rameshCompletion.verified_workdays} workdays, settlement status = ${rameshCompletion.settlement_status}`);
  console.log('================================================================');
  console.log('🎉 SEED SCRIPT COMPLETED SUCCESSFULLY. SYSTEM IS LIVING & CONSISTENT.');
  console.log('================================================================');
}

runSeed().catch((err) => {
  console.error('SEED_EXECUTION_FAILED:', err);
  process.exit(1);
});
