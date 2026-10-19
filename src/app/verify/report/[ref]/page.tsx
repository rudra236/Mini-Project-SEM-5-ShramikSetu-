'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icons } from '@/components/ui/icons';
import { paiseToRupeeDisplay } from '@/types/payment.types';

interface ComplaintVerificationData {
  status: 'VERIFIED' | 'TAMPERED' | 'NOT_FOUND';
  isValid: boolean;
  reportRef: string;
  version?: number;
  language?: string;
  generatedAt?: string;
  recipientType?: string;
  recipientName?: string;
  recipientAddress?: string;
  workerNameMasked?: string;
  occupation?: string;
  skillCategory?: string;
  contractorName?: string;
  contractorFirm?: string;
  projectName?: string;
  disputeCategory?: string;
  disputeStatus?: string;
  amountClaimedPaise?: number;
  totalVerifiedDays?: number;
  contentHash?: string;
  ledgerHash?: string;
}

export default function ComplaintReportVerifyPage({
  params,
}: {
  params: { ref: string };
}) {
  const reportRef = params.ref;
  const [data, setData] = useState<ComplaintVerificationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  useEffect(() => {
    if (!reportRef) {
      setIsLoading(false);
      return;
    }

    const verify = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/verify/report/${reportRef}`);
        const json = await res.json();
        if (json.verification) {
          setData(json.verification);
        } else {
          setError(json.error?.message || 'Failed to verify complaint report');
        }
      } catch (err: any) {
        setError(err.message || 'Network error verifying report');
      } finally {
        setIsLoading(false);
      }
    };

    verify();
  }, [reportRef]);

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-[var(--ink)] flex flex-col justify-between">
      {/* Top Header */}
      <header className="bg-white border-b-2 border-[var(--ink)] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-id font-bold text-lg tracking-wider text-[var(--ink)]">
              SHRAMIKSETU
            </span>
            <span className="text-[10px] font-mono uppercase bg-[#EBF7F0] text-[#1E7A4B] border border-[#1E7A4B] px-1.5 py-0.5 rounded-[2px] font-bold">
              STATUTORY VERIFICATION
            </span>
          </Link>
          <div className="text-[11px] font-mono text-[var(--ink-60)]">
            REF: {reportRef}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex-1">
        {isLoading ? (
          <div className="bg-white border-2 border-[var(--ink)] p-8 text-center shadow-sm">
            <div className="inline-block animate-spin w-8 h-8 border-4 border-[#1E3A8A] border-t-transparent rounded-full mb-3" />
            <div className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--ink)]">
              VERIFYING STATUTORY COMPLAINT REPORT...
            </div>
            <p className="text-xs text-[var(--ink-60)] mt-1">
              Validating SHA-256 integrity hash against ShramikSetu official registry.
            </p>
          </div>
        ) : error ? (
          <div className="bg-white border-2 border-[#B91C1C] p-6 text-center">
            <div className="w-12 h-12 bg-[#FEF2F2] border-2 border-[#B91C1C] rounded-full flex items-center justify-center mx-auto mb-3">
              <Icons.AlertTriangle size={24} className="text-[#B91C1C]" />
            </div>
            <h2 className="text-lg font-bold text-[#B91C1C] uppercase">Verification Error</h2>
            <p className="text-xs text-[var(--ink-60)] mt-1">{error}</p>
          </div>
        ) : data?.status === 'NOT_FOUND' ? (
          <div className="bg-white border-2 border-[#D97706] p-6 sm:p-8 shadow-sm">
            <div className="w-14 h-14 bg-[#FEF3C7] border-2 border-[#D97706] rounded-full flex items-center justify-center mx-auto mb-4">
              <Icons.AlertCircle size={30} className="text-[#D97706]" />
            </div>
            <div className="text-center">
              <span className="text-[11px] font-bold font-mono uppercase tracking-widest text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 border border-[#D97706]">
                INVALID REFERENCE · अमान्य संदर्भ
              </span>
              <h1 className="text-xl font-bold uppercase text-[var(--ink)] mt-2">
                Complaint Report Not Found
              </h1>
              <p className="text-xs text-[var(--ink-60)] mt-1 max-w-md mx-auto">
                No statutory complaint report with reference <strong className="font-mono text-[var(--ink)]">{reportRef}</strong> exists in the ShramikSetu official database.
              </p>
            </div>
          </div>
        ) : (
          /* VERIFIED STATUS */
          <div className="bg-white border-4 border-[var(--ink)] p-6 sm:p-8 shadow-sm">
            {/* Success Seal Header */}
            <div className="text-center border-b-2 border-[var(--ink)] pb-5 mb-5">
              <div className="w-14 h-14 bg-[#EBF7F0] border-2 border-[#1E7A4B] rounded-full flex items-center justify-center mx-auto mb-2">
                <Icons.CheckCircle size={32} className="text-[#1E7A4B]" />
              </div>
              <span className="text-[11px] font-bold font-mono uppercase tracking-widest text-[#1E7A4B] bg-[#EBF7F0] px-2 py-0.5 border border-[#1E7A4B] inline-block mb-1">
                OFFICIAL REPORT VERIFIED · प्रमाणित एवं सत्य
              </span>
              <h1 className="text-2xl font-bold uppercase text-[var(--ink)]">
                Statutory Labour Complaint Record
              </h1>
              <p className="text-xs text-[var(--ink-60)] mt-0.5">
                Authentic employment grievance document generated for police and labour office submission.
              </p>
              <div className="font-mono text-xs font-bold text-[var(--ink-60)] mt-1">
                REF: {data?.reportRef} (Version {data?.version})
              </div>
            </div>

            {/* Recipient Authority Block */}
            <div className="bg-[#FEF3C7] border border-[#F59E0B] p-4 mb-4">
              <div className="text-[10px] uppercase font-bold text-[#92400E] mb-1">
                FILED FOR SUBMISSION TO (प्राधिकारी विवरण):
              </div>
              <div className="text-sm font-bold text-[#1E293B]">
                {data?.recipientType === 'POLICE_STATION' ? 'The Station House Officer / OIC' : 'Labour Commissioner / Conciliation Officer'}, {data?.recipientName}
              </div>
              <div className="text-xs text-[#475569] mt-0.5">
                {data?.recipientAddress}
              </div>
            </div>

            {/* Parties Side by Side */}
            <div className="bg-[#FAF8F5] border border-[var(--ink-20)] p-4 mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    COMPLAINANT WORKER (शिकायतकर्ता)
                  </span>
                  <span className="font-id text-base font-bold uppercase text-[var(--ink)] block mt-0.5">
                    {data?.workerNameMasked}
                  </span>
                  <span className="text-[11px] text-[var(--ink-60)]">
                    {data?.occupation} ({data?.skillCategory})
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    RESPONDENT CONTRACTOR (अनावेदक)
                  </span>
                  <span className="font-id text-base font-bold uppercase text-[var(--ink)] block mt-0.5">
                    {data?.contractorName}
                  </span>
                  <span className="text-[11px] text-[var(--ink-60)]">
                    {data?.contractorFirm}
                  </span>
                </div>
              </div>
            </div>

            {/* Verified Claim Figures */}
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] mb-2">
                VERIFIED GRIEVANCE & FINANCIAL STATEMENT
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
                <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
                  <div className="font-data text-xl font-bold text-[#B91C1C]">
                    {paiseToRupeeDisplay(data?.amountClaimedPaise || 0)}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                    AMOUNT CLAIMED
                  </div>
                </div>

                <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
                  <div className="font-data text-xl font-bold text-[var(--ink)]">
                    {data?.totalVerifiedDays ?? 0}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                    VERIFIED SHIFTS
                  </div>
                </div>

                <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)] col-span-2 sm:col-span-1">
                  <div className="font-mono text-sm font-bold text-[#1E7A4B] truncate">
                    {data?.disputeCategory || 'WAGE_CLAIM'}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                    DISPUTE CATEGORY
                  </div>
                </div>
              </div>

              <div className="mt-2 p-3 bg-[#FAF8F5] border border-[var(--ink-20)] text-xs flex justify-between items-center">
                <span className="text-[var(--ink-60)]">PROJECT: <strong>{data?.projectName}</strong></span>
                <span className="font-mono text-[11px] text-[#1E7A4B] font-bold">STATUS: {data?.disputeStatus}</span>
              </div>
            </div>

            {/* Technical Verification Details */}
            <div>
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="w-full text-left text-xs font-mono font-bold text-[var(--ink-60)] hover:text-[var(--ink)] flex items-center justify-between py-2 border-t border-[var(--ink-20)]"
              >
                <span>{showTechnicalDetails ? '▾ HIDE' : '▸ VIEW'} CRYPTOGRAPHIC HASH ANCHORS</span>
                <span>SHA-256</span>
              </button>

              {showTechnicalDetails && (
                <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-20)] text-[10px] font-mono space-y-2 mt-2 break-all">
                  <div>
                    <span className="font-bold block text-[var(--ink-60)]">REPORT CONTENT HASH:</span>
                    <span className="text-[#1E7A4B] font-bold">{data?.contentHash}</span>
                  </div>
                  <div>
                    <span className="font-bold block text-[var(--ink-60)]">LEDGER STATE ANCHOR (PREV_HASH):</span>
                    <span className="text-[var(--ink)]">{data?.ledgerHash}</span>
                  </div>
                  {data?.generatedAt && (
                    <div>
                      <span className="font-bold block text-[var(--ink-60)]">GENERATED AT:</span>
                      <span>{new Date(data.generatedAt).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Visible Legal Disclaimer Footer */}
      <footer className="bg-white border-t-2 border-[var(--ink)] py-4 px-4 text-center">
        <div className="max-w-2xl mx-auto space-y-1">
          <div className="text-xs font-bold uppercase text-[var(--ink)]">
            ShramikSetu Statutory Verification Service
          </div>
          <div className="text-[11px] text-[var(--ink-60)]">
            <strong>DISCLAIMER:</strong> This is a system-generated summary of records on ShramikSetu, not a judicial judgment or FIR.
          </div>
        </div>
      </footer>
    </div>
  );
}
