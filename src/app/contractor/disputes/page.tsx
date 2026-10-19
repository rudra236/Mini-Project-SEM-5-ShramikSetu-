'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';
import { formatRupees } from '@/lib/money';
import { rupeesToPaise } from '@/types/payment.types';

export default function ContractorDisputesPage() {
  const { profiles, locale, t } = useAuth();
  const contractorProfile = profiles?.contractor;

  const [disputes, setDisputes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Status Filter: 'ALL' | 'open' | 'responded' | 'resolved' | 'escalated' | 'withdrawn'
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected Dispute Details Modal
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Response Form State inside modal
  const [responseType, setResponseType] = useState<'accept_and_pay' | 'deduction_claimed' | 'reject'>('accept_and_pay');
  const [deductionReason, setDeductionReason] = useState<'late_arrival' | 'incomplete_work' | 'advance_recovery' | 'other'>('late_arrival');
  const [deductionRupees, setDeductionRupees] = useState<string>('');
  const [responseMessage, setResponseMessage] = useState<string>('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Messaging thread
  const [newMessageText, setNewMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const fetchDisputes = async () => {
    try {
      setIsLoading(true);
      setErrorNotice(null);
      const res = await api.disputes.list(
        contractorProfile?.id ? { contractorId: contractorProfile.id } : {}
      );
      if (res.success && res.disputes) {
        setDisputes(res.disputes);
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to fetch disputes list.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, [contractorProfile?.id]);

  const loadDisputeDetail = async (disputeId: string) => {
    try {
      setIsLoadingDetail(true);
      const res = await api.disputes.get(disputeId);
      if (res.success) {
        setSelectedDispute({
          ...res.dispute,
          responses: res.responses || [],
          messages: res.messages || [],
          evidence: res.evidence || [],
          statusHistory: res.statusHistory || [],
          worker: res.worker,
          contractor: res.contractor,
          project: res.project,
          contract: res.contract,
        });
        // Reset response form
        setResponseType('accept_and_pay');
        setDeductionReason('late_arrival');
        setDeductionRupees('');
        setResponseMessage('');
      }
    } catch (err: any) {
      alert(`Could not load dispute details: ${err.message}`);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handlePostMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute || !newMessageText.trim()) return;

    try {
      setIsSendingMessage(true);
      const res = await api.disputes.postMessage(selectedDispute.id, newMessageText.trim());
      if (res.success && res.message) {
        setSelectedDispute((prev: any) => ({
          ...prev,
          messages: [...(prev.messages || []), res.message],
        }));
        setNewMessageText('');
      }
    } catch (err: any) {
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleContractorResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;

    if (responseType === 'deduction_claimed' && !deductionRupees) {
      alert('Please specify the deduction amount.');
      return;
    }

    if (responseType !== 'accept_and_pay' && !responseMessage.trim()) {
      alert('Formal statement / reason is required.');
      return;
    }

    try {
      setIsSubmittingResponse(true);
      const deductionAmountPaise = deductionRupees ? rupeesToPaise(Number(deductionRupees)) : undefined;

      const res = await api.disputes.respond(selectedDispute.id, {
        type: responseType,
        deductionReason: responseType === 'deduction_claimed' ? deductionReason : undefined,
        deductionAmountPaise,
        message: responseMessage.trim() || (responseType === 'accept_and_pay' ? 'Dispute claim accepted and settled in full.' : ''),
      });

      if (res.success) {
        setSuccessNotice(
          responseType === 'accept_and_pay'
            ? 'Claim accepted and settlement payment processed via ledger!'
            : 'Formal counter-response submitted successfully.'
        );
        await loadDisputeDetail(selectedDispute.id);
        await fetchDisputes();
      }
    } catch (err: any) {
      alert(`Failed to submit response: ${err.message}`);
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  const filteredDisputes = useMemo(() => {
    if (statusFilter === 'ALL') return disputes;
    return disputes.filter((d) => String(d.status).toLowerCase() === statusFilter.toLowerCase());
  }, [disputes, statusFilter]);

  const openCounts = useMemo(() => {
    return disputes.filter((d) => String(d.status).toLowerCase() === 'open').length;
  }, [disputes]);

  return (
    <div className="w-full space-y-6">
      {/* Title & Header */}
      <div className="p-4 border-b-2 border-[var(--ink)] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold font-mono uppercase tracking-widest text-[var(--site-orange)]">
            EMPLOYER GRIEVANCE DESK · शिकायत एवं विवाद
          </div>
          <h1 className="text-xl font-bold uppercase text-[var(--ink)] mt-0.5">
            Dispute & Arbitration Register
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-0.5">
            Formal worker claims filed under the Industrial Disputes Act & Payment of Wages Act. Review verified attendance, ledger shortfalls, and submit binding responses.
          </p>
        </div>

        <Link href="/contractor">
          <Button variant="secondary" size="md">
            ← BACK TO DASHBOARD
          </Button>
        </Link>
      </div>

      {successNotice && (
        <div className="p-4 bg-[#EBF7F0] border-2 border-[#1E7A4B] text-[#155A36] text-xs font-bold uppercase flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.CheckCircle size={18} />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="hover:opacity-75">
            <Icons.X size={16} />
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="p-4 bg-[#FEF2F2] border-2 border-[#B91C1C] text-[#991B1B] text-xs font-bold flex items-center justify-between">
          <span>{errorNotice}</span>
          <button onClick={() => setErrorNotice(null)} className="hover:opacity-75">
            <Icons.X size={16} />
          </button>
        </div>
      )}

      {/* Status Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'open', 'responded', 'resolved', 'escalated', 'withdrawn'] as const).map((st) => {
          const isActive = statusFilter === st;
          const label = st === 'ALL' ? 'ALL DISPUTES' : (t.disputes.statuses[st] || st).toUpperCase();
          const count = st === 'ALL'
            ? disputes.length
            : disputes.filter((d) => String(d.status).toLowerCase() === st.toLowerCase()).length;

          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold font-mono tracking-wide border-2 transition-none flex items-center gap-2 ${
                isActive
                  ? 'bg-[var(--ink)] text-white border-[var(--ink)] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                  : 'bg-white text-[var(--ink)] border-[var(--ink-40)] hover:border-[var(--ink)]'
              }`}
            >
              <span>{label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive
                    ? 'bg-white text-[var(--ink)]'
                    : st === 'open' && openCounts > 0
                    ? 'bg-[var(--site-orange)] text-white'
                    : 'bg-[var(--ink-10)] text-[var(--ink-60)]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <LoadingState message="ACCESSING DISPUTE RECORDS..." />
      ) : filteredDisputes.length === 0 ? (
        <EmptyState
          title="NO GRIEVANCES FILED"
          message={
            statusFilter === 'ALL'
              ? 'No active or pending disputes recorded against your projects. Your statutory muster and wage records are in order.'
              : `No disputes found under status '${statusFilter}'.`
          }
        />
      ) : (
        <div className="bg-white border-2 border-[var(--ink)] divide-y divide-[var(--ink-20)]">
          {filteredDisputes.map((d) => {
            const rawStatus = String(d.status).toLowerCase();
            const isOpen = rawStatus === 'open';
            const daysRemaining = d.contractor_response_deadline
              ? Math.max(0, Math.ceil((new Date(d.contractor_response_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              : 5;

            const categoryKey = (d.category || '').toLowerCase() as keyof typeof t.disputes.categories;
            const categoryLabel = t.disputes.categories[categoryKey] || d.category;
            const refCode = d.reference || d.dispute_ref || `SS-D-${d.id.slice(0, 8).toUpperCase()}`;

            return (
              <div key={d.id} className="p-4 sm:p-5 hover:bg-[var(--paper)] transition-none">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--site-orange)] bg-[#FFF3EB] border border-[#E8540A] px-2 py-0.5 rounded-[2px]">
                        {categoryLabel}
                      </span>
                      <span className="font-mono text-xs font-bold text-[var(--ink)]">
                        {refCode}
                      </span>
                      <span className="font-data text-xs text-[var(--ink-60)]">
                        · Filed {new Date(d.created_at).toLocaleDateString('en-IN')}
                      </span>
                    </div>

                    <h3 className="text-base font-bold uppercase text-[var(--ink)] mt-1.5">
                      {d.projects?.name || 'Worksite Project'}
                    </h3>

                    <div className="text-xs text-[var(--ink-60)] mt-0.5">
                      Worker: <strong>{d.workers?.full_name || 'Worker ID ' + d.worker_id.slice(0, 8)}</strong>
                      {d.workers?.skill_category ? ` (${d.workers.skill_category})` : ''}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-end gap-2">
                    <StatusPill status={d.status} />
                    <Button
                      variant={isOpen ? 'warning' : 'secondary'}
                      size="sm"
                      onClick={() => loadDisputeDetail(d.id)}
                    >
                      {isOpen ? 'REVIEW & RESPOND' : 'VIEW CASE FILE'}
                    </Button>
                  </div>
                </div>

                {/* Response Window Countdown Notice */}
                {isOpen && (
                  <div className="p-2.5 bg-[#FFF3EB] border border-[#E8540A] text-[#C04205] text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                    <div className="flex items-center gap-2">
                      <Icons.Clock size={16} />
                      <span>RESPONSE WINDOW OPEN: {daysRemaining} days remaining to file counter-statement.</span>
                    </div>
                    <span className="font-mono text-[11px]">
                      Deadline: {d.contractor_response_deadline ? new Date(d.contractor_response_deadline).toLocaleDateString('en-IN') : '5 days'}
                    </span>
                  </div>
                )}

                {/* Server Computed Breakdown Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-[var(--paper-dark)] border border-[var(--ink-20)] text-xs mb-3">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.earned}</span>
                    <span className="font-mono font-bold text-[var(--ink)]">{formatRupees(d.earned_paise || 0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.paid}</span>
                    <span className="font-mono font-bold text-[var(--ink)]">{formatRupees(d.paid_paise || 0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.shortfall}</span>
                    <span className="font-mono font-bold text-[#B91C1C]">{formatRupees(d.shortfall_paise || 0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.claimedAmount}</span>
                    <span className="font-mono font-bold text-[var(--site-orange)]">
                      {formatRupees(d.claimed_paise || d.amount_claimed_paise || 0)}
                    </span>
                  </div>
                </div>

                {/* Worker Statement Summary */}
                <div className="text-xs text-[var(--ink-80)] line-clamp-2">
                  <strong className="text-[var(--ink)]">Claim Statement: </strong>
                  {d.description}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dispute Details & Response Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white border-2 border-[var(--ink)] max-w-3xl w-full p-5 sm:p-6 text-[var(--ink)] shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="border-b-2 border-[var(--ink)] pb-3 mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--site-orange)]">
                  CASE FILE · {selectedDispute.reference || selectedDispute.dispute_ref || `SS-D-${selectedDispute.id.slice(0, 8).toUpperCase()}`}
                </div>
                <h2 className="text-lg font-bold uppercase text-[var(--ink)] mt-0.5">
                  {t.disputes.categories[(selectedDispute.category || '').toLowerCase() as keyof typeof t.disputes.categories] || selectedDispute.category}
                </h2>
                <div className="text-xs text-[var(--ink-60)] mt-0.5">
                  Project: <strong>{selectedDispute.project?.name || 'Worksite Project'}</strong> · Worker: <strong>{selectedDispute.worker?.full_name || 'Worker'}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusPill status={selectedDispute.status} />
                <button
                  onClick={() => setSelectedDispute(null)}
                  className="p-1 hover:bg-[var(--ink-10)] text-[var(--ink-60)] hover:text-[var(--ink)] border border-transparent hover:border-[var(--ink-20)]"
                  aria-label="Close"
                >
                  <Icons.X size={20} />
                </button>
              </div>
            </div>

            {/* Financial Reconciliation Breakdown */}
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase text-[var(--ink-60)] mb-1">
                {t.disputes.shortfallCardTitle} ({selectedDispute.period_from || '—'} to {selectedDispute.period_to || '—'})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-[var(--paper-dark)] border-2 border-[var(--ink)]">
                <div>
                  <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.earned}</span>
                  <span className="font-mono text-sm font-bold text-[var(--ink)]">
                    {formatRupees(selectedDispute.earned_paise || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.paid}</span>
                  <span className="font-mono text-sm font-bold text-[var(--ink)]">
                    {formatRupees(selectedDispute.paid_paise || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.shortfall}</span>
                  <span className="font-mono text-sm font-bold text-[#B91C1C]">
                    {formatRupees(selectedDispute.shortfall_paise || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[var(--ink-60)] block uppercase">{t.disputes.claimedAmount}</span>
                  <span className="font-mono text-sm font-bold text-[var(--site-orange)]">
                    {formatRupees(selectedDispute.claimed_paise || selectedDispute.amount_claimed_paise || 0)}
                  </span>
                </div>
              </div>

              {selectedDispute.claimed_justification && (
                <div className="mt-2 p-2 bg-[#FFFDF5] border border-[var(--site-orange)] text-xs text-[var(--ink)]">
                  <strong className="text-[var(--site-orange)]">Worker Justification (Claimed &gt; Shortfall):</strong>{' '}
                  {selectedDispute.claimed_justification}
                </div>
              )}
            </div>

            {/* Worker Allegation & Description */}
            <div className="mb-4 p-3 bg-[var(--paper)] border border-[var(--ink-20)] text-xs">
              <span className="text-[10px] font-bold uppercase text-[var(--ink-60)] block mb-1">
                WORKER STATEMENT
              </span>
              <p className="whitespace-pre-wrap text-[var(--ink)] leading-relaxed">{selectedDispute.description}</p>
            </div>

            {/* Evidence Gallery */}
            {selectedDispute.evidence && selectedDispute.evidence.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase text-[var(--ink-60)] mb-1.5 flex items-center gap-1">
                  <Icons.FileText size={14} />
                  <span>{t.disputes.evidenceTitle} ({selectedDispute.evidence.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedDispute.evidence.map((ev: any) => (
                    <a
                      key={ev.id}
                      href={ev.signedUrl || ev.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 bg-white border border-[var(--ink)] hover:bg-[var(--paper-dark)] flex items-center justify-between text-xs transition-none"
                    >
                      <div className="truncate mr-2">
                        <div className="font-bold truncate text-[var(--ink)]">{ev.file_name}</div>
                        <div className="text-[10px] font-mono text-[var(--ink-60)]">
                          {(ev.file_size / 1024).toFixed(1)} KB · {ev.mime_type}
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-[var(--register-blue)] underline">
                        VIEW ↗
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Contractor Response Section (Active if open or responded) */}
            {['open', 'responded'].includes(String(selectedDispute.status).toLowerCase()) ? (
              <div className="mb-5 p-4 border-2 border-[var(--ink)] bg-[#FAFAFA]">
                <div className="text-xs font-bold uppercase text-[var(--ink)] mb-3 flex items-center gap-2">
                  <Icons.AlertCircle size={16} className="text-[var(--site-orange)]" />
                  <span>CONTRACTOR RESPONSE · 3 STATUTORY ACTIONS</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setResponseType('accept_and_pay')}
                    className={`p-2 text-xs font-bold border-2 transition-none ${
                      responseType === 'accept_and_pay'
                        ? 'bg-[#1E7A4B] text-white border-[#1E7A4B]'
                        : 'bg-white text-[var(--ink)] border-[var(--ink-30)] hover:border-[var(--ink)]'
                    }`}
                  >
                    1. {t.disputes.responseTypes.accept_and_pay}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseType('deduction_claimed')}
                    className={`p-2 text-xs font-bold border-2 transition-none ${
                      responseType === 'deduction_claimed'
                        ? 'bg-[var(--site-orange)] text-white border-[var(--site-orange)]'
                        : 'bg-white text-[var(--ink)] border-[var(--ink-30)] hover:border-[var(--ink)]'
                    }`}
                  >
                    2. {t.disputes.responseTypes.deduction_claimed}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseType('reject')}
                    className={`p-2 text-xs font-bold border-2 transition-none ${
                      responseType === 'reject'
                        ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                        : 'bg-white text-[var(--ink)] border-[var(--ink-30)] hover:border-[var(--ink)]'
                    }`}
                  >
                    3. {t.disputes.responseTypes.reject}
                  </button>
                </div>

                <form onSubmit={handleContractorResponse} className="space-y-3">
                  {responseType === 'accept_and_pay' && (
                    <div className="p-3 bg-[#EBF7F0] border border-[#1E7A4B] text-xs text-[#155A36]">
                      <div className="font-bold mb-1">
                        Settlement Payment: {formatRupees(selectedDispute.claimed_paise || selectedDispute.amount_claimed_paise || 0)}
                      </div>
                      <p className="text-[11px]">
                        Executing this action immediately transfers full claimed shortfall to worker wallet, creates double-entry ledger entries, and marks this dispute <strong>RESOLVED</strong>.
                      </p>
                    </div>
                  )}

                  {responseType === 'deduction_claimed' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                          DEDUCTION REASON *
                        </label>
                        <select
                          value={deductionReason}
                          onChange={(e: any) => setDeductionReason(e.target.value)}
                          className="w-full border-2 border-[var(--ink)] p-2 text-xs bg-white"
                        >
                          <option value="late_arrival">{t.disputes.deductionReasons.late_arrival}</option>
                          <option value="incomplete_work">{t.disputes.deductionReasons.incomplete_work}</option>
                          <option value="advance_recovery">{t.disputes.deductionReasons.advance_recovery}</option>
                          <option value="other">{t.disputes.deductionReasons.other}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                          {t.disputes.deductionAmount} (₹) *
                        </label>
                        <input
                          type="number"
                          value={deductionRupees}
                          onChange={(e) => setDeductionRupees(e.target.value)}
                          placeholder="e.g. 200"
                          min="1"
                          className="w-full border-2 border-[var(--ink)] p-2 text-xs font-mono"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                      {responseType === 'accept_and_pay' ? 'SETTLEMENT NOTE (OPTIONAL)' : 'FORMAL EXPLANATION / STATEMENT *'}
                    </label>
                    <textarea
                      value={responseMessage}
                      onChange={(e) => setResponseMessage(e.target.value)}
                      placeholder={
                        responseType === 'accept_and_pay'
                          ? 'Optional note for worker...'
                          : 'Provide detailed justification for deduction or rejection...'
                      }
                      rows={3}
                      className="w-full border-2 border-[var(--ink)] p-2 text-xs font-sans"
                      required={responseType !== 'accept_and_pay'}
                    />
                  </div>

                  <Button
                    type="submit"
                    variant={responseType === 'accept_and_pay' ? 'primary' : responseType === 'reject' ? 'danger' : 'warning'}
                    size="md"
                    fullWidth
                    isLoading={isSubmittingResponse}
                  >
                    {responseType === 'accept_and_pay'
                      ? `ACCEPT & PAY ${formatRupees(selectedDispute.claimed_paise || selectedDispute.amount_claimed_paise || 0)}`
                      : responseType === 'reject'
                      ? 'SUBMIT REJECTION'
                      : 'SUBMIT DEDUCTION CLAIM'}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="mb-5 p-3 bg-[var(--paper-dark)] border border-[var(--ink-20)] text-xs text-[var(--ink-80)]">
                <strong>Status:</strong> Case is marked as{' '}
                <span className="font-mono uppercase font-bold text-[var(--ink)]">{selectedDispute.status}</span>.
                No further contractor response actions are permitted in this state.
              </div>
            )}

            {/* Discussion & Messaging Thread */}
            <div className="mb-5 border-t border-[var(--ink-20)] pt-4">
              <div className="text-xs font-bold uppercase text-[var(--ink)] mb-2 flex items-center gap-1.5">
                <Icons.MessageSquare size={16} />
                <span>{t.disputes.messagesTitle}</span>
              </div>

              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto p-2 bg-[var(--paper)] border border-[var(--ink-20)]">
                {(!selectedDispute.messages || selectedDispute.messages.length === 0) ? (
                  <div className="text-xs text-[var(--ink-40)] text-center py-3">
                    No messages in discussion thread yet.
                  </div>
                ) : (
                  selectedDispute.messages.map((m: any) => {
                    const isContractor = m.sender_role === 'CONTRACTOR';
                    return (
                      <div
                        key={m.id}
                        className={`p-2.5 text-xs max-w-[85%] ${
                          isContractor
                            ? 'ml-auto bg-[var(--ink)] text-white'
                            : 'mr-auto bg-white border border-[var(--ink)] text-[var(--ink)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 mb-1 font-mono">
                          <span>{m.sender_role}</span>
                          <span>{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{m.message}</p>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={handlePostMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder={t.disputes.typeMessagePlaceholder}
                  className="flex-1 border-2 border-[var(--ink)] p-2 text-xs"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  isLoading={isSendingMessage}
                  disabled={!newMessageText.trim()}
                >
                  {t.disputes.sendMessageBtn}
                </Button>
              </form>
            </div>

            {/* Status Timeline History */}
            {selectedDispute.statusHistory && selectedDispute.statusHistory.length > 0 && (
              <div className="border-t border-[var(--ink-20)] pt-3">
                <div className="text-[11px] font-bold uppercase text-[var(--ink-60)] mb-2">
                  AUDIT TIMELINE ({selectedDispute.statusHistory.length} TRANSITIONS)
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  {selectedDispute.statusHistory.map((h: any) => (
                    <div key={h.id} className="p-2 bg-[var(--paper-dark)] border border-[var(--ink-10)] flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-[var(--site-orange)]">{h.from_status} → {h.to_status}</span>
                        <span className="text-[var(--ink-60)]"> by {h.actor_role}</span>
                        {h.note && <div className="text-[11px] text-[var(--ink-80)] mt-0.5">{h.note}</div>}
                      </div>
                      <span className="text-[10px] text-[var(--ink-60)] whitespace-nowrap">
                        {new Date(h.at).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
