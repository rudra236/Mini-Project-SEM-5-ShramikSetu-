/**
 * SHRAMIKSETU UNIFIED FINANCIAL SUMMARY SERVICE
 *
 * Single source of truth for:
 *  - Worker shifts worked (verified attendance count)
 *  - Total earned (integer paise)
 *  - Total paid (integer paise)
 *  - Net outstanding arrears (integer paise)
 *
 * Backed by the database view `worker_financial_summary` and `contract_financial_summary`.
 * Ensures that /worker (Dashboard), /worker/wallet (Ledger), and /worker/passport (Passport)
 * never calculate or diverge on totals.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { localUserRegistry } from '@/lib/auth/unified-auth';

export interface WorkerFinancialSummary {
  workerId: string;
  userId: string;
  fullName: string;
  internalWorkerId: string;
  occupation: string | null;
  skillCategory: string | null;
  verifiedDaysCount: number;
  totalEarnedPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
  totalWithdrawnPaise: number;
  walletBalancePaise: number;
  totalContractsCount: number;
  activeContractsCount: number;
}

export interface ContractFinancialSummary {
  contractId: string;
  contractCode: string;
  workerId: string;
  contractorId: string;
  projectId: string;
  worksiteId: string;
  contractStatus: string;
  dailyWagePaise: number;
  verifiedDaysCount: number;
  totalEarnedPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
}

async function getWorkerWithdrawalTotals(admin: any, workerId: string): Promise<number> {
  try {
    const { data: workerAcc } = await admin
      .from('accounts')
      .select('id')
      .eq('account_type', 'WORKER')
      .eq('owner_id', workerId)
      .maybeSingle();

    if (!workerAcc) return 0;

    const { data: entries } = await admin
      .from('ledger_entries')
      .select('amount_paise, ref_type, debit_account, credit_account')
      .in('ref_type', ['WITHDRAWAL', 'ADJUSTMENT', 'WITHDRAWAL_REVERSAL']);

    let netWithdrawn = 0;
    for (const w of entries || []) {
      if (w.ref_type === 'WITHDRAWAL' && w.debit_account === workerAcc.id) {
        netWithdrawn += Number(w.amount_paise || 0);
      } else if ((w.ref_type === 'ADJUSTMENT' || w.ref_type === 'WITHDRAWAL_REVERSAL') && w.credit_account === workerAcc.id) {
        netWithdrawn -= Number(w.amount_paise || 0);
      }
    }
    return Math.max(0, netWithdrawn);
  } catch {
    return 0;
  }
}

/**
 * Fetch unified financial summary for a worker.
 * Queries `worker_financial_summary` view, with fallback to relational query if view is unavailable.
 */
