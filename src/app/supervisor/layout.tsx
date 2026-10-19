'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '@/components/ui/icons';

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] flex flex-col justify-between">
      {/* High-visibility gate header */}
      <header className="bg-[var(--ink)] text-white px-4 py-3 border-b-4 border-[var(--site-yellow)]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--site-yellow)] text-[var(--ink)] font-bold flex items-center justify-center text-xs rounded-[2px]">
              GT
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-white">
                SHRAMIKSETU GATE KIOSK
              </div>
              <div className="text-[10px] font-mono text-[var(--site-yellow)]">
                ATTENDANCE TOKEN DISPENSER
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs text-white/80 hover:text-white px-2 py-1 font-mono uppercase"
            >
              EXIT KIOSK
            </Link>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-white/80 hover:text-white rounded-[2px]"
            >
              <Icons.LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Single Action Center */}
      <main className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-[#E8E3DC] border-t border-[var(--ink-20)] px-4 py-2 text-center text-[10px] font-mono text-[var(--ink-60)]">
        GATE ATTENDANCE VERIFICATION TERMINAL · 100M GPS REQUIRED
      </footer>
    </div>
  );
}
