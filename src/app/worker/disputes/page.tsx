'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';
import { VoiceSpeechInput } from '@/components/ui/VoiceSpeechInput';
import { formatRupees } from '@/lib/money';
import { rupeesToPaise } from '@/types/payment.types';

export default function WorkerDisputesPage() {
  const { profiles, locale, t } = useAuth();
  const workerProfile = profiles?.worker;

  const [disputes, setDisputes] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Status Filter: 'ALL' | 'open' | 'responded' | 'resolved' | 'escalated' | 'withdrawn'
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected dispute for detail modal
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [newMessageText, setNewMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Complaint Report Modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLang, setReportLang] = useState<'en' | 'hi' | 'mr'>('en');
  const [reportRecipientType, setReportRecipientType] = useState<'police' | 'labour_office' | 'other'>('police');
  const [reportRecipientName, setReportRecipientName] = useState('');
  const [reportRecipientAddress, setReportRecipientAddress] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [previousReports, setPreviousReports] = useState<any[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  const openReportModal = async (dispute: any) => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('shramiksetu_rep_lang') as any;
      if (['en', 'hi', 'mr'].includes(savedLang)) setReportLang(savedLang);
      else if (['en', 'hi', 'mr'].includes(locale)) setReportLang(locale as any);

      const savedType = localStorage.getItem('shramiksetu_rep_type') as any;
      if (['police', 'labour_office', 'other'].includes(savedType)) setReportRecipientType(savedType);

      setReportRecipientName(localStorage.getItem('shramiksetu_rep_name') || '');
      setReportRecipientAddress(localStorage.getItem('shramiksetu_rep_addr') || '');
    }

    setReportError(null);
    setShowReportModal(true);
    setIsLoadingReports(true);

    try {
      const res = await fetch(`/api/worker/disputes/${dispute.id}/reports`);
      const json = await res.json();
      if (json.success && json.reports) {
        setPreviousReports(json.reports);
      } else {
        setPreviousReports([]);
      }
    } catch {
      setPreviousReports([]);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedDispute?.dispute) return;

    if (typeof window !== 'undefined') {
      localStorage.setItem('shramiksetu_rep_lang', reportLang);
      localStorage.setItem('shramiksetu_rep_type', reportRecipientType);
      localStorage.setItem('shramiksetu_rep_name', reportRecipientName);
      localStorage.setItem('shramiksetu_rep_addr', reportRecipientAddress);
    }

    setIsGeneratingReport(true);
    setReportError(null);

    const disputeId = selectedDispute.dispute.id;
    const url = `/worker/disputes/${disputeId}/report.pdf?lang=${reportLang}&recipient_type=${reportRecipientType}&recipient_name=${encodeURIComponent(reportRecipientName)}&recipient_address=${encodeURIComponent(reportRecipientAddress)}`;

    try {
      // Trigger browser download via anchor click
      const a = document.createElement('a');
      a.href = url;
      a.download = `Complaint_Report_${selectedDispute.dispute.reference || disputeId}_${reportLang}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Refresh previous versions after a short delay
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/worker/disputes/${disputeId}/reports`);
          const json = await res.json();
          if (json.success && json.reports) {
            setPreviousReports(json.reports);
          }
        } catch {}
        setIsGeneratingReport(false);
      }, 1500);
    } catch (err: any) {
      setReportError(err?.message || 'Failed to download report');
      setIsGeneratingReport(false);
    }
  };

  // Form state
  const [selectedContractId, setSelectedContractId] = useState('');
  const [category, setCategory] = useState<
    'short_payment' | 'unpaid_wages' | 'attendance_not_recorded' | 'unlawful_deduction' | 'unsafe_conditions' | 'other'
  >('short_payment');

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultPastStr = useMemo(
    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    []
  );

  const [periodFrom, setPeriodFrom] = useState(defaultPastStr);
  const [periodTo, setPeriodTo] = useState(todayStr);
  const [description, setDescription] = useState('');
  const [claimedRupees, setClaimedRupees] = useState<string>('');
  const [claimedJustification, setClaimedJustification] = useState('');

  // Live calculated summary state
  const [liveCalculation, setLiveCalculation] = useState<{
    dailyWagePaise: number;
    verifiedAttendanceDaysCount: number;
    earnedPaise: number;
    paidPaise: number;
    shortfallPaise: number;
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Evidence file upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Fetch live calculation when contract or period changes
  useEffect(() => {
    if (!selectedContractId || !periodFrom || !periodTo || periodTo < periodFrom) {
      setLiveCalculation(null);
      return;
    }

    let active = true;
    setIsCalculating(true);

    api.disputes
      .calculate({
        contractId: selectedContractId,
        periodFrom,
        periodTo,
      })
      .then((res) => {
        if (!active) return;
        if (res.success) {
          setLiveCalculation({
            dailyWagePaise: res.dailyWagePaise,
            verifiedAttendanceDaysCount: res.verifiedAttendanceDaysCount,
            earnedPaise: res.earnedPaise,
            paidPaise: res.paidPaise,
            shortfallPaise: res.shortfallPaise,
          });
          // Prefill claimed amount with calculated shortfall in Rupees
          const shortfallInRupees = Math.round(res.shortfallPaise / 100);
          setClaimedRupees(String(shortfallInRupees));
        }
      })
      .catch(() => {
        if (active) setLiveCalculation(null);
      })
      .finally(() => {
        if (active) setIsCalculating(false);
      });

    return () => {
      active = false;
    };
  }, [selectedContractId, periodFrom, periodTo]);

  const fetchDisputesData = async () => {
    try {
      setIsLoading(true);
      setErrorNotice(null);
      const [disputesRes, contractsRes] = await Promise.allSettled([
        api.disputes.list(),
        api.contracts.list(),
      ]);

      if (disputesRes.status === 'fulfilled' && disputesRes.value.success) {
        setDisputes(disputesRes.value.disputes || []);
      }

      if (contractsRes.status === 'fulfilled' && contractsRes.value.success) {
        const list = contractsRes.value.contracts || [];
        // Filter contracts eligible for disputes: accepted, active, completed, terminated, disputed
        const eligible = list.filter((c: any) => {
          const s = String(c.status).toUpperCase();
          return ['ACCEPTED', 'ACTIVE', 'COMPLETED', 'TERMINATED', 'DISPUTED'].includes(s);
        });
        setContracts(eligible);
        if (eligible.length > 0 && !selectedContractId) {
          setSelectedContractId(eligible[0].id);
        }
      }
    } catch (err: any) {
      setErrorNotice(err.message || t.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputesData();
  }, [workerProfile?.id]);

  // Filtered disputes list
  const filteredDisputes = useMemo(() => {
    if (statusFilter === 'ALL') return disputes;
    const filterLower = statusFilter.toLowerCase();
    return disputes.filter((d) => {
      const s = String(d.status).toLowerCase();
      if (filterLower === 'open') return s === 'open';
      if (filterLower === 'responded') return s === 'responded' || s === 'under_review';
      if (filterLower === 'resolved') return s === 'resolved' || s === 'settled';
      if (filterLower === 'escalated') return s === 'escalated';
      if (filterLower === 'withdrawn') return s === 'withdrawn';
      return s === filterLower;
    });
  }, [disputes, statusFilter]);

  // Open dispute detail
  const handleOpenDetail = async (disputeId: string) => {
    try {
      setIsLoadingDetail(true);
      const res = await api.disputes.get(disputeId);
      if (res.success) {
        setSelectedDispute(res);
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to load dispute details');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files);
      if (selectedFiles.length + filesArr.length > 5) {
        alert(t.disputes.evidenceUploadHint || 'Maximum 5 files allowed.');
        return;
      }
      setSelectedFiles((prev) => [...prev, ...filesArr]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit new dispute
  const handleRaiseDispute = async (e: React.FormEvent) => {
    e.preventDefault();

    const matchedContract = contracts.find((c) => c.id === selectedContractId);
    if (!matchedContract) {
      setErrorNotice(t.disputes.selectContract);
      return;
    }

    if (description.trim().length < 20) {
      setErrorNotice('Description must be at least 20 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorNotice(null);

      const claimedPaiseValue = claimedRupees ? rupeesToPaise(Number(claimedRupees)) : undefined;

      const res = await api.disputes.create({
        workerId: workerProfile?.id || matchedContract.worker_id,
        contractorId: matchedContract.contractor_id,
        contractId: matchedContract.id,
        projectId: matchedContract.project_id,
        category,
        periodFrom,
        periodTo,
        description: description.trim(),
        claimedPaise: claimedPaiseValue,
        claimedJustification: claimedJustification.trim() || undefined,
      });

      if (res.success && res.dispute) {
        // Upload any attached evidence files
        if (selectedFiles.length > 0) {
          for (const file of selectedFiles) {
            try {
              await api.disputes.uploadEvidence(res.dispute.id, file);
            } catch (evErr: any) {
              console.warn('Evidence file upload warning:', evErr);
            }
          }
        }

        setSuccessNotice(t.disputes.successDesc);
        setShowModal(false);
        setDescription('');
        setSelectedFiles([]);
        setClaimedJustification('');
        await fetchDisputesData();
      }
    } catch (err: any) {
      setErrorNotice(err.message || t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Worker Action: Withdraw
  const handleWithdraw = async (disputeId: string) => {
    if (!confirm('Are you sure you want to withdraw this dispute?')) return;
    try {
      setIsSubmitting(true);
      await api.disputes.withdraw(disputeId, 'Worker requested withdrawal');
      setSuccessNotice('Dispute successfully withdrawn.');
      setSelectedDispute(null);
      await fetchDisputesData();
    } catch (err: any) {
      alert(err.message || 'Failed to withdraw dispute');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Worker Action: Escalate
  const handleEscalate = async (disputeId: string) => {
    if (!confirm('Are you sure you want to escalate this unresolved dispute to the Labour Inspector?')) return;
    try {
      setIsSubmitting(true);
      await api.disputes.escalate(disputeId, 'Escalated by worker for official labour inspection');
      setSuccessNotice('Dispute escalated to Labour Inspector.');
      await handleOpenDetail(disputeId);
      await fetchDisputesData();
    } catch (err: any) {
      alert(err.message || 'Failed to escalate dispute');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Worker Action: Confirm Resolution
  const handleConfirmResolution = async (disputeId: string) => {
    if (!confirm('Confirm that this dispute is fully resolved?')) return;
    try {
      setIsSubmitting(true);
      await api.disputes.confirmResolution(disputeId, 'Confirmed by worker');
      setSuccessNotice('Dispute confirmed as resolved.');
      await handleOpenDetail(disputeId);
      await fetchDisputesData();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm resolution');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Post message in dispute discussion
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute || !newMessageText.trim()) return;

    try {
      setIsSendingMessage(true);
      await api.disputes.postMessage(selectedDispute.dispute.id, newMessageText.trim());
      setNewMessageText('');
      await handleOpenDetail(selectedDispute.dispute.id);
    } catch (err: any) {
      alert(err.message || 'Failed to post message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const isClaimedOverShortfall = useMemo(() => {
    if (!liveCalculation) return false;
    const claimedP = claimedRupees ? rupeesToPaise(Number(claimedRupees)) : 0;
    return claimedP > liveCalculation.shortfallPaise;
  }, [claimedRupees, liveCalculation]);

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="p-4 border-b-2 border-[var(--ink)] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold uppercase text-[var(--ink)]">
            {t.workerPortal.disputesHeading}
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-0.5">
            {t.disputes.subtitle}
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/worker/wallet">
            <Button variant="secondary" size="md" className="min-h-[48px]">
              ← {t.nav.wallet}
            </Button>
          </Link>
          <Button
            variant="warning"
            size="md"
            onClick={() => setShowModal(true)}
            className="min-h-[48px] shrink-0"
          >
            <Icons.Plus size={18} className="mr-1.5" />
            {t.workerPortal.raiseNewDispute}
          </Button>
        </div>
      </div>

      {successNotice && (
        <div
          role="status"
          className="p-4 bg-[#EBF7F0] border-2 border-[#1E7A4B] text-[#155A36] text-xs sm:text-sm font-bold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Icons.CheckCircle size={20} />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center p-1 text-[#155A36]"
            aria-label={t.common.close}
          >
            <Icons.X size={18} />
          </button>
        </div>
      )}

      {errorNotice && (
        <div
          role="alert"
          className="p-4 bg-[#FEF2F2] border-2 border-[#B91C1C] text-[#991B1B] text-xs sm:text-sm font-bold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Icons.AlertTriangle size={20} />
            <span>{errorNotice}</span>
          </div>
          <button
            onClick={() => setErrorNotice(null)}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center p-1 text-[#991B1B]"
            aria-label={t.common.close}
          >
            <Icons.X size={18} />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['ALL', 'open', 'responded', 'resolved', 'escalated', 'withdrawn'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`min-h-[44px] px-3 py-1.5 text-xs font-mono font-bold uppercase rounded-[2px] border-2 transition-all shrink-0 ${
              statusFilter === st
                ? 'bg-[var(--ink)] text-white border-[var(--ink)]'
                : 'bg-white text-[var(--ink)] border-[var(--ink-20)] hover:border-[var(--ink)]'
            }`}
          >
            {st === 'ALL' ? 'ALL' : t.disputes.statuses[st as keyof typeof t.disputes.statuses] || st}
          </button>
        ))}
      </div>

      {/* Disputes List */}
      {isLoading ? (
        <LoadingState message="ACCESSING DISPUTE RECORDS..." />
      ) : filteredDisputes.length === 0 ? (
        <EmptyState
          title={t.disputes.noDisputesTitle}
          message={t.disputes.noDisputesDesc}
        />
      ) : (
        <div className="bg-white border-2 border-[var(--ink)] divide-y divide-[var(--ink-20)]">
          {filteredDisputes.map((d) => {
            const statusKey = String(d.status).toLowerCase();
            return (
              <div
                key={d.id}
                onClick={() => handleOpenDetail(d.id)}
                className="p-4 hover:bg-[var(--paper)] cursor-pointer transition-none flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-[var(--site-orange)] bg-[#FFF3EB] border border-[#E8540A] px-2 py-0.5 rounded-[2px]">
                      {t.disputes.categories[d.category as keyof typeof t.disputes.categories] || d.category}
                    </span>
                    <span className="font-data text-xs text-[var(--ink-60)]">
                      REF #{d.reference || d.dispute_ref || d.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="font-data text-xs text-[var(--ink-60)]">
                      · {d.period_from} → {d.period_to}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold uppercase text-[var(--ink)]">
                    {d.projects?.name || 'Worksite Project'}
                  </h3>
                  <p className="text-xs text-[var(--ink-60)] line-clamp-1">
                    {d.description}
                  </p>
                  <div className="text-xs font-mono font-bold text-[var(--ink)] flex items-center gap-3">
                    <span>Earned: {formatRupees(d.earned_paise || 0)}</span>
                    <span>Paid: {formatRupees(d.paid_paise || 0)}</span>
                    <span className="text-[#DC2626]">
                      Shortfall: {formatRupees(d.shortfall_paise || 0)}
                    </span>
                    <span className="text-[var(--site-orange)]">
                      Claimed: {formatRupees(d.claimed_paise || d.amount_claimed_paise || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex sm:flex-col items-end gap-2">
                  <StatusPill status={statusKey.toUpperCase()} />
                  <Button variant="secondary" size="sm" className="min-h-[44px]">
                    VIEW CASE →
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── NEW DISPUTE MODAL ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border-2 border-[var(--ink)] shadow-brutal max-w-lg w-full p-5 sm:p-6 my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-[var(--ink-20)] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-[var(--site-orange)] tracking-widest">
                  FORM D-1 · OFFICIAL DISPUTE LODGING
                </span>
                <h2 className="text-lg font-bold uppercase text-[var(--ink)]">
                  {t.disputes.formTitle}
                </h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--ink)]"
                aria-label={t.common.close}
              >
                <Icons.X size={20} />
              </button>
            </div>

            <form onSubmit={handleRaiseDispute} className="space-y-4">
              {/* Contract Selection */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  {t.disputes.selectContract} *
                </label>
                <select
                  value={selectedContractId}
                  onChange={(e) => setSelectedContractId(e.target.value)}
                  required
                  className="w-full min-h-[48px] p-2.5 border-2 border-[var(--ink)] bg-white text-xs font-mono uppercase focus:outline-none"
                >
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.work_type || 'General Work'} · {c.contract_code || c.id.slice(0, 8)} · ₹{Math.round((c.daily_wage_paise || 0) / 100)}/day
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  {t.disputes.categoryLabel} *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full min-h-[48px] p-2.5 border-2 border-[var(--ink)] bg-white text-xs font-mono uppercase focus:outline-none"
                >
                  <option value="short_payment">{t.disputes.categories.short_payment}</option>
                  <option value="unpaid_wages">{t.disputes.categories.unpaid_wages}</option>
                  <option value="attendance_not_recorded">{t.disputes.categories.attendance_not_recorded}</option>
                  <option value="unlawful_deduction">{t.disputes.categories.unlawful_deduction}</option>
                  <option value="unsafe_conditions">{t.disputes.categories.unsafe_conditions}</option>
                  <option value="other">{t.disputes.categories.other}</option>
                </select>
              </div>

              {/* Period Select */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                    {t.disputes.periodFrom} *
                  </label>
                  <input
                    type="date"
                    value={periodFrom}
                    onChange={(e) => setPeriodFrom(e.target.value)}
                    required
                    className="w-full min-h-[48px] p-2.5 border-2 border-[var(--ink)] text-xs font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                    {t.disputes.periodTo} *
                  </label>
                  <input
                    type="date"
                    value={periodTo}
                    onChange={(e) => setPeriodTo(e.target.value)}
                    required
                    className="w-full min-h-[48px] p-2.5 border-2 border-[var(--ink)] text-xs font-mono focus:outline-none"
                  />
                </div>
              </div>

              {/* LIVE SERVER-COMPUTED FINANCIAL SUMMARY CARD */}
              <div className="p-3 bg-[#FEF3C7] border-2 border-[var(--ink)] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold uppercase text-[var(--ink)]">
                  <span>{t.disputes.shortfallCardTitle}</span>
                  {isCalculating && <span className="text-[10px] text-amber-800">Calculating...</span>}
                </div>
                {liveCalculation ? (
                  <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-amber-300">
                    <div>
                      <div className="text-[10px] font-mono text-[var(--ink-60)] uppercase">{t.disputes.earned}</div>
                      <div className="text-xs sm:text-sm font-bold font-mono text-[var(--ink)]">
                        {formatRupees(liveCalculation.earnedPaise)}
                      </div>
                      <div className="text-[9px] text-[var(--ink-60)] font-mono">
                        ({liveCalculation.verifiedAttendanceDaysCount} days)
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-[var(--ink-60)] uppercase">{t.disputes.paid}</div>
                      <div className="text-xs sm:text-sm font-bold font-mono text-[var(--ink)]">
                        {formatRupees(liveCalculation.paidPaise)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-[var(--ink-60)] uppercase">{t.disputes.shortfall}</div>
                      <div className="text-xs sm:text-sm font-bold font-mono text-[#DC2626]">
                        {formatRupees(liveCalculation.shortfallPaise)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--ink-60)]">
                    Pick a valid contract and dates to compute live earned and shortfall amounts.
                  </p>
                )}
              </div>

              {/* Claimed Amount */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  {t.disputes.claimedAmount}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 font-mono font-bold text-sm text-[var(--ink-60)]">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={claimedRupees}
                    onChange={(e) => setClaimedRupees(e.target.value)}
                    placeholder="Enter claimed amount in Rupees"
                    className="w-full min-h-[48px] pl-8 pr-3 py-2 border-2 border-[var(--ink)] text-sm font-mono focus:outline-none"
                  />
                </div>
              </div>

              {/* Conditional Justification when Claimed > Shortfall */}
              {isClaimedOverShortfall && (
                <div className="p-3 bg-red-50 border-2 border-[#DC2626] space-y-1">
                  <label className="block text-xs font-mono font-bold uppercase text-[#991B1B]">
                    {t.disputes.justificationLabel} *
                  </label>
                  <textarea
                    rows={2}
                    value={claimedJustification}
                    onChange={(e) => setClaimedJustification(e.target.value)}
                    placeholder={t.disputes.justificationPlaceholder}
                    required
                    className="w-full p-2 border border-[#DC2626] text-xs focus:outline-none"
                  />
                </div>
              )}

              {/* Description & Character Counter */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-mono font-bold uppercase text-[var(--ink)]">
                    {t.disputes.descriptionLabel} *
                  </label>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      description.length < 20 ? 'text-[#DC2626]' : 'text-[var(--ink-60)]'
                    }`}
                  >
                    {description.length} / 2000 chars (min 20)
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Example: Agreed daily wage ₹700, contractor paid ₹500, shortfall ₹200 with no valid reason."
                  required
                  className="w-full p-2.5 border-2 border-[var(--ink)] text-xs focus:outline-none"
                />
                <VoiceSpeechInput
                  locale={locale}
                  onTranscript={(val: string) => setDescription((prev) => (prev ? `${prev} ${val}` : val))}
                  className="mt-1"
                />
              </div>

              {/* Evidence Upload */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  {t.disputes.evidenceTitle}
                </label>
                <p className="text-[10px] text-[var(--ink-60)] mb-1.5">
                  {t.disputes.evidenceUploadHint}
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="w-full text-xs font-mono file:mr-2 file:py-2 file:px-3 file:border-2 file:border-[var(--ink)] file:bg-white file:text-xs file:font-mono file:uppercase file:cursor-pointer"
                />

                {selectedFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-300 text-xs font-mono"
                      >
                        <span className="truncate max-w-[200px]">{file.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="text-red-600 font-bold px-1"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ink-20)]">
                <Button
                  variant="secondary"
                  size="md"
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="min-h-[48px]"
                >
                  {t.common.cancel}
                </Button>
                <Button
                  variant="warning"
                  size="md"
                  type="submit"
                  disabled={isSubmitting || description.trim().length < 20}
                  className="min-h-[48px]"
                >
                  {isSubmitting ? t.disputes.submitting : t.disputes.submitBtn}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DISPUTE DETAIL MODAL ─── */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border-2 border-[var(--ink)] shadow-brutal max-w-2xl w-full p-5 sm:p-6 my-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-[var(--ink-20)] pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-[var(--site-orange)] bg-[#FFF3EB] border border-[#E8540A] px-2 py-0.5 rounded-[2px]">
                    {selectedDispute.dispute.category}
                  </span>
                  <StatusPill status={String(selectedDispute.dispute.status).toUpperCase()} />
                </div>
                <h2 className="text-base sm:text-lg font-bold uppercase text-[var(--ink)] mt-1">
                  CASE #{selectedDispute.dispute.reference || selectedDispute.dispute.dispute_ref}
                </h2>
              </div>
              <button
                onClick={() => setSelectedDispute(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--ink)]"
                aria-label={t.common.close}
              >
                <Icons.X size={20} />
              </button>
            </div>

            {/* Financial Summary Card */}
            <div className="p-3 bg-[#FEF3C7] border-2 border-[var(--ink)]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-[10px] font-mono text-[var(--ink-60)] uppercase">{t.disputes.earned}</div>
                  <div className="text-sm font-bold font-mono text-[var(--ink)]">
                    {formatRupees(selectedDispute.dispute.earned_paise || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-[var(--ink-60)] uppercase">{t.disputes.paid}</div>
                  <div className="text-sm font-bold font-mono text-[var(--ink)]">
                    {formatRupees(selectedDispute.dispute.paid_paise || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-[var(--ink-60)] uppercase">{t.disputes.shortfall}</div>
                  <div className="text-sm font-bold font-mono text-[#DC2626]">
                    {formatRupees(selectedDispute.dispute.shortfall_paise || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-[var(--ink-60)] uppercase">Claimed</div>
                  <div className="text-sm font-bold font-mono text-[var(--site-orange)]">
                    {formatRupees(selectedDispute.dispute.claimed_paise || selectedDispute.dispute.amount_claimed_paise || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Description & Justification */}
            <div className="space-y-2">
              <div className="text-xs font-mono font-bold uppercase text-[var(--ink)]">
                Worker Statement
              </div>
              <p className="text-xs sm:text-sm p-3 bg-slate-50 border border-slate-300 whitespace-pre-wrap">
                {selectedDispute.dispute.description}
              </p>
              {selectedDispute.dispute.claimed_justification && (
                <div className="text-xs p-2 bg-amber-50 border border-amber-300">
                  <span className="font-bold">Claim Justification: </span>
                  {selectedDispute.dispute.claimed_justification}
                </div>
              )}
            </div>

            {/* Contractor Response Section */}
            {selectedDispute.responses && selectedDispute.responses.length > 0 && (
              <div className="space-y-2 p-3 bg-[#EBF7F0] border-2 border-[#1E7A4B]">
                <div className="text-xs font-mono font-bold uppercase text-[#155A36] flex items-center justify-between">
                  <span>{t.disputes.contractorResponse}</span>
                  <span className="px-2 py-0.5 bg-white border border-[#1E7A4B] text-[10px] rounded-[2px]">
                    {selectedDispute.responses[0].type}
                  </span>
                </div>
                {selectedDispute.responses[0].deduction_reason && (
                  <div className="text-xs text-[#155A36]">
                    <span className="font-bold">Deduction: </span>
                    {selectedDispute.responses[0].deduction_reason} ({formatRupees(selectedDispute.responses[0].deduction_amount_paise || 0)})
                  </div>
                )}
                <p className="text-xs text-[#0F172A] bg-white p-2 border border-[#1E7A4B]">
                  {selectedDispute.responses[0].message}
                </p>
              </div>
            )}

            {/* Evidence Gallery */}
            {selectedDispute.evidence && selectedDispute.evidence.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-mono font-bold uppercase text-[var(--ink)]">
                  {t.disputes.evidenceTitle}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedDispute.evidence.map((ev: any) => (
                    <a
                      key={ev.id}
                      href={ev.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 border border-[var(--ink-20)] bg-white flex items-center justify-between text-xs hover:border-[var(--ink)]"
                    >
                      <span className="truncate max-w-[150px] font-mono">{ev.file_path.split(/[/\\\\]/).pop()}</span>
                      <span className="font-mono text-[10px] text-blue-600 font-bold">VIEW ↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Status Timeline */}
            {selectedDispute.statusHistory && selectedDispute.statusHistory.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-mono font-bold uppercase text-[var(--ink)]">
                  Status Timeline
                </div>
                <div className="space-y-1 divide-y divide-slate-100 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200">
                  {selectedDispute.statusHistory.map((sh: any) => (
                    <div key={sh.id} className="pt-1 text-[11px] font-mono flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold uppercase">{sh.actor_role || 'ACTOR'}: </span>
                        <span>{sh.note || sh.to_status}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(sh.at).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Discussion Thread */}
            <div className="space-y-2 border-t border-[var(--ink-20)] pt-3">
              <div className="text-xs font-mono font-bold uppercase text-[var(--ink)]">
                {t.disputes.messagesTitle}
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-white border border-[var(--ink-20)]">
                {selectedDispute.messages && selectedDispute.messages.length > 0 ? (
                  selectedDispute.messages.map((m: any) => (
                    <div
                      key={m.id}
                      className={`p-2 rounded-[2px] text-xs ${
                        m.sender_role === 'WORKER'
                          ? 'bg-amber-50 border border-amber-200 ml-4'
                          : 'bg-slate-100 border border-slate-200 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                        <span className="font-bold">{m.sender_role}</span>
                        <span>{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{m.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 p-2">No messages in thread yet.</p>
                )}
              </div>

              {/* Send Message Form */}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder={t.disputes.typeMessagePlaceholder}
                  className="flex-1 min-h-[44px] px-3 border-2 border-[var(--ink)] text-xs focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={isSendingMessage || !newMessageText.trim()}
                  className="min-h-[44px] shrink-0"
                >
                  {isSendingMessage ? 'Sending...' : t.disputes.sendMessageBtn}
                </Button>
              </form>
            </div>

            {/* Worker Action Buttons */}
            <div className="flex items-center justify-between gap-2 border-t-2 border-[var(--ink)] pt-3 flex-wrap">
              <div className="flex items-center gap-2">
                {/* Withdraw button (open or responded) */}
                {['open', 'responded'].includes(String(selectedDispute.dispute.status).toLowerCase()) && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleWithdraw(selectedDispute.dispute.id)}
                    className="min-h-[44px]"
                  >
                    {t.disputes.withdrawBtn}
                  </Button>
                )}

                {/* Escalate button (only after responded) */}
                {String(selectedDispute.dispute.status).toLowerCase() === 'responded' && (
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={() => handleEscalate(selectedDispute.dispute.id)}
                    className="min-h-[44px]"
                  >
                    {t.disputes.escalateBtn}
                  </Button>
                )}

                {/* Confirm Resolution button */}
                {String(selectedDispute.dispute.status).toLowerCase() === 'responded' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleConfirmResolution(selectedDispute.dispute.id)}
                    className="min-h-[44px]"
                  >
                    CONFIRM RESOLUTION
                  </Button>
                )}
              </div>

              {/* Generate complaint report button */}
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openReportModal(selectedDispute.dispute)}
                  className="min-h-[44px] border-2 border-[var(--ink)] bg-[#FFFBEB] font-bold"
                >
                  📄 Generate complaint report
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── COMPLAINT REPORT MODAL ─── */}
      {showReportModal && selectedDispute && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border-2 border-[var(--ink)] shadow-brutal max-w-lg w-full p-5 sm:p-6 my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b-2 border-[var(--ink-20)] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase bg-[#FFF3EB] text-[#E8540A] border border-[#E8540A] px-1.5 py-0.5 rounded-[2px] font-bold">
                  OFFICIAL FILING
                </span>
                <h2 className="text-base sm:text-lg font-bold uppercase text-[var(--ink)] mt-1">
                  Generate Complaint Report
                </h2>
                <div className="text-xs font-mono text-[var(--ink-60)]">
                  Case Ref: {selectedDispute.dispute.reference || selectedDispute.dispute.dispute_ref}
                </div>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--ink)]"
                aria-label={t.common.close}
              >
                <Icons.X size={20} />
              </button>
            </div>

            {/* Strength Hint Banner */}
            <div className="p-3 bg-amber-50 border border-amber-300 text-xs text-amber-900 rounded-[2px] space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>💡</span>
                <span>Pro-Tip for Stronger Official Submission</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Adding the contractor's formal response and attaching muster or site photos first makes this complaint report much stronger when handed to a police station or labour officer.
              </p>
            </div>

            {/* Report Form */}
            <div className="space-y-3 pt-1">
              {/* Language Selector */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  Language / भाषा / भाषा *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportLang('en')}
                    className={`min-h-[44px] p-2 text-xs font-mono font-bold border-2 ${
                      reportLang === 'en'
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                        : 'border-[var(--ink-20)] bg-white text-[var(--ink)] hover:border-[var(--ink)]'
                    }`}
                  >
                    English (EN)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportLang('hi')}
                    className={`min-h-[44px] p-2 text-xs font-mono font-bold border-2 ${
                      reportLang === 'hi'
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                        : 'border-[var(--ink-20)] bg-white text-[var(--ink)] hover:border-[var(--ink)]'
                    }`}
                  >
                    हिन्दी (HI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportLang('mr')}
                    className={`min-h-[44px] p-2 text-xs font-mono font-bold border-2 ${
                      reportLang === 'mr'
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                        : 'border-[var(--ink-20)] bg-white text-[var(--ink)] hover:border-[var(--ink)]'
                    }`}
                  >
                    मराठी (MR)
                  </button>
                </div>
              </div>

              {/* Recipient Type */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  Recipient Authority Type *
                </label>
                <select
                  value={reportRecipientType}
                  onChange={(e) => setReportRecipientType(e.target.value as any)}
                  className="w-full min-h-[48px] p-2.5 border-2 border-[var(--ink)] bg-white text-xs font-mono focus:outline-none"
                >
                  <option value="police">Police Station (थाना प्रभारी)</option>
                  <option value="labour_office">Labour Commissioner / Conciliation Office (श्रम आयुक्त)</option>
                  <option value="other">Other Authority (अन्य प्राधिकारी)</option>
                </select>
              </div>

              {/* Recipient Name */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  Recipient Name / Station Name (Optional)
                </label>
                <input
                  type="text"
                  value={reportRecipientName}
                  onChange={(e) => setReportRecipientName(e.target.value)}
                  placeholder="e.g. Kalyan Police Station / Thane Labour Office"
                  className="w-full min-h-[48px] p-2.5 border-2 border-[var(--ink)] text-xs font-mono focus:outline-none"
                />
              </div>

              {/* Recipient Address */}
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[var(--ink)] mb-1">
                  Recipient Address / Location (Optional)
                </label>
                <input
                  type="text"
                  value={reportRecipientAddress}
                  onChange={(e) => setReportRecipientAddress(e.target.value)}
                  placeholder="e.g. Station Road, Kalyan West, District Thane"
                  className="w-full min-h-[48px] p-2.5 border-2 border-[var(--ink)] text-xs font-mono focus:outline-none"
                />
              </div>
            </div>

            {reportError && (
              <div className="p-2.5 bg-red-50 border border-red-300 text-xs text-red-700">
                {reportError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ink-20)]">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowReportModal(false)}
                className="min-h-[48px]"
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
                className="min-h-[48px] bg-[#1E7A4B] hover:bg-[#155A36] text-white"
              >
                {isGeneratingReport ? 'Generating PDF...' : '⬇ Generate & Download PDF'}
              </Button>
            </div>

            {/* Previous Versions Section */}
            <div className="pt-3 border-t-2 border-[var(--ink-20)] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold uppercase text-[var(--ink)]">
                <span>Previous Versions</span>
                <span className="text-[10px] text-[var(--ink-60)]">
                  {previousReports.length} recorded
                </span>
              </div>

              {isLoadingReports ? (
                <div className="text-center py-3 text-xs font-mono text-[var(--ink-60)]">
                  Loading previous reports...
                </div>
              ) : previousReports.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {previousReports.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-2 bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-mono font-bold text-[var(--ink)]">
                          v{rep.version} · {rep.language} · {rep.recipient_type}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {rep.recipient_name} · {new Date(rep.created_at).toLocaleDateString('en-IN')}
                        </div>
                      </div>
                      <a
                        href={`/worker/disputes/${selectedDispute.dispute.id}/report.pdf?lang=${rep.language.toLowerCase()}&recipient_type=${rep.recipient_type.toLowerCase()}&recipient_name=${encodeURIComponent(rep.recipient_name || '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-white border border-[var(--ink)] text-[10px] font-mono font-bold text-[var(--ink)] hover:bg-[var(--ink)] hover:text-white shrink-0 min-h-[36px] flex items-center"
                      >
                        DOWNLOAD ⬇
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 font-mono py-1">
                  No previous reports generated yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
