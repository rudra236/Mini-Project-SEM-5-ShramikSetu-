import { createAdminClient } from '@/lib/supabase/admin';
import { rupeesToPaise, paiseToRupees } from '@/types/payment.types';
import type {
  MinimumWageRuleRow,
  ComplianceCheckLogRow,
  ComplianceResultEnum,
  SkillCategoryEnum,
} from '@/types/database.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class ComplianceEngineError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'COMPLIANCE_ENGINE_ERROR') {
    super(message);
    this.name = 'ComplianceEngineError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CreateMinimumWageRuleParams {
  state: string;
  district?: string | null;
  workerCategory?: string | null;
  skillLevel: SkillCategoryEnum;
  wageType?: string;
  minimumAmountPaise: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD
  sourceReference: string;
  version?: number;
}

export interface ComplianceCheckParams {
  contractId: string;
  checkDate?: string; // YYYY-MM-DD (defaults to today)
  checkedByUserId?: string | null;
}

export interface ComplianceCheckResult {
  contractId: string;
  result: ComplianceResultEnum;
  ruleUsed: MinimumWageRuleRow | null;
  ruleVersion: number | null;
  inputs: {
    contractDailyWagePaise: number;
    contractDailyWageRupees: number;
    skillLevel: SkillCategoryEnum;
    state: string;
    district: string | null;
    workerCategory: string | null;
    checkDate: string;
  };
  calculation: {
    contractWagePaise: number;
    minimumWagePaise: number | null;
    differencePaise: number | null;
    isAboveMinimum: boolean | null;
  };
  explanation: string;
  checkedAt: string;
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Creates or updates a versioned minimum wage rule in DB.
 * Rules are stored in database and NEVER hardcoded in business logic.
 */
export async function createMinimumWageRule(
  params: CreateMinimumWageRuleParams
): Promise<MinimumWageRuleRow> {
  const adminClient = createAdminClient();

  if (params.minimumAmountPaise <= 0) {
    throw new ComplianceEngineError(
      'Minimum wage amount must be greater than zero.',
      422,
      'INVALID_MINIMUM_AMOUNT'
    );
  }

  const { data: rule, error } = await adminClient
    .from('minimum_wage_rules')
    .insert({
      state: params.state.trim(),
      district: params.district ? params.district.trim() : null,
      worker_category: params.workerCategory ? params.workerCategory.trim() : null,
      skill_level: params.skillLevel,
      wage_type: params.wageType ?? 'DAILY',
      minimum_amount_paise: params.minimumAmountPaise,
      effective_from: params.effectiveFrom,
      effective_to: params.effectiveTo ?? null,
      source_reference: params.sourceReference.trim(),
      version: params.version ?? 1,
      is_active: true,
    })
    .select()
    .single();

  if (error || !rule) {
    throw new ComplianceEngineError(
      `Failed to create minimum wage rule: ${error?.message}`,
      500,
      'RULE_CREATION_FAILED'
    );
  }

  return rule;
}

/**
 * Finds the applicable minimum wage rule for a given location, skill level, category, and date.
 *
 * Matching Order / Precedence:
 * 1. Exact match on state + district + skill_level + active date range.
 * 2. Fallback match on state (district IS NULL) + skill_level + active date range.
 * 3. Pick rule with highest version.
 *
 * Expired Rule Detection:
 * If a rule matched the location/skill level but its `effective_to` is prior to checkDate and no newer active rule covers checkDate, returns `{ rule: null, isExpired: true }`.
 */
export async function findApplicableMinimumWageRule(params: {
  state: string;
  district?: string | null;
  skillLevel: SkillCategoryEnum;
  workerCategory?: string | null;
  checkDate: string;
}): Promise<{ rule: MinimumWageRuleRow | null; isExpired: boolean; reason?: string }> {
  const adminClient = createAdminClient();

  // Query candidate rules for the state and skill level
  const { data: candidates, error } = await adminClient
    .from('minimum_wage_rules')
    .select('*')
    .eq('state', params.state)
    .eq('skill_level', params.skillLevel)
    .eq('is_active', true)
    .order('version', { ascending: false });

  if (error || !candidates || candidates.length === 0) {
    return { rule: null, isExpired: false, reason: 'No wage rule registered for this state and skill level.' };
  }

  // Filter candidates matching district (either exact match or rule district is null)
  let districtMatches = candidates.filter((r: MinimumWageRuleRow) => {
    if (params.district && r.district) {
      return r.district.toLowerCase() === params.district.toLowerCase();
    }
    return true; // includes state-wide rules (district === null)
  });

  if (districtMatches.length === 0) {
    districtMatches = candidates;
  }

  // Check date bounds
  const checkDateStr = params.checkDate;

  // Active rules where effective_from <= checkDate AND (effective_to IS NULL OR effective_to >= checkDate)
  const currentlyActiveRules = districtMatches.filter((r: MinimumWageRuleRow) => {
    const fromValid = r.effective_from <= checkDateStr;
    const toValid = !r.effective_to || r.effective_to >= checkDateStr;
    return fromValid && toValid;
  });

  if (currentlyActiveRules.length > 0) {
    // Sort: exact district match first, then highest version
    currentlyActiveRules.sort((a: MinimumWageRuleRow, b: MinimumWageRuleRow) => {
      if (params.district) {
        const aExact = a.district && a.district.toLowerCase() === params.district.toLowerCase();
        const bExact = b.district && b.district.toLowerCase() === params.district.toLowerCase();
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
      }
      return b.version - a.version;
    });

    return { rule: currentlyActiveRules[0], isExpired: false };
  }

  // Check if there are expired rules (effective_to < checkDate)
  const expiredRules = districtMatches.filter((r: MinimumWageRuleRow) => r.effective_to && r.effective_to < checkDateStr);
  if (expiredRules.length > 0) {
    return { rule: expiredRules[0], isExpired: true, reason: `Wage rule ${expiredRules[0].id} expired on ${expiredRules[0].effective_to}.` };
  }

  return { rule: null, isExpired: false, reason: 'No valid wage rule active on check date.' };
}

/**
 * Runs Minimum Wage Compliance Check on a contract.
 *
 * Rules:
 * - Checks daily_wage against applicable minimum_wage_rule.
 * - Stores full audit record in `compliance_check_logs`.
 * - Returns structured compliance result:
 *   - COMPLIANT: wage >= minimum rule
 *   - POTENTIAL_NON_COMPLIANCE: wage < minimum rule (underpayment)
 *   - REVIEW_REQUIRED: contract has status 'DISPUTED' or ambiguous/flagged condition
 *   - INSUFFICIENT_DATA: rule missing or expired without current active replacement
 */
export async function checkContractCompliance(
  params: ComplianceCheckParams
): Promise<ComplianceCheckResult> {
  const adminClient = createAdminClient();
  const checkDateStr = params.checkDate || new Date().toISOString().slice(0, 10);

  // 1. Fetch Contract & Worksite / Project & Worker details
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select(`
      id,
      daily_wage,
      status,
      project_id,
      worker_id,
      projects!inner (
        name,
        worksites (
          state,
          district
        )
      ),
      workers (
        skill_category,
        occupation
      )
    `)
    .eq('id', params.contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new ComplianceEngineError('Work contract not found.', 404, 'CONTRACT_NOT_FOUND');
  }

  const contractDailyWagePaise = rupeesToPaise(contract.daily_wage);

  // Extract location and worker skill level
  // Fallbacks if worksite/worker relation missing in mock/DB
  // @ts-ignore - Handle flexible project/worksite relation structure
  const projectObj = contract.projects as any;
  const worksiteObj = Array.isArray(projectObj?.worksites) ? projectObj.worksites[0] : projectObj?.worksites;
  const workerObj = contract.workers as any;

  const state = worksiteObj?.state || 'Maharashtra';
  const district = worksiteObj?.district || null;
  const skillLevel: SkillCategoryEnum = workerObj?.skill_category || 'SKILLED';
  const workerCategory = workerObj?.occupation || null;

  const inputs = {
    contractDailyWagePaise,
    contractDailyWageRupees: paiseToRupees(contractDailyWagePaise),
    skillLevel,
    state,
    district,
    workerCategory,
    checkDate: checkDateStr,
  };

  // 2. Lookup Minimum Wage Rule
  const { rule: ruleUsed, isExpired, reason: ruleSearchReason } = await findApplicableMinimumWageRule({
    state,
    district,
    skillLevel,
    workerCategory,
    checkDate: checkDateStr,
  });

  let resultStatus: ComplianceResultEnum;
  let explanation: string;
  let minimumWagePaise: number | null = null;
  let differencePaise: number | null = null;
  let isAboveMinimum: boolean | null = null;

  if (!ruleUsed || isExpired) {
    resultStatus = 'INSUFFICIENT_DATA';
    explanation = isExpired
      ? `Minimum wage rule is EXPIRED for ${state} (${skillLevel}). ${ruleSearchReason}`
      : `MISSING minimum wage rule for state ${state}, skill level ${skillLevel}. Cannot determine compliance.`;
  } else if (contract.status === 'DISPUTED') {
    minimumWagePaise = Number(ruleUsed.minimum_amount_paise || 0);
    differencePaise = contractDailyWagePaise - minimumWagePaise;
    isAboveMinimum = contractDailyWagePaise >= minimumWagePaise;
    resultStatus = 'REVIEW_REQUIRED';
    explanation = `Contract is currently DISPUTED. Compliance check flagged for mandatory review. Minimum required: ₹${paiseToRupees(minimumWagePaise!)}, Contract wage: ₹${paiseToRupees(contractDailyWagePaise)}.`;
  } else {
    minimumWagePaise = Number(ruleUsed.minimum_amount_paise || 0);
    differencePaise = contractDailyWagePaise - minimumWagePaise;
    isAboveMinimum = contractDailyWagePaise >= minimumWagePaise;

    if (isAboveMinimum) {
      resultStatus = 'COMPLIANT';
      explanation = `Contract daily wage (₹${paiseToRupees(contractDailyWagePaise)}) meets or exceeds legal minimum wage (₹${paiseToRupees(minimumWagePaise!)}) under rule ${ruleUsed.source_reference}.`;
    } else {
      resultStatus = 'POTENTIAL_NON_COMPLIANCE';
      explanation = `POTENTIAL UNDERPAYMENT DISCREPANCY: Contract daily wage (₹${paiseToRupees(contractDailyWagePaise)}) is BELOW legal minimum wage (₹${paiseToRupees(minimumWagePaise!)}) by ₹${paiseToRupees(Math.abs(differencePaise!))}. Reference: ${ruleUsed.source_reference}.`;
    }
  }

  const calculation = {
    contractWagePaise: contractDailyWagePaise,
    minimumWagePaise,
    differencePaise,
    isAboveMinimum,
  };

  const checkedAt = new Date().toISOString();

  // 3. Log Audit Trail to compliance_check_logs
  const { error: logErr } = await adminClient
    .from('compliance_check_logs')
    .insert({
      contract_id: params.contractId,
      rule_id: ruleUsed ? ruleUsed.id : null,
      rule_version: ruleUsed ? ruleUsed.version : null,
      rule_snapshot: ruleUsed ? (ruleUsed as any) : null,
      inputs: inputs as any,
      calculation: calculation as any,
      result: resultStatus,
      explanation,
      checked_at: checkedAt,
      checked_by: params.checkedByUserId || null,
    });

  if (logErr) {
    console.warn(`[ComplianceEngine] Audit log insert warning: ${logErr.message}`);
  }

  return {
    contractId: params.contractId,
    result: resultStatus,
    ruleUsed: ruleUsed || null,
    ruleVersion: ruleUsed ? ruleUsed.version : null,
    inputs,
    calculation,
    explanation,
    checkedAt,
  };
}
