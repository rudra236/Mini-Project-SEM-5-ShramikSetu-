'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '@/components/ui/icons';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { LoadingState } from '@/components/ui/FeedbackStates';

export default function InspectorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, profiles, isLoading, logout } = useAuth();
  const instProfile = profiles?.institutionalUser;

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login?redirect=/inspector');
      } else if (role !== 'INSTITUTIONAL_USER' && role !== 'ADMIN') {
        router.push('/login?redirect=/inspector');
      }
    }
  }, [user, role, isLoading, router]);

  if (isLoading) {
    return <LoadingState message="ACCESSING AUDIT DESK..." />;
  }

  if (!user || (role !== 'INSTITUTIONAL_USER' && role !== 'ADMIN')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] flex flex-col">
      {/* Statutory Header */}
      <header className="bg-[var(--ink)] text-white px-4 py-3 border-b-4 border-[#1E7A4B]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1E7A4B] text-white font-bold flex items-center justify-center text-xs rounded-[2px]">
              LI
            </div>
            <div>
              <Link href="/inspector" className="flex items-center gap-2">
                <span className="font-bold text-base uppercase tracking-wider text-white">
                  SHRAMIKSETU
                </span>
                <span className="font-id text-xs text-[#6EE7B7]">· श्रम निरीक्षण डेस्क</span>
              </Link>
              <div className="text-[10px] font-mono text-white/60">
                LABOUR COMPLIANCE & ARBITRATION AUDIT LEDGER
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold uppercase text-white">
                {instProfile?.official_designation || 'Labour Compliance Auditor'}
              </div>
              <div className="text-[10px] font-mono text-white/60">
                JURISDICTION: {instProfile?.jurisdiction_region || 'Unassigned District'}
              </div>
            </div>

            <NotificationBell />

            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-[2px]"
            >
              <Icons.LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Sub-navigation bar */}
      <div className="border-b-2 border-[var(--ink)] bg-white px-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
          <Link
            href="/inspector"
            className={`py-3 border-b-2 transition-none ${
              pathname === '/inspector'
                ? 'border-[#1E7A4B] text-[#155A36]'
                : 'border-transparent text-[var(--ink-60)] hover:text-[var(--ink)]'
            }`}
          >
            COMPLIANCE LEDGER · अनुपालन
          </Link>
          <Link
            href="/inspector/disputes"
            className={`py-3 border-b-2 transition-none ${
              pathname === '/inspector/disputes'
                ? 'border-[#1E7A4B] text-[#155A36]'
                : 'border-transparent text-[var(--ink-60)] hover:text-[var(--ink)]'
            }`}
          >
            ARBITRATION DESK · विवाद निवारण
          </Link>
        </div>
      </div>

      {/* Main Full-Width Content */}
      <main className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1">
        {children}
      </main>

      <footer className="bg-[#E8E3DC] border-t border-[var(--ink-20)] px-4 py-3 text-center text-xs font-mono text-[var(--ink-60)]">
        SHRAMIKSETU COMPLIANCE AUDIT REGISTRY · STATUTORY WAGE LEDGER
      </footer>
    </div>
  );
}
