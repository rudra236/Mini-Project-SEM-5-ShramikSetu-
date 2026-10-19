'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { Icons } from '@/components/ui/icons';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { formatRupees } from '@/lib/money';
import { getCachedBalance, saveCachedBalance, getCachedAttendance, saveCachedAttendance } from '@/lib/offline-cache';
import { RoleGuard } from '@/components/ui/RoleGuard';

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profiles, locale, setLocale, logout, t } = useAuth();
  const wp = t.workerPortal;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Persistent bottom status data with offline fallback (hydrated in useEffect to avoid SSR mismatch)
  const [outstandingPaise, setOutstandingPaise] = useState<number>(0);
  const [verifiedDays, setVerifiedDays] = useState<number>(0);
  const [todayMarked, setTodayMarked] = useState<boolean>(false);
  const [cacheTime, setCacheTime] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Read offline cache on client mount
    const cachedB = getCachedBalance();
    if (cachedB?.data) {
      setOutstandingPaise(cachedB.data.outstandingPaise || 0);
      setVerifiedDays(cachedB.data.verifiedDaysCount || 0);
      setCacheTime(cachedB.cachedAt);
    }
    const cachedA = getCachedAttendance();
    if (cachedA?.data) {
      setTodayMarked(cachedA.data.todayMarked || false);
    }
    const fetchQuickStatus = async () => {
      try {
        const [earningsRes, attendanceRes] = await Promise.allSettled([
          api.earnings.get(),
          api.attendance.list(),
        ]);

        if (earningsRes.status === 'fulfilled' && earningsRes.value.success) {
          const paise = earningsRes.value.outstandingPaise || 0;
          const days = earningsRes.value.verifiedDaysCount || 0;
          setOutstandingPaise(paise);
          setVerifiedDays(days);
          saveCachedBalance({ outstandingPaise: paise, verifiedDaysCount: days });
          setCacheTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }

        if (attendanceRes.status === 'fulfilled' && attendanceRes.value.success) {
          const events = attendanceRes.value.attendanceEvents || [];
          const todayStr = new Date().toISOString().split('T')[0];
          const hasMarkedToday = events.some(
            (e: any) => e.attendance_date === todayStr || (e.created_at && e.created_at.startsWith(todayStr))
          );
          setTodayMarked(hasMarkedToday);
          saveCachedAttendance({ todayMarked: hasMarkedToday, events });
        }
      } catch {
        // Fall back gracefully to cached state
      }
    };

    fetchQuickStatus();
  }, []);

  const navItems = [
    { href: '/worker', label: t.nav.home, icon: Icons.User },
    { href: '/worker/contracts', label: t.nav.contracts, icon: Icons.FileText },
    { href: '/worker/attendance', label: t.nav.attendance, icon: Icons.CheckCircle },
    { href: '/worker/wallet', label: t.nav.wallet, icon: Icons.Clock },
    { href: '/worker/disputes', label: t.nav.disputes, icon: Icons.AlertTriangle },
    { href: '/worker/passport', label: t.nav.passport, icon: Icons.ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col pb-16 selection:bg-[#FEF3C7] selection:text-[#0F172A]">
      {/* ─── Header Strip (Neo-Brutalist White & Hard Border) ─── */}
      {/* ─── Header Strip (Neo-Brutalist White & Hard Border) ─── */}
      <header className="sticky top-0 z-40 bg-white border-b-2 border-[#0F172A]">
        {/* Mobile Language Switcher Strip (< sm) placed first in DOM */}
        <div className="sm:hidden bg-slate-50 border-b border-slate-200 px-3 py-1 flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase text-slate-500">भाषा / LANGUAGE</span>
          <div role="radiogroup" aria-label={t.nav.language} className="flex border border-black bg-white shadow-brutal-sm">
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
                  className={`min-h-[44px] min-w-[44px] px-2 text-xs font-mono font-black flex items-center justify-center transition-all ${
                    isSelected ? 'bg-[#F59E0B] text-black font-extrabold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {locLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[#0F172A] bg-slate-100 hover:bg-slate-200 border-2 border-black shadow-brutal-sm"
            >
              <Icons.Menu size={20} />
            </button>
            <Link href="/worker" className="min-h-[44px] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0F172A] text-white font-black text-xs flex items-center justify-center border-2 border-black shadow-brutal-sm shrink-0">
                SS
              </div>
              <div>
                <div className="font-black text-xs sm:text-sm tracking-wider uppercase leading-none text-[#0F172A]">
                  SHRAMIKSETU
                </div>
                <div className="hidden sm:block text-[10px] font-mono text-[#B45309] font-black uppercase leading-tight mt-0.5">
                  WORKER REGISTER · श्रमिक
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Desktop / Tablet Language Selector */}
            <div
              role="radiogroup"
              aria-label={t.nav.language}
              className="hidden sm:flex border-2 border-black bg-white shadow-brutal-sm overflow-hidden"
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
                      isSelected
                        ? 'bg-[#F59E0B] text-[#0F172A]'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {locLabel}
                  </button>
                );
              })}
            </div>

            {/* User ID / Name Badge */}
            {user && (
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 bg-[#FFFDF5] border border-black font-mono text-[10px] font-bold text-[#0F172A] shadow-brutal-sm">
                <Icons.User size={12} className="text-[#B45309]" />
                <span className="truncate max-w-[120px]">{user.login_id || profiles?.worker?.full_name || 'Worker'}</span>
              </div>
            )}

            {/* Sign Out / Sign In Button */}
            {user ? (
              <button
                type="button"
                onClick={logout}
                title={t.nav.logout || 'Sign Out'}
                aria-label={t.nav.logout || 'Sign Out'}
                className="flex min-h-[44px] min-w-[44px] px-2.5 text-xs font-mono font-bold items-center justify-center gap-1 text-[#DC2626] bg-white hover:bg-red-50 border-2 border-black shadow-brutal-sm transition-all"
              >
                <Icons.LogOut size={16} />
                <span className="hidden md:inline">{t.nav.logout || 'Sign Out'}</span>
              </button>
            ) : (
              <Link
                href="/signin?role=worker"
                className="min-h-[44px] min-w-[44px] px-2.5 text-xs font-mono font-bold flex items-center justify-center gap-1 text-black bg-[#F59E0B] hover:bg-amber-400 border-2 border-black shadow-brutal-sm transition-all"
              >
                <Icons.LogIn size={16} />
                <span className="hidden sm:inline">{wp.signIn || 'Sign In'}</span>
              </Link>
            )}

            <NotificationBell />
          </div>
        </div>

        {/* Sub-Navigation Bar with Horizontal Scroll */}
        <div className="bg-slate-100 border-t border-[#0F172A]">
          <nav className="max-w-2xl mx-auto px-2 sm:px-3 py-1 flex items-center space-x-1.5 overflow-x-auto no-scrollbar text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
            {navItems.map((item, idx) => {
              const isActive = pathname === item.href;
              return (
                <React.Fragment key={item.href}>
                  {idx > 0 && <span className="text-slate-300">/</span>}
                  <Link
                    href={item.href}
                    className={`min-h-[44px] flex items-center px-3 py-1 whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? 'bg-[#0F172A] text-white font-black shadow-brutal-sm border border-black'
                        : 'hover:text-black hover:bg-white/80'
                    }`}
                  >
                    {item.label}
                  </Link>
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Hazard Seam Accent Line */}
      <div className="cricket-seam-divider" />

      {/* Offline Banner */}
      <OfflineBanner locale={locale} cachedAt={cacheTime} />

      {/* Navigation Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="relative w-72 max-w-[85vw] bg-white h-full border-r-2 border-black flex flex-col justify-between z-10 shadow-brutal-lg">
            <div>
              <div className="p-4 border-b-2 border-black bg-[#0F172A] text-white flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold font-mono tracking-widest uppercase text-[#F59E0B]">
                    {t.workerHome.idCardTitle}
                  </div>
                  <div className="font-black text-sm uppercase mt-0.5 truncate max-w-[180px]">
                    {profiles?.worker?.full_name || user?.phone || t.roles.WORKER}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label={t.common.close}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1 text-white hover:bg-white/10 border border-white/20"
                >
                  <Icons.X size={18} />
                </button>
              </div>

              <nav className="p-3 space-y-2" aria-label="Main Navigation">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsDrawerOpen(false)}
                      className={`mechanical-btn min-h-[44px] flex items-center gap-3 px-3 text-xs font-mono font-black uppercase tracking-wider border-2 border-black transition-all ${
                        isActive
                          ? 'bg-[#F59E0B] text-[#0F172A] shadow-brutal'
                          : 'bg-white text-[#0F172A] hover:bg-slate-50 shadow-brutal-sm'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="p-4 border-t-2 border-black bg-slate-100">
              <button
                type="button"
                onClick={logout}
                className="mechanical-btn w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-mono font-black uppercase tracking-wider text-white bg-[#DC2626] border-2 border-black shadow-brutal-sm"
              >
                <Icons.LogOut size={16} />
                {t.nav.logout}
              </button>
              <div className="text-[10px] font-mono text-center text-slate-500 mt-2 font-bold">
                SHRAMIKSETU · WORKER PROTOCOL
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Single-Column Content Protected with Client RoleGuard */}
      <main className="max-w-2xl mx-auto w-full flex-1 px-3 sm:px-4 py-4">
        <RoleGuard allowedRoles={['WORKER', 'ADMIN']}>
          {children}
        </RoleGuard>
      </main>

      {/* Fixed Neo-Brutalist Bottom Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t-2 border-black shadow-brutal">
        <div className="max-w-2xl mx-auto px-3 py-2 flex items-center justify-between text-xs">
          <Link
            href="/worker/attendance"
            className="min-h-[44px] flex items-center gap-2 py-1 px-2 hover:bg-slate-100 border border-transparent hover:border-black rounded-[2px]"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                todayMarked ? 'bg-[#15803D]' : 'bg-[#EA580C] pulse-dot'
              }`}
            />
            <div className="text-left truncate font-mono">
              <div className="text-[9px] font-bold uppercase text-slate-500 leading-none">
                TODAY&apos;S SHIFT
              </div>
              <div className="text-xs font-black text-[#0F172A] truncate leading-tight mt-0.5">
                {todayMarked ? '✓ VERIFIED PUNCH' : '● PENDING CHECK-IN'}
              </div>
            </div>
          </Link>

          <Link
            href="/worker/wallet"
            className="min-h-[44px] flex items-center gap-2 py-1 px-2.5 hover:bg-slate-100 border border-black bg-[#FEF3C7] shadow-brutal-sm"
          >
            <div className="text-right font-mono">
              <div className="text-[9px] font-bold uppercase text-[#B45309] leading-none">
                UNPAID WAGES
              </div>
              <div className="font-mono font-black text-xs sm:text-sm text-[#0F172A] leading-tight mt-0.5">
                {formatRupees(outstandingPaise, true)}
              </div>
            </div>
            <div className="w-5 h-5 bg-[#0F172A] text-white flex items-center justify-center font-bold text-[10px]">
              ₹
            </div>
          </Link>
        </div>
      </footer>
    </div>
  );
}
