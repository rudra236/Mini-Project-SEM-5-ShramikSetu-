'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';

interface PublicVerificationData {
  status: 'VERIFIED' | 'TAMPERED' | 'NOT_FOUND';
  isValid?: boolean;
  type?: 'COMPLAINT_REPORT' | 'CREDENTIAL';
  reference?: string;
  credentialRef?: string;
  claimedAmountRupees?: number;
  generatedAt?: string;
  hashMatchesRecord?: boolean;
  shortHash?: string;
  workerNameMasked?: string;
  skillCategory?: string;
  occupation?: string;
  totalVerifiedWorkdays?: number;
  gpsValidityPercent?: number;
  employerRelationshipsCount?: number;
  disputesResolvedInFavourCount?: number;
  totalEarnedRupees?: number | null;
  issuedAt?: string;
  ledgerHashAtIssuance?: string;
  credentialHash?: string;
  tamperReason?: string;
  guarantees?: {
    ledgerChained: boolean;
    tamperEvident: boolean;
    guaranteedStatements: string[];
    nonGuaranteedDisclaimers: string[];
  };
}

export default function PublicVerifyPage({ params }: { params: { ref: string } }) {
  const credentialRef = params.ref;
  const [data, setData] = useState<PublicVerificationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  useEffect(() => {
    if (!credentialRef) {
      setIsLoading(false);
      return;
    }

    const verify = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/verify/${credentialRef}`);
        const json = await res.json();
        if (json.verification) {
          setData(json.verification);
        } else {
          setError(json.error?.message || 'Failed to verify credential');
        }
      } catch (err: any) {
        setError(err.message || 'Network error verifying credential');
      } finally {
        setIsLoading(false);
      }
    };

    verify();
  }, [credentialRef]);

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
              PUBLIC VERIFICATION
            </span>
          </Link>
          <div className="text-[11px] font-mono text-[var(--ink-60)]">
            REF: {credentialRef}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex-1">
        {isLoading ? (
          <div className="bg-white border-2 border-[var(--ink)] p-8 text-center shadow-sm">
            <div className="inline-block animate-spin w-8 h-8 border-4 border-[#1E3A8A] border-t-transparent rounded-full mb-3" />
            <div className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--ink)]">
              VERIFYING CRYPTOGRAPHIC LEDGER PROOF...
            </div>
            <p className="text-xs text-[var(--ink-60)] mt-1">
              Checking SHA-256 hash match against double-entry ledger root.
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
                Credential Not Found
              </h1>
              <p className="text-xs text-[var(--ink-60)] mt-1 max-w-md mx-auto">
                No verified work record with certificate reference <strong className="font-mono text-[var(--ink)]">{credentialRef}</strong> exists in the ShramikSetu registry.
              </p>
            </div>
          </div>
        ) : data?.status === 'TAMPERED' ? (
          <div className="bg-white border-4 border-[#B91C1C] p-6 sm:p-8 shadow-md">
            {/* Tampered Warning Banner */}
            <div className="bg-[#FEF2F2] border-2 border-[#B91C1C] p-4 text-center mb-6">
              <div className="w-14 h-14 bg-[#FEE2E2] border-2 border-[#B91C1C] rounded-full flex items-center justify-center mx-auto mb-2">
                <Icons.AlertTriangle size={32} className="text-[#B91C1C]" />
              </div>
              <span className="text-[11px] font-bold font-mono uppercase tracking-widest text-[#991B1B] bg-[#FEE2E2] px-2 py-0.5 border border-[#B91C1C] inline-block mb-1">
                INTEGRITY CHECK FAILED · छेड़छाड़ की गई
              </span>
              <h1 className="text-2xl font-black uppercase text-[#991B1B] tracking-tight">
                RECORD TAMPERED / HASH MISMATCH
              </h1>
              <p className="text-xs text-[#7F1D1D] font-semibold mt-1">
                WARNING: The underlying database row or snapshot has been altered after issuance.
                The computed SHA-256 hash does not match the ledger state.
              </p>
            </div>

            <div className="border border-[var(--ink-20)] p-4 bg-[#FAF8F5] text-xs font-mono space-y-2 mb-6">
              <div>
                <span className="font-bold text-[var(--ink-60)]">CERTIFICATE REF:</span>{' '}
                <span className="font-bold text-[#B91C1C]">{credentialRef}</span>
              </div>
              <div>
                <span className="font-bold text-[var(--ink-60)]">FAILURE REASON:</span>{' '}
                <span className="text-[#B91C1C]">{data.tamperReason || 'Cryptographic snapshot mismatch'}</span>
              </div>
              {data.issuedAt && (
                <div>
                  <span className="font-bold text-[var(--ink-60)]">ORIGINAL ISSUANCE:</span>{' '}
                  <span>{new Date(data.issuedAt).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-xs text-[var(--ink-60)]">
                Third parties (banks, landlords, employers) MUST NOT accept this document.
              </p>
            </div>
          </div>
        ) : (data?.claimedAmountRupees !== undefined || data?.type === 'COMPLAINT_REPORT') ? (
          /* COMPLAINT REPORT PUBLIC VERIFICATION (STRICT ZERO PERSONAL DATA) */
          <div className="bg-white border-4 border-[var(--ink)] p-6 sm:p-8 shadow-sm">
            <div className="text-center border-b-2 border-[var(--ink)] pb-5 mb-5">
              <div className="w-14 h-14 bg-[#EBF7F0] border-2 border-[#1E7A4B] rounded-full flex items-center justify-center mx-auto mb-2">
                <Icons.CheckCircle size={32} className="text-[#1E7A4B]" />
              </div>
              <span className="text-[11px] font-bold font-mono uppercase tracking-widest text-[#1E7A4B] bg-[#EBF7F0] px-2 py-0.5 border border-[#1E7A4B] inline-block mb-1">
                PUBLIC RECORD VERIFIED · प्रामाणिक अभिलेख
              </span>
              <h1 className="text-2xl font-bold uppercase text-[var(--ink)]">
                Complaint Report Verification
              </h1>
              <p className="text-xs text-[var(--ink-60)] mt-0.5">
                Statutory summary record integrity verification.
              </p>
              <div className="font-mono text-xs font-bold text-[var(--ink-60)] mt-1">
                REF: {data?.reference || credentialRef}
              </div>
            </div>

            {/* Privacy-Safe Attestation Strip: strictly ONLY reference, status, claimed amount, generated date, hash matches record */}
            <div className="bg-[#FAF8F5] border border-[var(--ink-20)] p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    REFERENCE NUMBER
                  </span>
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {data?.reference || credentialRef}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    STATUS
                  </span>
                  <span className="text-sm font-bold text-[#1E7A4B]">
                    {data?.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    CLAIMED AMOUNT
                  </span>
                  <span className="text-sm font-bold text-[var(--site-orange)]">
                    ₹{data?.claimedAmountRupees?.toLocaleString('en-IN') ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    GENERATED DATE
                  </span>
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {data?.generatedAt ? new Date(data.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Recorded on Ledger'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    HASH MATCHES RECORD
                  </span>
                  <span className={`text-sm font-bold ${data?.hashMatchesRecord ? 'text-[#1E7A4B]' : 'text-[#DC2626]'}`}>
                    {data?.hashMatchesRecord ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    INTEGRITY SHORT HASH
                  </span>
                  <span className="text-sm font-bold text-[var(--ink)]">
                    {data?.shortHash || 'VERIFIED'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 text-[11px] text-blue-900">
                <strong>Notice:</strong> This public verification page shows only platform metadata. No personal complainant or respondent information is disclosed.
              </div>
            </div>
          </div>
        ) : (
          /* VERIFIED STATUS FOR PASSPORT / WORK CREDENTIAL */
          <div className="bg-white border-4 border-[var(--ink)] p-6 sm:p-8 shadow-sm">
            {/* Success Seal Header */}
            <div className="text-center border-b-2 border-[var(--ink)] pb-5 mb-5">
              <div className="w-14 h-14 bg-[#EBF7F0] border-2 border-[#1E7A4B] rounded-full flex items-center justify-center mx-auto mb-2">
                <Icons.CheckCircle size={32} className="text-[#1E7A4B]" />
              </div>
              <span className="text-[11px] font-bold font-mono uppercase tracking-widest text-[#1E7A4B] bg-[#EBF7F0] px-2 py-0.5 border border-[#1E7A4B] inline-block mb-1">
                CRYPTOGRAPHICALLY VERIFIED · प्रमाणित एवं सत्य
              </span>
              <h1 className="text-2xl font-bold uppercase text-[var(--ink)]">
                ShramikSetu Verified Work Record
              </h1>
              <p className="text-xs text-[var(--ink-60)] mt-0.5">
                Privacy-safe credential verification anchored to the append-only wage ledger.
              </p>
              <div className="font-mono text-xs font-bold text-[var(--ink-60)] mt-1">
                REF: {data?.credentialRef}
              </div>
            </div>

            {/* Privacy-Safe Worker Details */}
            <div className="bg-[#FAF8F5] border border-[var(--ink-20)] p-4 mb-5">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    WORKER NAME (PRIVACY MASKED)
                  </span>
                  <span className="font-id text-base font-bold uppercase text-[var(--ink)]">
                    {data?.workerNameMasked}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    SKILL CATEGORY
                  </span>
                  <span className="font-bold uppercase text-[var(--register-blue)]">
                    {data?.skillCategory} · {data?.occupation}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    ISSUANCE TIMESTAMP
                  </span>
                  <span className="font-mono font-semibold">
                    {data?.issuedAt ? new Date(data.issuedAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }) : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                    INTEGRITY STATUS
                  </span>
                  <span className="font-mono font-bold text-[#1E7A4B]">
                    UNALTERED RECORD ✓
                  </span>
                </div>
              </div>
            </div>

            {/* Verified Career Metrics Strip */}
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] mb-2">
                VERIFIED SERVICE METRICS · प्रमाणित कार्य विवरण
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
                  <div className="font-data text-xl font-bold text-[var(--ink)]">
                    {data?.totalVerifiedWorkdays ?? 0}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                    VERIFIED SHIFTS
                  </div>
                </div>

                <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
                  <div className="font-data text-xl font-bold text-[var(--register-blue)]">
                    {data?.gpsValidityPercent ?? 100}%
                  </div>
                  <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                    GPS VALIDITY
                  </div>
                </div>

                <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
                  <div className="font-data text-xl font-bold text-[var(--ink)]">
                    {data?.employerRelationshipsCount ?? 0}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                    EMPLOYERS
                  </div>
                </div>

                <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
                  <div className="font-data text-xl font-bold text-[#1E7A4B]">
                    {data?.disputesResolvedInFavourCount ?? 0}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                    FAVOUR RULINGS
                  </div>
                </div>
              </div>

              {/* Earnings (Consent Guarded) */}
              <div className="mt-2 p-3 bg-[var(--paper-dark)] border border-[var(--ink-20)] flex justify-between items-center text-xs">
                <span className="font-semibold text-[var(--ink-60)]">LIFETIME VERIFIED EARNINGS:</span>
                {data?.totalEarnedRupees !== null && data?.totalEarnedRupees !== undefined ? (
                  <span className="font-data font-bold text-base text-[#1E7A4B]">
                    ₹{data.totalEarnedRupees.toLocaleString('en-IN')}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-[var(--ink-40)] italic">
                    Hidden by Worker Privacy Consent (गोपनीय)
                  </span>
                )}
              </div>
            </div>

            {/* Documented Guarantees vs Non-Guarantees */}
            <div className="border border-[var(--ink-20)] p-4 bg-[#FAF8F5] mb-5 text-xs">
              <div className="font-bold uppercase text-[var(--ink)] mb-2 flex items-center">
                <Icons.ShieldCheck size={16} className="text-[#1E7A4B] mr-1.5" />
                GUARANTEED BY LEDGER PROOF
              </div>
              <ul className="space-y-1 text-[var(--ink-60)] list-disc list-inside mb-3">
                <li>Shift attendance and GPS presence validation match the immutable ledger state at time of issuance.</li>
                <li>Wage claims are chained to append-only double-entry ledger entries (cannot be silently altered).</li>
                <li>Arbitration rulings reflect official records submitted before statutory inspectors.</li>
              </ul>

              <div className="font-bold uppercase text-[var(--ink-60)] mb-1 text-[11px]">
                WHAT IS NOT GUARANTEED (DISCLAIMERS)
              </div>
              <ul className="space-y-1 text-[var(--ink-40)] list-disc list-inside text-[11px]">
                <li>This is NOT a government-issued identity card, passport, or Aadhaar KYC document.</li>
                <li>Reflects historical state at issue date; ongoing shifts require a refreshed credential.</li>
                <li>Informal cash transactions outside platform contracts are not recorded.</li>
              </ul>
            </div>

            {/* Technical Verification Details Drawer */}
            <div>
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="w-full text-left text-xs font-mono font-bold text-[var(--ink-60)] hover:text-[var(--ink)] flex items-center justify-between py-2 border-t border-[var(--ink-20)]"
              >
                <span>{showTechnicalDetails ? '▾ HIDE' : '▸ VIEW'} CRYPTOGRAPHIC HASH CHAIN ANCHORS</span>
                <span>SHA-256</span>
              </button>

              {showTechnicalDetails && (
                <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-20)] text-[10px] font-mono space-y-2 mt-2 break-all">
                  <div>
                    <span className="font-bold block text-[var(--ink-60)]">LEDGER ROOT ANCHOR (PREV_HASH):</span>
                    <span className="text-[var(--ink)]">{data?.ledgerHashAtIssuance}</span>
                  </div>
                  <div>
                    <span className="font-bold block text-[var(--ink-60)]">CREDENTIAL SHA-256 HASH:</span>
                    <span className="text-[#1E7A4B] font-bold">{data?.credentialHash}</span>
                  </div>
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
            ShramikSetu Public Verification Service
          </div>
          <div className="text-[11px] text-[var(--ink-60)]">
            <strong>NOT A GOVERNMENT-ISSUED DOCUMENT.</strong> Issued under digital wage ledger record integrity verification.
          </div>
        </div>
      </footer>
    </div>
  );
}
