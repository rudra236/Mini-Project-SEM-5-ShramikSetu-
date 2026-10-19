'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { formatRupees } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { LoadingState } from '@/components/ui/FeedbackStates';
import { saveCachedPassport, getCachedPassport } from '@/lib/offline-cache';

interface SharingConsentState {
  shareEarnings: boolean;
  shareDisputes: boolean;
  shareEmployerNames: boolean;
  shareGpsMetrics: boolean;
}

export default function WorkerPassportPage() {
  const { profiles, locale, t } = useAuth();
  const workerProfile = profiles?.worker;
  const workerId = workerProfile?.id;

  const [passport, setPassport] = useState<any | null>(() => getCachedPassport()?.data || null);
  const [credentialRef, setCredentialRef] = useState<string | null>(() => getCachedPassport()?.data?.credentialRef || null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!getCachedPassport()?.data);
  const [isIssuing, setIsIssuing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Consent Toggles for Credential Sharing
  const [consent, setConsent] = useState<SharingConsentState>({
    shareEarnings: true,
    shareDisputes: true,
    shareEmployerNames: true,
    shareGpsMetrics: true,
  });

  const loadData = async () => {
    if (!workerId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const passRes = await api.passport.get(workerId);
      if (passRes && passRes.passport) {
        const p = passRes.passport;
        setPassport(p);
        saveCachedPassport(p);

        if (p.sharingConsent) {
          setConsent({
            shareEarnings: p.sharingConsent.shareEarnings ?? true,
            shareDisputes: p.sharingConsent.shareDisputes ?? true,
            shareEmployerNames: p.sharingConsent.shareEmployerNames ?? true,
            shareGpsMetrics: p.sharingConsent.shareGpsMetrics ?? true,
          });
        }

        let ref = p.credentialRef;
        if (!ref) {
          // If no credential ref exists yet, issue one automatically
          const issueRes = await api.credentials.issue(workerId, consent);
          if (issueRes && issueRes.credential) {
            ref = issueRes.credential.credentialRef;
            p.credentialRef = ref;
            p.credentialHash = issueRes.credential.credentialHash;
            p.ledgerHashAtIssuance = issueRes.credential.ledgerHashAtIssuance;
          }
        }

        setCredentialRef(ref);

        if (ref) {
          const verifyUrl = `${window.location.origin}/verify/${ref}`;
          const qr = await QRCode.toDataURL(verifyUrl, {
            width: 140,
            margin: 1,
            color: { dark: '#111827', light: '#FFFFFF' },
          });
          setQrCodeDataUrl(qr);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load verified work record.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workerId]);

  const handleRefreshCredential = async () => {
    if (!workerId) return;
    try {
      setIsIssuing(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const issueRes = await api.credentials.issue(workerId, consent);
      if (issueRes && issueRes.credential) {
        const cred = issueRes.credential;
        setCredentialRef(cred.credentialRef);
        setPassport((prev: any) => ({
          ...prev,
          credentialRef: cred.credentialRef,
          credentialHash: cred.credentialHash,
          ledgerHashAtIssuance: cred.ledgerHashAtIssuance,
          sharingConsent: cred.sharingConsent,
        }));

        const verifyUrl = `${window.location.origin}/verify/${cred.credentialRef}`;
        const qr = await QRCode.toDataURL(verifyUrl, {
          width: 140,
          margin: 1,
          color: { dark: '#111827', light: '#FFFFFF' },
        });
        setQrCodeDataUrl(qr);

        setSuccessMessage(`New verifiable credential issued: ${cred.credentialRef}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to issue new credential');
    } finally {
      setIsIssuing(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="COMPILING STATUTORY VERIFIED WORK RECORD..." />;
  }

  const queryParams = new URLSearchParams({
    ...(credentialRef ? { ref: credentialRef } : {}),
    shareEarnings: String(consent.shareEarnings),
    shareDisputes: String(consent.shareDisputes),
    shareEmployerNames: String(consent.shareEmployerNames),
    shareGpsMetrics: String(consent.shareGpsMetrics),
  });

  const pdfDownloadUrl = workerId ? `/api/passport/${workerId}/pdf?${queryParams.toString()}` : '#';

  return (
    <div className="w-full">
      {/* Title Strip */}
      <div className="p-4 border-b-2 border-[var(--ink)] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold font-mono uppercase tracking-widest text-[#1E7A4B] bg-[#EBF7F0] inline-block px-2 py-0.5 rounded-[2px] border border-[#1E7A4B]">
            {t.verify.verifiedBadge}
          </div>
          <h1 className="text-xl font-bold uppercase text-[var(--ink)] mt-1.5" title="ShramikSetu Verified Work Record">
            {t.passport.title}
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-0.5">
            {t.passport.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={handleRefreshCredential}
            disabled={isIssuing}
            className="min-h-[48px]"
          >
            <Icons.RefreshCw size={16} className={`mr-2 ${isIssuing ? 'animate-spin' : ''}`} />
            {isIssuing ? t.common.loading : t.passport.reissueBtn}
          </Button>

          {workerId && (
            <a
              href={pdfDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={`shramiksetu-work-record-${credentialRef || workerId.slice(0, 8)}.pdf`}
            >
              <Button variant="primary" size="md" className="min-h-[48px]">
                <Icons.Download size={16} className="mr-2" />
                {t.passport.downloadPdfBtn}
              </Button>
            </a>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-[#FEF2F2] border-b-2 border-[#B91C1C] text-[#991B1B] text-xs font-bold">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-[#EBF7F0] border-b-2 border-[#1E7A4B] text-[#1E7A4B] text-xs font-bold">
          ✓ {successMessage}
        </div>
      )}

      {/* Main Content Area */}
      <div className="p-4 sm:p-6 bg-[var(--paper)] max-w-4xl mx-auto space-y-6">
        {/* Credential Sharing Consent Preferences Card */}
        <div className="bg-white border-2 border-[var(--ink)] p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--ink-20)] pb-2 mb-3">
            <div className="font-mono text-xs font-bold uppercase text-[var(--ink)] flex items-center">
              <Icons.ShieldCheck size={16} className="text-[#1E7A4B] mr-2" />
              CREDENTIAL SHARING CONSENT · साझा करने की सहमति
            </div>
            <span className="text-[10px] font-mono text-[var(--ink-60)]">
              Granular third-party disclosures
            </span>
          </div>

          <p className="text-xs text-[var(--ink-60)] mb-3">
            Configure which details third parties (banks, prospective employers, landlords) can see when scanning your public verification QR code or viewing your exported PDF:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-start space-x-2.5 p-2 bg-[#FAF8F5] border border-[var(--ink-20)] cursor-pointer">
              <input
                type="checkbox"
                checked={consent.shareEarnings}
                onChange={(e) => setConsent({ ...consent, shareEarnings: e.target.checked })}
                className="mt-0.5"
              />
              <div>
                <span className="font-bold text-[var(--ink)] block">Share Lifetime Earnings & Wage Rates</span>
                <span className="text-[11px] text-[var(--ink-60)]">
                  Disclose exact earnings and daily wage rates for bank loan or credit evaluation.
                </span>
              </div>
            </label>

            <label className="min-h-[44px] flex items-center space-x-2.5 p-3 bg-[#FAF8F5] border border-[var(--ink-20)] cursor-pointer">
              <input
                type="checkbox"
                checked={consent.shareDisputes}
                onChange={(e) => setConsent({ ...consent, shareDisputes: e.target.checked })}
                className="w-5 h-5 accent-[#0F172A] shrink-0 cursor-pointer"
              />
              <div>
                <span className="font-bold text-xs text-[var(--ink)] block">Share Dispute Resolution Record</span>
                <span className="text-[11px] text-[var(--ink-60)]">
                  Disclose resolved arbitration cases (e.g. rulings ordered in your favour).
                </span>
              </div>
            </label>

            <label className="min-h-[44px] flex items-center space-x-2.5 p-3 bg-[#FAF8F5] border border-[var(--ink-20)] cursor-pointer">
              <input
                type="checkbox"
                checked={consent.shareGpsMetrics}
                onChange={(e) => setConsent({ ...consent, shareGpsMetrics: e.target.checked })}
                className="w-5 h-5 accent-[#0F172A] shrink-0 cursor-pointer"
              />
              <div>
                <span className="font-bold text-xs text-[var(--ink)] block">Share GPS Geofence Compliance Rate</span>
                <span className="text-[11px] text-[var(--ink-60)]">
                  Show 100% physical on-site presence rate to prove authentic attendance.
                </span>
              </div>
            </label>

            <label className="min-h-[44px] flex items-center space-x-2.5 p-3 bg-[#FAF8F5] border border-[var(--ink-20)] cursor-pointer">
              <input
                type="checkbox"
                checked={consent.shareEmployerNames}
                onChange={(e) => setConsent({ ...consent, shareEmployerNames: e.target.checked })}
                className="w-5 h-5 accent-[#0F172A] shrink-0 cursor-pointer"
              />
              <div>
                <span className="font-bold text-xs text-[var(--ink)] block">Share Employer & Project Names</span>
                <span className="text-[11px] text-[var(--ink-60)]">
                  Display verified contractor company names and project sites for reference checks.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Verifiable Work Record Document Card */}
        <div className="bg-white border-4 border-[var(--ink)] p-6 relative shadow-sm">
          {/* Header Seal */}
          <div className="text-center border-b-2 border-[var(--ink)] pb-4 mb-5">
            <div className="w-12 h-12 border-2 border-[var(--ink)] rounded-full flex items-center justify-center mx-auto mb-2 bg-[#FAF8F5]">
              <Icons.ShieldCheck size={26} className="text-[#1E7A4B]" />
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--ink-60)]">
              SHRAMIKSETU · STATUTORY WAGE & ATTENDANCE LEDGER AUDIT
            </div>
            <h2 className="font-id text-2xl font-bold uppercase text-[var(--ink)] mt-0.5">
              SHRAMIKSETU VERIFIED WORK RECORD
            </h2>
            <div className="font-data text-xs font-mono font-bold text-[#1E3A8A] mt-1">
              REF: {credentialRef || 'ISSUING...'}
            </div>
          </div>

          {/* Primary Identity Section */}
          <div className="flex flex-col sm:flex-row gap-4 border-b border-[var(--ink-20)] pb-5 mb-5">
            <div className="w-24 h-28 bg-[var(--paper-dark)] border-2 border-[var(--ink)] shrink-0 flex items-center justify-center">
              <Icons.User size={48} className="text-[var(--ink-40)]" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
                  WORKER NAME · श्रमिक का नाम
                </span>
                <span className="font-id text-lg font-bold uppercase text-[var(--ink)]">
                  {passport?.workerName || workerProfile?.full_name || 'Worker Record'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">RECORD ID</span>
                  <span className="font-data font-bold">{passport?.internalWorkerId || workerProfile?.internal_worker_id || 'Pending'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">SKILL TIER</span>
                  <span className="font-bold uppercase text-[var(--register-blue)]">
                    {passport?.skillCategory || workerProfile?.skill_category || 'GENERAL'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">DESIGNATED OCCUPATION</span>
                <span className="text-xs font-semibold uppercase">{passport?.occupation || workerProfile?.occupation || 'General Labour'}</span>
              </div>
            </div>
          </div>

          {/* Verified Career Milestones */}
          <div className="mb-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] mb-2">
              VERIFIED SERVICE METRICS · प्रमाणित कार्य विवरण
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)] text-center">
              <div>
                <div className="font-data text-xl font-bold text-[var(--ink)]">
                  {passport?.totalVerifiedWorkdays ?? 0}
                </div>
                <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                  VERIFIED SHIFTS
                </div>
              </div>

              <div>
                <div className="font-data text-xl font-bold text-[#1E7A4B]">
                  {formatRupees(passport?.totalEarnedPaise ?? 0)}
                </div>
                <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                  LIFETIME EARNED
                </div>
              </div>

              <div>
                <div className="font-data text-xl font-bold text-[var(--register-blue)]">
                  {passport?.gpsValidityPercent ?? 100}%
                </div>
                <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                  GPS VALIDITY
                </div>
              </div>

              <div>
                <div className="font-data text-xl font-bold text-[#1E7A4B]">
                  {passport?.disputesResolvedInFavourCount ?? 0}
                </div>
                <div className="text-[10px] uppercase text-[var(--ink-60)] font-semibold mt-0.5">
                  DISPUTES WON
                </div>
              </div>
            </div>
          </div>

          {/* Audited Employment History Timeline */}
          <div className="mb-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] mb-2">
              AUDITED EMPLOYMENT RELATIONSHIPS
            </div>
            {passport?.employmentHistory && passport.employmentHistory.length > 0 ? (
              <div className="border border-[var(--ink-20)] divide-y divide-[var(--ink-10)] text-xs">
                {passport.employmentHistory.map((entry: any, idx: number) => (
                  <div key={entry.contractId || idx} className="p-2.5 bg-[#FAF8F5] flex justify-between items-center">
                    <div>
                      <div className="font-bold uppercase">{entry.contractorCompany || entry.contractorName || 'Contractor'}</div>
                      <div className="text-[11px] text-[var(--ink-60)] font-mono">
                        {entry.projectName || 'Active Project'} · {entry.employmentStatus || 'Active'}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-[#EBF7F0] text-[#1E7A4B] border border-[#1E7A4B] px-1.5 py-0.5 rounded-[2px]">
                      VERIFIED REL
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-[var(--paper-dark)] text-center text-xs text-[var(--ink-60)] border border-[var(--ink-20)]">
                No audited employment contracts on record yet.
              </div>
            )}
          </div>

          {/* Public Verification & QR Code Block */}
          {credentialRef && (
            <div className="border-2 border-[var(--ink-20)] p-4 bg-[#FAF8F5] flex flex-col sm:flex-row items-center gap-4">
              {qrCodeDataUrl ? (
                <div className="p-1 bg-white border border-[var(--ink-20)] shrink-0">
                  <img
                    src={qrCodeDataUrl}
                    alt="Public Verification QR Code"
                    className="w-28 h-28"
                  />
                </div>
              ) : (
                <div className="w-28 h-28 bg-[var(--paper-dark)] flex items-center justify-center shrink-0">
                  <Icons.QrCode size={40} className="text-[var(--ink-40)]" />
                </div>
              )}

              <div className="space-y-1.5 text-xs flex-1">
                <div className="font-bold uppercase text-[var(--ink)] flex items-center">
                  <Icons.CheckCircle size={15} className="text-[#1E7A4B] mr-1.5" />
                  THIRD-PARTY PUBLIC VERIFICATION QR
                </div>
                <p className="text-[var(--ink-60)]">
                  Third parties (banks, landlords, prospective employers) can scan this QR code or visit{' '}
                  <Link
                    href={`/verify/${credentialRef}`}
                    className="underline text-[var(--register-blue)] font-mono font-bold"
                    target="_blank"
                  >
                    /verify/{credentialRef}
                  </Link>{' '}
                  to verify your work records instantly without requiring a login.
                </p>
                <div className="font-mono text-[10px] text-[var(--ink-40)]">
                  LEDGER ROOT ANCHOR: {passport?.ledgerHashAtIssuance?.slice(0, 24)}...
                </div>
              </div>
            </div>
          )}

          {/* Visible Legal Disclaimer Footer */}
          <div className="mt-6 pt-4 border-t-2 border-dashed border-[var(--ink-40)] text-center space-y-1">
            <div className="text-[11px] font-bold uppercase text-[var(--ink)]">
              SHRAMIKSETU DIGITAL WAGE LEDGER RECORD INTEGRITY
            </div>
            <div className="text-[10px] font-mono text-[var(--ink-60)]">
              NOT A GOVERNMENT-ISSUED DOCUMENT. Issued under digital wage ledger record integrity verification.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
