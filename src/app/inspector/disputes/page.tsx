'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';
import { formatRupees } from '@/lib/money';
import { rupeesToPaise, paiseToRupees } from '@/types/payment.types';

export default function InspectorDisputesPage() {
  const { user, role } = useAuth();

  const [disputes, setDisputes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'>('ALL');

  // Case View & Adjudication Modal State
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [disputeDetail, setDisputeDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Ruling form
  const [rulingDecision, setRulingDecision] = useState<'ORDER_PAYMENT' | 'PARTIAL_SETTLEMENT' | 'DISMISS'>('ORDER_PAYMENT');
  const [orderedAmountRupees, setOrderedAmountRupees] = useState<string>('0');
  const [deadlineDays, setDeadlineDays] = useState<number>(2);
  const [rulingReason, setRulingReason] = useState<string>('');
  const [officerNotes, setOfficerNotes] = useState<string>('');
  const [isSubmittingRuling, setIsSubmittingRuling] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchDisputes = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.disputes.list();
      if (res.success && res.disputes) {
        setDisputes(res.disputes);
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  // Open Case View modal & load rich details and evidence snapshot
  const handleOpenCase = async (dispute: any) => {
    setSelectedDispute(dispute);
    setIsLoadingDetail(true);
    setRulingReason('');
    setOfficerNotes('');
    setRulingDecision('ORDER_PAYMENT');

    // Default ordered amount from shortfall or claimed amount
    const claimedRupees = paiseToRupees(dispute.amount_claimed_paise || 0);
    setOrderedAmountRupees(String(claimedRupees > 0 ? claimedRupees : 1800));

    try {
      const res = await api.disputes.get(dispute.id);
      if (res.success) {
        setDisputeDetail(res);
        // Pre-fill computed shortfall if available from automated analysis
        const autoAnalysis = res.evidenceSnapshot?.automated_analysis;
        if (autoAnalysis && autoAnalysis.outstandingRupees > 0) {
          setOrderedAmountRupees(String(autoAnalysis.outstandingRupees));
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleIssueRuling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;

    if (!rulingReason.trim()) {
      alert('Official arbitration ruling statement is required.');
      return;
    }

    try {
      setIsSubmittingRuling(true);
      const orderedPaise = (rulingDecision === 'ORDER_PAYMENT' || rulingDecision === 'PARTIAL_SETTLEMENT')
        ? rupeesToPaise(Number(orderedAmountRupees || 0))
        : 0;

      await api.disputes.ruling(selectedDispute.id, {
        rulingDecision,
        reason: rulingReason.trim(),
        resolutionNotes: officerNotes.trim() || undefined,
        orderedAmountPaise: orderedPaise,
        deadlineDays,
      });

      setActionNotice(`Statutory Tribunal Ruling issued for Dispute #${selectedDispute.dispute_ref || selectedDispute.id.slice(0, 8)}. Double-entry settlement appended to wage ledger.`);
      setSelectedDispute(null);
      setDisputeDetail(null);
      await fetchDisputes();
    } catch (err: any) {
      alert(`Ruling failed: ${err.message}`);
    } finally {
      setIsSubmittingRuling(false);
    }
  };

  // Filter disputes
  const filteredDisputes = disputes.filter((d) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'OPEN') return d.status === 'OPEN' || d.status === 'WAITING_FOR_INFORMATION';
    if (statusFilter === 'UNDER_REVIEW') return d.status === 'UNDER_REVIEW';
    if (statusFilter === 'RESOLVED') return d.status === 'RESOLVED' || d.status === 'REJECTED' || d.status === 'CLOSED';
    return true;
  });

  const openCount = disputes.filter((d) => d.status === 'OPEN' || d.status === 'WAITING_FOR_INFORMATION').length;
  const underReviewCount = disputes.filter((d) => d.status === 'UNDER_REVIEW').length;
  const resolvedCount = disputes.filter((d) => d.status === 'RESOLVED' || d.status === 'REJECTED' || d.status === 'CLOSED').length;

  return (
    <div className="w-full space-y-6">
      {/* Title */}
      <div className="border-b-2 border-[var(--ink)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold font-mono uppercase tracking-widest text-[var(--site-orange)]">
            TRIBUNAL ARBITRATION DESK · श्रम विवाद न्यायाधिकरण
          </div>
          <h1 className="text-2xl font-bold uppercase text-[var(--ink)] mt-0.5">
            Statutory Arbitration Roster
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-0.5">
            Formal complaints filed by workers against employers under the Industrial Disputes Act & Minimum Wages Act.
          </p>
        </div>

        <Link href="/inspector">
          <Button variant="secondary" size="md">
            ← BACK TO STATUTORY LEDGER
          </Button>
        </Link>
      </div>

      {actionNotice && (
        <div className="p-4 bg-[#EBF7F0] border-2 border-[#1E7A4B] text-[#155A36] text-xs font-bold uppercase flex items-center gap-2">
          <Icons.CheckCircle size={18} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Filter Tabs Driven by Real Data */}
      <div className="flex border-2 border-[var(--ink)] bg-white text-xs font-bold uppercase">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`flex-1 py-2.5 text-center transition-none border-r border-[var(--ink)] ${
            statusFilter === 'ALL' ? 'bg-[var(--ink)] text-white' : 'text-[var(--ink)] hover:bg-[var(--ink-5)]'
          }`}
        >
          ALL ({disputes.length})
        </button>
        <button
          onClick={() => setStatusFilter('OPEN')}
          className={`flex-1 py-2.5 text-center transition-none border-r border-[var(--ink)] ${
            statusFilter === 'OPEN' ? 'bg-[var(--ink)] text-white' : 'text-[var(--ink)] hover:bg-[var(--ink-5)]'
          }`}
        >
          OPEN ({openCount})
        </button>
        <button
          onClick={() => setStatusFilter('UNDER_REVIEW')}
          className={`flex-1 py-2.5 text-center transition-none border-r border-[var(--ink)] ${
            statusFilter === 'UNDER_REVIEW' ? 'bg-[var(--ink)] text-white' : 'text-[var(--ink)] hover:bg-[var(--ink-5)]'
          }`}
        >
          UNDER REVIEW ({underReviewCount})
        </button>
        <button
          onClick={() => setStatusFilter('RESOLVED')}
          className={`flex-1 py-2.5 text-center transition-none ${
            statusFilter === 'RESOLVED' ? 'bg-[var(--ink)] text-white' : 'text-[var(--ink)] hover:bg-[var(--ink-5)]'
          }`}
        >
          RESOLVED ({resolvedCount})
        </button>
      </div>

      {/* Disputes Roster */}
      {isLoading ? (
        <LoadingState message="ACCESSING DISPUTE ARCHIVES & EVIDENCE VAULT..." />
      ) : filteredDisputes.length === 0 ? (
        <EmptyState
          title="NO GRIEVANCES MATCH FILTER"
          message="No active or pending grievances match the selected filter."
        />
      ) : (
        <div className="bg-white border-2 border-[var(--ink)] divide-y divide-[var(--ink-10)]">
          {filteredDisputes.map((d) => (
            <div key={d.id} className="p-5 hover:bg-[var(--paper)] transition-none">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-[#FFF3EB] text-[#C04205] border border-[#E8540A] px-2 py-0.5 rounded-[2px]">
                      {d.category}
                    </span>
                    <span className="font-data text-xs text-[var(--ink-60)]">
                      REF #{d.dispute_ref || d.id.slice(0, 8).toUpperCase()} · Filed {new Date(d.created_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>

                  <h3 className="text-base font-bold uppercase text-[var(--ink)] mt-1.5">
                    {d.projects?.name || 'Worksite Project Claim'}
                  </h3>

                  <div className="text-xs text-[var(--ink-60)] mt-0.5">
                    Worker: <strong>{d.workers?.full_name || 'Worker ' + d.worker_id.slice(0, 8)}</strong> ({d.workers?.skill_category || 'Skilled'}) · Contractor: <strong>{d.contractors?.company_name || 'Builder Firm'}</strong>
                  </div>
                  <div className="text-xs font-mono font-bold text-[var(--ink)] mt-1">
                    Claimed Wage Shortfall: {formatRupees(d.amount_claimed_paise || 0)}
                  </div>
                </div>

                <div className="flex sm:flex-col items-end gap-2">
                  <StatusPill status={d.status} />
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={() => handleOpenCase(d)}
                  >
                    {d.status === 'RESOLVED' ? 'INSPECT CASE & RULING' : 'INSPECT CASE & ADJUDICATE'}
                  </Button>
                </div>
              </div>

              {/* Worker statement snippet */}
              <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-10)] text-xs mb-2">
                <span className="text-[10px] font-bold uppercase text-[var(--ink-60)] block mb-1">
                  WORKER STATEMENT OF ALLEGATION
                </span>
                <p className="whitespace-pre-wrap">{d.description}</p>
                {d.voice_transcription && (
                  <div className="mt-1.5 font-sans text-[11px] text-[var(--ink-60)]">
                    <strong>Voice Note Transcript:</strong> {d.voice_transcription}
                  </div>
                )}
              </div>

              {/* Contractor counter-statement snippet if available */}
              {d.contractor_counter_statement && (
                <div className="p-3 bg-[#EAF1F8] border border-[var(--register-blue)] text-xs text-[var(--ink)] mb-2">
                  <span className="text-[10px] font-bold uppercase text-[var(--register-blue)] block mb-1">
                    CONTRACTOR COUNTER-STATEMENT
                  </span>
                  <p>{d.contractor_counter_statement}</p>
                </div>
              )}

              {/* Ruling snippet if resolved */}
              {d.ruling_decision && (
                <div className={`p-3 border text-xs ${
                  d.ruling_decision === 'DISMISS'
                    ? 'bg-[#FEF2F2] border-[#B91C1C] text-[#991B1B]'
                    : 'bg-[#EBF7F0] border-[#1E7A4B] text-[#155A36]'
                }`}>
                  <span className="text-[10px] font-bold uppercase block mb-0.5">
                    TRIBUNAL RULING · {d.ruling_decision}
                  </span>
                  <p className="font-semibold">{d.ruling_reason}</p>
                  {d.ordered_amount_paise > 0 && (
                    <div className="text-[11px] mt-1 font-mono">
                      Payment Order: {formatRupees(d.ordered_amount_paise)} · Deadline: {d.order_payment_deadline ? new Date(d.order_payment_deadline).toLocaleDateString('en-IN') : 'Immediate'}
                    </div>
                  )}
                  {d.is_deadline_missed && (
                    <div className="text-[11px] font-bold text-[#B91C1C] mt-1">
                      ⚠ Order deadline missed. Contractor flagged as NON-COMPLIANT in state compliance records.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Case View & Adjudication Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 overflow-y-auto">
          <div className="bg-white border-2 border-[var(--ink)] max-w-4xl w-full p-6 text-[var(--ink)] shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="border-b-2 border-[var(--ink-20)] pb-4 mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase text-[#1E7A4B] font-mono">
                  LABOUR ARBITRATION TRIBUNAL · CASE FILE #{selectedDispute.dispute_ref || selectedDispute.id.slice(0, 8)}
                </div>
                <h2 className="text-xl font-bold uppercase">Statutory Arbitration Hearing & Case Dossier</h2>
                <div className="text-xs text-[var(--ink-60)] mt-0.5">
                  Worker: {selectedDispute.workers?.full_name || 'Worker'} · Contractor: {selectedDispute.contractors?.company_name || 'Contractor'} · Project: {selectedDispute.projects?.name || 'Project'}
                </div>
              </div>
              <button
                onClick={() => setSelectedDispute(null)}
                className="text-[var(--ink-60)] hover:text-[var(--ink)] p-2"
              >
                <Icons.X size={24} />
              </button>
            </div>

            {isLoadingDetail ? (
              <LoadingState message="COMPILING STATUTORY CASE DOSSIER & EVIDENCE CHAIN..." />
            ) : (
              <div className="space-y-6 text-xs">
                {/* SECTION 1: STATUTORY SHORTFALL BREAKDOWN */}
                <div className="p-4 bg-[var(--paper-dark)] border-2 border-[var(--ink)] space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--ink-20)] pb-2">
                    <span className="font-bold uppercase text-xs text-[var(--ink)]">
                      1. AUTO-COMPUTED STATUTORY SHORTFALL BREAKDOWN
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#1E7A4B]">
                      Muster & Ledger Reconciled
                    </span>
                  </div>

                  {disputeDetail?.evidenceSnapshot?.automated_analysis ? (
                    (() => {
                      const a = disputeDetail.evidenceSnapshot.automated_analysis;
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                          <div className="p-2.5 bg-white border border-[var(--ink-20)]">
                            <span className="text-[10px] text-[var(--ink-60)] uppercase block">Daily Statutory Wage</span>
                            <span className="font-mono font-bold text-sm">₹{a.dailyWageRupees}</span>
                          </div>
                          <div className="p-2.5 bg-white border border-[var(--ink-20)]">
                            <span className="text-[10px] text-[var(--ink-60)] uppercase block">Verified Work Shifts</span>
                            <span className="font-mono font-bold text-sm">{a.verifiedAttendanceDaysCount} shifts</span>
                          </div>
                          <div className="p-2.5 bg-white border border-[var(--ink-20)]">
                            <span className="text-[10px] text-[var(--ink-60)] uppercase block">Expected Wage Total</span>
                            <span className="font-mono font-bold text-sm text-[var(--ink)]">₹{a.totalEarnedRupees}</span>
                          </div>
                          <div className="p-2.5 bg-[#FFF3EB] border border-[#E8540A]">
                            <span className="text-[10px] text-[#C04205] uppercase font-bold block">Computed Shortfall</span>
                            <span className="font-mono font-bold text-sm text-[#C04205]">₹{a.outstandingRupees}</span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-2.5 bg-white border border-[var(--ink-20)]">
                        <span className="text-[10px] text-[var(--ink-60)] uppercase block">Amount Claimed by Worker</span>
                        <span className="font-mono font-bold text-sm text-[#C04205]">{formatRupees(selectedDispute.amount_claimed_paise || 0)}</span>
                      </div>
                      <div className="p-2.5 bg-white border border-[var(--ink-20)]">
                        <span className="text-[10px] text-[var(--ink-60)] uppercase block">Grievance Category</span>
                        <span className="font-mono font-bold text-sm">{selectedDispute.category}</span>
                      </div>
                      <div className="p-2.5 bg-white border border-[var(--ink-20)]">
                        <span className="text-[10px] text-[var(--ink-60)] uppercase block">Contractor Compliance</span>
                        <span className="font-mono font-bold text-sm">{selectedDispute.contractors?.compliance_status || 'COMPLIANT'}</span>
                      </div>
                    </div>
                  )}

                  {disputeDetail?.evidenceSnapshot?.automated_analysis?.analysisSummary && (
                    <div className="p-2 bg-white border border-[var(--ink-20)] text-[11px] font-sans">
                      <strong>Audit Engine Finding:</strong> {disputeDetail.evidenceSnapshot.automated_analysis.analysisSummary}
                    </div>
                  )}
                </div>

                {/* SECTION 2: STATUTORY TIMELINE */}
                <div className="border-2 border-[var(--ink)] p-4 bg-white space-y-3">
                  <span className="font-bold uppercase text-xs text-[var(--ink)] block border-b border-[var(--ink-20)] pb-2">
                    2. PROCEDURAL CHRONOLOGY & CASE TIMELINE
                  </span>

                  <div className="relative border-l-2 border-[var(--ink-40)] ml-3 pl-5 space-y-4">
                    {/* Event 1: Dispute Raised */}
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-[var(--site-orange)] border-2 border-white" />
                      <div className="font-bold uppercase text-[11px] text-[var(--ink)]">Grievance Filed by Worker</div>
                      <div className="text-[10px] text-[var(--ink-60)] font-mono">
                        {new Date(selectedDispute.created_at).toLocaleString('en-IN')} · Amount Claimed: {formatRupees(selectedDispute.amount_claimed_paise || 0)}
                      </div>
                    </div>

                    {/* Event 2: Evidence Snapshot Captured */}
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-[var(--register-blue)] border-2 border-white" />
                      <div className="font-bold uppercase text-[11px] text-[var(--ink)]">Immutable Evidence Snapshot Frozen</div>
                      <div className="text-[10px] text-[var(--ink-60)] font-mono">
                        Attendance muster rows, wage ledger transactions, and tamper-evident cryptographic hash chain captured.
                      </div>
                    </div>

                    {/* Event 3: Contractor Response Window */}
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-[var(--site-yellow)] border-2 border-white" />
                      <div className="font-bold uppercase text-[11px] text-[var(--ink)]">Employer Response Window (5 Days)</div>
                      <div className="text-[10px] text-[var(--ink-60)] font-mono">
                        {selectedDispute.contractor_responded_at ? (
                          <span className="text-[#1E7A4B] font-bold">
                            ✓ Employer counter-statement submitted on {new Date(selectedDispute.contractor_responded_at).toLocaleDateString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-[#C04205]">
                            Awaiting employer response. Window deadline: {selectedDispute.contractor_response_deadline ? new Date(selectedDispute.contractor_response_deadline).toLocaleDateString('en-IN') : '5 days'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Event 4: Tribunal Ruling (if already resolved) */}
                    {selectedDispute.ruling_issued_at && (
                      <div className="relative">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-[#1E7A4B] border-2 border-white" />
                        <div className="font-bold uppercase text-[11px] text-[#1E7A4B]">Tribunal Arbitration Ruling Issued</div>
                        <div className="text-[10px] text-[var(--ink-60)] font-mono">
                          {new Date(selectedDispute.ruling_issued_at).toLocaleString('en-IN')} · Ruling: {selectedDispute.ruling_decision}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 3: BOTH PARTIES' STATEMENTS & EVIDENCE */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Worker Statement & Evidence */}
                  <div className="border-2 border-[var(--ink)] p-3 bg-white space-y-2">
                    <span className="font-bold uppercase text-xs text-[var(--site-orange)] block border-b border-[var(--ink-20)] pb-1">
                      WORKER ALLEGATION & EVIDENCE
                    </span>
                    <p className="whitespace-pre-wrap leading-relaxed">{selectedDispute.description}</p>

                    {selectedDispute.voice_transcription && (
                      <div className="p-2 bg-[var(--paper-dark)] border border-[var(--ink-20)] text-[11px]">
                        <strong>Voice Note Transcript:</strong> {selectedDispute.voice_transcription}
                      </div>
                    )}

                    {selectedDispute.evidence_voice_url && (
                      <div className="p-2 bg-[var(--paper-dark)] border border-[var(--ink-20)] flex items-center gap-2">
                        <Icons.Mic size={14} className="text-[var(--site-orange)]" />
                        <audio controls src={selectedDispute.evidence_voice_url} className="h-7 w-full" />
                      </div>
                    )}

                    {selectedDispute.evidence_photo_url && (
                      <div className="mt-2">
                        <span className="text-[10px] font-bold uppercase text-[var(--ink-60)] block mb-1">Attached Photo:</span>
                        <img src={selectedDispute.evidence_photo_url} alt="Worker evidence" className="h-28 w-auto object-cover border border-[var(--ink)]" />
                      </div>
                    )}

                    <div className="text-[10px] text-[var(--ink-60)] font-mono pt-1">
                      Auto-attached: {selectedDispute.linked_attendance_event_ids?.length || 0} muster punch rows, {selectedDispute.linked_ledger_entry_ids?.length || 0} ledger transaction IDs.
                    </div>
                  </div>

                  {/* Contractor Statement & Evidence */}
                  <div className="border-2 border-[var(--ink)] p-3 bg-white space-y-2">
                    <span className="font-bold uppercase text-xs text-[var(--register-blue)] block border-b border-[var(--ink-20)] pb-1">
                      CONTRACTOR COUNTER-STATEMENT & DEFENSE
                    </span>
                    {selectedDispute.contractor_counter_statement ? (
                      <div>
                        <p className="whitespace-pre-wrap leading-relaxed">{selectedDispute.contractor_counter_statement}</p>
                        {selectedDispute.contractor_evidence_url && (
                          <div className="mt-2 p-2 bg-[var(--paper-dark)] text-[11px] font-mono">
                            Counter-Evidence: <a href={selectedDispute.contractor_evidence_url} target="_blank" rel="noreferrer" className="text-[var(--register-blue)] underline">{selectedDispute.contractor_evidence_url}</a>
                          </div>
                        )}
                        <div className="text-[10px] text-[var(--ink-60)] mt-2 font-mono">
                          Submitted on: {new Date(selectedDispute.contractor_responded_at).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-[var(--paper-dark)] text-center text-[var(--ink-60)] italic">
                        No counter-statement submitted by contractor yet. Response window remains open.
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 4: TRIBUNAL RULING ACTIONS */}
                <div className="border-2 border-[var(--ink)] p-4 bg-[#FFFDF5] space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--ink-20)] pb-2">
                    <span className="font-bold uppercase text-xs text-[var(--ink)]">
                      3. OFFICIAL ARBITRATION TRIBUNAL RULING ACTIONS
                    </span>
                    <span className="text-[10px] font-bold text-[#1E7A4B] font-mono">
                      Statutory Authority: ID Act Sec 10
                    </span>
                  </div>

                  <form onSubmit={handleIssueRuling} className="space-y-4">
                    {/* Action Selector */}
                    <div>
                      <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                        SELECT TRIBUNAL RULING ACTION *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setRulingDecision('ORDER_PAYMENT')}
                          className={`p-2.5 text-xs font-bold uppercase border-2 text-center transition-none ${
                            rulingDecision === 'ORDER_PAYMENT'
                              ? 'bg-[#1E7A4B] text-white border-[#1E7A4B]'
                              : 'bg-white border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink-5)]'
                          }`}
                        >
                          1. ORDER PAYMENT
                        </button>
                        <button
                          type="button"
                          onClick={() => setRulingDecision('PARTIAL_SETTLEMENT')}
                          className={`p-2.5 text-xs font-bold uppercase border-2 text-center transition-none ${
                            rulingDecision === 'PARTIAL_SETTLEMENT'
                              ? 'bg-[#D97706] text-white border-[#D97706]'
                              : 'bg-white border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink-5)]'
                          }`}
                        >
                          2. PARTIAL SETTLEMENT
                        </button>
                        <button
                          type="button"
                          onClick={() => setRulingDecision('DISMISS')}
                          className={`p-2.5 text-xs font-bold uppercase border-2 text-center transition-none ${
                            rulingDecision === 'DISMISS'
                              ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                              : 'bg-white border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink-5)]'
                          }`}
                        >
                          3. DISMISS CLAIM
                        </button>
                      </div>
                    </div>

                    {/* Conditional Amount & Deadline Inputs */}
                    {(rulingDecision === 'ORDER_PAYMENT' || rulingDecision === 'PARTIAL_SETTLEMENT') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white border border-[var(--ink-20)]">
                        <div>
                          <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                            ORDERED PAYMENT AMOUNT (₹ RUPEES) *
                          </label>
                          <input
                            type="number"
                            value={orderedAmountRupees}
                            onChange={(e) => setOrderedAmountRupees(e.target.value)}
                            min="1"
                            step="1"
                            placeholder="e.g. 1800"
                            className="w-full border-2 border-[var(--ink)] p-2 font-mono font-bold text-xs"
                            required
                          />
                          <span className="text-[10px] text-[var(--ink-60)]">
                            Creates a double-entry reversing ledger row in wage ledger ({rupeesToPaise(Number(orderedAmountRupees || 0))} paise).
                          </span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                            COMPLIANCE DEADLINE (DAYS) *
                          </label>
                          <select
                            value={deadlineDays}
                            onChange={(e) => setDeadlineDays(Number(e.target.value))}
                            className="w-full border border-[var(--ink)] p-2 text-xs font-semibold bg-white"
                          >
                            <option value={1}>24 HOURS (URGENT)</option>
                            <option value={2}>48 HOURS (STATUTORY STANDARD)</option>
                            <option value={5}>5 DAYS</option>
                            <option value={7}>7 DAYS</option>
                          </select>
                          <span className="text-[10px] text-[var(--ink-60)]">
                            Missed deadline automatically flags employer as NON-COMPLIANT.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Ruling Statement & Reason */}
                    <div>
                      <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                        OFFICIAL TRIBUNAL RULING DIRECTIVE / REASON *
                      </label>
                      <textarea
                        value={rulingReason}
                        onChange={(e) => setRulingReason(e.target.value)}
                        placeholder="e.g. Employer failed to produce biometric punch logs for 12-13th; verified shift records confirm worker was present. Employer ordered to disburse ₹1,800 within 48 hours."
                        rows={3}
                        className="w-full border-2 border-[var(--ink)] p-2.5 text-xs font-sans outline-none focus:bg-[#FFFDF5]"
                        required
                      />
                    </div>

                    {/* Internal Audit Note */}
                    <div>
                      <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                        INTERNAL LABOUR OFFICER AUDIT NOTE
                      </label>
                      <input
                        type="text"
                        value={officerNotes}
                        onChange={(e) => setOfficerNotes(e.target.value)}
                        placeholder="e.g. Telephonic hearing conducted with contractor site manager Ramesh."
                        className="w-full border border-[var(--ink)] p-2 text-xs"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        fullWidth
                        onClick={() => setSelectedDispute(null)}
                      >
                        CLOSE CASE DOSSIER
                      </Button>
                      <Button
                        type="submit"
                        variant={rulingDecision === 'DISMISS' ? 'danger' : 'verified'}
                        size="md"
                        fullWidth
                        isLoading={isSubmittingRuling}
                      >
                        EXECUTE STATUTORY TRIBUNAL RULING
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
