'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { formatRupees } from '@/lib/money';

export default function NewContractPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [workerLoginId, setWorkerLoginId] = useState('');
  const [workType, setWorkType] = useState('Mason');
  const [skillCategory, setSkillCategory] = useState<'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED'>('SKILLED');
  const [zone, setZone] = useState('Zone I');
  const [dailyWage, setDailyWage] = useState('650');
  const [expectedHours, setExpectedHours] = useState('8.0');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY'>('DAILY');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Statutory Minimum Wage State
  const [applicableBenchmark, setApplicableBenchmark] = useState<any | null>(null);
  const [allMinimumWages, setAllMinimumWages] = useState<any[]>([]);
  const [showMinWageModal, setShowMinWageModal] = useState(false);

  // Override Acknowledgement Modal State
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [hasAcknowledgedOverride, setHasAcknowledgedOverride] = useState(false);
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  // Fetch statutory minimum wages
  useEffect(() => {
    const fetchMinWages = async () => {
      try {
        const res = await api.compliance.getMinimumWages({
          state: 'Maharashtra',
          skillCategory,
          zone,
        });
        if (res.success) {
          setAllMinimumWages(res.minimumWages || []);
          if (res.applicableMinimumWage) {
            setApplicableBenchmark(res.applicableMinimumWage);
          } else if (res.minimumWages?.length > 0) {
            const match = res.minimumWages.find(
              (w: any) =>
                (w.skill_category === skillCategory || w.skill_tier === skillCategory) &&
                (w.zone === zone || w.region?.includes(zone))
            ) || res.minimumWages[0];
            setApplicableBenchmark(match);
          }
        }
      } catch {
        // Fallback handled by backend
      }
    };
    fetchMinWages();
  }, [skillCategory, zone]);

  const minWagePaise = applicableBenchmark?.daily_rate_paise || applicableBenchmark?.minimum_wage_paise || 60638;
  const minWageRupees = minWagePaise / 100;
  const wageNum = parseFloat(dailyWage) || 0;
  const isBelowMinimum = wageNum > 0 && wageNum < minWageRupees;

  const handleSubmit = async (e?: React.FormEvent, allowOverride = false) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (isNaN(wageNum) || wageNum <= 0) {
      setErrorMessage('Daily wage must be a positive rupee amount.');
      return;
    }
    if (!workerLoginId.trim()) {
      setErrorMessage("Worker ID is required. Find it on the worker's identity card (e.g. SS-W-2026-000001 or Ramesh).");
      return;
    }
    if (!workType.trim()) {
      setErrorMessage('Work type / occupation is required.');
      return;
    }

    // If below minimum wage and override not yet explicitly confirmed, trigger warning modal
    if (isBelowMinimum && !allowOverride) {
      setShowOverrideModal(true);
      return;
    }

    try {
      setIsLoading(true);
      await api.contracts.create({
        workerLoginId: workerLoginId.trim(),
        projectId,
        workType: workType.trim(),
        dailyWage: wageNum,
        expectedWorkingHours: parseFloat(expectedHours) || 8.0,
        paymentFrequency: frequency,
        startDate,
        endDate: endDate || undefined,
        acknowledgeBelowMinimumWage: allowOverride,
      });

      router.push(`/contractor/projects/${projectId}`);
    } catch (err: any) {
      if (err.code === 'DUPLICATE_ACTIVE_ASSIGNMENT' || err.statusCode === 409) {
        setErrorMessage('Worker already has an active contract on this project. Cannot assign duplicate active contract.');
      } else if (err.code === 'WAGE_BELOW_MINIMUM' || err.statusCode === 422) {
        setShowOverrideModal(true);
      } else {
        setErrorMessage(err.message || 'Failed to issue employment contract.');
      }
    } finally {
      setIsLoading(false);
      setIsSubmittingOverride(false);
    }
  };

  const confirmOverrideAndDispatch = async () => {
    if (!hasAcknowledgedOverride) return;
    setIsSubmittingOverride(true);
    setShowOverrideModal(false);
    await handleSubmit(undefined, true);
  };

  return (
    <div className="w-full p-4 sm:p-6 max-w-2xl">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <Link
          href={`/contractor/projects/${projectId}`}
          className="min-h-[44px] text-xs font-bold uppercase text-[var(--ink)] hover:underline inline-flex items-center gap-1"
        >
          <Icons.ArrowLeft size={16} />
          BACK TO PROJECT MUSTER
        </Link>
        <button
          type="button"
          onClick={() => setShowMinWageModal(true)}
          className="min-h-[44px] text-xs font-bold font-mono text-[var(--register-blue)] hover:underline uppercase inline-flex items-center gap-1"
        >
          <Icons.ShieldCheck size={14} />
          VIEW MINIMUM WAGES REGISTER
        </button>
      </div>

      <div className="bg-white border-2 border-[var(--ink)] p-6 border-t-8 border-t-[var(--site-yellow)] shadow-sm">
        <div className="border-b border-[var(--ink-10)] pb-4 mb-6">
          <div className="text-[10px] font-bold font-mono tracking-widest uppercase text-[var(--site-orange)]">
            FORM C-1 · STATUTORY WORK CONTRACT DEED
          </div>
          <h1 className="text-xl font-bold uppercase text-[var(--ink)] mt-0.5">
            Add Worker & Issue Contract
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-1">
            Worker will be added to the project muster immediately and assigned active status.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 mb-4 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold">
            <div className="flex items-center gap-1.5 mb-0.5 font-bold uppercase">
              <Icons.AlertTriangle size={14} />
              <span>ASSIGNMENT ERROR</span>
            </div>
            {errorMessage}
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
          {/* Worker ID / Name */}
          <div>
            <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
              WORKER SHRAMIKSETU ID OR REGISTERED NAME *
            </label>
            <input
              id="workerLoginId"
              type="text"
              value={workerLoginId}
              onChange={(e) => setWorkerLoginId(e.target.value)}
              placeholder="e.g. SS-W-2026-000001, SS-W-2026-504738, or Ramesh Kumar"
              className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2.5 font-data text-sm font-bold outline-none focus:bg-[#FFFDF5]"
              required
            />
            <div className="text-[10px] text-[var(--ink-60)] mt-1">
              Search by SS-W identity code or worker full name.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                OCCUPATION / TRADE *
              </label>
              <input
                id="workType"
                type="text"
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                placeholder="e.g. Masonry, Barbender, Carpenter, Scaffolder"
                className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2.5 text-xs outline-none focus:bg-[#FFFDF5]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                STATUTORY SKILL CATEGORY *
              </label>
              <select
                value={skillCategory}
                onChange={(e) => setSkillCategory(e.target.value as any)}
                className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2.5 text-xs bg-white font-semibold outline-none"
              >
                <option value="UNSKILLED">UNSKILLED (अकुशल - Helper / General Labour)</option>
                <option value="SEMI_SKILLED">SEMI-SKILLED (अर्धकुशल - Assistant Trades)</option>
                <option value="SKILLED">SKILLED (कुशल - Mason / Carpenter / Electrician)</option>
                <option value="HIGHLY_SKILLED">HIGHLY SKILLED (उच्च कुशल - Specialist / Supervisor)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                WORKSITE REGION / ZONE
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2 text-xs bg-white font-semibold outline-none"
              >
                <option value="Zone I">Maharashtra Zone I (Mumbai, Thane, Pune, Corp Limits)</option>
                <option value="Zone II">Maharashtra Zone II (A & B Grade Municipal Councils)</option>
                <option value="Zone III">Maharashtra Zone III (Other Areas / Rural)</option>
                <option value="Area A">Central Sphere Area A (Metropolitan Cities)</option>
                <option value="Area B">Central Sphere Area B (Tier-2 Urban Centres)</option>
                <option value="Area C">Central Sphere Area C (Other Central Areas)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                PAYMENT FREQUENCY
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2 text-xs bg-white font-semibold outline-none"
              >
                <option value="DAILY">DAILY DISBURSEMENT</option>
                <option value="WEEKLY">WEEKLY DISBURSEMENT</option>
                <option value="FORTNIGHTLY">FORTNIGHTLY (15 DAYS)</option>
                <option value="MONTHLY">MONTHLY SETTLEMENT</option>
              </select>
            </div>
          </div>

          {/* Daily Wage + Minimum Wage Indicator */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold uppercase text-[var(--ink)]">
                STIPULATED DAILY WAGE (RUPEES) *
              </label>
              {applicableBenchmark && (
                <span className="text-[11px] font-mono text-[var(--ink-60)]">
                  Min Legal: <strong>₹{minWageRupees.toFixed(2)}</strong>/day
                </span>
              )}
            </div>
            <div className="flex">
              <span className="inline-flex items-center px-3 border-2 border-r-0 border-[var(--ink)] bg-[var(--paper-dark)] font-bold text-sm">
                ₹
              </span>
              <input
                id="dailyWage"
                type="number"
                value={dailyWage}
                onChange={(e) => setDailyWage(e.target.value)}
                placeholder="650"
                step="1"
                min="1"
                className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2.5 font-data font-bold text-sm outline-none focus:bg-[#FFFDF5]"
                required
              />
            </div>

            {/* Statutory Minimum Wage Callout Badge */}
            {applicableBenchmark && (
              <div
                className={`mt-2 p-2.5 border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 ${
                  isBelowMinimum
                    ? 'border-red-600 bg-red-50 text-red-800'
                    : 'border-emerald-600 bg-emerald-50 text-emerald-800'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span>{isBelowMinimum ? '⚠️' : '✓'}</span>
                  <span className="font-semibold">
                    {isBelowMinimum
                      ? `Below legal statutory minimum (₹${minWageRupees.toFixed(2)}/day)`
                      : `Meets statutory minimum wage (₹${minWageRupees.toFixed(2)}/day)`}
                  </span>
                </div>
                <div className="text-[10px] font-mono flex items-center gap-1">
                  <span>{applicableBenchmark.source_name || applicableBenchmark.source_citation}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      applicableBenchmark.verified ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                    }`}
                  >
                    {applicableBenchmark.verified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                MANDATED HOURS / DAY
              </label>
              <input
                type="number"
                value={expectedHours}
                onChange={(e) => setExpectedHours(e.target.value)}
                step="0.5"
                min="1"
                max="12"
                className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2 text-xs font-data"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                START DATE *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2 text-xs font-data"
                required
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--ink-10)] flex gap-2">
            <Link href={`/contractor/projects/${projectId}`} className="flex-1">
              <Button variant="secondary" size="md" fullWidth>
                CANCEL
              </Button>
            </Link>
            <Button
              type="submit"
              variant={isBelowMinimum ? 'yellow' : 'primary'}
              size="md"
              fullWidth
              isLoading={isLoading}
              className="flex-1"
            >
              {isBelowMinimum ? 'DISPATCH WITH UNDERPAYMENT WARNING' : 'DISPATCH CONTRACT'}
            </Button>
          </div>
        </form>
      </div>

      {/* Statutory Underpayment Override Confirmation Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white border-2 border-[var(--ink)] max-w-lg w-full p-6 text-[var(--ink)] shadow-2xl">
            <div className="border-b border-[var(--ink-20)] pb-3 mb-4">
              <div className="text-xs font-bold uppercase text-[#B91C1C]">
                STATUTORY MINIMUM WAGE OVERRIDE WARNING
              </div>
              <h3 className="text-lg font-bold uppercase mt-0.5">
                Underpayment Acknowledgment Required
              </h3>
            </div>

            <div className="p-3 bg-red-50 border-2 border-red-600 text-red-900 text-xs mb-4">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <span>⚠️</span>
                <span>WAGE BELOW LEGAL THRESHOLD</span>
              </div>
              <p className="mb-2">
                The stipulated rate of <strong>₹{wageNum}/day</strong> is below the notified statutory minimum wage of{' '}
                <strong>₹{minWageRupees.toFixed(2)}/day</strong> for <strong>{skillCategory}</strong> in <strong>{zone}</strong>.
              </p>
              <div className="text-[11px] font-mono border-t border-red-200 pt-1.5 space-y-0.5">
                <div>• Authority: {applicableBenchmark?.source_name}</div>
                <div>• Effective: {applicableBenchmark?.effective_from || applicableBenchmark?.effective_date}</div>
                <div>• Status: {applicableBenchmark?.verified ? 'Government Gazette Verified' : 'Unverified Estimate'}</div>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-60)] mb-4">
              Under the Minimum Wages Act and statutory labour compliance rules, paying below the notified rate may subject the establishment to arbitration or penalties. To proceed, an explicit logged acknowledgement is required.
            </p>

            <label className="flex items-start gap-2.5 text-xs font-bold cursor-pointer p-3 bg-slate-50 border border-slate-300 mb-5">
              <input
                type="checkbox"
                checked={hasAcknowledgedOverride}
                onChange={(e) => setHasAcknowledgedOverride(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I acknowledge that ₹{wageNum}/day is below the legal statutory minimum of ₹{minWageRupees.toFixed(2)}/day and confirm this contract override. This action will be logged in the immutable audit trail.
              </span>
            </label>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setShowOverrideModal(false)}
                disabled={isSubmittingOverride}
              >
                CANCEL & ADJUST WAGE
              </Button>
              <Button
                variant="danger"
                size="md"
                fullWidth
                isLoading={isSubmittingOverride}
                disabled={!hasAcknowledgedOverride}
                onClick={confirmOverrideAndDispatch}
              >
                CONFIRM OVERRIDE & DISPATCH
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Statutory Minimum Wages Reference Table Modal */}
      {showMinWageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white border-2 border-[var(--ink)] max-w-3xl w-full max-h-[85vh] flex flex-col text-[var(--ink)] shadow-2xl">
            <div className="p-4 border-b-2 border-[var(--ink)] flex items-center justify-between bg-[var(--paper-dark)]">
              <div>
                <div className="text-[10px] font-bold font-mono tracking-widest uppercase text-[var(--site-orange)]">
                  STATUTORY LABOUR BENCHMARKS · वैधानिक किमान वेतन
                </div>
                <h3 className="text-base font-bold uppercase mt-0.5">
                  Official Minimum Wages Register
                </h3>
              </div>
              <button
                onClick={() => setShowMinWageModal(false)}
                className="text-xs font-bold font-mono px-2 py-1 bg-white border border-[var(--ink)] hover:bg-slate-100"
              >
                CLOSE [✕]
              </button>
            </div>

            <div className="p-4 overflow-y-auto text-xs flex-1">
              <p className="text-xs text-[var(--ink-60)] mb-3">
                Rates sourced from official notifications of the Maharashtra Labour Department and Central Chief Labour Commissioner.
              </p>

              <table className="w-full text-left text-xs border border-[var(--ink-20)]">
                <thead className="bg-[var(--paper-dark)] border-b border-[var(--ink-20)] font-bold text-[10px] uppercase">
                  <tr>
                    <th className="p-2.5">JURISDICTION</th>
                    <th className="p-2.5">ZONE / AREA</th>
                    <th className="p-2.5">SKILL CATEGORY</th>
                    <th className="p-2.5">DAILY RATE</th>
                    <th className="p-2.5">EFFECTIVE FROM</th>
                    <th className="p-2.5">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink-10)]">
                  {allMinimumWages.map((w: any) => (
                    <tr key={w.id} className="hover:bg-slate-50 font-sans">
                      <td className="p-2.5 font-bold">{w.state}</td>
                      <td className="p-2.5 font-mono text-[11px]">{w.zone}</td>
                      <td className="p-2.5 uppercase font-semibold">{w.skill_category}</td>
                      <td className="p-2.5 font-data font-bold text-[var(--register-blue)]">
                        ₹{(w.daily_rate_paise / 100).toFixed(2)}/day
                      </td>
                      <td className="p-2.5 font-mono text-[11px]">{w.effective_from}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                            w.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {w.verified ? 'Verified' : 'Unverified'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-[var(--ink-10)] bg-slate-50 flex justify-between items-center text-[11px]">
              <span className="text-[var(--ink-60)]">
                Official Sources: mahakamgar.maharashtra.gov.in · clc.gov.in
              </span>
              <Button variant="secondary" size="sm" onClick={() => setShowMinWageModal(false)}>
                DISMISS
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
