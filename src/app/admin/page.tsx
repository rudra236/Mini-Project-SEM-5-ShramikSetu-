'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { LoadingState } from '@/components/ui/FeedbackStates';

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        setIsLoading(true);
        const [projectsRes, contractsRes, attendanceRes] = await Promise.allSettled([
          api.projects.list(),
          api.contracts.list(),
          api.attendance.list(),
        ]);

        setStats({
          projectsCount: projectsRes.status === 'fulfilled' ? projectsRes.value.projects?.length || 0 : 0,
          contractsCount: contractsRes.status === 'fulfilled' ? contractsRes.value.contracts?.length || 0 : 0,
          attendanceCount: attendanceRes.status === 'fulfilled' ? attendanceRes.value.attendanceEvents?.length || 0 : 0,
        });
      } catch {
        // Handled
      } finally {
        setIsLoading(false);
      }
    };
    fetchAdminStats();
  }, []);

  if (isLoading) {
    return <LoadingState message="ACCESSING CENTRAL ADMIN CONSOLE..." />;
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      {/* Header */}
      <header className="bg-[var(--ink)] text-white px-4 py-3 border-b-4 border-[var(--site-yellow)]">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--site-yellow)] text-[var(--ink)] font-bold flex items-center justify-center text-xs rounded-[2px]">
              AD
            </div>
            <div>
              <span className="font-bold text-base tracking-wider uppercase text-white">
                SHRAMIKSETU CENTRAL ADMIN CONSOLE
              </span>
              <div className="text-[10px] font-mono text-[var(--site-yellow)]">
                SUPERUSER CONTROL & IMMUTABLE LEDGER MONITOR
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs font-mono uppercase text-white/80 hover:text-white">
              PORTAL HOME
            </Link>
            <button
              onClick={logout}
              className="p-1.5 text-white/80 hover:text-white rounded-[2px]"
            >
              <Icons.LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="border-b-2 border-[var(--ink)] pb-3 flex justify-between items-center bg-white p-5">
          <div>
            <div className="text-[10px] font-bold font-mono uppercase tracking-widest text-[var(--register-blue)]">
              SYSTEM CONSOLE · प्रशासनिक नियंत्रण
            </div>
            <h1 className="text-2xl font-bold uppercase text-[var(--ink)] mt-0.5">
              System Administration
            </h1>
            <p className="text-xs text-[var(--ink-60)] mt-0.5">
              Administer system entities, test cross-role workflows, and monitor immutable database logs.
            </p>
          </div>
        </div>

        {/* Global Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-white border-2 border-[var(--ink)]">
            <div className="text-[10px] font-bold uppercase text-[var(--ink-60)]">TOTAL WORKSITE PROJECTS</div>
            <div className="font-data text-2xl font-bold text-[var(--ink)] mt-1">
              {stats?.projectsCount}
            </div>
          </div>

          <div className="p-4 bg-white border-2 border-[var(--ink)]">
            <div className="text-[10px] font-bold uppercase text-[var(--ink-60)]">REGISTERED CONTRACTS</div>
            <div className="font-data text-2xl font-bold text-[var(--register-blue)] mt-1">
              {stats?.contractsCount}
            </div>
          </div>

          <div className="p-4 bg-white border-2 border-[var(--ink)]">
            <div className="text-[10px] font-bold uppercase text-[var(--ink-60)]">MUSTERS VERIFIED</div>
            <div className="font-data text-2xl font-bold text-[#1E7A4B] mt-1">
              {stats?.attendanceCount}
            </div>
          </div>
        </div>

        {/* Cryptographic Tamper-Evidence & Integrity Monitor */}
        <div className="bg-white border-2 border-[var(--ink)] p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-[var(--ink-20)] gap-3">
            <div>
              <div className="text-[10px] font-bold font-mono uppercase tracking-widest text-[#1E7A4B]">
                CRYPTOGRAPHIC INTEGRITY · अपरिवर्तनीय लेज़र
              </div>
              <h2 className="text-lg font-bold uppercase text-[var(--ink)] mt-0.5">
                Tamper-Evidence & Hash Chain Monitor
              </h2>
              <p className="text-xs text-[var(--ink-60)] mt-0.5">
                Continuous SHA-256 chain recomputation, nightly Merkle root anchors, and DB trigger enforcement.
              </p>
            </div>
            <Link href="/admin/integrity">
              <Button variant="verified" size="md">
                OPEN INTEGRITY DESK →
              </Button>
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 border border-gray-200">
              <div className="text-[10px] font-bold uppercase text-gray-500">DOUBLE-ENTRY LEDGER</div>
              <div className="text-sm font-bold text-[#1E7A4B] mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1E7A4B]"></span>
                SHA-256 HASH CHAINED
              </div>
              <div className="text-[10px] text-gray-500 mt-1">UPDATE / DELETE blocked</div>
            </div>

            <div className="p-3 bg-gray-50 border border-gray-200">
              <div className="text-[10px] font-bold uppercase text-gray-500">ATTENDANCE MUSTER</div>
              <div className="text-sm font-bold text-[#1E7A4B] mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1E7A4B]"></span>
                SHA-256 HASH CHAINED
              </div>
              <div className="text-[10px] text-gray-500 mt-1">Append-only protected</div>
            </div>

            <div className="p-3 bg-gray-50 border border-gray-200">
              <div className="text-[10px] font-bold uppercase text-gray-500">TRANSPARENCY ANCHORS</div>
              <div className="text-sm font-bold text-[var(--register-blue)] mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--register-blue)]"></span>
                MERKLE ROOT ANCHORED
              </div>
              <div className="text-[10px] text-gray-500 mt-1">Public log verifiable</div>
            </div>
          </div>
        </div>

        {/* Role Quick Jump Links */}
        <div className="bg-white border-2 border-[var(--ink)] p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] mb-3 pb-2 border-b border-[var(--ink-20)]">
            CROSS-ROLE TESTING & EMULATION PORTALS
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/worker">
              <Button variant="yellow" fullWidth size="md">
                WORKER DESK →
              </Button>
            </Link>
            <Link href="/contractor">
              <Button variant="secondary" fullWidth size="md">
                CONTRACTOR DESK →
              </Button>
            </Link>
            <Link href="/supervisor">
              <Button variant="warning" fullWidth size="md">
                GATE SUPERVISOR →
              </Button>
            </Link>
            <Link href="/inspector">
              <Button variant="verified" fullWidth size="md">
                INSPECTOR DESK →
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
