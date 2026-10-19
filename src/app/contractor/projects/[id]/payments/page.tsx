'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { rupeesToPaise, formatRupees } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { LoadingState } from '@/components/ui/FeedbackStates';
import { StatusPill } from '@/components/ui/StatusPill';

export default function RecordPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const { profiles } = useAuth();
  const contractorId = profiles?.contractor?.id;

  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [reconciliation, setReconciliation] = useState<any | null>(null);
  const [pastTransactions, setPastTransactions] = useState<any[]>([]);
  const [amountRupees, setAmountRupees] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI_SIMULATED' | 'BANK_TRANSFER' | 'CASH'>('UPI_SIMULATED');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [proofUrl, setProofUrl] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isAdvance, setIsAdvance] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<any | null>(null);

  useEffect(() => {
    const fetchContracts = async () => {
      try {
        setIsLoading(true);
        const res = await api.contracts.list();
        if (res.success && res.contracts) {
          const matched = res.contracts.filter(
            (c: any) =>
              c.project_id === projectId &&
              ['ACCEPTED', 'accepted', 'ACTIVE', 'active'].includes(c.status) &&
              !c.end_reason
          );
          setContracts(matched);
          const queryContractId = searchParams.get('contractId');
          if (queryContractId && matched.some((c: any) => c.id === queryContractId)) {
            setSelectedContractId(queryContractId);
          } else if (matched.length > 0) {
            setSelectedContractId(matched[0].id);
          }
        }
      } catch {
        // Non-blocking
      } finally {
        setIsLoading(false);
      }
    };
    if (projectId) {
      fetchContracts();
    }
  }, [projectId, searchParams]);

  const fetchProjectPayments = async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/payments/summary?projectId=${projectId}`).then((r) => r.json());
      if (res.success && res.transactions) {
        setPastTransactions(res.transactions);
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchProjectPayments();
  }, [projectId]);

  // When selectedContractId changes, fetch current outstanding balance
  useEffect(() => {
    if (!selectedContractId) return;

    const fetchContractBalance = async () => {
      try {
        const res = await api.reconciliation.get(selectedContractId);
        if (res.success) {
          const recData = res.reconciliation || res;
          setReconciliation(recData);
          // Pre-fill with outstanding amount if any
          const outstandingRupees = (recData.outstandingPaise || 0) / 100;
          if (outstandingRupees > 0) {
            setAmountRupees(String(outstandingRupees));
          }
        }
      } catch {
        // Fallback to earnings
        try {
          const earn = await api.earnings.get({ contractId: selectedContractId });
          if (earn.success) {
            setReconciliation(earn);
          }
        } catch {
          // Ignore
        }
      }
    };

    fetchContractBalance();
  }, [selectedContractId]);

  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const outstandingPaise = reconciliation?.outstandingPaise || 0;
  const targetAmountPaise = rupeesToPaise(amountRupees);
  const isOverpayment = targetAmountPaise > outstandingPaise;
  const isBlockedOverpayment = isOverpayment && !isAdvance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessReceipt(null);

    if (!selectedContract) {
      setErrorMessage('Please select a valid worker contract.');
      return;
    }

    if (targetAmountPaise <= 0) {
      setErrorMessage('Disbursement amount must be greater than zero.');
      return;
    }

    if (isBlockedOverpayment) {
      setErrorMessage(
        `OVERPAYMENT PREVENTED: Statutory rules prohibit disbursing more than the uncollected wage ledger balance (${formatRupees(
          outstandingPaise,
          true
        )}) unless marked as Advance Payment.`
      );
      return;
    }

    if (!referenceNumber.trim()) {
      setErrorMessage('Please provide a payment reference number (UPI Transaction ID, Bank UTR, or Cash Voucher number).');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.payments.initiate({
        contractId: selectedContract.id,
        workerId: selectedContract.worker_id,
        contractorId: selectedContract.contractor_id || contractorId,
        projectId,
        amountPaise: targetAmountPaise,
        idempotencyKey: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        paymentSource:
          paymentMethod === 'CASH'
            ? 'CONTRACTOR_REPORTED_CASH_PAYMENT'
            : paymentMethod === 'BANK_TRANSFER'
            ? 'BANK_TRANSFER'
            : 'PLATFORM_TRANSFER',
        paymentMethod: paymentMethod as any,
        referenceNumber: referenceNumber.trim(),
        proofUrl: proofUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        isAdvance,
      });

      if (res.success) {
        setSuccessReceipt(res.transaction);
        // Refresh reconciliation & project payments
        const updated = await api.reconciliation.get(selectedContract.id);
        if (updated.success) {
          setReconciliation(updated.reconciliation || updated);
        }
        await fetchProjectPayments();
      }
    } catch (err: any) {
      if (err.code === 'OVERPAYMENT_REJECTED') {
        setErrorMessage('REJECTED: Overpayment detected. Amount exceeds outstanding wages on this contract.');
      } else if (err.code === 'CONTRACT_NOT_ACTIVE') {
        setErrorMessage('REJECTED: Worker must have an active or accepted contract to receive payments.');
      } else if (err.code === 'PROJECT_NOT_OWNED') {
        setErrorMessage('REJECTED: Contractor does not own this project.');
      } else if (err.code === 'CONTRACT_MISMATCH') {
        setErrorMessage('REJECTED: Contract details do not match the specified worker or project.');
      } else {
        setErrorMessage(err.message || 'Payment initiation failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="ACCESSING PROJECT DISBURSEMENT DESK..." />;
  }

  return (
    <div className="w-full p-4 sm:p-6 max-w-2xl">
      <div className="mb-4">
        <Link
          href={`/contractor/projects/${projectId}`}
          className="min-h-[44px] text-xs font-bold uppercase text-[var(--ink)] hover:underline inline-flex items-center gap-1"
        >
          <Icons.ArrowLeft size={16} />
          BACK TO PROJECT
        </Link>
      </div>

      <div className="bg-white border-2 border-[var(--ink)] p-6 border-t-8 border-t-[#1E7A4B]">
        <div className="border-b border-[var(--ink-10)] pb-4 mb-6">
          <div className="text-[10px] font-bold font-mono tracking-widest uppercase text-[#1E7A4B]">
            FORM W-1 · WAGE DISBURSEMENT SETTLEMENT
          </div>
          <h1 className="text-xl font-bold uppercase text-[var(--ink)] mt-0.5">
            Record Worker Payment
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-1">
            Logs an atomic double-entry payment transaction into the worker&apos;s digital wage ledger.
          </p>
        </div>

        {successReceipt && (
          <div className="p-4 mb-6 bg-[#EBF7F0] border-2 border-[#1E7A4B] text-[#155A36]">
            <div className="flex items-center gap-2 font-bold text-xs uppercase mb-1">
              <Icons.CheckCircle size={18} />
              <span>PAYMENT TRANSACTION EXECUTED</span>
            </div>
            <div className="text-xs font-mono">
              Amount: {formatRupees(successReceipt.amount_paise, true)} transacted · TXID: #{successReceipt.id?.slice(0, 10).toUpperCase()}
            </div>
            <div className="text-[11px] mt-1 text-[#155A36]">
              Dual ledger entries created. Notice dispatched to worker for receipt confirmation.
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 mb-6 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold">
            <div className="flex items-center gap-1.5 mb-0.5 font-bold uppercase">
              <Icons.AlertTriangle size={14} />
              <span>DISBURSEMENT ERROR</span>
            </div>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
              SELECT RECIPIENT WORKER CONTRACT *
            </label>
            <select
              value={selectedContractId}
              onChange={(e) => setSelectedContractId(e.target.value)}
              className="w-full border-2 border-[var(--ink)] p-2.5 text-xs bg-white font-semibold"
              required
            >
              {contracts.length === 0 ? (
                <option value="">No contracts available</option>
              ) : (
                contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.workers?.full_name || 'Worker'} ({c.work_type}) — Rate: ₹{(Number(c.daily_wage) / 100).toLocaleString('en-IN')}/day
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Ledger Balance Card */}
          {reconciliation && (
            <div className="p-4 bg-[var(--paper-dark)] border border-[var(--ink-20)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">VERIFIED DAYS</span>
                <span className="font-data font-bold text-base text-[var(--ink)]">
                  {reconciliation.verifiedDaysCount || 0} shifts
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">EARNED TO DATE</span>
                <span className="font-data font-bold text-base text-[#1E7A4B]">
                  {formatRupees(reconciliation.totalEarnedPaise, true)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">PAID TO DATE</span>
                <span className="font-data font-bold text-base text-[var(--ink)]">
                  {formatRupees(reconciliation.totalPaidPaise || 0, true)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--site-orange)] block">OUTSTANDING OWED</span>
                <span className="font-data font-bold text-base text-[var(--site-orange)]">
                  {formatRupees(reconciliation.outstandingPaise, true)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
              DISBURSEMENT AMOUNT (RUPEES) *
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 border-2 border-r-0 border-[var(--ink)] bg-[var(--paper-dark)] font-bold text-base">
                ₹
              </span>
              <input
                id="paymentAmount"
                type="number"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="700"
                step="0.01"
                min="1"
                className={`w-full border-2 border-[var(--ink)] p-2.5 font-data text-base font-bold outline-none ${
                  isBlockedOverpayment ? 'bg-[#FEF2F2] border-[#B91C1C]' : 'focus:bg-[#FFFDF5]'
                }`}
                required
              />
            </div>

            {outstandingPaise > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAmountRupees(String(outstandingPaise / 100));
                    setIsAdvance(false);
                  }}
                  className="min-h-[44px] px-3 py-1.5 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 border border-[var(--ink)] text-[var(--ink)] inline-flex items-center justify-center"
                >
                  Pay Full Dues ({formatRupees(outstandingPaise, true)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAmountRupees(String(Math.round(outstandingPaise / 200)));
                    setIsAdvance(false);
                  }}
                  className="min-h-[44px] px-3 py-1.5 text-xs font-bold uppercase bg-slate-100 hover:bg-slate-200 border border-[var(--ink)] text-[var(--ink)] inline-flex items-center justify-center"
                >
                  Pay 50% ({formatRupees(Math.round(outstandingPaise / 2), true)})
                </button>
              </div>
            )}

            {isOverpayment ? (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-600 rounded-[2px] space-y-2">
                <div className="text-xs text-amber-900 font-semibold">
                  ⚠️ Amount exceeds outstanding balance of {formatRupees(outstandingPaise, true)}.
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-950">
                  <input
                    id="isAdvanceCheckbox"
                    type="checkbox"
                    checked={isAdvance}
                    onChange={(e) => setIsAdvance(e.target.checked)}
                    className="w-4 h-4 text-[#1E7A4B] border-2 border-[var(--ink)]"
                  />
                  <span>Mark as Advance Payment (Overrides wage dues limit)</span>
                </label>
              </div>
            ) : (
              <div className="text-[10px] text-[var(--ink-60)] mt-1 font-mono">
                Integer conversion: {targetAmountPaise} paise
              </div>
            )}
          </div>

          {/* Simulation Disclaimer Banner */}
          <div className="p-3 bg-[#FFFDF5] border border-[var(--site-orange)] text-[11px] font-mono text-[var(--ink)]">
            <span className="font-bold text-[var(--site-orange)]">ℹ SIMULATION NOTICE:</span> NPCI UPI integration is operating in <em>Simulated Test Mode</em> for sandbox evaluation. All recorded payments enter the <strong>PAID_CLAIMED</strong> state and are committed to the double-entry wage ledger upon worker confirmation.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                DISBURSEMENT CHANNEL *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full border-2 border-[var(--ink)] p-2 text-xs bg-white font-semibold"
              >
                <option value="UPI_SIMULATED">Simulated UPI (Test Mode) / प्रायोगिक यूपीआई</option>
                <option value="BANK_TRANSFER">Direct Bank Transfer (NEFT / IMPS / RTGS)</option>
                <option value="CASH">Direct Cash (Verified Voucher)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                PAYMENT REFERENCE NUMBER *
              </label>
              <input
                id="paymentReference"
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. UPI-984210, UTR #908124, or Cash Slip #42"
                className="w-full border-2 border-[var(--ink)] p-2 text-xs font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                PROOF RECEIPT / VOUCHER URL (OPTIONAL)
              </label>
              <input
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://... receipt image or document URL"
                className="w-full border border-[var(--ink)] p-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                TRANSACTION NOTES / PURPOSE
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Masonry wage settlement for Week 1"
                className="w-full border border-[var(--ink)] p-2 text-xs"
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
              variant="verified"
              size="md"
              fullWidth
              isLoading={isSubmitting}
              disabled={isBlockedOverpayment || contracts.length === 0}
              className="flex-1"
            >
              EXECUTE LEDGER DISBURSEMENT
            </Button>
          </div>
        </form>
      </div>

      {/* DISBURSEMENT HISTORY */}
      {pastTransactions.length > 0 && (
        <div className="mt-6 bg-white border-2 border-[var(--ink)] p-5">
          <div className="flex items-center justify-between border-b-2 border-[var(--ink)] pb-3 mb-4">
            <h2 className="text-sm font-bold uppercase text-[var(--ink)]">
              DISBURSEMENT HISTORY · पिछले भुगतान
            </h2>
            <span className="text-xs font-mono text-[var(--ink-60)]">
              {pastTransactions.length} RECORD(S)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--ink-20)] text-[10px] font-mono text-[var(--ink-60)] uppercase">
                  <th className="py-2 pr-3">DATE</th>
                  <th className="py-2 pr-3">REFERENCE</th>
                  <th className="py-2 pr-3">AMOUNT</th>
                  <th className="py-2 pr-3">METHOD</th>
                  <th className="py-2 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink-10)]">
                {pastTransactions.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-[var(--paper-dark)]">
                    <td className="py-2.5 pr-3 font-mono">
                      {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-2.5 pr-3 font-mono font-bold">
                      {tx.transaction_ref || tx.reference_number || `#${tx.id?.slice(0, 8).toUpperCase()}`}
                    </td>
                    <td className="py-2.5 pr-3 font-mono font-extrabold text-[#1E7A4B]">
                      {formatRupees(tx.amount_paise, true)}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px]">
                      {tx.payment_method || 'TRANSFER'}
                    </td>
                    <td className="py-2.5 text-right">
                      <StatusPill status={tx.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
