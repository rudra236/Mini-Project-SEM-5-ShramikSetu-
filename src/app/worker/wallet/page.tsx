'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';
import { ReadAloudButton } from '@/components/ui/ReadAloudButton';
import { TextToSpeechService } from '@/lib/services/tts-service';
import { saveCachedBalance, getCachedBalance } from '@/lib/offline-cache';

export default function WorkerWalletPage() {
  const { user, locale, t } = useAuth();

  const [financialSummary, setFinancialSummary] = useState<any | null>(() => getCachedBalance()?.data || null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [projectBreakdowns, setProjectBreakdowns] = useState<any[]>([]);
  const [availableProjects, setAvailableProjects] = useState<{ id: string; name: string }[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(!getCachedBalance()?.data);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [txFilter, setTxFilter] = useState<'ALL' | 'ACCRUAL' | 'PAYMENT' | 'WITHDRAWAL'>('ALL');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Expanded project accordion state
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  // Withdrawal Modal State
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAmountRupees, setWithdrawAmountRupees] = useState<string>('');
  const [destinationType, setDestinationType] = useState<'UPI' | 'BANK_TRANSFER'>('UPI');
  const [destinationValue, setDestinationValue] = useState<string>('');
  const [simulateWithdrawFailure, setSimulateWithdrawFailure] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Dispute modal state
  const [disputeTxId, setDisputeTxId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [workerNotes, setWorkerNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchWalletData = async () => {
    try {
      setIsLoading(true);
      setActionError(null);

      const timelineRes = await api.ledger.getTimeline();
      if (timelineRes.success) {
        setFinancialSummary(timelineRes.financialSummary);
        setTimeline(timelineRes.timeline || []);
        setPendingClaims(timelineRes.pendingClaims || []);
        setProjectBreakdowns(timelineRes.projectBreakdowns || []);
        setAvailableProjects(timelineRes.projects || []);
        setAvailableMonths(timelineRes.months || []);
        saveCachedBalance(timelineRes.financialSummary);
      }
    } catch (err: any) {
      // Fallback to earnings + payments summary
      try {
        const [earningsRes, paymentsRes] = await Promise.allSettled([
          api.earnings.get({ snapshot: true }),
          api.payments.getSummary(),
        ]);

        if (earningsRes.status === 'fulfilled' && earningsRes.value.success) {
          setFinancialSummary(earningsRes.value);
          saveCachedBalance(earningsRes.value);
        }

        if (paymentsRes.status === 'fulfilled' && paymentsRes.value.success) {
          const txs = paymentsRes.value.transactions || [];
          const claims = txs.filter(
            (t: any) => t.status === 'PAID_CLAIMED' || (!t.payment_confirmations?.length && t.status !== 'SUCCESS')
          );
          setPendingClaims(claims);
        }
      } catch (fallbackErr: any) {
        setActionError(fallbackErr.message || t.common.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, []);

  // Filtered timeline based on Type, Project, and Month
  const filteredTimeline = useMemo(() => {
    return timeline.filter((item) => {
      // Type Filter
      if (txFilter === 'ACCRUAL' && item.type !== 'ACCRUAL') return false;
      if (txFilter === 'PAYMENT' && !item.type.startsWith('PAYMENT')) return false;
      if (txFilter === 'WITHDRAWAL' && item.type !== 'WITHDRAWAL' && item.type !== 'ADJUSTMENT') return false;

      // Project Filter
      if (selectedProjectId !== 'ALL') {
        const projMatch =
          item.projectId === selectedProjectId ||
          (item.projectName && availableProjects.find((p) => p.id === selectedProjectId)?.name === item.projectName);
        if (!projMatch && item.type !== 'WITHDRAWAL' && item.type !== 'ADJUSTMENT') return false;
      }

      // Month Filter
      if (selectedMonth !== 'ALL') {
        if (!item.date || !item.date.startsWith(selectedMonth)) return false;
      }

      return true;
    });
  }, [timeline, txFilter, selectedProjectId, selectedMonth, availableProjects]);

  // Derived financials
  const totalEarnedPaise = financialSummary?.totalEarnedPaise || 0;
  const totalPaidPaise = financialSummary?.totalPaidPaise || 0;
  const outstandingPaise = financialSummary?.outstandingPaise || 0;
  const totalWithdrawnPaise = financialSummary?.totalWithdrawnPaise || 0;
  const walletBalancePaise = financialSummary?.walletBalancePaise ?? Math.max(0, totalPaidPaise - totalWithdrawnPaise);
  const verifiedDaysCount = financialSummary?.verifiedDaysCount || 0;

  const walletBalanceRupees = Math.round(walletBalancePaise / 100);
  const unpaidRupees = Math.round(outstandingPaise / 100);
  const totalEarnedRupees = Math.round(totalEarnedPaise / 100);
  const confirmedPaidRupees = Math.round(totalPaidPaise / 100);

  const balanceSpoken = TextToSpeechService.buildBalanceText({
    unpaidRupees,
    totalEarnedRupees,
    confirmedPaidRupees,
    shiftsCount: verifiedDaysCount,
    locale,
  });

  // Open Withdraw Modal
  const openWithdrawModal = () => {
    setWithdrawError(null);
    setWithdrawAmountRupees(String(walletBalanceRupees > 0 ? walletBalanceRupees : ''));
    setDestinationValue('');
    setSimulateWithdrawFailure(false);
    setIsWithdrawOpen(true);
  };

  // Submit Withdrawal
  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError(null);

    const amountPaise = rupeesToPaise(withdrawAmountRupees);
    if (amountPaise <= 0) {
      setWithdrawError('Withdrawal amount must be greater than zero.');
      return;
    }

    if (amountPaise > walletBalancePaise) {
      setWithdrawError(
        `Insufficient balance: Requested ${formatRupees(amountPaise, true)} exceeds available wallet balance of ${formatRupees(walletBalancePaise, true)}.`
      );
      return;
    }

    if (!destinationValue.trim()) {
      setWithdrawError('Please enter a destination UPI ID or Bank Account Number.');
      return;
    }

    try {
      setIsWithdrawing(true);
      const idempotencyKey = `wth_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const res = await api.wallet.withdraw({
        amountPaise,
        destinationType,
        destinationValue: destinationValue.trim(),
        idempotencyKey,
        simulateFailure: simulateWithdrawFailure,
      });

      if (res.status === 'FAILED' || res.reversed) {
        setSuccessMessage(null);
        setActionError(
          res.message || t.wallet.withdrawFailed || 'Withdrawal failed. Balance restored via reversing ledger entry.'
        );
      } else {
        setActionError(null);
        setSuccessMessage(
          res.message || t.wallet.withdrawSuccess || 'Withdrawal transferred successfully!'
        );
      }

      setIsWithdrawOpen(false);
      await fetchWalletData();
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal request failed.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Worker confirms payment (one-tap)
  const handleConfirmPayment = async (transactionId: string) => {
    try {
      setIsProcessing(true);
      setActionError(null);
      await api.payments.confirm({
        transactionId,
        isConfirmed: true,
      });
      setSuccessMessage(t.wallet.oneTapConfirmSuccess);
      await fetchWalletData();
    } catch (err: any) {
      setActionError(err.message || t.common.error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Worker disputes payment
  const handleOneTapDispute = async (transactionId: string) => {
    try {
      setIsProcessing(true);
      setActionError(null);
      await api.payments.confirm({
        transactionId,
        isConfirmed: false,
        disputeReason: 'Payment not received in account or cash by worker',
      });
      setSuccessMessage(t.wallet.oneTapDisputeSuccess);
      await fetchWalletData();
    } catch (err: any) {
      setActionError(err.message || t.common.error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Detailed dispute modal submission
  const handleSubmitDetailedDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeTxId) return;

    try {
      setIsProcessing(true);
      setActionError(null);
      await api.payments.confirm({
        transactionId: disputeTxId,
        isConfirmed: false,
        disputeReason: disputeReason || 'Payment claimed by contractor not received',
        workerNotes,
      });
      setSuccessMessage(t.wallet.oneTapDisputeSuccess);
      setDisputeTxId(null);
      setDisputeReason('');
      setWorkerNotes('');
      await fetchWalletData();
    } catch (err: any) {
      setActionError(err.message || t.common.error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading && !financialSummary) {
    return <LoadingState message={t.common.loading} skeleton />;
  }

  return (
    <div className="w-full space-y-4">
      {/* TEST MODE BANNER */}
      <div className="bg-[#FFFBEB] border-2 border-[var(--site-orange)] p-3 text-xs font-black uppercase tracking-wider text-[var(--site-orange)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-base">🧪</span>
          <span>SANDBOX MODE ACTIVE — WAGE LEDGER &amp; WALLET</span>
        </div>
        <span className="bg-[var(--site-orange)] text-white px-2 py-0.5 text-[10px] self-start sm:self-auto font-mono">
          DEMO_MODE=true
        </span>
      </div>

      {/* Header */}
      <div className="p-4 bg-[var(--paper-dark)] border-b-2 border-[var(--ink)] flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold uppercase text-[var(--ink)]">
            {t.wallet.title}
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-0.5">
            {t.wallet.subtitle}
          </p>
        </div>
        <ReadAloudButton
          text={balanceSpoken}
          locale={locale}
          variant="primary"
        />
      </div>

      {successMessage && (
        <div
          role="status"
          className="p-4 bg-[#EBF7F0] border-2 border-[#1E7A4B] text-[#155A36] text-xs sm:text-sm font-bold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Icons.CheckCircle size={20} />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 min-h-[48px] min-w-[48px] flex items-center justify-center text-[#155A36] hover:bg-black/5"
            aria-label={t.common.close}
          >
            <Icons.X size={18} />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="p-4 bg-[#FEF2F2] border-2 border-[#B91C1C] text-[#991B1B] text-xs sm:text-sm font-bold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Icons.AlertTriangle size={20} />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="p-1 min-h-[48px] min-w-[48px] flex items-center justify-center text-[#991B1B] hover:bg-black/5"
            aria-label={t.common.close}
          >
            <Icons.X size={18} />
          </button>
        </div>
      )}

      {/* ─── 4 SUMMARY CARDS: BALANCE, EARNED, PAID, PENDING ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: WALLET BALANCE (Hero) */}
        <div className="p-4 bg-white border-2 border-[var(--ink)] border-t-8 border-t-[#1E7A4B] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-60)]">
                {t.wallet.walletBalanceCard}
              </span>
              <span className="text-xs">💳</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-extrabold text-[#1E7A4B] mt-1">
              {formatRupees(walletBalancePaise, true)}
            </div>
            <p className="text-[11px] text-[var(--ink-60)] mt-1">
              {t.wallet.walletBalanceDesc}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-[var(--ink-10)]">
            <Button
              variant="verified"
              size="sm"
              fullWidth
              onClick={openWithdrawModal}
              disabled={walletBalancePaise <= 0}
            >
              <Icons.ArrowUpRight size={14} className="mr-1.5" />
              {t.wallet.withdrawBtn}
            </Button>
          </div>
        </div>

        {/* Card 2: PENDING WAGES (DUE) */}
        <div className="p-4 bg-white border-2 border-[var(--ink)] border-t-8 border-t-[var(--site-orange)] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-60)]">
                {t.wallet.pendingDueCard}
              </span>
              <span className="text-xs">⏳</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-extrabold text-[var(--site-orange)] mt-1">
              {formatRupees(outstandingPaise, true)}
            </div>
            <p className="text-[11px] text-[var(--ink-60)] mt-1">
              {t.wallet.pendingDueDesc}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-[var(--ink-10)]">
            <Link href="/worker/disputes" className="block w-full">
              <Button variant="warning" size="sm" fullWidth disabled={outstandingPaise <= 0}>
                <Icons.AlertTriangle size={14} className="mr-1.5" />
                {t.wallet.disputeUnpaidWagesBtn}
              </Button>
            </Link>
          </div>
        </div>

        {/* Card 3: TOTAL EARNED */}
        <div className="p-4 bg-white border-2 border-[var(--ink)] border-t-8 border-t-[#0F172A] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-60)]">
                {t.wallet.totalEarnedCard}
              </span>
              <span className="text-xs">🏗️</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-extrabold text-[var(--ink)] mt-1">
              {formatRupees(totalEarnedPaise, true)}
            </div>
            <p className="text-[11px] text-[var(--ink-60)] mt-1">
              {verifiedDaysCount} {t.common.days} {t.status.verified}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-[var(--ink-10)] text-[11px] font-mono text-[var(--ink-60)]">
            {t.wallet.typeAccrual}
          </div>
        </div>

        {/* Card 4: TOTAL PAID OUT */}
        <div className="p-4 bg-white border-2 border-[var(--ink)] border-t-8 border-t-blue-600 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-60)]">
                {t.wallet.confirmedPaidCard}
              </span>
              <span className="text-xs">✓</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-extrabold text-blue-700 mt-1">
              {formatRupees(totalPaidPaise, true)}
            </div>
            <p className="text-[11px] text-[var(--ink-60)] mt-1">
              Withdrawn: {formatRupees(totalWithdrawnPaise, true)}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-[var(--ink-10)] text-[11px] font-mono text-emerald-700 font-bold">
            ✓ Double-entry settled
          </div>
        </div>
      </div>

      {/* ─── PENDING CLAIMS ACTION CENTER (IF CONTRACTOR CLAIMED) ─── */}
      {pendingClaims.length > 0 && (
        <div className="p-4 sm:p-5 bg-[#FEF2F2]/70 border-2 border-[#B91C1C] rounded-[2px] space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#B91C1C] animate-pulse" />
            <h2 className="text-xs sm:text-sm font-bold font-mono uppercase tracking-widest text-[#B91C1C]">
              {t.wallet.claimActionTitle} ({pendingClaims.length})
            </h2>
          </div>
          <p className="text-xs text-[var(--ink-60)]">
            {t.wallet.claimActionDesc}
          </p>

          <div className="space-y-3 pt-1">
            {pendingClaims.map((claim: any) => {
              const amountDisplay = formatRupees(claim.amount_paise, true);
              const contractor = claim.contractorName || claim.contractors?.company_name || t.roles.CONTRACTOR;
              const dateStr = new Date(claim.claimed_at || claim.created_at).toLocaleDateString(
                locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN',
                { day: 'numeric', month: 'short', year: 'numeric' }
              );

              return (
                <div
                  key={claim.id}
                  className="p-4 bg-white border-2 border-[#B91C1C] shadow-sm space-y-3 rounded-[2px]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[var(--ink)]">
                        {contractor}: <span className="font-mono text-base font-extrabold text-[#1E7A4B]">{amountDisplay}</span> ({dateStr})
                      </div>
                      <div className="text-[11px] font-mono text-[var(--ink-60)] mt-0.5">
                        Ref: #{claim.reference_number || claim.transaction_ref}
                      </div>
                    </div>

                    {claim.proof_url && (
                      <a
                        href={claim.proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--register-blue)] underline hover:text-blue-800 min-h-[48px]"
                      >
                        <Icons.ShieldCheck size={16} />
                        {t.wallet.viewProofBtn}
                      </a>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--ink-10)] flex flex-col sm:flex-row gap-2.5">
                    <button
                      onClick={() => handleConfirmPayment(claim.id)}
                      disabled={isProcessing}
                      className="flex-1 min-h-[48px] py-3 px-4 bg-[#1E7A4B] text-white font-bold text-xs sm:text-sm uppercase hover:bg-[#165B37] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 rounded-[2px]"
                    >
                      <Icons.CheckCircle size={18} />
                      <span>{t.wallet.confirmPaymentBtn}</span>
                    </button>

                    <button
                      onClick={() => handleOneTapDispute(claim.id)}
                      disabled={isProcessing}
                      className="flex-1 min-h-[48px] py-3 px-4 bg-white text-[#B91C1C] border-2 border-[#B91C1C] font-bold text-xs sm:text-sm uppercase hover:bg-[#FEF2F2] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 rounded-[2px]"
                    >
                      <Icons.AlertTriangle size={18} />
                      <span>{t.wallet.didNotReceiveBtn}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── WAGE BREAKDOWN PER PROJECT (DAYS × RATE = AMOUNT) ─── */}
      {projectBreakdowns.length > 0 && (
        <div className="bg-white border-2 border-[var(--ink)] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b-2 border-[var(--ink)] pb-3">
            <h2 className="text-sm sm:text-base font-bold uppercase text-[var(--ink)]">
              {t.wallet.wageBreakdownTitle}
            </h2>
            <span className="text-xs font-mono text-[var(--ink-60)]">
              {projectBreakdowns.length} active sites
            </span>
          </div>

          <div className="divide-y divide-[var(--ink-10)]">
            {projectBreakdowns.map((proj, idx) => {
              const isExpanded = expandedProjectId === proj.projectId;
              return (
                <div key={`${proj.projectId}-${idx}`} className="py-3.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[var(--ink)]">{proj.projectName}</div>
                      <div className="text-xs text-[var(--ink-60)] font-mono">
                        {proj.contractorName} · Rate: {formatRupees(proj.dailyWagePaise, true)}/day
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-[#1E7A4B]">
                          {proj.verifiedDaysCount} days × {formatRupees(proj.dailyWagePaise, true)} = {formatRupees(proj.totalEarnedPaise, true)}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--site-orange)] font-semibold">
                          Due: {formatRupees(proj.outstandingPaise, true)} · Paid: {formatRupees(proj.totalPaidPaise, true)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedProjectId(isExpanded ? null : proj.projectId)}
                        className="p-2 border border-[var(--ink)] hover:bg-[var(--paper-dark)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-xs font-mono font-bold"
                        aria-label={t.wallet.tapToViewDates}
                      >
                        {isExpanded ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Accordion: Verified Dates Worked */}
                  {isExpanded && (
                    <div className="mt-2 p-3 bg-[var(--paper)] border border-[var(--ink-20)] space-y-2">
                      <div className="text-xs font-bold uppercase text-[var(--ink-80)]">
                        {t.wallet.datesWorked} ({proj.datesWorked.length} verified shifts):
                      </div>
                      {proj.datesWorked.length === 0 ? (
                        <p className="text-xs text-[var(--ink-60)]">No shifts logged on this project yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-1">
                          {proj.datesWorked.map((dtStr: string) => (
                            <div
                              key={dtStr}
                              className="p-1.5 bg-white border border-[var(--ink-10)] text-[11px] font-mono flex items-center justify-between"
                            >
                              <span>{dtStr}</span>
                              <span className="text-[#1E7A4B] font-bold">✓</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TRANSACTION LEDGER WITH FILTERS ─── */}
      <div className="bg-white border-2 border-[var(--ink)]">
        <div className="p-4 border-b-2 border-[var(--ink)] bg-[var(--paper)] flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold uppercase text-[var(--ink)]">
              {t.workerPortal.wageLedger} ({filteredTimeline.length})
            </h2>

            {/* Filter Dropdowns: Project & Month */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Project Filter */}
              {availableProjects.length > 0 && (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="min-h-[44px] border-2 border-[var(--ink)] px-2.5 py-1.5 text-xs bg-white font-semibold"
                >
                  <option value="ALL">{t.wallet.allProjects}</option>
                  {availableProjects.map((p, pIdx) => (
                    <option key={`${p.id}-${pIdx}`} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Month Filter */}
              {availableMonths.length > 0 && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="min-h-[44px] border-2 border-[var(--ink)] px-2.5 py-1.5 text-xs bg-white font-semibold"
                >
                  <option value="ALL">{t.wallet.allMonths}</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Type Segmented Buttons */}
          <div className="flex flex-wrap border-2 border-[var(--ink)] text-xs font-bold uppercase rounded-[2px] overflow-hidden self-start">
            <button
              onClick={() => setTxFilter('ALL')}
              className={`min-h-[44px] px-3.5 transition-colors flex items-center justify-center ${
                txFilter === 'ALL'
                  ? 'bg-[var(--site-orange)] text-white'
                  : 'bg-white text-[var(--ink)] hover:bg-[var(--paper-dark)]'
              }`}
            >
              {t.workerPortal.filterAll}
            </button>
            <button
              onClick={() => setTxFilter('ACCRUAL')}
              className={`min-h-[44px] px-3.5 border-l-2 border-r-2 border-[var(--ink)] transition-colors flex items-center justify-center ${
                txFilter === 'ACCRUAL'
                  ? 'bg-[var(--site-orange)] text-white'
                  : 'bg-white text-[var(--ink)] hover:bg-[var(--paper-dark)]'
              }`}
            >
              {t.wallet.typeAccrual}
            </button>
            <button
              onClick={() => setTxFilter('PAYMENT')}
              className={`min-h-[44px] px-3.5 border-r-2 border-[var(--ink)] transition-colors flex items-center justify-center ${
                txFilter === 'PAYMENT'
                  ? 'bg-[var(--site-orange)] text-white'
                  : 'bg-white text-[var(--ink)] hover:bg-[var(--paper-dark)]'
              }`}
            >
              {t.wallet.typePayment}
            </button>
            <button
              onClick={() => setTxFilter('WITHDRAWAL')}
              className={`min-h-[44px] px-3.5 transition-colors flex items-center justify-center ${
                txFilter === 'WITHDRAWAL'
                  ? 'bg-[var(--site-orange)] text-white'
                  : 'bg-white text-[var(--ink)] hover:bg-[var(--paper-dark)]'
              }`}
            >
              {t.wallet.typeWithdrawal}
            </button>
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <EmptyState
            title={
              locale === 'hi'
                ? 'अभी कोई लेन-देन नहीं है'
                : locale === 'mr'
                ? 'अद्याप कोणतेही व्यवहार नाहीत'
                : 'No transactions yet'
            }
            message={
              locale === 'hi'
                ? 'हाजिरी और मजदूरी भुगतान दर्ज होने पर वे यहाँ दिखाई देंगे।'
                : locale === 'mr'
                ? 'हजेरी आणि मजुरी देयके नोंदवल्यावर ते येथे दिसतील.'
                : 'As attendance and payments are recorded, your transactions will appear here.'
            }
            icon="file"
          />
        ) : (
          <div className="divide-y divide-[var(--ink-10)]">
            {filteredTimeline.map((item) => {
              const isAccrual = item.type === 'ACCRUAL';
              const isPayment = item.type.startsWith('PAYMENT');
              const isWithdrawal = item.type === 'WITHDRAWAL';
              const isAdjustment = item.type === 'ADJUSTMENT';

              return (
                <div key={item.id} className="p-4 hover:bg-[var(--paper)] transition-colors space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono font-black text-sm ${
                          isAccrual || isPayment || isAdjustment
                            ? 'text-[#1E7A4B]'
                            : 'text-[#B91C1C]'
                        }`}
                      >
                        {isWithdrawal ? '- ' : '+ '}
                        {formatRupees(item.amountPaise, true)}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 border font-bold uppercase rounded-[2px] bg-white text-[var(--ink)]">
                        {isAccrual
                          ? t.wallet.typeAccrual
                          : isPayment
                          ? t.wallet.typePayment
                          : isWithdrawal
                          ? t.wallet.typeWithdrawal
                          : t.wallet.typeAdjustment}
                      </span>
                    </div>

                    <StatusPill
                      status={item.statusBadge?.status || 'VERIFIED'}
                      label={item.statusBadge?.label}
                    />
                  </div>

                  <p className="text-xs text-[var(--ink-60)] leading-relaxed">
                    {item.plainLanguageDescription}
                  </p>

                  <div className="text-[10px] font-mono text-[var(--ink-40)]">
                    {new Date(item.date).toLocaleDateString(
                      locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN',
                      { day: 'numeric', month: 'short', year: 'numeric' }
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── WITHDRAW MODAL (SANDBOX ONLY) ─── */}
      {isWithdrawOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-white border-2 border-[var(--ink)] max-w-md w-full p-6 shadow-2xl rounded-[3px] space-y-4">
            <div className="border-b border-[var(--ink-20)] pb-3">
              <div className="text-[10px] font-bold font-mono tracking-widest uppercase text-[#1E7A4B]">
                SANDBOX PAYOUT · त्वरित निकासी
              </div>
              <h3 className="text-lg font-bold uppercase text-[var(--ink)] mt-0.5">
                {t.wallet.withdrawModalTitle}
              </h3>
              <p className="text-xs text-[var(--ink-60)] mt-0.5">
                Available Wallet Balance: <strong className="font-mono text-[#1E7A4B] font-bold text-sm">{formatRupees(walletBalancePaise, true)}</strong>
              </p>
            </div>

            {withdrawError && (
              <div className="p-3 bg-[#FEF2F2] border-l-4 border-l-[#B91C1C] text-[#991B1B] text-xs font-bold">
                ⚠️ {withdrawError}
              </div>
            )}

            <form onSubmit={handleExecuteWithdrawal} className="space-y-4">
              {/* Amount input with quick buttons */}
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                  {t.wallet.withdrawAmountLabel} *
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 border-2 border-r-0 border-[var(--ink)] bg-[var(--paper-dark)] font-bold text-base">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={withdrawAmountRupees}
                    onChange={(e) => setWithdrawAmountRupees(e.target.value)}
                    placeholder="500"
                    min="1"
                    max={walletBalanceRupees}
                    className="w-full border-2 border-[var(--ink)] p-2.5 font-data text-base font-bold outline-none focus:bg-[#FFFDF5]"
                    required
                  />
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setWithdrawAmountRupees(String(walletBalanceRupees))}
                    className="px-2.5 py-1 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 border border-[var(--ink)] text-[var(--ink)]"
                  >
                    {t.wallet.withdrawAll} ({formatRupees(walletBalancePaise, true)})
                  </button>
                  {walletBalanceRupees >= 500 && (
                    <button
                      type="button"
                      onClick={() => setWithdrawAmountRupees('500')}
                      className="px-2.5 py-1 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 border border-[var(--ink)] text-[var(--ink)]"
                    >
                      ₹500
                    </button>
                  )}
                  {walletBalanceRupees >= 1000 && (
                    <button
                      type="button"
                      onClick={() => setWithdrawAmountRupees('1000')}
                      className="px-2.5 py-1 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 border border-[var(--ink)] text-[var(--ink)]"
                    >
                      ₹1,000
                    </button>
                  )}
                </div>
              </div>

              {/* Destination Type */}
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                  {t.wallet.destinationTypeLabel} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDestinationType('UPI')}
                    className={`p-2.5 text-xs font-bold uppercase border-2 transition-colors ${
                      destinationType === 'UPI'
                        ? 'border-[var(--site-orange)] bg-[var(--site-orange)]/10 text-[var(--site-orange)]'
                        : 'border-[var(--ink-20)] text-[var(--ink-60)] hover:border-[var(--ink)]'
                    }`}
                  >
                    {t.wallet.upiOption}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestinationType('BANK_TRANSFER')}
                    className={`p-2.5 text-xs font-bold uppercase border-2 transition-colors ${
                      destinationType === 'BANK_TRANSFER'
                        ? 'border-[var(--site-orange)] bg-[var(--site-orange)]/10 text-[var(--site-orange)]'
                        : 'border-[var(--ink-20)] text-[var(--ink-60)] hover:border-[var(--ink)]'
                    }`}
                  >
                    {t.wallet.bankOption}
                  </button>
                </div>
              </div>

              {/* Destination Input */}
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                  {destinationType === 'UPI' ? 'UPI ID' : 'BANK ACCOUNT NUMBER'} *
                </label>
                <input
                  type="text"
                  value={destinationValue}
                  onChange={(e) => setDestinationValue(e.target.value)}
                  placeholder={
                    destinationType === 'UPI'
                      ? t.wallet.destinationPlaceholderUpi
                      : t.wallet.destinationPlaceholderBank
                  }
                  className="w-full border-2 border-[var(--ink)] p-2.5 text-xs font-mono outline-none focus:bg-[#FFFDF5]"
                  required
                />
              </div>

              {/* Sandbox Failure Simulator Toggle */}
              <div className="p-3 bg-[#FFFDF5] border border-[var(--site-orange)] rounded-[2px] space-y-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--ink)]">
                  <input
                    type="checkbox"
                    checked={simulateWithdrawFailure}
                    onChange={(e) => setSimulateWithdrawFailure(e.target.checked)}
                    className="w-4 h-4 text-[var(--site-orange)] border-2 border-[var(--ink)]"
                  />
                  <span>{t.wallet.simulateFailureToggle}</span>
                </label>
                <p className="text-[10px] text-[var(--ink-60)]">
                  Simulates bank gateway decline to demonstrate atomic reversal and fund restoration.
                </p>
              </div>

              <div className="flex gap-2 pt-2 border-t border-[var(--ink-10)]">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={() => setIsWithdrawOpen(false)}
                  disabled={isWithdrawing}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="verified"
                  size="md"
                  fullWidth
                  isLoading={isWithdrawing}
                  disabled={walletBalancePaise <= 0}
                >
                  {t.wallet.withdrawSubmitBtn}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DETAILED DISPUTE MODAL ─── */}
      {disputeTxId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-white border-2 border-[var(--ink)] max-w-md w-full p-5 shadow-2xl rounded-[3px] space-y-4">
            <h3 className="font-bold text-base uppercase text-[var(--ink)]">
              {t.wallet.disputeModalTitle}
            </h3>
            <form onSubmit={handleSubmitDetailedDispute} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                  {t.wallet.disputeReasonLabel}
                </label>
                <textarea
                  rows={3}
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full border-2 border-[var(--ink)] p-2 text-xs outline-none focus:border-[var(--site-orange)]"
                  placeholder="e.g. Contractor did not transfer funds to my UPI or cash."
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 min-h-[48px] bg-[#B91C1C] text-white font-bold text-xs uppercase rounded-[2px]"
                >
                  {t.wallet.submitDisputeBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setDisputeTxId(null)}
                  className="min-h-[48px] px-4 border-2 border-[var(--ink)] text-xs font-bold uppercase rounded-[2px]"
                >
                  {t.common.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
