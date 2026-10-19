'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signin, locale, setLocale, t } = useAuth();
  const wp = t.workerPortal;

  // Role Tab: 'worker' vs 'contractor'
  const redirectParam = searchParams.get('next') || searchParams.get('redirect') || '';
  const initialRole =
    searchParams.get('role') === 'contractor' || redirectParam.startsWith('/contractor')
      ? 'contractor'
      : 'worker';
  const [roleTab, setRoleTab] = useState<'worker' | 'contractor'>(initialRole);

  // Credentials (strictly empty by default - no hardcoding)
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const lockoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Safe redirect sanitizer: strictly prevents open-redirect vulnerabilities
  const getSafeRedirectUrl = (targetRole: 'WORKER' | 'CONTRACTOR'): string => {
    const raw = searchParams.get('next') || searchParams.get('redirect');
    if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\')) {
      return raw;
    }
    return targetRole === 'WORKER' ? '/worker' : '/contractor';
  };

  // Sync role from query parameters or redirect destination
  useEffect(() => {
    const roleParam = searchParams.get('role');
    const redirectParam = searchParams.get('next') || searchParams.get('redirect') || '';
    if (roleParam === 'contractor' || redirectParam.startsWith('/contractor')) {
      setRoleTab('contractor');
    } else if (roleParam === 'worker' || redirectParam.startsWith('/worker')) {
      setRoleTab('worker');
    }

    if (searchParams.get('reason') === 'expired') {
      setErrorMessage(wp.sessionExpired || 'Your session has expired. Please sign in again to continue.');
    }

    if (searchParams.get('status') === 'password_reset') {
      setStatusNotice(wp.passwordSetSuccess || 'Password successfully updated! You can now sign in.');
    }
  }, [searchParams, wp.sessionExpired, wp.passwordSetSuccess]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemainingSec && lockoutRemainingSec > 0) {
      lockoutTimerRef.current = setInterval(() => {
        setLockoutRemainingSec((prev) => {
          if (prev && prev > 1) return prev - 1;
          if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
          setErrorMessage(null);
          return null;
        });
      }, 1000);
    }
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, [lockoutRemainingSec]);

  const formatLockoutTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setIsNetworkError(false);
    setStatusNotice(null);

    const cleanId = loginId.trim();
    if (!cleanId || !password) {
      setErrorMessage(wp.invalidCredentials || 'Please provide both your ID and password.');
      return;
    }

    try {
      setIsLoading(true);
      const targetRole = roleTab === 'worker' ? 'WORKER' : 'CONTRACTOR';
      const ok = await signin(cleanId, password, targetRole);

      if (ok) {
        const destination = getSafeRedirectUrl(targetRole);
        if (typeof window !== 'undefined') {
          window.location.href = destination;
        } else {
          router.push(destination);
        }
      }
    } catch (err: any) {
      const status = err.statusCode || err.status;
      const message = err.message || '';

      if (status === 429) {
        const retrySec = err.retryAfterSeconds || 900;
        setLockoutRemainingSec(retrySec);
        const mins = Math.ceil(retrySec / 60);
        setErrorMessage(
          (wp.tryAgainIn || 'Too many failed attempts. Please try again in {minutes} minute(s).').replace(
            '{minutes}',
            String(mins)
          )
        );
      } else if (status === 401) {
        setErrorMessage(wp.invalidCredentials || 'Invalid ID or password.');
      } else if (err.name === 'TypeError' || message.includes('fetch') || message.includes('Network')) {
        setIsNetworkError(true);
        setErrorMessage(wp.networkError || 'Network connectivity issue. Please check your connection and retry.');
      } else {
        setErrorMessage(message || wp.invalidCredentials || 'Sign in failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isLockedOut = Boolean(lockoutRemainingSec && lockoutRemainingSec > 0);
  const isSubmitDisabled = isLoading || isLockedOut;

  return (
    <div className="min-h-screen bg-[#FFFDF5] text-[#0F172A] flex flex-col justify-between selection:bg-[#FEF3C7] selection:text-[#0F172A]">
      {/* ─── Top Header (Neo-Brutalist High-Contrast) ─── */}
      <header className="bg-white border-b-2 border-[#0F172A] sticky top-0 z-40">
        <div className="max-w-[1000px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <Link href="/" className="min-h-[44px] flex items-center space-x-2.5 group">
            <div className="w-8 h-8 bg-[#0F172A] text-white font-black text-sm flex items-center justify-center border-2 border-black shadow-brutal-sm relative shrink-0">
              SS
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#F59E0B] border border-black rounded-full" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-extrabold uppercase tracking-tight text-[#0F172A] flex items-center gap-1.5">
                <span>SHRAMIKSETU</span>
                <span className="hidden sm:inline">× AUTH PROTOCOL</span>
              </div>
              <div className="hidden sm:block text-[10px] font-mono text-slate-500 uppercase tracking-tight">
                OFFICIAL WORKER &amp; CONTRACTOR ENTRY
              </div>
            </div>
          </Link>

          {/* Language Switcher */}
          <div
            role="radiogroup"
            aria-label={t.nav.language}
            className="flex border-2 border-black bg-white shadow-brutal-sm overflow-hidden"
          >
            {(['hi', 'mr', 'en'] as const).map((loc) => {
              const isSelected = locale === loc;
              const locLabel = loc === 'hi' ? 'हिन्दी' : loc === 'mr' ? 'मराठी' : 'EN';
              return (
                <button
                  key={loc}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setLocale(loc)}
                  className={`min-h-[44px] min-w-[44px] px-2.5 text-xs font-mono font-black transition-all flex items-center justify-center ${
                    isSelected ? 'bg-[#F59E0B] text-[#0F172A]' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {locLabel}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Cricket/Hazard Seam Accent Stripe */}
      <div className="cricket-seam-divider" />

      {/* Main Authentication Card */}
      <main className="max-w-md mx-auto w-full px-4 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        <div className="border-2 border-black bg-white p-6 sm:p-8 shadow-brutal-lg relative">
          {/* Card Heading */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 bg-[#F59E0B] border border-black" />
              <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-[#B45309]">
                NATIONAL STATUTORY REGISTRY
              </span>
            </div>
            <h1 className="text-2xl font-black uppercase text-[#0F172A] tracking-tight">
              {roleTab === 'worker' ? wp.loginTitle : wp.contractorLoginTitle}
            </h1>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {roleTab === 'worker' ? wp.loginSubtitle : wp.contractorLoginSubtitle}
            </p>
          </div>

          {/* ─── ROLE SELECTOR TABS ─── */}
          <div
            role="tablist"
            aria-label={wp.roleSelector || 'Select Account Role'}
            className="flex border-2 border-black font-mono font-bold text-xs uppercase mb-6 bg-slate-100 shadow-brutal-sm overflow-hidden"
          >
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === 'worker'}
              onClick={() => {
                setRoleTab('worker');
                setErrorMessage(null);
                setStatusNotice(null);
                setIsNetworkError(false);
              }}
              className={`flex-1 min-h-[44px] py-2.5 text-center transition-all flex items-center justify-center gap-1.5 ${
                roleTab === 'worker'
                  ? 'bg-[#0F172A] text-white font-black'
                  : 'bg-white text-[#0F172A] hover:bg-slate-50'
              }`}
            >
              <span>👷</span>
              <span>{wp.workerRole || 'Worker · श्रमिक'}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === 'contractor'}
              onClick={() => {
                setRoleTab('contractor');
                setErrorMessage(null);
                setStatusNotice(null);
                setIsNetworkError(false);
              }}
              className={`flex-1 min-h-[44px] py-2.5 text-center transition-all flex items-center justify-center gap-1.5 border-l-2 border-black ${
                roleTab === 'contractor'
                  ? 'bg-[#0F172A] text-white font-black'
                  : 'bg-white text-[#0F172A] hover:bg-slate-50'
              }`}
            >
              <span>🏗️</span>
              <span>{wp.contractorRole || 'Contractor · ठेकेदार'}</span>
            </button>
          </div>

          {/* Feedback Notices */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3.5 mb-5 border-2 border-[#DC2626] bg-[#FEF2F2] text-[#991B1B] text-xs font-bold shadow-brutal-sm"
            >
              <div className="flex items-center justify-between mb-1 uppercase text-[11px]">
                <div className="flex items-center gap-1.5 font-black">
                  <Icons.AlertTriangle size={15} />
                  <span>{isLockedOut ? 'TEMPORARY LOCKOUT' : t.common.error}</span>
                </div>
                {lockoutRemainingSec && (
                  <span className="font-mono bg-[#DC2626] text-white px-2 py-0.5 rounded-[2px] font-black">
                    ⏱ {formatLockoutTime(lockoutRemainingSec)}
                  </span>
                )}
              </div>
              <p className="leading-relaxed">{errorMessage}</p>

              {isNetworkError && (
                <div className="mt-2.5 pt-2 border-t border-red-200">
                  <button
                    type="button"
                    onClick={() => handleSignIn()}
                    className="inline-flex items-center gap-1 bg-[#DC2626] text-white font-mono text-[11px] font-black px-2.5 py-1 uppercase border border-black shadow-brutal-sm hover:bg-red-700"
                  >
                    <Icons.RotateCw size={12} />
                    <span>{wp.retryBtn || t.common.retry || 'Retry'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {statusNotice && (
            <div
              role="status"
              aria-live="polite"
              className="p-3.5 mb-5 border-2 border-[#15803D] bg-[#F0FDF4] text-[#166534] text-xs font-bold shadow-brutal-sm"
            >
              <div className="flex items-center gap-1.5 mb-1 uppercase text-[11px] font-black">
                <Icons.CheckCircle size={15} />
                <span>{t.common.success}</span>
              </div>
              <p className="leading-relaxed">{statusNotice}</p>
            </div>
          )}

          {/* ─── CREDENTIALS FORM: ID + Password Only ─── */}
          <form onSubmit={handleSignIn} method="POST" action="#" className="space-y-5" noValidate>
            {/* ID Input */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label
                  htmlFor="signin-login-id"
                  className="block text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A]"
                >
                  {roleTab === 'worker' ? wp.workerIdLabel : wp.contractorIdLabel} *
                </label>
                <span className="text-[10px] font-mono text-slate-500 uppercase">
                  {roleTab === 'worker' ? 'SS-W-YYYY-XXXXXX' : 'SS-C-YYYY-XXXXXX'}
                </span>
              </div>
              <input
                id="signin-login-id"
                name="username"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder={roleTab === 'worker' ? wp.workerIdPlaceholder : wp.contractorIdPlaceholder}
                className="w-full min-h-[48px] border-2 border-black p-3 font-mono text-sm font-bold tracking-wider outline-none focus:bg-[#FFFDF5] focus:ring-2 focus:ring-[#F59E0B] shadow-brutal-sm disabled:bg-slate-100 disabled:cursor-not-allowed"
                required
                disabled={isLoading || isLockedOut}
                autoCapitalize="characters"
                autoComplete="username"
                inputMode="text"
                spellCheck={false}
              />
            </div>

            {/* Password Input */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label
                  htmlFor="signin-password"
                  className="block text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A]"
                >
                  {wp.passwordLabel} *
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="min-h-[44px] min-w-[44px] px-2.5 text-[11px] font-mono font-bold text-[#1D4ED8] hover:underline uppercase flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-black"
                  aria-controls="signin-password"
                  aria-label={showPassword ? wp.hidePassword : wp.showPassword}
                >
                  {showPassword ? wp.hidePassword : wp.showPassword}
                </button>
              </div>
              <div className="relative">
                <input
                  id="signin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={wp.passwordPlaceholder}
                  className="w-full min-h-[48px] border-2 border-black p-3 font-mono text-sm font-bold tracking-wider outline-none focus:bg-[#FFFDF5] focus:ring-2 focus:ring-[#F59E0B] shadow-brutal-sm pr-12 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  required
                  disabled={isLoading || isLockedOut}
                  autoComplete="current-password"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-black p-2 focus:outline-none focus:ring-1 focus:ring-black"
                  aria-label={showPassword ? wp.hidePassword : wp.showPassword}
                  tabIndex={-1}
                >
                  {showPassword ? <Icons.X size={18} /> : <Icons.ShieldCheck size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              shimmer
              isLoading={isLoading}
              disabled={isSubmitDisabled}
              className="min-h-[48px] text-sm font-black uppercase tracking-wider shadow-brutal hover:shadow-brutal-lg transition-all"
            >
              {isLoading
                ? wp.signingIn || 'Verifying Credentials...'
                : isLockedOut
                ? `LOCKED (${formatLockoutTime(lockoutRemainingSec!)})`
                : `${wp.signInBtn || 'Sign In'} ↗`}
            </Button>

            {/* Registration and Password Reset Links */}
            <div className="pt-4 border-t-2 border-slate-200 mt-6 space-y-2 text-center font-mono">
              <div>
                <Link
                  href={`/register?role=${roleTab}`}
                  className="min-h-[44px] text-xs font-bold text-[#1D4ED8] hover:underline uppercase inline-flex items-center justify-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-black px-2.5"
                >
                  <span>{wp.dontHaveId || "Don't have an ID? Register profile here"}</span>
                  <span>↗</span>
                </Link>
              </div>
              <div>
                <Link
                  href="/set-password"
                  className="min-h-[44px] text-[11px] font-bold text-slate-600 hover:text-black hover:underline uppercase inline-flex items-center justify-center gap-1 focus:outline-none focus:ring-1 focus:ring-black px-2.5"
                >
                  <span>{wp.resetPasswordLink || 'Set / Reset Password with Token'}</span>
                  <span>↗</span>
                </Link>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* Footer Strip */}
      <footer className="bg-white border-t-2 border-[#0F172A] py-3 text-center text-xs font-mono text-slate-500">
        SHRAMIKSETU STATUTORY WAGE PLATFORM · TRILINGUAL (HI / MR / EN) · ZERO MOCK DATA
      </footer>
    </div>
  );
}

export default function SignInPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FFFDF5] flex items-center justify-center font-mono text-xs uppercase font-bold text-slate-600">
          Loading authentication portal...
        </div>
      }
    >
      <SignInContent />
    </React.Suspense>
  );
}
