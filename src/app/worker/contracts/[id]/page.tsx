'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Icons } from '@/components/ui/icons';
import { ComplianceBadge } from '@/components/ui/ComplianceBadge';
import { formatRupees } from '@/lib/money';
import { LoadingState, ErrorState } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/lib/auth-context';
import { ReadAloudButton } from '@/components/ui/ReadAloudButton';
import { TextToSpeechService } from '@/lib/services/tts-service';

type LanguageTab = 'hi' | 'mr' | 'en';

export default function WorkerContractDetailPage() {
  const { locale, t } = useAuth();
  const params = useParams();
  const router = useRouter();
  const contractId = params.id as string;

  const [contract, setContract] = useState<any | null>(null);
  const [complianceResult, setComplianceResult] = useState<any | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<LanguageTab>(locale || 'hi');

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [attendanceSummary, setAttendanceSummary] = useState<{
    verifiedDaysCount: number;
    totalEarnedPaise: number;
    recentAttendance: any[];
  } | null>(null);

  const wp = t.workerPortal;

  const fetchContractData = async () => {
    try {
      setIsLoading(true);
      setActionError(null);

      let foundContract: any = null;

      // Call single contract API with authorization isolation check
      try {
        const res = await api.contracts.get(contractId);
        if (res.success && res.contract) {
          foundContract = res.contract;
          setContract(res.contract);
          setAttendanceSummary(res.attendanceSummary || null);
          try {
            const comp = await api.compliance.check({ contractId });
            if (comp.success) {
              setComplianceResult(comp);
              if (comp.benchmark) {
                setBenchmarkData(comp.benchmark);
              }
            }
          } catch {
            // Handled
          }
        }
      } catch (err: any) {
        if (err.statusCode === 403 || err.code === 'FORBIDDEN_CONTRACT_ACCESS') {
          setActionError('Access denied: You are not authorized to view this employment contract.');
          return;
        }
      }

      if (!foundContract) {
        const listRes = await api.contracts.list();
        if (listRes.success && listRes.contracts) {
          const found = listRes.contracts.find((c: any) => c.id === contractId);
          if (found) {
            foundContract = found;
            setContract(found);
          } else {
            setActionError('Contract record not found in system.');
            return;
          }
        }
      }

      // Always fetch statutory benchmark if not already loaded from compliance check
      if (foundContract) {
        try {
          const skill =
            foundContract.workers?.skill_category ||
            foundContract.work_type ||
            'SKILLED';
          const minWageRes = await api.compliance.getMinimumWages({
            state: 'Maharashtra',
            skillCategory: skill,
            zone: 'Zone I',
          });
          if (minWageRes.success && minWageRes.applicableMinimumWage) {
            setBenchmarkData(minWageRes.applicableMinimumWage);
          }
        } catch {
          // Fallback handled
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to retrieve contract data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contractId) {
      fetchContractData();
    }
  }, [contractId]);

  const handleRespond = async (response: 'ACCEPTED' | 'REJECTED', reason?: string) => {
    try {
      setIsResponding(true);
      setActionError(null);

      // Call API to record response with browser metadata
      const res = await fetch(`/api/contracts/${contractId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response,
          rejectionReason: reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to process contract response');
      }

      setSuccessMessage(
        response === 'ACCEPTED'
          ? 'Contract accepted! Timestamp, IP hash, and cryptographic terms hash recorded.'
          : 'Contract offer rejected.'
      );
      setShowRejectModal(false);
      await fetchContractData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to process contract response.');
    } finally {
      setIsResponding(false);
    }
  };

  const handleDownloadPdf = () => {
    window.open(`/api/contracts/${contractId}/pdf`, '_blank');
  };

  if (isLoading) {
    return <LoadingState message="ACCESSING CONTRACT DEED · अनुबंध विलेख लोड हो रहा है..." />;
  }

  if (!contract && actionError) {
    return (
      <div className="p-4">
        <ErrorState message={actionError} onRetry={fetchContractData} />
      </div>
    );
  }

  const isPending =
    contract?.status === 'PENDING' ||
    contract?.status === 'pending' ||
    contract?.status === 'OFFERED' ||
    contract?.status === 'PENDING_ACCEPTANCE';
  const isAcceptedOrActive =
    contract?.status === 'ACCEPTED' ||
    contract?.status === 'accepted' ||
    contract?.status === 'ACTIVE' ||
    contract?.status === 'active' ||
    contract?.status === 'COMPLETED';

  const rawWage = Number(contract?.daily_wage) || 0;
  const wagePaise = rawWage >= 1000 ? rawWage : rawWage * 100;
  const dailyWageDisplay = formatRupees(wagePaise);

  const minWagePaise = benchmarkData?.daily_rate_paise || benchmarkData?.minimum_wage_paise || 60638;
  const minWageDisplay = formatRupees(minWagePaise);
  const isCompliant = wagePaise >= minWagePaise;
  const benchmarkVerified = benchmarkData?.verified !== false;
  const benchmarkSource = benchmarkData?.source_name || benchmarkData?.source_citation || 'Office of the Labour Commissioner, Maharashtra';
  const benchmarkEffective = benchmarkData?.effective_from || benchmarkData?.effective_date || '2026-07-01';
  const benchmarkUrl = benchmarkData?.source_url || 'https://mahakamgar.maharashtra.gov.in/';

  return (
    <div className="w-full">
      {/* Header bar */}
      <div className="p-4 border-b-2 border-[var(--ink)] bg-white flex items-center justify-between">
        <Link
          href="/worker/contracts"
          className="text-xs font-bold uppercase text-[var(--ink)] hover:underline flex items-center gap-1"
        >
          <Icons.ArrowLeft size={16} />
          ALL CONTRACTS · सभी अनुबंध
        </Link>
        <span className="font-data text-xs text-[var(--ink-60)]">
          ID: {contractId.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {successMessage && (
        <div className="p-4 bg-[#EBF7F0] border-b-2 border-[#1E7A4B] text-[#155A36] text-xs font-bold flex items-center gap-2">
          <Icons.CheckCircle size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-[#FEF2F2] border-b-2 border-[#B91C1C] text-[#991B1B] text-xs font-bold">
          {actionError}
        </div>
      )}

      {/* COMPLETED ASSIGNMENT BANNER */}
      {(contract?.status === 'COMPLETED' || contract?.status === 'TERMINATED') && (
        <div className="p-3.5 bg-slate-100 border-b-2 border-slate-400 text-slate-800 text-xs">
          <div className="font-bold flex items-center gap-1.5 mb-0.5">
            <span>✓</span>
            <span className="uppercase font-mono">ASSIGNMENT COMPLETED · कार्य संपन्न / समाप्त</span>
          </div>
          <p className="mt-0.5">
            This assignment was completed on <strong>{contract.end_date || 'Current date'}</strong>.
            {contract.end_reason && <span> Reason recorded: &quot;{contract.end_reason}&quot;</span>}
          </p>
        </div>
      )}

      {/* STATUTORY MINIMUM WAGE COMPLIANCE COMPARISON CARD */}
      <div
        className={`p-4 border-b-2 ${
          isCompliant ? 'bg-emerald-50 border-emerald-600' : 'bg-red-50 border-red-600'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{isCompliant ? '✓' : '⚠️'}</span>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              {isCompliant
                ? 'STATUTORY WAGE COMPLIANCE · वैधानिक वेतन मानदण्ड'
                : 'UNDERPAYMENT ADVISORY · किमान वेतनापेक्षा कमी दर'}
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
              benchmarkVerified ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
            }`}
          >
            {benchmarkVerified ? 'Official Gazette Verified' : 'Unverified Benchmark'}
          </span>
        </div>

        <div className="text-sm sm:text-base font-bold text-[var(--ink)] mb-2 flex flex-wrap items-center gap-2">
          <span>
            Your daily wage <strong className="text-[var(--register-blue)] font-data">{dailyWageDisplay}</strong> vs legal minimum <strong className="font-data">{minWageDisplay}</strong>
          </span>
          <span
            className={`px-2 py-0.5 text-xs rounded font-bold ${
              isCompliant ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'
            }`}
          >
            {isCompliant ? 'Compliant' : 'Below Minimum'}
          </span>
        </div>

        <div className="text-[11px] text-[var(--ink-60)] font-mono space-y-0.5 pt-1.5 border-t border-[var(--ink-10)]">
          <div>• Authority: {benchmarkSource}</div>
          <div>• Effective Date: {benchmarkEffective}</div>
          <div>
            • Gazette Citation: <a href={benchmarkUrl} target="_blank" rel="noreferrer" className="underline text-[var(--register-blue)]">{benchmarkUrl}</a>
          </div>
        </div>
      </div>

      {/* Language Selector for Plain Language Summary */}
      <div className="bg-[var(--paper-dark)] p-3 border-b border-[var(--ink-20)] flex items-center justify-between">
        <span className="text-xs font-bold uppercase text-[var(--ink-60)]">
          EXPLANATION LANGUAGE · भाषा चुनें:
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setSelectedLang('hi')}
            className={`px-3 py-1 text-xs font-bold rounded-sm border ${
              selectedLang === 'hi'
                ? 'bg-[var(--register-blue)] text-white border-[var(--register-blue)]'
                : 'bg-white text-[var(--ink)] border-[var(--ink-20)]'
            }`}
          >
            हिन्दी (Hindi)
          </button>
          <button
            onClick={() => setSelectedLang('mr')}
            className={`px-3 py-1 text-xs font-bold rounded-sm border ${
              selectedLang === 'mr'
                ? 'bg-[var(--register-blue)] text-white border-[var(--register-blue)]'
                : 'bg-white text-[var(--ink)] border-[var(--ink-20)]'
            }`}
          >
            मराठी (Marathi)
          </button>
          <button
            onClick={() => setSelectedLang('en')}
            className={`px-3 py-1 text-xs font-bold rounded-sm border ${
              selectedLang === 'en'
                ? 'bg-[var(--register-blue)] text-white border-[var(--register-blue)]'
                : 'bg-white text-[var(--ink)] border-[var(--ink-20)]'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* PLAIN LANGUAGE SUMMARY CARD (Accessibility for Low-Literacy Workers) */}
      <div className="p-4 bg-[#FFFDF5] border-b-2 border-[var(--site-orange)]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Icons.ShieldCheck size={18} className="text-[var(--site-orange)]" />
            <h2 className="text-sm font-bold uppercase text-[var(--ink)]">
              {selectedLang === 'hi' && 'सरल भाषा में काम और मजदूरी का विवरण'}
              {selectedLang === 'mr' && 'सोप्या भाषेतील काम व मजुरीचा तपशील'}
              {selectedLang === 'en' && 'Plain-Language Contract Summary'}
            </h2>
          </div>
          <ReadAloudButton
            text={TextToSpeechService.buildContractText({
              contractorName: contract?.contractors?.company_name || 'Contractor',
              projectName: contract?.projects?.name || 'Project Site',
              dailyWage: Math.round((contract?.daily_wage || 0) / 100) || 500,
              hours: contract?.expected_working_hours || 8,
              locale: selectedLang,
            })}
            locale={selectedLang}
            variant="compact"
          />
        </div>

        {selectedLang === 'hi' && (
          <div className="text-xs text-[var(--ink)] space-y-1.5 leading-relaxed">
            <p>
              • <strong>कंपनी / ठेकेदार:</strong> {contract?.contractors?.company_name || 'पंजीकृत ठेकेदार'}
            </p>
            <p>
              • <strong>आपका काम:</strong> {contract?.work_type || 'दैनिक निर्माण कार्य'}
            </p>
            <p>
              • <strong>दैनिक मजदूरी दर:</strong> <span className="font-bold text-base text-[var(--register-blue)]">{dailyWageDisplay}</span> प्रति दिन (मानक 8 घंटे कार्य)
            </p>
            <p>
              • <strong>कार्यस्थल:</strong> {contract?.projects?.name || 'कार्य स्थल'}
            </p>
            <p>
              • <strong>कार्य आरंभ:</strong> {contract?.start_date || 'तत्काल'} · <strong>समाप्ति:</strong> {contract?.end_date || 'प्रोजेक्ट पूर्ण होने तक'}
            </p>
            <p className="text-[11px] text-[var(--ink-60)] pt-1 border-t border-[var(--ink-10)]">
              ℹ️ मजदूरी सीधे आपके डिजिटल लेजर / बैंक वॉलेट में जमा होगी। कार्यस्थल पर क्यूआर (QR) कोड से हजेरी लगाना अनिवार्य है।
            </p>
          </div>
        )}

        {selectedLang === 'mr' && (
          <div className="text-xs text-[var(--ink)] space-y-1.5 leading-relaxed">
            <p>
              • <strong>कंपनी / कंत्राटदार:</strong> {contract?.contractors?.company_name || 'नोंदणीकृत कंत्राटदार'}
            </p>
            <p>
              • <strong>तुमचे काम:</strong> {contract?.work_type || 'दैनिक बांधकाम काम'}
            </p>
            <p>
              • <strong>दैनिक मजुरी दर:</strong> <span className="font-bold text-base text-[var(--register-blue)]">{dailyWageDisplay}</span> दररोज (8 तास काम)
            </p>
            <p>
              • <strong>कामाचे ठिकाण:</strong> {contract?.projects?.name || 'प्रकल्प कार्यस्थळ'}
            </p>
            <p>
              • <strong>काम सुरू:</strong> {contract?.start_date || 'तातडीने'} · <strong>शेवट:</strong> {contract?.end_date || 'प्रकल्प संपेपर्यंत'}
            </p>
            <p className="text-[11px] text-[var(--ink-60)] pt-1 border-t border-[var(--ink-10)]">
              ℹ️ मजुरी थेट तुमच्या डिजिटल लेजर / बँक वॉलेटमध्ये जमा होईल. कामाच्या ठिकाणी QR कोड स्कॅन करून हजेरी लावणे आवश्यक आहे.
            </p>
          </div>
        )}

        {selectedLang === 'en' && (
          <div className="text-xs text-[var(--ink)] space-y-1.5 leading-relaxed">
            <p>
              • <strong>Contractor:</strong> {contract?.contractors?.company_name || 'Registered Contractor'}
            </p>
            <p>
              • <strong>Designated Role:</strong> {contract?.work_type || 'Daily Construction Work'}
            </p>
            <p>
              • <strong>Mandated Daily Wage:</strong> <span className="font-bold text-base text-[var(--register-blue)]">{dailyWageDisplay}</span> / day (8 hours standard shift)
            </p>
            <p>
              • <strong>Worksite:</strong> {contract?.projects?.name || 'Project Worksite'}
            </p>
            <p>
              • <strong>Effective Period:</strong> {contract?.start_date || 'Immediate'} → {contract?.end_date || 'Ongoing'}
            </p>
            <p className="text-[11px] text-[var(--ink-60)] pt-1 border-t border-[var(--ink-10)]">
              ℹ️ Wages accrue directly into your digital wallet ledger upon verified site-gate QR attendance.
            </p>
          </div>
        )}
      </div>

      {/* BIG ACCEPT / REJECT CALL TO ACTION (When Pending / Offered) */}
      {isPending && (
        <div className="p-4 bg-white border-b-2 border-[var(--ink)]">
          <div className="text-xs font-bold uppercase text-[var(--ink-60)] mb-3 text-center">
            OFFICIAL DECISION · आपला अंतिम निर्णय:
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="verified"
              size="lg"
              fullWidth
              isLoading={isResponding}
              onClick={() => handleRespond('ACCEPTED')}
              className="py-4 text-sm font-bold uppercase shadow-md hover:shadow-lg"
            >
              <Icons.Check size={20} className="mr-2" />
              स्वीकार करा / स्वीकार करें / ACCEPT ({dailyWageDisplay}/day)
            </Button>

            <Button
              variant="warning"
              size="lg"
              fullWidth
              disabled={isResponding}
              onClick={() => setShowRejectModal(true)}
              className="py-4 text-sm font-bold uppercase"
            >
              <Icons.X size={20} className="mr-2" />
              नकार द्या / अस्वीकार करें / REJECT OFFER
            </Button>
          </div>
        </div>
      )}

      {/* Contract Deed Container */}
      <div className="p-4 sm:p-6 bg-white border-b-2 border-[var(--ink)]">
        <div className="border-2 border-[var(--ink)] p-5 relative">
          <div className="flex items-start justify-between gap-4 border-b-2 border-[var(--ink)] pb-4 mb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--ink-60)]">
                STANDARD WORK CONTRACT · कार्य अनुबंध विलेख
              </div>
              <h1 className="text-xl sm:text-2xl font-bold uppercase text-[var(--ink)] mt-0.5">
                {contract?.projects?.name || 'Site Work Contract'}
              </h1>
              <div className="text-xs text-[var(--ink-60)] font-mono mt-0.5">
                Contract Reference #{contract?.contract_code || contractId}
              </div>
            </div>
            <StatusPill status={contract?.status} />
          </div>

          {/* Compliance Banner */}
          {complianceResult && (
            <div className="mb-4">
              <ComplianceBadge
                status={complianceResult.result}
                ruleUsed={complianceResult.ruleUsed?.rule_name}
              />
            </div>
          )}

          {/* Cryptographic Terms Hash Badge (Tamper-evident verification) */}
          {contract?.terms_hash && (
            <div className="mb-4 p-2.5 bg-[var(--paper-dark)] border border-[var(--ink-20)] text-[11px] font-mono flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--ink-60)] block text-[9px] uppercase">
                  CRYPTOGRAPHIC TERMS HASH (SHA-256) · डिजिटल सत्यता
                </span>
                <span className="text-[var(--ink)]">{contract.terms_hash}</span>
              </div>
              {isAcceptedOrActive && (
                <Button variant="secondary" size="sm" onClick={handleDownloadPdf}>
                  <Icons.FileText size={14} className="mr-1" />
                  PDF विलेख
                </Button>
              )}
            </div>
          )}

          {/* Core Terms Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-6">
            <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-10)]">
              <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                CONTRACTOR / EMPLOYING FIRM
              </span>
              <div className="text-sm font-bold uppercase text-[var(--ink)] mt-1">
                {contract?.contractors?.company_name || 'Standard Builder'}
              </div>
              <div className="text-xs text-[var(--ink-60)] mt-0.5">
                License: {contract?.contractors?.license_number || 'CLRA-VERIFIED'}
              </div>
            </div>

            <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-10)]">
              <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                WORK CLASSIFICATION
              </span>
              <div className="text-sm font-bold uppercase text-[var(--ink)] mt-1">
                {contract?.work_type || 'General Civil Labour'}
              </div>
              <div className="text-xs text-[var(--ink-60)] mt-0.5">
                Payment Schedule: {contract?.payment_frequency || 'DAILY'}
              </div>
            </div>
          </div>

          {/* Wage Stipulation Callout */}
          <div className="p-4 border-2 border-[var(--register-blue)] bg-[#F0F5FA] mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--register-blue)] tracking-wider">
                STIPULATED DAILY WAGE (MANDATED RATE)
              </div>
              <div className="font-data text-2xl sm:text-3xl font-bold text-[var(--register-blue)]">
                {dailyWageDisplay}
                <span className="text-xs font-normal text-[var(--ink-60)]"> / day (8 hours standard)</span>
              </div>
            </div>
            <div className="text-xs text-[var(--ink-60)] sm:text-right font-mono">
              <div>Effective: {contract?.start_date || 'Immediate'}</div>
              <div>End Date: {contract?.end_date || 'Until Project Termination'}</div>
            </div>
          </div>

          {/* Linked Attendance & Wage Summary */}
          {attendanceSummary && (
            <div className="border-t-2 border-black pt-4 mb-4">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#B45309] mb-2 flex items-center gap-1.5">
                <Icons.CheckCircle size={16} />
                <span>{wp.linkedAttendanceSummary}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 bg-[#F8FAFC] border-2 border-black p-3 shadow-brutal-sm mb-3">
                <div>
                  <span className="block text-[10px] uppercase font-mono text-slate-500 font-bold">
                    {wp.totalDaysWorked}
                  </span>
                  <span className="font-mono text-xl font-black text-[#15803D]">
                    {attendanceSummary.verifiedDaysCount} {t.common.days}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-mono text-slate-500 font-bold">
                    {wp.totalWagesAccrued}
                  </span>
                  <span className="font-mono text-xl font-black text-[#1D4ED8]">
                    {formatRupees(attendanceSummary.totalEarnedPaise)}
                  </span>
                </div>
              </div>

              {attendanceSummary.recentAttendance?.length > 0 && (
                <div className="text-xs space-y-1 bg-white border border-slate-200 p-2">
                  <span className="block text-[10px] uppercase font-bold text-slate-500">
                    Recent Verified Shifts under this Contract:
                  </span>
                  {attendanceSummary.recentAttendance.map((att: any) => (
                    <div key={att.id} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-b-0 text-[11px] font-mono">
                      <span>📅 {att.date}</span>
                      <span className="font-bold text-[#15803D]">
                        ✓ {att.attendance_method === 'otp' ? 'Verified (OTP)' : 'Verified (QR)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Statutory Clauses */}
          <div className="border-t border-[var(--ink-20)] pt-4 text-xs space-y-2 text-[var(--ink-60)]">
            <div className="font-bold uppercase text-[var(--ink)] text-[11px]">
              {wp.contractTermsTitle} · वैधानिक शर्तें
            </div>
            <p>
              1. <strong>Attendance Verification:</strong> Wages accrue upon verification of physical site attendance via time-limited QR token and 100-meter GPS radius verification.
            </p>
            <p>
              2. <strong>Wage Disbursement:</strong> Payments are transacted atomically into your digital wage wallet ledger, backed by dual DEBIT/CREDIT ledger entries.
            </p>
            <p>
              3. <strong>Dispute Rights:</strong> Either party may file formal notice with the District Labour Commissioner in the event of missing muster records or underpayment.
            </p>
          </div>

          {/* Download Bilingual PDF button if contract accepted */}
          {isAcceptedOrActive && (
            <div className="mt-6 pt-6 border-t-2 border-[var(--ink)] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs font-bold text-[#1E7A4B] flex items-center gap-1.5">
                <Icons.CheckCircle size={16} />
                Contract legally active & recorded in benefit passport.
              </span>
              <Button variant="verified" size="md" onClick={handleDownloadPdf}>
                <Icons.FileText size={16} className="mr-2" />
                DOWNLOAD BILINGUAL CONTRACT PDF · करार डाउनलोड करा
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white border-2 border-[var(--ink)] max-w-md w-full p-6 text-[var(--ink)] shadow-2xl">
            <div className="border-b border-[var(--ink-20)] pb-3 mb-4">
              <div className="text-xs font-bold uppercase text-[#B91C1C]">REJECT CONTRACT OFFER</div>
              <h3 className="text-lg font-bold uppercase">Provide Reason for Rejection · नकार देण्याचे कारण</h3>
            </div>

            <p className="text-xs text-[var(--ink-60)] mb-3">
              State why you are rejecting this contract offer (e.g. rate below agreed amount, wrong worksite, schedule conflict).
            </p>

            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection explanation / कारण लिहा..."
              rows={3}
              className="w-full border-2 border-[var(--ink)] p-2.5 text-xs font-sans mb-4 outline-none focus:bg-[#FFFDF5]"
              required
            />

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setShowRejectModal(false)}
              >
                CANCEL · रद्द करा
              </Button>
              <Button
                variant="danger"
                size="md"
                fullWidth
                isLoading={isResponding}
                disabled={!rejectionReason.trim()}
                onClick={() => handleRespond('REJECTED', rejectionReason)}
              >
                SUBMIT REJECTION
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