export async function getWorkerFinancialSummary(workerId: string): Promise<WorkerFinancialSummary> {
  const admin = createAdminClient();

  // 1. Try querying the database view first
  const { data: viewData, error: viewError } = await admin
    .from('worker_financial_summary')
    .select('*')
    .eq('worker_id', workerId)
    .maybeSingle();

  if (!viewError && viewData) {
    const totalEarnedPaise = Number(viewData.total_earned_paise || 0);
    const totalPaidPaise = Number(viewData.total_paid_paise || 0);
    const totalWithdrawnPaise = await getWorkerWithdrawalTotals(admin, workerId);
    const walletBalancePaise = Math.max(0, totalPaidPaise - totalWithdrawnPaise);

    return {
      workerId: viewData.worker_id,
      userId: viewData.user_id,
      fullName: viewData.full_name,
      internalWorkerId: viewData.internal_worker_id,
      occupation: viewData.occupation,
      skillCategory: viewData.skill_category,
      verifiedDaysCount: Number(viewData.verified_days_count || 0),
      totalEarnedPaise,
      totalPaidPaise,
      outstandingPaise: Number(viewData.outstanding_paise || 0),
      totalWithdrawnPaise,
      walletBalancePaise,
      totalContractsCount: Number(viewData.total_contracts_count || 0),
      activeContractsCount: Number(viewData.active_contracts_count || 0),
    };
  }

  // 2. Direct relational query fallback (guarantees identical logic if view hasn't been pushed to DB yet)
  let worker: any = null;
  try {
    const { data } = await admin
      .from('workers')
      .select('id, user_id, full_name, internal_worker_id, occupation, skill_category')
      .eq('id', workerId)
      .maybeSingle();
    worker = data;
  } catch {}

  if (!worker) {
    for (const rec of localUserRegistry.values()) {
      if (rec.profile?.id === workerId || rec.user?.id === workerId) {
        worker = rec.profile;
        break;
      }
    }
  }

  if (!worker) {
    throw new Error('Worker not found');
  }

  // Attendance verified shifts + earnings
  const { data: attendance } = await admin
    .from('attendance_events')
    .select('date, contract_id, status, work_contracts!inner(daily_wage)')
    .eq('worker_id', workerId)
    .eq('status', 'VERIFIED');

  const distinctDates = new Set<string>();
  let totalEarnedPaise = 0;

  for (const att of attendance || []) {
    distinctDates.add(att.date);
    const wage = (att as any).work_contracts?.daily_wage;
    const wageNum = typeof wage === 'number' ? wage : Number(wage || 0);
    // If daily_wage in DB was stored in Rupees (< 10000), normalize to paise
    const wagePaise = wageNum < 10000 ? Math.round(wageNum * 100) : Math.round(wageNum);
    totalEarnedPaise += wagePaise;
  }

  // Successful payment transactions
  const { data: payments } = await admin
    .from('payment_transactions')
    .select('amount_paise')
    .eq('worker_id', workerId)
    .in('status', ['SUCCESS', 'WORKER_CONFIRMED']);

  const totalPaidPaise = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount_paise || 0), 0);
  const totalWithdrawnPaise = await getWorkerWithdrawalTotals(admin, workerId);
  const walletBalancePaise = Math.max(0, totalPaidPaise - totalWithdrawnPaise);

  // Contracts count
  const { data: contracts } = await admin
    .from('work_contracts')
    .select('id, status')
    .eq('worker_id', workerId);

  const totalContractsCount = contracts?.length || 0;
  const activeContractsCount = (contracts || []).filter((c: any) => c.status === 'ACTIVE').length || 0;

  return {
    workerId: worker.id,
    userId: worker.user_id,
    fullName: worker.full_name,
    internalWorkerId: worker.internal_worker_id,
    occupation: worker.occupation,
    skillCategory: worker.skill_category,
    verifiedDaysCount: distinctDates.size,
    totalEarnedPaise,
    totalPaidPaise,
    outstandingPaise: Math.max(0, totalEarnedPaise - totalPaidPaise),
    totalWithdrawnPaise,
    walletBalancePaise,
    totalContractsCount,
    activeContractsCount,
  };
}

/**
 * Fetch unified financial summary for a specific contract.
 */
export async function getContractFinancialSummary(contractId: string): Promise<ContractFinancialSummary> {
  const admin = createAdminClient();

  const { data: viewData, error: viewError } = await admin
    .from('contract_financial_summary')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle();

  if (!viewError && viewData) {
    return {
      contractId: viewData.contract_id,
      contractCode: viewData.contract_code,
      workerId: viewData.worker_id,
      contractorId: viewData.contractor_id,
      projectId: viewData.project_id,
      worksiteId: viewData.worksite_id,
      contractStatus: viewData.contract_status,
      dailyWagePaise: Number(viewData.daily_wage_paise || 0),
      verifiedDaysCount: Number(viewData.verified_days_count || 0),
      totalEarnedPaise: Number(viewData.total_earned_paise || 0),
      totalPaidPaise: Number(viewData.total_paid_paise || 0),
      outstandingPaise: Number(viewData.outstanding_paise || 0),
    };
  }

  // Relational fallback
  const { data: contract } = await admin
    .from('work_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (!contract) {
    throw new Error('Contract not found');
  }

  const rawWage = Number(contract.daily_wage || 0);
  const dailyWagePaise = rawWage < 10000 ? Math.round(rawWage * 100) : Math.round(rawWage);

  const { data: attendance } = await admin
    .from('attendance_events')
    .select('date')
    .eq('contract_id', contractId)
    .eq('status', 'VERIFIED');

  const distinctDates = new Set((attendance || []).map((a: any) => a.date));
  const verifiedDaysCount = distinctDates.size;
  const totalEarnedPaise = verifiedDaysCount * dailyWagePaise;

  const { data: payments } = await admin
    .from('payment_transactions')
    .select('amount_paise')
    .eq('contract_id', contractId)
    .eq('status', 'SUCCESS');

  const totalPaidPaise = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount_paise || 0), 0);

  return {
    contractId: contract.id,
    contractCode: contract.contract_code,
    workerId: contract.worker_id,
    contractorId: contract.contractor_id,
    projectId: contract.project_id,
    worksiteId: contract.worksite_id,
    contractStatus: contract.status,
    dailyWagePaise,
    verifiedDaysCount,
    totalEarnedPaise,
    totalPaidPaise,
    outstandingPaise: totalEarnedPaise - totalPaidPaise,
  };
}
