'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { StatusPill } from '@/components/ui/StatusPill';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { formatRupees } from '@/lib/money';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';

export default function WorkerContractsPage() {
  const { t } = useAuth();
  const wp = t.workerPortal;
  const ct = t.contracts;

  const [contracts, setContracts] = useState<any[]>([]);
  const [counts, setCounts] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ONGOING' | 'COMPLETED'>('ONGOING');

  // Decision state for accept/reject
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reject modal state
  const [rejectingContract, setRejectingContract] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchContracts = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true);
      const [res, countsRes] = await Promise.allSettled([
        api.contracts.list(),
        api.counts.get({ scope: 'worker' }),
      ]);
      if (res.status === 'fulfilled' && res.value.success && res.value.contracts) {
        setContracts(res.value.contracts);
      }
      if (countsRes.status === 'fulfilled' && countsRes.value.success && countsRes.value.counts) {
        setCounts(countsRes.value.counts);
      }
    } catch {
      // Handled
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContracts(true);
    // Standalone polling every 15 seconds
    const interval = setInterval(() => {
      fetchContracts(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchContracts]);

  // Handle Accept
  const handleAccept = async (contractId: string) => {
    try {
      setProcessingId(contractId);
      setActionNotice(null);
      const res = await api.contracts.accept(contractId);
      if (res.success) {
        setActionNotice({
          type: 'success',
          text: 'Assignment accepted! Shift check-in is now enabled for this project.',
        });
        await fetchContracts(false);
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Failed to accept assignment.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Open Reject Modal
  const openRejectModal = (contract: any) => {
    setRejectingContract(contract);
    setRejectionReason('');
  };

  // Handle Confirm Reject
  const handleConfirmReject = async () => {
    if (!rejectingContract) return;
    try {
      setProcessingId(rejectingContract.id);
      setActionNotice(null);
      const res = await api.contracts.reject(rejectingContract.id, rejectionReason.trim());
      if (res.success) {
        setActionNotice({
          type: 'success',
          text: 'Assignment invitation declined.',
        });
        setRejectingContract(null);
        await fetchContracts(false);
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Failed to reject assignment.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Split contracts into Pending, Ongoing, and Completed
  const pendingRequests = contracts.filter((c) =>
    ['PENDING', 'pending', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(c.status)
  );

  const ongoingContracts = contracts.filter((c) =>
    ['ACCEPTED', 'accepted', 'ACTIVE', 'active'].includes(c.status)
  );

  const completedContracts = contracts.filter((c) =>
    ['COMPLETED', 'completed', 'TERMINATED', 'terminated', 'REJECTED', 'rejected', 'CANCELLED', 'cancelled', 'ENDED', 'ended'].includes(c.status)
  );

  const displayedContracts = activeTab === 'ONGOING' ? ongoingContracts : completedContracts;

  return (
    <div className="w-full">
      {/* Title Strip */}
      <div className="p-4 border-b-2 border-black bg-white">
        <div className="text-[11px] font-bold font-mono uppercase tracking-widest text-[#B45309]">
          OFFICIAL REGISTER · {t.nav.contracts}
        </div>
        <h1 className="text-xl font-bold uppercase text-[#0F172A] mt-0.5">
          {ct.title}
        </h1>
        <p className="text-xs text-slate-600 mt-0.5">
          {ct.subtitle}
        </p>
      </div>

      {/* Action Notification Alert */}
      {actionNotice && (
        <div
          className={`p-3 text-xs font-semibold flex items-center justify-between border-b-2 ${
            actionNotice.type === 'success'
              ? 'bg-[#EBF7F0] text-[#155A36] border-[#1E7A4B]'
              : 'bg-[#FEF2F2] text-[#991B1B] border-[#B91C1C]'
          }`}
        >
          <span>{actionNotice.type === 'success' ? '✓ ' : '⚠️ '}{actionNotice.text}</span>
          <button
            onClick={() => setActionNotice(null)}
            className="text-xs uppercase font-bold px-1 hover:underline"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PENDING REQUESTS SECTION (TOP, HIGHLIGHTED)                              */}
      {/* ========================================================================= */}
      {pendingRequests.length > 0 && (
        <div className="p-4 bg-[#FFFDF5] border-b-4 border-amber-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-amber-900">
                {ct.pendingRequests || 'PENDING REQUESTS'} ({counts ? counts.pendingInvites : pendingRequests.length})
              </h2>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-amber-200 border border-amber-600 text-amber-900 rounded-sm">
              ACTION REQUIRED · कार्रवाई आवश्यक
            </span>
          </div>

          <p className="text-xs text-amber-800 mb-3">
            {ct.pendingRequestsSubtitle || 'Contractors have invited you to the following projects. Review wage rates and accept to activate your assignment.'}
          </p>

          <div className="space-y-3">
            {pendingRequests.map((req) => {
              const offeredPaise = Number(req.daily_wage) >= 1000 ? Number(req.daily_wage) : Number(req.daily_wage) * 100;
              const minWagePaise = Number(req.min_wage_applicable_paise) || 60638;
              const isAboveMin = offeredPaise >= minWagePaise;
              const isProcessing = processingId === req.id;

              return (
                <div
                  key={req.id}
                  className="bg-white border-2 border-amber-400 p-3.5 shadow-sm hover:shadow transition-none"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-2 border-b border-amber-200">
                    <div>
                      <div className="text-[10px] font-mono text-slate-500 font-bold">
                        {req.contract_code ? `CONTRACT: ${req.contract_code} · ` : ''}INVITE REF: #{req.id.slice(0, 8).toUpperCase()}
                      </div>
                      <h3 className="text-base font-bold uppercase text-[#0F172A] mt-0.5">
                        {req.projects?.name || 'Site Project'}
                      </h3>
                      <div className="text-xs text-slate-700 mt-0.5">
                        <strong>{t.roles.CONTRACTOR}:</strong> {req.contractors?.company_name || 'Builder'} · <strong>Role:</strong> {req.work_type || 'General Civil'}
                      </div>
                    </div>
                    <div>
                      <StatusPill status="PENDING" label="PENDING YOUR DECISION" />
                    </div>
                  </div>

                  {/* Wage and Statutory Comparison Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#F8FAFC] p-2.5 my-3 border border-slate-300 text-xs">
                    <div>
                      <span className="block text-[10px] uppercase font-mono text-slate-500">{wp.wageRate}</span>
                      <span className="font-mono font-bold text-[#1D4ED8] text-sm">
                        {formatRupees(offeredPaise)}/day
                      </span>
                    </div>

                    <div>
                      <span className="block text-[10px] uppercase font-mono text-slate-500">
                        {ct.statutoryMinWage || 'LEGAL MIN WAGE'}
                      </span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {formatRupees(minWagePaise)}/day
                      </span>
                    </div>

                    <div>
                      <span className="block text-[10px] uppercase font-mono text-slate-500">WAGE COMPLIANCE</span>
                      <span
                        className={`inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${
                          isAboveMin
                            ? 'bg-[#EBF7F0] text-[#155A36] border-[#1E7A4B]'
                            : 'bg-amber-100 text-amber-800 border-amber-500'
                        }`}
                      >
                        {isAboveMin ? '✓ AT/ABOVE MIN' : '⚠️ OVERRIDE WAGE'}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[10px] uppercase font-mono text-slate-500">{wp.contractDuration}</span>
                      <span className="font-semibold text-slate-800 text-[11px]">
                        {req.start_date || 'Immediate'} {req.end_date ? `to ${req.end_date}` : '(Ongoing)'}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons: Accept / Reject */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => openRejectModal(req)}
                      disabled={isProcessing}
                      className="min-h-[44px] text-xs font-bold uppercase w-full sm:w-auto"
                    >
                      {ct.rejectInvite || 'REJECT'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAccept(req.id)}
                      isLoading={isProcessing}
                      className="min-h-[44px] text-xs font-bold uppercase bg-[#15803D] hover:bg-[#166534] w-full sm:w-auto"
                    >
                      <Icons.Check size={14} className="mr-1" />
                      {ct.acceptInvite || 'ACCEPT ASSIGNMENT'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Segmented Control (Ongoing vs Completed with counts) */}
      <div className="flex border-b-2 border-black bg-[#F1F5F9] text-xs font-mono font-bold uppercase overflow-hidden">
        <button
          type="button"
          onClick={() => setActiveTab('ONGOING')}
          className={`flex-1 min-h-[44px] py-3 text-center transition-all border-r-2 border-black flex items-center justify-center gap-2 ${
            activeTab === 'ONGOING'
              ? 'bg-white text-[#0F172A] border-b-4 border-b-[#0F172A]'
              : 'text-slate-600 hover:text-black hover:bg-slate-200'
          }`}
        >
          <span>{wp.ongoingTab}</span>
          <span className="px-2 py-0.5 text-[10px] font-black bg-[#EBF7F0] border border-black rounded-sm text-[#155A36]">
            {counts ? counts.activeContracts : ongoingContracts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('COMPLETED')}
          className={`flex-1 min-h-[44px] py-3 text-center transition-all flex items-center justify-center gap-2 ${
            activeTab === 'COMPLETED'
              ? 'bg-white text-[#0F172A] border-b-4 border-b-[#0F172A]'
              : 'text-slate-600 hover:text-black hover:bg-slate-200'
          }`}
        >
          <span>{wp.completedTab}</span>
          <span className="px-2 py-0.5 text-[10px] font-black bg-slate-200 border border-black rounded-sm text-[#0F172A]">
            {counts ? counts.completedPast : completedContracts.length}
          </span>
        </button>
      </div>

      {isLoading ? (
        <LoadingState message={t.common.loading} />
      ) : displayedContracts.length === 0 ? (
        <EmptyState
          title={t.common.emptyTitle}
          message={activeTab === 'ONGOING' ? wp.noOngoingContracts : wp.noCompletedContracts}
        />
      ) : (
        <div className="divide-y-2 divide-slate-200">
          {displayedContracts.map((contract) => {
            const isAccepted = ['ACCEPTED', 'accepted', 'ACTIVE', 'active'].includes(contract.status);

            return (
              <div
                key={contract.id}
                className={`p-4 bg-white hover:bg-[#FFFDF5] transition-none border-l-4 ${
                  isAccepted
                    ? 'border-l-[#15803D]'
                    : contract.status === 'REJECTED' || contract.status === 'rejected'
                    ? 'border-l-[#B91C1C]'
                    : 'border-l-slate-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-[11px] font-mono text-slate-500 font-bold">
                      {contract.contract_code ? `CONTRACT: ${contract.contract_code} · ` : ''}REF: #{contract.id.slice(0, 8).toUpperCase()}
                    </div>
                    <h3 className="text-base font-bold uppercase text-[#0F172A] mt-0.5">
                      {contract.projects?.name || 'Site Project'}
                    </h3>
                    <div className="text-xs text-slate-600 mt-0.5">
                      <strong>{t.roles.CONTRACTOR}:</strong> {contract.contractors?.company_name || 'Builder'} · <strong>Role:</strong> {contract.work_type || 'General Civil'}
                    </div>
                    {contract.rejection_reason && (
                      <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 p-1.5 mt-1.5 rounded-sm">
                        <strong>Reason:</strong> {contract.rejection_reason}
                      </div>
                    )}
                  </div>
                  <StatusPill status={contract.status} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[#F8FAFC] p-2.5 text-xs my-3 border border-slate-300">
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">{wp.wageRate}</span>
                    <span className="font-mono font-bold text-[#1D4ED8] text-sm">
                      {formatRupees(Number(contract.daily_wage) >= 1000 ? Number(contract.daily_wage) : Number(contract.daily_wage) * 100)}/day
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">{t.workerHome.expectedHours}</span>
                    <span className="font-mono font-bold text-[#0F172A]">{contract.expected_working_hours || 8.0} hrs</span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="block text-[10px] uppercase font-mono text-slate-500">{wp.paymentSchedule}</span>
                    <span className="font-bold uppercase text-[#0F172A]">{contract.payment_frequency || 'DAILY'}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] font-mono text-slate-500">
                    {wp.contractDuration}: {contract.start_date || 'Current'} {contract.end_date ? `to ${contract.end_date}` : '(Ongoing)'}
                  </span>

                  <Link href={`/worker/contracts/${contract.id}`}>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[40px] text-xs font-bold uppercase"
                    >
                      {t.workerHome.viewContractBtn} ↗
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rejection Modal with Optional Reason */}
      {rejectingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white border-2 border-[var(--ink)] max-w-md w-full p-5 shadow-2xl">
            <div className="border-b border-[var(--ink-20)] pb-2 mb-3">
              <h3 className="text-base font-bold uppercase text-[#991B1B]">
                {ct.rejectionReasonModalTitle || 'Decline Assignment Offer'}
              </h3>
              <p className="text-xs text-[var(--ink-60)] mt-0.5">
                {rejectingContract.projects?.name} · {rejectingContract.contractors?.company_name}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                {ct.rejectionReasonPrompt || 'Reason for rejection (Optional):'}
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={ct.rejectionReasonPlaceholder || 'e.g. Schedule conflict, wage rate too low, transportation issues'}
                rows={3}
                className="w-full text-xs p-2 border-2 border-[var(--ink-40)] focus:border-black outline-none font-sans"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRejectingContract(null)}
                disabled={processingId !== null}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmReject}
                isLoading={processingId === rejectingContract.id}
              >
                {ct.confirmRejectBtn || 'CONFIRM DECLINE'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
