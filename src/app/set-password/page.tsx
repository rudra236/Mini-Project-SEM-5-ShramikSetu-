'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';

function SetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setPassword, locale, setLocale, t } = useAuth();
  const wp = t.workerPortal;

  const initialToken = searchParams.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanToken = token.trim();
    if (!cleanToken) {
      setErrorMessage('One-time verification token is required.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage(wp.passwordRequirements || 'Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage(wp.passwordMismatch || 'Passwords do not match.');
      return;
    }

    try {
      setIsLoading(true);
      const ok = await setPassword(cleanToken, newPassword);
      if (ok) {
        setSuccessMessage(wp.passwordSetSuccess || 'Password successfully updated! You can now sign in.');
        setTimeout(() => {
          router.push('/signin?status=password_reset');
        }, 1500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update password. Please check your token.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDF5] text-[#0F172A] flex flex-col justify-between selection:bg-[#FEF3C7] selection:text-[#0F172A]">
      {/* Top Header */}
      <header className="bg-white border-b-2 border-[#0F172A] sticky top-0 z-40">
        <div className="max-w-[1000px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-[#0F172A] text-white font-black text-sm flex items-center justify-center border-2 border-black shadow-brutal-sm relative">
              SS
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#F59E0B] border border-black rounded-full" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-extrabold uppercase tracking-tight text-[#0F172A]">
                SHRAMIKSETU × AUTH PROTOCOL
              </div>
              <div className="text-[10px] font-mono text-slate-500 uppercase">
                ONE-TIME PASSWORD ACTIVATION
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
                  className={`min-h-[34px] px-2.5 text-xs font-mono font-black transition-all ${
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

      <div className="cricket-seam-divider" />

      {/* Main Set-Password Card */}
      <main className="max-w-md mx-auto w-full px-4 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        <div className="border-2 border-black bg-white p-6 sm:p-8 shadow-brutal-lg">
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 bg-[#F59E0B] border border-black" />
              <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-[#B45309]">
                TOKEN-BASED CREDENTIAL ACTIVATION
              </span>
            </div>
            <h1 className="text-2xl font-black uppercase text-[#0F172A] tracking-tight">
              {wp.setPasswordTitle || 'Set Account Password'}
            </h1>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {wp.setPasswordDesc || 'Enter your one-time verification token to set a new password.'}
            </p>
          </div>

          {/* Notices */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3.5 mb-5 border-2 border-[#DC2626] bg-[#FEF2F2] text-[#991B1B] text-xs font-bold shadow-brutal-sm"
            >
              <div className="flex items-center gap-1.5 mb-1 uppercase text-[11px] font-black">
                <Icons.AlertTriangle size={15} />
                <span>{t.common.error}</span>
              </div>
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              aria-live="polite"
              className="p-3.5 mb-5 border-2 border-[#15803D] bg-[#F0FDF4] text-[#166534] text-xs font-bold shadow-brutal-sm"
            >
              <div className="flex items-center gap-1.5 mb-1 uppercase text-[11px] font-black">
                <Icons.CheckCircle size={15} />
                <span>{t.common.success}</span>
              </div>
              <p className="leading-relaxed">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="set-pwd-token"
                className="block text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A] mb-1.5"
              >
                {wp.tokenLabel || 'One-Time Token'} *
              </label>
              <input
                id="set-pwd-token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={wp.tokenPlaceholder || 'Enter 64-character token'}
                className="w-full min-h-[48px] border-2 border-black p-3 font-mono text-xs font-bold tracking-wider outline-none focus:bg-[#FFFDF5] focus:ring-2 focus:ring-[#F59E0B] shadow-brutal-sm"
                required
                disabled={isLoading}
                spellCheck={false}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label
                  htmlFor="set-pwd-new"
                  className="block text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A]"
                >
                  {wp.newPasswordLabel || 'New Password'} *
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] font-mono font-bold text-[#1D4ED8] hover:underline uppercase"
                >
                  {showPassword ? wp.hidePassword : wp.showPassword}
                </button>
              </div>
              <input
                id="set-pwd-new"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={wp.newPasswordPlaceholder || 'Minimum 8 characters'}
                className="w-full min-h-[48px] border-2 border-black p-3 font-mono text-sm font-bold tracking-wider outline-none focus:bg-[#FFFDF5] focus:ring-2 focus:ring-[#F59E0B] shadow-brutal-sm"
                required
                disabled={isLoading}
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>

            <div>
              <label
                htmlFor="set-pwd-confirm"
                className="block text-xs font-mono font-bold uppercase tracking-wider text-[#0F172A] mb-1.5"
              >
                {wp.confirmPasswordLabel || 'Confirm New Password'} *
              </label>
              <input
                id="set-pwd-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={wp.confirmPasswordPlaceholder || 'Re-enter new password'}
                className="w-full min-h-[48px] border-2 border-black p-3 font-mono text-sm font-bold tracking-wider outline-none focus:bg-[#FFFDF5] focus:ring-2 focus:ring-[#F59E0B] shadow-brutal-sm"
                required
                disabled={isLoading}
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              shimmer
              isLoading={isLoading}
              disabled={isLoading || !token.trim() || newPassword.length < 8}
              className="min-h-[48px] text-sm font-black uppercase tracking-wider shadow-brutal hover:shadow-brutal-lg"
            >
              {isLoading
                ? wp.settingPassword || 'Updating Password...'
                : `${wp.submitSetPassword || 'Set New Password'} ↗`}
            </Button>

            <div className="pt-3 border-t-2 border-slate-200 mt-4 text-center font-mono">
              <Link
                href="/signin"
                className="text-xs font-bold text-[#1D4ED8] hover:underline uppercase inline-flex items-center gap-1"
              >
                <span>{wp.haveId || 'Already have an ID? Sign in here'}</span>
                <span>↗</span>
              </Link>
            </div>
          </form>
        </div>
      </main>

      <footer className="bg-white border-t-2 border-[#0F172A] py-3 text-center text-xs font-mono text-slate-500">
        SHRAMIKSETU STATUTORY WAGE PLATFORM · ONE-TIME PASSWORD ACTIVATION
      </footer>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FFFDF5] flex items-center justify-center font-mono text-xs uppercase font-bold text-slate-600">
          Loading password activation...
        </div>
      }
    >
      <SetPasswordContent />
    </React.Suspense>
  );
}
