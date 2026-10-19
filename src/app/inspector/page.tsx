'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { formatRupees } from '@/lib/money';
import { StatusPill } from '@/components/ui/StatusPill';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { LoadingState, DismissibleAlert } from '@/components/ui/FeedbackStates';
import type {
  FullEnforcementOverview,
  ContractorRiskScoreBreakdown,
  DetectedViolation,
  FollowUpQueueItem,
  ContractorDrilldown,
  WorkerDrilldownItem,
  ShiftDrilldownItem,
} from '@/lib/services/enforcement-service';

export default function InspectorDashboardPage() {
  const router = useRouter();
  const { user, role, isLoading: authLoading } = useAuth();

  // State
  const [overview, setOverview] = useState<FullEnforcementOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState('Maharashtra');
  const [districtFilter, setDistrictFilter] = useState('Mumbai Suburban');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [ruleTypeFilter, setRuleTypeFilter] = useState('ALL');

  // Expanded views
  const [expandedContractorId, setExpandedContractorId] = useState<string | null>(null);
  const [selectedDrilldown, setSelectedDrilldown] = useState<ContractorDrilldown | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<WorkerDrilldownItem | null>(null);
  const [selectedShift, setSelectedShift] = useState<ShiftDrilldownItem | null>(null);
  const [isDrilldownLoading, setIsDrilldownLoading] = useState(false);
  const [followupSuccessMsg, setFollowupSuccessMsg] = useState<string | null>(null);

  const fetchEnforcementData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const params = new URLSearchParams();
      if (stateFilter) params.set('state', stateFilter);
      if (districtFilter && districtFilter !== 'ALL') params.set('district', districtFilter);
      if (riskFilter !== 'ALL') params.set('riskLevel', riskFilter);
      if (ruleTypeFilter !== 'ALL') params.set('ruleType', ruleTypeFilter);

      const res = await fetch(`/api/compliance/enforcement?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Enforcement query failed with status ${res.status}`);
      }
      const data = await res.json();
      setOverview(data);
    } catch (err: any) {
      console.error('Failed to load enforcement data:', err);
      setErrorMessage(err.message || 'Failed to load statutory compliance data.');
    } finally {
      setIsLoading(false);
    }
  }, [stateFilter, districtFilter, riskFilter, ruleTypeFilter]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || (role !== 'INSTITUTIONAL_USER' && role !== 'ADMIN')) {
        router.push('/login?redirect=/inspector');
        return;
      }
      fetchEnforcementData();
    }
  }, [authLoading, user, role, fetchEnforcementData, router]);

  const handleOpenDrilldown = async (contractorId: string) => {
    try {
      setIsDrilldownLoading(true);
      setSelectedDrilldown(null);
      setSelectedWorker(null);
      setSelectedShift(null);

      const res = await fetch(`/api/compliance/drilldown?contractorId=${contractorId}`);
      if (!res.ok) {
        throw new Error('Failed to load contractor drill-down hierarchy');
      }
      const data = await res.json();
      setSelectedDrilldown(data.drilldown);
      if (data.drilldown.workers.length > 0) {
        setSelectedWorker(data.drilldown.workers[0]);
        if (data.drilldown.workers[0].shifts.length > 0) {
          setSelectedShift(data.drilldown.workers[0].shifts[0]);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsDrilldownLoading(false);
    }
  };

  const handleTakeFollowupAction = async (followUpId: string, action: 'NOTICE_SENT' | 'RESOLVED') => {
    try {
      const res = await fetch('/api/compliance/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpId, action }),
      });
      if (!res.ok) throw new Error('Action recording failed');
      setFollowupSuccessMsg(`Enforcement follow-up updated: ${action}`);
      setTimeout(() => setFollowupSuccessMsg(null), 4000);
      fetchEnforcementData();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  if (authLoading || !user) {
    return null;
  }

  if (isLoading) {
    return <LoadingState message="AUDITING STATUTORY COMPLIANCE LEDGER & EVALUATING JURISDICTION RISKS..." skeleton />;
  }

  const jurisdiction = overview?.jurisdiction;
  const contractors = overview?.contractorRiskRoster || [];
  const violations = overview?.violations || [];
  const followUpQueue = overview?.followUpQueue || [];

  return (
    <div className="w-full space-y-6">
      {/* Title & Jurisdictional Header */}
      <div className="border-b-2 border-[var(--ink)] pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold font-mono uppercase tracking-widest text-[#1E7A4B] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1E7A4B]"></span>
            STATUTORY LABOUR AUDIT & ENFORCEMENT LEDGER · कार्यक्षेत्र अनुपालन
          </div>
          <h1 className="text-2xl font-bold uppercase text-[var(--ink)] mt-0.5">
            Compliance Enforcement Desk
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-0.5">
            Jurisdiction: <span className="font-bold text-[var(--ink)]">{jurisdiction?.state || 'Maharashtra'}</span> —{' '}
            <span className="font-bold text-[var(--ink)]">{jurisdiction?.district || 'Mumbai Suburban'}</span> |
            Explainable risk scoring, statutory detection rules, and SLA tracking.
          </p>
        </div>

        {/* Action Controls & Audit Exporters */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/compliance/export?format=csv&state=${stateFilter}&district=${districtFilter}`}
            download
          >
            <Button variant="secondary" size="sm">
              <Icons.Download size={14} className="mr-1" />
              EXPORT CSV
            </Button>
          </a>

          <a
            href={`/api/compliance/export?format=pdf&state=${stateFilter}&district=${districtFilter}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary" size="sm">
              <Icons.FileText size={14} className="mr-1" />
              EXPORT AUDIT PDF
            </Button>
          </a>

          <Link href="/inspector/disputes">
            <Button variant="warning" size="sm">
              <Icons.AlertTriangle size={14} className="mr-1" />
              DISPUTES DESK ({followUpQueue.filter((f) => f.targetType === 'DISPUTE').length})
            </Button>
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <DismissibleAlert title="AUDIT NOTIFICATION" message={errorMessage} variant="warning" />
      )}
      {followupSuccessMsg && (
        <div className="p-3 bg-green-50 border border-green-300 text-green-900 text-xs font-mono">
          ✓ {followupSuccessMsg}
        </div>
      )}

      {/* Jurisdiction & Regulatory Filter Toolbar */}
      <div className="bg-white border-2 border-[var(--ink)] p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <div className="flex items-center gap-2">
            <Icons.Filter size={16} className="text-[var(--ink-60)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              JURISDICTION & RISK FILTERS
            </span>
          </div>
          <button
            onClick={fetchEnforcementData}
            className="text-[11px] font-mono text-[var(--register-blue)] hover:underline flex items-center gap-1"
          >
            <Icons.RefreshCw size={12} /> Re-evaluate Rules
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[var(--ink-60)] mb-1">STATE</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full border border-[var(--ink)] p-2 bg-white uppercase font-mono text-xs"
            >
              <option value="Maharashtra">Maharashtra (महाराष्ट्र)</option>
              <option value="Gujarat">Gujarat (ગુજરાત)</option>
              <option value="Delhi">Delhi (दिल्ली)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-[var(--ink-60)] mb-1">DISTRICT</label>
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="w-full border border-[var(--ink)] p-2 bg-white uppercase font-mono text-xs"
            >
              <option value="Mumbai Suburban">Mumbai Suburban (मुंबई उपनगर)</option>
              <option value="Mumbai City">Mumbai City (मुंबई शहर)</option>
              <option value="Thane">Thane (ठाणे)</option>
              <option value="Pune">Pune (पुणे)</option>
              <option value="ALL">ALL DISTRICTS</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-[var(--ink-60)] mb-1">RISK TIER</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="w-full border border-[var(--ink)] p-2 bg-white uppercase font-mono text-xs"
            >
              <option value="ALL">ALL CONTRACTORS</option>
              <option value="HIGH_RISK">HIGH RISK (Score &lt; 50)</option>
              <option value="MEDIUM_RISK">MEDIUM RISK (50 - 69)</option>
              <option value="LOW_RISK">LOW RISK (70 - 84)</option>
              <option value="GOOD_STANDING">COMPLIANT (85 - 100)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-[var(--ink-60)] mb-1">VIOLATION FILTER</label>
            <select
              value={ruleTypeFilter}
              onChange={(e) => setRuleTypeFilter(e.target.value)}
              className="w-full border border-[var(--ink)] p-2 bg-white uppercase font-mono text-xs"
            >
              <option value="ALL">ALL RULES & ANOMALIES</option>
              <option value="RULE_MINIMUM_WAGE">MINIMUM WAGE SHORTFALL</option>
              <option value="RULE_GHOST_WORKER">GHOST WORKERS (PAID, NO MUSTER)</option>
              <option value="RULE_DUPLICATE_WORKER">IMPOSSIBLE TRAVEL / DUPES</option>
              <option value="RULE_ATTENDANCE_ANOMALY">ATTENDANCE SURGE ANOMALIES</option>
            </select>
          </div>
        </div>
      </div>

      {/* Key Metric Highlights Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-white border-2 border-[var(--ink)]">
          <div className="text-[10px] font-bold uppercase text-[var(--ink-60)]">MONITORED ENTITIES</div>
          <div className="font-data text-2xl font-bold text-[var(--ink)] mt-1">
            {jurisdiction?.monitoredContractorsCount || 0}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Licensed Contractors</div>
        </div>

        <div className="p-4 bg-white border-2 border-[var(--ink)]">
          <div className="text-[10px] font-bold uppercase text-[var(--ink-60)]">MONITORED WORKERS</div>
          <div className="font-data text-2xl font-bold text-[var(--register-blue)] mt-1">
            {jurisdiction?.totalActiveWorkers || 0}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Active Muster Roster</div>
        </div>

        <div className="p-4 bg-white border-2 border-red-600 bg-red-50/40">
          <div className="text-[10px] font-bold uppercase text-red-700">HIGH-RISK CONTRACTORS</div>
          <div className="font-data text-2xl font-bold text-red-700 mt-1">
            {jurisdiction?.highRiskCount || 0}
          </div>
          <div className="text-[10px] text-red-600 mt-0.5">Score &lt; 50 / Audit Priority</div>
        </div>

        <div className="p-4 bg-white border-2 border-[var(--site-orange)] bg-[#FFFDFB]">
          <div className="text-[10px] font-bold uppercase text-[var(--site-orange)]">ACTIVE VIOLATIONS</div>
          <div className="font-data text-2xl font-bold text-[var(--site-orange)] mt-1">
            {violations.length}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Rule Triggers Fired</div>
        </div>

        <div className="p-4 bg-white border-2 border-[#1E7A4B] bg-[#F7FCF9] col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold uppercase text-[#1E7A4B]">OUTSTANDING WAGES</div>
          <div className="font-data text-xl font-bold text-[#1E7A4B] mt-1">
            {formatRupees(jurisdiction?.totalOutstandingPaise || 0, true)}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Unpaid Accrual Arrears</div>
        </div>
      </div>

      {/* ─── SECTION 1: CONTRACTOR RISK ROSTER (TRANSPARENT, NOT A BLACK BOX) ─── */}
      <div className="bg-white border-2 border-[var(--ink)]">
        <div className="p-4 bg-[var(--ink-5)] border-b border-[var(--ink-20)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
              Contractor Statutory Risk Scores & Factor Breakdowns
            </span>
            <span className="text-[11px] text-[var(--ink-60)]">
              Transparent, multi-signal evaluation: On-Time Payouts (25%), Arrears Age (20%), Dispute Rate (20%), Statutory Wage Parity (20%), Muster Integrity (15%).
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--ink-60)] uppercase">
            {contractors.length} Contractors Audited
          </span>
        </div>

        <div className="divide-y divide-[var(--ink-10)]">
          {contractors.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--ink-60)]">
              No contractors match the active jurisdiction and risk filters.
            </div>
          ) : (
            contractors.map((c) => {
              const isExpanded = expandedContractorId === c.contractorId;
              const isGoodStanding = c.riskLevel === 'GOOD_STANDING';

              return (
                <div key={c.contractorId} className="p-4 hover:bg-[var(--paper)] transition-colors">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    {/* Contractor Name & Core Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm uppercase text-[var(--ink)]">{c.companyName}</span>
                        <span className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 text-gray-700">
                          {c.licenseNumber}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--ink-60)] flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>Workers: <strong className="text-[var(--ink)]">{c.activeWorkersCount}</strong></span>
                        <span>Active Contracts: <strong className="text-[var(--ink)]">{c.activeContractsCount}</strong></span>
                        <span>Outstanding: <strong className="text-[var(--ink)]">{formatRupees(c.totalOutstandingPaise)}</strong></span>
                      </div>
                    </div>

                    {/* Score & Risk Badge */}
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-gray-500">RISK SCORE</div>
                        <div className="text-2xl font-bold font-mono text-[var(--ink)]">
                          {c.compositeScore}<span className="text-xs text-gray-500">/100</span>
                        </div>
                      </div>

                      <div>
                        <StatusPill status={c.riskLevel} />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setExpandedContractorId(isExpanded ? null : c.contractorId)}
                        >
                          {isExpanded ? 'HIDE FACTORS ▲' : 'SCORE FACTORS ▼'}
                        </Button>

                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenDrilldown(c.contractorId)}
                        >
                          DRILL-DOWN →
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Summary Deductions Strip */}
                  <div className="mt-2 text-xs">
                    {c.summaryExplanations.map((exp, idx) => (
                      <div
                        key={idx}
                        className={`text-[11px] font-mono ${
                          isGoodStanding ? 'text-green-700' : 'text-amber-800'
                        }`}
                      >
                        {isGoodStanding ? '✓ ' : '⚠ '} {exp}
                      </div>
                    ))}
                  </div>

                  {/* Expanded Transparent Components Breakdown */}
                  {isExpanded && (
                    <div className="mt-4 p-4 bg-gray-50 border border-gray-200 space-y-3 rounded-[2px]">
                      <div className="text-[11px] font-bold uppercase text-[var(--ink)] border-b border-gray-200 pb-1 flex justify-between">
                        <span>COMPONENT AUDIT BREAKDOWN (NOT A BLACK BOX)</span>
                        <span className="font-mono text-gray-500">TOTAL WEIGHT: 100 PTS</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
                        {/* 1. On-Time Payment */}
                        <div className="p-3 bg-white border border-gray-200">
                          <div className="text-[10px] font-bold uppercase text-gray-500">ON-TIME PAYOUTS (25%)</div>
                          <div className="text-lg font-bold font-mono mt-1 text-[var(--ink)]">
                            {c.components.onTimePayment.score} / 25
                          </div>
                          <div className="text-[11px] font-mono text-gray-600 mt-1">
                            {c.components.onTimePayment.rawMetricValue}% on schedule
                          </div>
                          {c.components.onTimePayment.deductionExplanation && (
                            <div className="text-[10px] text-red-600 mt-1">
                              {c.components.onTimePayment.deductionExplanation}
                            </div>
                          )}
                        </div>

                        {/* 2. Arrears Age */}
                        <div className="p-3 bg-white border border-gray-200">
                          <div className="text-[10px] font-bold uppercase text-gray-500">ARREARS AGE (20%)</div>
                          <div className="text-lg font-bold font-mono mt-1 text-[var(--ink)]">
                            {c.components.arrearsAge.score} / 20
                          </div>
                          <div className="text-[11px] font-mono text-gray-600 mt-1">
                            {c.components.arrearsAge.rawMetricValue} days overdue
                          </div>
                          {c.components.arrearsAge.deductionExplanation && (
                            <div className="text-[10px] text-red-600 mt-1">
                              {c.components.arrearsAge.deductionExplanation}
                            </div>
                          )}
                        </div>

                        {/* 3. Dispute Rate */}
                        <div className="p-3 bg-white border border-gray-200">
                          <div className="text-[10px] font-bold uppercase text-gray-500">DISPUTE RATE (20%)</div>
                          <div className="text-lg font-bold font-mono mt-1 text-[var(--ink)]">
                            {c.components.disputeRate.score} / 20
                          </div>
                          <div className="text-[11px] font-mono text-gray-600 mt-1">
                            {c.components.disputeRate.rawMetricValue} open dispute(s)
                          </div>
                          {c.components.disputeRate.deductionExplanation && (
                            <div className="text-[10px] text-red-600 mt-1">
                              {c.components.disputeRate.deductionExplanation}
                            </div>
                          )}
                        </div>

                        {/* 4. Minimum Wage */}
                        <div className="p-3 bg-white border border-gray-200">
                          <div className="text-[10px] font-bold uppercase text-gray-500">STATUTORY WAGE (20%)</div>
                          <div className="text-lg font-bold font-mono mt-1 text-[var(--ink)]">
                            {c.components.minimumWageCompliance.score} / 20
                          </div>
                          <div className="text-[11px] font-mono text-gray-600 mt-1">
                            {c.components.minimumWageCompliance.rawMetricValue} underpaid
                          </div>
                          {c.components.minimumWageCompliance.deductionExplanation && (
                            <div className="text-[10px] text-red-600 mt-1">
                              {c.components.minimumWageCompliance.deductionExplanation}
                            </div>
                          )}
                        </div>

                        {/* 5. Flagged Punches */}
                        <div className="p-3 bg-white border border-gray-200">
                          <div className="text-[10px] font-bold uppercase text-gray-500">MUSTER INTEGRITY (15%)</div>
                          <div className="text-lg font-bold font-mono mt-1 text-[var(--ink)]">
                            {c.components.flaggedPunchesFrequency.score} / 15
                          </div>
                          <div className="text-[11px] font-mono text-gray-600 mt-1">
                            {c.components.flaggedPunchesFrequency.rawMetricValue}% flags
                          </div>
                          {c.components.flaggedPunchesFrequency.deductionExplanation && (
                            <div className="text-[10px] text-red-600 mt-1">
                              {c.components.flaggedPunchesFrequency.deductionExplanation}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── SECTION 2: EXPLAINABLE DETECTION RULES WITH STRUCTURED EVIDENCE ─── */}
      <div className="bg-white border-2 border-[var(--ink)]">
        <div className="p-4 bg-[var(--ink-5)] border-b border-[var(--ink-20)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
              Active Statutory Violations & Muster Anomaly Feed
            </span>
            <span className="text-[11px] text-[var(--ink-60)]">
              Rule-based alerts with full explainability. Every flag demonstrates why it fired and displays the exact database evidence rows.
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-red-700 bg-red-100 px-2 py-0.5">
            {violations.length} ACTIVE FLAGS
          </span>
        </div>

        <div className="divide-y divide-[var(--ink-10)]">
          {violations.length === 0 ? (
            <div className="p-8 text-center text-xs text-green-800 bg-green-50/50">
              ✓ No statutory violations or muster anomalies detected in the selected jurisdiction.
            </div>
          ) : (
            violations.map((v) => (
              <div key={v.id} className="p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 text-white ${
                        v.severity === 'CRITICAL'
                          ? 'bg-red-700'
                          : v.severity === 'HIGH'
                          ? 'bg-red-600'
                          : 'bg-amber-600'
                      }`}
                    >
                      {v.severity}
                    </span>
                    <span className="font-bold text-sm text-[var(--ink)]">{v.ruleTitle}</span>
                    <span className="text-xs text-[var(--ink-60)]">· {v.contractorName}</span>
                  </div>

                  <span className="text-[10px] font-mono text-gray-500">
                    Detected: {new Date(v.detectedAt).toLocaleDateString('en-IN')}
                  </span>
                </div>

                {/* Plain-Language Regulatory Explanation */}
                <div className="p-3 bg-amber-50/70 border-l-4 border-[var(--site-orange)] text-xs text-[var(--ink)] space-y-1">
                  <div>
                    <strong className="text-amber-900">Why this flag fired:</strong> {v.whyItFired}
                  </div>
                  <div className="text-[11px] font-mono text-gray-600">
                    Regulatory Basis: {v.regulatoryReference}
                  </div>
                </div>

                {/* Evidence Rows Table */}
                <div className="overflow-x-auto border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 text-[10px] font-bold uppercase text-gray-600 border-b border-gray-200">
                      <tr>
                        <th className="p-2">EVIDENCE TABLE</th>
                        <th className="p-2">RECORD ID</th>
                        <th className="p-2">EVIDENCE SUMMARY & VERIFIABLE VALUES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {v.evidenceRows.map((er, idx) => (
                        <tr key={idx} className="font-mono text-[11px]">
                          <td className="p-2 font-bold text-gray-700">{er.table}</td>
                          <td className="p-2 text-gray-500 break-all">{er.recordId}</td>
                          <td className="p-2 text-[var(--ink)]">{er.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── SECTION 3: NOTIFICATION QUEUE WITH SLA TIMERS ─── */}
      <div className="bg-white border-2 border-[var(--ink)]">
        <div className="p-4 bg-[var(--ink-5)] border-b border-[var(--ink-20)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
              Enforcement Follow-Up Queue & Statutory SLA Timers
            </span>
            <span className="text-[11px] text-[var(--ink-60)]">
              Automated countdown timers for statutory dispute counter-statements, wage shortfall notices, and arbitration hearings.
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-[var(--register-blue)] bg-blue-50 px-2 py-0.5">
            {followUpQueue.length} ITEMS QUEUED
          </span>
        </div>

        <div className="divide-y divide-[var(--ink-10)]">
          {followUpQueue.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--ink-60)]">
              No pending enforcement actions in queue.
            </div>
          ) : (
            followUpQueue.map((item) => (
              <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 ${
                        item.slaStatus === 'SLA_BREACHED'
                          ? 'bg-red-700 text-white'
                          : item.slaStatus === 'URGENT_ATTENTION'
                          ? 'bg-amber-600 text-white'
                          : 'bg-green-700 text-white'
                      }`}
                    >
                      {item.slaStatus === 'SLA_BREACHED'
                        ? 'SLA BREACHED'
                        : item.slaStatus === 'URGENT_ATTENTION'
                        ? 'DUE SOON'
                        : 'ON TRACK'}
                    </span>
                    <span className="font-bold text-xs uppercase text-[var(--ink)]">{item.title}</span>
                  </div>
                  <div className="text-xs text-[var(--ink-60)]">
                    Target: <strong className="text-[var(--ink)]">{item.contractorName}</strong> | Required Action:{' '}
                    <span className="text-[var(--ink)]">{item.actionRequired}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-gray-500">DEADLINE</div>
                    <div
                      className={`text-xs font-mono font-bold ${
                        item.slaHoursRemaining < 0 ? 'text-red-700' : 'text-gray-800'
                      }`}
                    >
                      {item.slaHoursRemaining < 0
                        ? `Overdue by ${Math.abs(item.slaHoursRemaining)}h`
                        : `${item.slaHoursRemaining}h remaining`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTakeFollowupAction(item.id, 'NOTICE_SENT')}
                    >
                      ISSUE NOTICE
                    </Button>
                    <Button
                      variant="verified"
                      size="sm"
                      onClick={() => handleTakeFollowupAction(item.id, 'RESOLVED')}
                    >
                      MARK RESOLVED
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── SECTION 4: DRILL-DOWN MODAL / PANEL (Contractor -> Workers -> Shifts -> Ledger) ─── */}
      {selectedDrilldown && (
        <div className="bg-white border-4 border-[var(--register-blue)] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-[var(--ink)] pb-3 gap-2">
            <div>
              <div className="text-[10px] font-mono font-bold text-[var(--register-blue)] uppercase">
                STATUTORY DRILL-DOWN HIERARCHY · ठेकेदार से लेज़र तक ड्रिल-डाउन
              </div>
              <h2 className="text-xl font-bold uppercase text-[var(--ink)] mt-0.5">
                {selectedDrilldown.contractor.companyName}
              </h2>
              <p className="text-xs text-[var(--ink-60)]">
                License: {selectedDrilldown.contractor.licenseNumber} | Phone: {selectedDrilldown.contractor.phone} |
                Jurisdiction: {selectedDrilldown.contractor.district}, {selectedDrilldown.contractor.state}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDrilldown(null)}>
              ✕ CLOSE DRILL-DOWN
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1: Workers List */}
            <div className="border-2 border-[var(--ink)] p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] border-b pb-2 flex justify-between">
                <span>1. REGISTERED WORKERS</span>
                <span className="font-mono text-gray-500">{selectedDrilldown.workers.length}</span>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {selectedDrilldown.workers.map((w) => {
                  const isSelected = selectedWorker?.workerId === w.workerId;
                  return (
                    <div
                      key={w.workerId}
                      onClick={() => {
                        setSelectedWorker(w);
                        setSelectedShift(w.shifts[0] || null);
                      }}
                      className={`p-3 border cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? 'border-[var(--register-blue)] bg-blue-50/50 font-bold'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--ink)]">{w.workerName}</span>
                        {w.isUnderpaid && (
                          <span className="text-[9px] font-mono bg-red-100 text-red-700 px-1 font-bold">
                            UNDERPAID
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                        {w.occupation} · {w.skillCategory}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--ink)] mt-1 flex justify-between">
                        <span>Wage: ₹{w.dailyWageRupees}/d</span>
                        <span className="text-green-700">Days: {w.totalVerifiedDays}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Shifts for Selected Worker */}
            <div className="border-2 border-[var(--ink)] p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] border-b pb-2 flex justify-between">
                <span>2. RECORDED SHIFTS</span>
                <span className="font-mono text-gray-500">
                  {selectedWorker ? `${selectedWorker.workerName} (${selectedWorker.shifts.length})` : 'Select Worker'}
                </span>
              </div>

              {!selectedWorker ? (
                <div className="text-xs text-gray-500 p-4 text-center">Select a worker to inspect shifts.</div>
              ) : selectedWorker.shifts.length === 0 ? (
                <div className="text-xs text-red-600 p-4 text-center">
                  Zero attendance shifts recorded for this worker. (Potential Ghost Worker flag).
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {selectedWorker.shifts.map((s) => {
                    const isSelected = selectedShift?.id === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedShift(s)}
                        className={`p-3 border cursor-pointer text-xs transition-colors ${
                          isSelected
                            ? 'border-[var(--register-blue)] bg-blue-50/50 font-bold'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-[var(--ink)]">{s.date}</span>
                          <span
                            className={`text-[9px] font-mono px-1 font-bold ${
                              s.status === 'VERIFIED'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {s.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-600 truncate mt-0.5">{s.worksiteName}</div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5 flex justify-between">
                          <span>Dist: {s.distanceMeters.toFixed(1)}m</span>
                          <span>Ledger entries: {s.ledgerRows.length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 3: Double-Entry Ledger Rows for Shift */}
            <div className="border-2 border-[var(--ink)] p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] border-b pb-2 flex justify-between">
                <span>3. DOUBLE-ENTRY LEDGER ROWS</span>
                <span className="font-mono text-gray-500">
                  {selectedShift ? `Shift ${selectedShift.date}` : 'Select Shift'}
                </span>
              </div>

              {!selectedShift ? (
                <div className="text-xs text-gray-500 p-4 text-center">Select a shift to inspect ledger rows.</div>
              ) : selectedShift.ledgerRows.length === 0 ? (
                <div className="text-xs text-gray-500 p-4 text-center">
                  No direct ledger entries linked to this shift.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {selectedShift.ledgerRows.map((lr) => (
                    <div key={lr.id} className="p-3 bg-gray-50 border border-gray-200 text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between items-center border-b border-gray-200 pb-1">
                        <span className="font-bold text-[var(--register-blue)]">{lr.refType}</span>
                        <span className="font-bold text-[var(--ink)]">₹{lr.amountRupees}</span>
                      </div>
                      <div className="text-[10px] text-gray-600">Tx ID: {lr.transactionId}</div>
                      <div className="text-[10px] text-gray-600 truncate">Prev: {lr.prevHash.slice(0, 16)}...</div>
                      <div className="text-[10px] text-gray-600 truncate">Hash: {lr.hash.slice(0, 16)}...</div>
                      <div className="text-[10px] text-green-700">✓ Cryptographic Hash Chained</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
