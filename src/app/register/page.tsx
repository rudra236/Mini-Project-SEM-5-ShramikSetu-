'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';

type PublicRole = 'WORKER' | 'CONTRACTOR';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, locale, setLocale, t } = useAuth();

  const [selectedRole, setSelectedRole] = useState<PublicRole>('WORKER');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Worker fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [occupation, setOccupation] = useState('');
  const [skillCategory, setSkillCategory] = useState<'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED'>('SEMI_SKILLED');
  const [emergencyContact, setEmergencyContact] = useState('');

  // Contractor fields
  const [companyName, setCompanyName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState<string>('/worker');
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const handleCopyId = async () => {
    if (!registeredId) return;
    try {
      await navigator.clipboard.writeText(registeredId);
      setHasCopiedId(true);
      setTimeout(() => setHasCopiedId(false), 2500);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'contractor') {
      setSelectedRole('CONTRACTOR');
    } else if (roleParam === 'worker') {
      setSelectedRole('WORKER');
    }
  }, [searchParams]);

  const wp = t.workerPortal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage(wp.passwordRequirements || 'Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    if (selectedRole === 'WORKER' && fullName.trim().length < 2) {
      setErrorMessage('Please enter your full legal name.');
      return;
    }

    if (selectedRole === 'CONTRACTOR' && companyName.trim().length < 2) {
      setErrorMessage('Please enter your company or firm name.');
      return;
    }

    if (phone.trim()) {
      const digits = phone.replace(/\D/g, '');
      const cleanDigits = digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : (digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits);
      if (cleanDigits.length !== 10 || !['6', '7', '8', '9'].includes(cleanDigits[0])) {
        setErrorMessage('Please enter a valid 10-digit Indian mobile number (e.g. 98200 33001).');
        return;
      }
    }

    setIsLoading(true);

    try {
      const payload: any = {
        role: selectedRole,
        password,
        phone: phone.trim() || undefined,
        locale,
      };

      if (selectedRole === 'WORKER') {
        payload.fullName = fullName.trim();
        if (occupation.trim()) payload.occupation = occupation.trim();
        payload.skillCategory = skillCategory;
        if (emergencyContact.trim()) payload.emergencyContact = emergencyContact.trim();
      } else {
        payload.companyName = companyName.trim();
        payload.fullName = fullName.trim() || companyName.trim();
        if (licenseNumber.trim()) payload.licenseNumber = licenseNumber.trim();
      }

      const res = await register(payload);
      setRegisteredId(res.id);
      setRedirectPath(res.redirect || (selectedRole === 'WORKER' ? '/worker' : '/contractor'));
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please check inputs and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between selection:bg-[#FEF3C7] selection:text-[#0F172A]">
      {/* Header */}
      <header className="bg-white border-b-2 border-[#0F172A] sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <Link href="/" className="min-h-[44px] flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-[#0F172A] text-white font-black text-sm flex items-center justify-center border-2 border-black shadow-brutal-sm relative shrink-0">
              SS
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#F59E0B] border border-black rounded-full" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-extrabold uppercase tracking-tight text-[#0F172A]">
                SHRAMIKSETU LEDGER
              </div>
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tight">
                ← {t.common.back}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="flex border-2 border-black bg-white shadow-brutal-sm overflow-hidden">
              {(['hi', 'mr', 'en'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocale(loc)}
                  className={`min-h-[44px] min-w-[44px] px-2.5 text-xs font-black uppercase transition-all flex items-center justify-center ${
                    locale === loc ? 'bg-[#0F172A] text-white' : 'text-[#0F172A] hover:bg-slate-100'
                  }`}
                >
                  {loc === 'hi' ? 'हिन्दी' : loc === 'mr' ? 'मराठी' : 'EN'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Cricket/Hazard Seam Stripe */}
      <div className="cricket-seam-divider" />

      <main className="max-w-2xl mx-auto w-full px-4 py-8">
        <div className="border-2 border-black bg-white p-6 sm:p-8 shadow-brutal-lg relative">
          {registeredId ? (
            /* ─── SUCCESS STATE: DISPLAY GENERATED ID CLEARLY ─── */
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 bg-[#15803D] text-white mx-auto flex items-center justify-center rounded-full border-2 border-black shadow-brutal">
                <Icons.CheckCircle size={32} />
              </div>

              <div>
                <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-[#15803D]">
                  OFFICIAL ENROLLMENT COMPLETE
                </span>
                <h1 className="text-2xl font-black uppercase text-[#0F172A] mt-1">
                  Registration Successful!
                </h1>
                <p className="text-xs text-slate-600 mt-2 font-medium max-w-md mx-auto">
                  {wp.rememberCredentialsNotice}
                </p>
              </div>

              {/* Prominent Warning Banner */}
              <div className="p-4 border-2 border-black bg-[#FEF2F2] text-[#991B1B] text-xs font-bold shadow-brutal max-w-md mx-auto text-left">
                <div className="flex items-start gap-2.5">
                  <Icons.AlertTriangle size={18} className="shrink-0 mt-0.5 text-[#DC2626]" />
                  <p className="leading-relaxed">
                    {wp.saveIdWarning || '⚠️ CRITICAL: Save this ID immediately. You will need this ID and your password to sign in.'}
                  </p>
                </div>
              </div>

              <div className="p-5 border-2 border-black bg-[#FEF3C7] shadow-brutal max-w-md mx-auto">
                <div className="text-xs font-mono font-bold uppercase text-[#B45309]">
                  {wp.generatedIdNotice}
                </div>
                <div className="text-2xl sm:text-3xl font-mono font-black text-[#0F172A] tracking-wider my-3 flex items-center justify-center gap-2.5 flex-wrap">
                  <span>{registeredId}</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="min-h-[44px] min-w-[44px] px-3 py-1 bg-white hover:bg-slate-100 text-[#0F172A] text-xs font-mono font-black uppercase border-2 border-black shadow-brutal-sm flex items-center justify-center gap-1.5 transition-all"
                  >
                    {hasCopiedId ? (
                      <>
                        <Icons.Check size={14} className="text-[#15803D]" />
                        <span>{wp.copied || 'Copied! ✓'}</span>
                      </>
                    ) : (
                      <>
                        <Icons.Copy size={14} />
                        <span>{wp.copyId || 'Copy ID'}</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="text-[10px] font-mono text-slate-600 font-bold uppercase">
                  ROLE: {selectedRole} · PASSWORD: ••••••••
                </div>
              </div>

              <div className="pt-4 max-w-md mx-auto">
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  size="lg"
                  shimmer
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.location.href = redirectPath;
                    } else {
                      router.push(redirectPath);
                    }
                  }}
                  className="font-black text-sm uppercase min-h-[48px]"
                >
                  ENTER OFFICIAL DESK ↗
                </Button>
              </div>
            </div>
          ) : (
            /* ─── REGISTRATION FORM ─── */
            <div>
              <div className="border-b-2 border-slate-900 pb-4 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-[#15803D] pulse-dot" />
                  <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-[#B45309]">
                    OFFICIAL STATUTORY ENROLLMENT
                  </span>
                </div>
                <h1 className="text-2xl font-black uppercase text-[#0F172A] tracking-tight">
                  {wp.registerTitle || 'Official Ledger Enrollment'}
                </h1>
                <p className="text-xs text-slate-600 mt-1 font-medium">
                  {wp.registerSubtitle || 'Choose your role and set your password to receive your unique Ledger ID.'}
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 mb-6 border-2 border-[#DC2626] bg-[#FEF2F2] text-[#991B1B] text-xs font-bold shadow-brutal-sm">
                  <div className="flex items-center gap-1.5 mb-0.5 uppercase">
                    <Icons.AlertTriangle size={14} />
                    <span>{t.common.error}</span>
                  </div>
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 1. Role Selector */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A] mb-2">
                    1. SELECT ROLE
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedRole('WORKER')}
                      className={`mechanical-btn p-4 text-left border-2 border-black transition-all ${
                        selectedRole === 'WORKER'
                          ? 'bg-[#F59E0B] text-[#0F172A] shadow-brutal'
                          : 'bg-white text-[#0F172A] hover:bg-slate-50 shadow-brutal-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[9px] font-black px-1.5 py-0.5 uppercase bg-black text-white">
                          WORKER
                        </span>
                        {selectedRole === 'WORKER' && (
                          <span className="font-mono text-xs font-black">✓ SELECTED</span>
                        )}
                      </div>
                      <div className="text-sm font-black uppercase tracking-tight">Worker · श्रमिक</div>
                      <div className="text-xs mt-1 font-medium text-slate-700">
                        Attendance punch, wallet, contracts &amp; verifiable passport
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedRole('CONTRACTOR')}
                      className={`mechanical-btn p-4 text-left border-2 border-black transition-all ${
                        selectedRole === 'CONTRACTOR'
                          ? 'bg-[#0F172A] text-white shadow-brutal'
                          : 'bg-white text-[#0F172A] hover:bg-slate-50 shadow-brutal-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[9px] font-black px-1.5 py-0.5 uppercase bg-[#1D4ED8] text-white">
                          CONTRACTOR
                        </span>
                        {selectedRole === 'CONTRACTOR' && (
                          <span className="font-mono text-xs font-black">✓ SELECTED</span>
                        )}
                      </div>
                      <div className="text-sm font-black uppercase tracking-tight">Contractor · ठेकेदार</div>
                      <div className="text-xs mt-1 font-medium text-slate-300">
                        Projects, muster roll &amp; statutory wage disbursements
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Credentials: Password (min 8 chars) */}
                <div className="border-t-2 border-slate-200 pt-5">
                  <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A] mb-3">
                    2. ACCOUNT CREDENTIALS (PASSWORD)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A]">
                          PASSWORD (MIN 8 CHARS) *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="min-h-[44px] min-w-[44px] px-2.5 text-xs font-mono font-bold text-[#1D4ED8] uppercase flex items-center justify-center hover:underline"
                        >
                          {showPassword ? wp.hidePassword : wp.showPassword}
                        </button>
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        minLength={8}
                        className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                        required
                        autoComplete="new-password"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                        CONFIRM PASSWORD *
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        minLength={8}
                        className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                        required
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 mt-1.5">
                    Your unique Login ID (e.g. {selectedRole === 'WORKER' ? 'SS-W-2026-XXXXXX' : 'SS-C-2026-XXXXXX'}) will be generated upon completion.
                  </p>
                </div>

                {/* 3. Role-Specific Profile Information */}
                <div className="border-t-2 border-slate-200 pt-5">
                  <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A] mb-3">
                    3. {selectedRole} PARTICULARS
                  </div>

                  {selectedRole === 'WORKER' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                          FULL LEGAL NAME *
                        </label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Ramesh Kumar"
                          className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                            OCCUPATION / TRADE
                          </label>
                          <input
                            type="text"
                            value={occupation}
                            onChange={(e) => setOccupation(e.target.value)}
                            placeholder="e.g. Mason, Carpenter, Helper"
                            className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                            SKILL TIER
                          </label>
                          <select
                            value={skillCategory}
                            onChange={(e) => setSkillCategory(e.target.value as any)}
                            className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm bg-white"
                          >
                            <option value="UNSKILLED">Unskilled (अकुशल)</option>
                            <option value="SEMI_SKILLED">Semi-Skilled (अर्ध-कुशल)</option>
                            <option value="SKILLED">Skilled (कुशल)</option>
                            <option value="HIGHLY_SKILLED">Highly Skilled (उच्च कुशल)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                            MOBILE NUMBER (PROFILE RECORD)
                          </label>
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="e.g. 98200 33001"
                            className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                            EMERGENCY CONTACT
                          </label>
                          <input
                            type="text"
                            value={emergencyContact}
                            onChange={(e) => setEmergencyContact(e.target.value)}
                            placeholder="e.g. 98200 99999"
                            className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Contractor Specific Fields */
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                          REGISTERED COMPANY / FIRM NAME *
                        </label>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="e.g. Apex Infrastructure Ltd"
                          className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                            AUTHORIZED SIGNATORY NAME
                          </label>
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Rajesh Singhania"
                            className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                            LABOUR LICENSE / REGISTRATION NUMBER
                          </label>
                          <input
                            type="text"
                            value={licenseNumber}
                            onChange={(e) => setLicenseNumber(e.target.value)}
                            placeholder="e.g. LIC-MH-CON-2024-001"
                            className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono font-bold uppercase text-[#0F172A] mb-1">
                          OFFICE CONTACT MOBILE NUMBER
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. 98200 22002"
                          className="w-full min-h-[44px] border-2 border-black p-2.5 font-mono text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t-2 border-slate-200">
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    size="lg"
                    shimmer
                    isLoading={isLoading}
                    className="min-h-[48px] font-black text-sm uppercase"
                  >
                    {isLoading ? 'ENROLLING ACCOUNT...' : 'COMPLETE REGISTRATION & GET ID ↗'}
                  </Button>
                </div>

                <div className="text-center pt-2">
                  <Link
                    href={`/login?role=${selectedRole.toLowerCase()}`}
                    className="min-h-[44px] text-xs font-mono font-bold text-[#1D4ED8] hover:underline uppercase inline-flex items-center justify-center gap-1 px-2.5"
                  >
                    <span>Already have a Ledger ID? Sign in here</span>
                    <span>↗</span>
                  </Link>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t-2 border-[#0F172A] py-3 text-center text-xs font-mono text-slate-500">
        SHRAMIKSETU STATUTORY WAGE PLATFORM · TRILINGUAL (HI / MR / EN)
      </footer>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FFFDF5] flex items-center justify-center font-mono text-xs uppercase font-bold text-slate-600">
          Loading registration portal...
        </div>
      }
    >
      <RegisterForm />
    </React.Suspense>
  );
}

