'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { Icons } from '@/components/ui/icons';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { RoleGuard } from '@/components/ui/RoleGuard';

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profiles, logout, locale, setLocale, t } = useAuth();
  const contractorProfile = profiles?.contractor;

  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [openDisputesCount, setOpenDisputesCount] = useState<number>(0);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoadingProjects(true);
        const res = await api.projects.list();
        if (res.success && res.projects) {
          setProjects(res.projects);
        }
      } catch {
        // Non-blocking
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();

    if (contractorProfile?.id) {
      api.disputes.count({ contractorId: contractorProfile.id })
        .then((res) => {
          if (res.success && typeof res.count === 'number') {
            setOpenDisputesCount(res.count);
          }
        })
        .catch(() => {});
    }
  }, [pathname, contractorProfile?.id]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col selection:bg-[#FEF3C7] selection:text-[#0F172A]">
      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-40 bg-white border-b-2 border-[#0F172A]">
        <div className="w-full px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0F172A] text-white flex items-center justify-center font-mono font-black text-xs border-2 border-black shadow-brutal-sm relative">
              CR
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#F59E0B] border border-black rounded-full" />
            </div>
            <Link href="/contractor" className="min-h-[44px] flex items-center gap-2">
              <span className="font-black text-sm sm:text-base tracking-wider uppercase text-[#0F172A]">
                SHRAMIKSETU
              </span>
              <span className="hidden md:inline font-mono text-xs text-[#B45309] font-black uppercase">
                · CONTRACTOR DESK · ठेकेदार
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Language Selector */}
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

            {/* Contractor Profile / ID Display */}
            <div className="hidden sm:block text-right font-mono">
              <div className="text-xs font-black uppercase text-[#0F172A] truncate max-w-[160px]">
                {contractorProfile?.company_name || user?.login_id || 'Contractor'}
              </div>
              <div className="text-[10px] text-slate-500 font-bold">
                {user?.login_id || (contractorProfile?.license_number ? `LIC: ${contractorProfile.license_number}` : 'REGISTERED ENTITY')}
              </div>
            </div>

            <NotificationBell />

            {/* Sign Out Button */}
            {user ? (
              <button
                type="button"
                onClick={logout}
                title={t.nav.logout || 'Sign Out'}
                aria-label={t.nav.logout || 'Sign Out'}
                className="min-h-[44px] min-w-[44px] px-2.5 text-xs font-mono font-bold flex items-center justify-center gap-1.5 text-[#DC2626] bg-white hover:bg-red-50 border-2 border-black shadow-brutal-sm transition-all"
              >
                <Icons.LogOut size={16} />
                <span className="hidden md:inline">{t.nav.logout || 'Sign Out'}</span>
              </button>
            ) : (
              <Link
                href="/signin?role=contractor"
                className="min-h-[44px] min-w-[44px] px-3 text-xs font-mono font-bold flex items-center justify-center gap-1 text-black bg-[#F59E0B] hover:bg-amber-400 border-2 border-black shadow-brutal-sm"
              >
                <Icons.LogIn size={16} />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hazard Seam Accent Line */}
      <div className="cricket-seam-divider" />

      {/* Two-Zone Layout (Rail + Content) */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Left Rail */}
        <aside className="w-full md:w-64 bg-white border-b-2 md:border-b-0 md:border-r-2 border-[#0F172A] flex flex-col shrink-0">
          {/* Mobile Language Switcher */}
          <div className="sm:hidden p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase text-slate-500">भाषा / LANGUAGE</span>
            <div className="flex border border-black bg-white shadow-brutal-sm">
              {(['hi', 'mr', 'en'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocale(loc)}
                  className={`min-h-[44px] min-w-[44px] px-2 text-xs font-mono font-black flex items-center justify-center ${
                    locale === loc ? 'bg-[#F59E0B] text-black' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {loc === 'hi' ? 'हिन्दी' : loc === 'mr' ? 'मराठी' : 'EN'}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-100 border-b-2 border-slate-200 flex items-center justify-between font-mono gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#0F172A] truncate">
              CIVIL SITES ({projects.length})
            </span>
            <Link
              href="/contractor/projects/new"
              className="min-h-[44px] text-xs font-black bg-[#F59E0B] text-black px-3 py-1.5 border border-black shadow-brutal-sm uppercase flex items-center gap-1 shrink-0"
            >
              <Icons.Plus size={14} />
              NEW SITE
            </Link>
          </div>

          <div className="p-2 space-y-1.5 flex-1 overflow-y-auto max-h-56 md:max-h-[calc(100vh-140px)]">
            <Link
              href="/contractor"
              className={`min-h-[44px] flex items-center p-2.5 text-xs font-mono font-black uppercase rounded-[2px] transition-all border-2 ${
                pathname === '/contractor'
                  ? 'bg-[#0F172A] text-white border-black shadow-brutal-sm'
                  : 'text-[#0F172A] border-transparent hover:bg-slate-100'
              }`}
            >
              ● DASHBOARD OVERVIEW
            </Link>

            <Link
              href="/contractor/disputes"
              className={`min-h-[44px] flex items-center justify-between p-2.5 text-xs font-mono font-black uppercase rounded-[2px] transition-all border-2 ${
                pathname === '/contractor/disputes'
                  ? 'bg-[#FEF2F2] text-[#991B1B] border-[#DC2626] shadow-brutal-sm'
                  : 'text-[#0F172A] border-transparent hover:bg-slate-100'
              }`}
            >
              <span>⚠ DISPUTES &amp; CLAIMS</span>
              {openDisputesCount > 0 && (
                <span className="ml-2 px-1.5 py-0.2 bg-[#DC2626] text-white text-[10px] font-mono font-bold rounded-full">
                  {openDisputesCount}
                </span>
              )}
            </Link>

            {projects.map((proj) => {
              const isSelected = pathname.includes(`/contractor/projects/${proj.id}`);
              return (
                <Link
                  key={proj.id}
                  href={`/contractor/projects/${proj.id}`}
                  className={`min-h-[44px] flex flex-col justify-center p-2.5 text-xs uppercase rounded-[2px] transition-all border-2 ${
                    isSelected
                      ? 'bg-[#FEF3C7] border-black text-[#0F172A] font-black shadow-brutal-sm'
                      : 'text-[#0F172A] border-transparent hover:bg-slate-100'
                  }`}
                >
                  <div className="font-black truncate">{proj.name}</div>
                  <div className="text-[10px] text-slate-500 truncate font-mono mt-0.5">
                    {proj.start_date || 'Active Project'}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="p-3 border-t-2 border-black bg-slate-100 hidden md:block">
            <Link
              href="/contractor/projects/new"
              className="mechanical-btn min-h-[44px] w-full flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-mono font-black uppercase tracking-wider bg-[#0F172A] text-white hover:bg-slate-800 border-2 border-black shadow-brutal-sm"
            >
              <Icons.Plus size={14} />
              CREATE PROJECT SITE ↗
            </Link>
          </div>
        </aside>

        {/* Main Content Pane Protected with Client RoleGuard */}
        <main className="flex-1 min-w-0 bg-[#F8FAFC]">
          <RoleGuard allowedRoles={['CONTRACTOR', 'ADMIN']}>
            {children}
          </RoleGuard>
        </main>
      </div>
    </div>
  );
}

