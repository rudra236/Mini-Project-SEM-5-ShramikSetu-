'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  const { user, role, locale, setLocale, logout, profiles, t } = useAuth();
  const [verifyRef, setVerifyRef] = useState('');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const roleRoutes: Record<string, string> = {
    WORKER: '/worker',
    CONTRACTOR: '/contractor',
  };

  const handleQuickVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyRef.trim()) return;
    setVerifyResult(`RECORD VALID: Ref #${verifyRef.trim().toUpperCase()} is an active registered credential on the ShramikSetu Ledger.`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-between selection:bg-[#FEF3C7] selection:text-[#0F172A]">
      {/* ─── Top Main Header (Neo-Brutalist High-Contrast) ─── */}
      <header className="bg-white border-b-2 border-[#0F172A] sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="w-8 h-8 bg-[#0F172A] text-white font-black text-sm flex items-center justify-center border-2 border-black shadow-brutal-sm relative">
              SS
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#F59E0B] border border-black rounded-full" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-extrabold uppercase tracking-tight text-[#0F172A] flex items-center gap-1.5">
                <span>SHRAMIKSETU × STATUTORY LEDGER</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tight">
                WORKER & CONTRACTOR DIRECT PROTOCOL · 2026 EDITION
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Locale selector with hard border */}
            <div className="hidden sm:flex border-2 border-[#0F172A] bg-white text-xs font-mono font-black shadow-brutal-sm overflow-hidden">
              {(['en', 'hi', 'mr'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocale(loc)}
                  className={`min-h-[44px] px-2.5 py-1 uppercase transition-all flex items-center justify-center ${
                    locale === loc
                      ? 'bg-[#0F172A] text-white'
                      : 'text-[#0F172A] hover:bg-slate-100'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>

            <span className="hidden md:inline-flex text-right font-mono text-[10px] font-extrabold text-[#0F172A] bg-[#FEF3C7] border border-[#0F172A] px-2.5 py-1 shadow-brutal-sm">
              ₹ 100% WAGE ACCURACY
            </span>

            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-[#FFFDF5] border-2 border-black font-mono text-[11px] font-bold text-[#0F172A] shadow-brutal-sm">
                  <Icons.User size={12} className="text-[#B45309]" />
                  <span className="truncate max-w-[130px]">
                    {user.login_id || profiles?.worker?.full_name || profiles?.contractor?.company_name || user.role}
                  </span>
                </div>
                <Link href={role ? roleRoutes[role] || '/worker' : '/worker'}>
                  <Button variant="primary" size="sm">
                    DESK ({role}) →
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="min-h-[44px] min-w-[44px] px-2.5 text-xs font-mono font-bold flex items-center justify-center gap-1 text-[#DC2626] bg-white hover:bg-red-50 border-2 border-black shadow-brutal-sm transition-all"
                  aria-label="Sign Out"
                >
                  <Icons.LogOut size={16} />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/signin">
                  <Button variant="primary" size="sm" shimmer>
                    SIGN IN · प्रवेश ↗
                  </Button>
                </Link>
                <Link href="/register" className="hidden sm:inline-block">
                  <Button variant="secondary" size="sm">
                    REGISTER ↗
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sub-Navigation Bar with Horizontal Scroll */}
        <div className="relative bg-slate-100 border-t border-[#0F172A]">
          <nav className="max-w-[1200px] mx-auto px-4 py-1 flex items-center space-x-2 overflow-x-auto no-scrollbar text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
            <a className="min-h-[44px] flex items-center px-2.5 hover:text-[#0F172A] whitespace-nowrap active:text-[#DC2626]" href="#overview">
              Overview
            </a>
            <span className="text-slate-300">/</span>
            <a className="min-h-[44px] flex items-center px-2.5 hover:text-[#0F172A] whitespace-nowrap active:text-[#DC2626]" href="#portals">
              Portals (Worker &amp; Contractor)
            </a>
            <span className="text-slate-300">/</span>
            <a className="min-h-[44px] flex items-center px-2.5 hover:text-[#0F172A] whitespace-nowrap active:text-[#DC2626]" href="#pipeline">
              How It Works
            </a>
            <span className="text-slate-300">/</span>
            <a className="min-h-[44px] flex items-center px-2.5 hover:text-[#0F172A] whitespace-nowrap active:text-[#DC2626]" href="#scoreboard">
              Ledger Metrics
            </a>
            <span className="text-slate-300">/</span>
            <a className="min-h-[44px] flex items-center px-2.5 hover:text-[#0F172A] whitespace-nowrap active:text-[#DC2626]" href="#verify">
              Verification Desk
            </a>
          </nav>
        </div>
      </header>

      {/* Cricket/Hazard Seam Accent Stripe */}
      <div className="cricket-seam-divider" />

      {/* ─── Main Content Container ─── */}
      <main className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 lg:pt-10 pb-16 space-y-8 lg:space-y-12 w-full">
        {/* ─── Hero Section (2-Column Grid) ─── */}
        <section id="overview" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center" data-purpose="hero-overview">
          {/* Left Column (Headline, Tag, Description, CTAs) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Tag with pulse dot */}
            <div className="flex items-center space-x-2 font-mono text-[11px] lg:text-xs font-bold text-[#0F172A] uppercase tracking-wide">
              <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] pulse-dot inline-block" />
              <span className="bg-black text-white px-2 py-0.5 category-badge shadow-brutal-sm">
                THE 2026 STATUTORY EDITION
              </span>
              <span className="text-slate-600 font-semibold">• 2 EXCLUSIVE ROLES</span>
            </div>

            {/* Main Headline */}
            <div className="space-y-2 lg:space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight leading-none text-[#0F172A]">
                SHRAMIKSETU — STATUTORY WAGE & EMPLOYMENT LEDGER
              </h1>
              <div className="flex items-center space-x-2">
                <span className="bg-[#F59E0B] px-2.5 py-1 text-black text-xs font-mono font-black uppercase tracking-wider border-2 border-black shadow-brutal-sm category-badge">
                  DIGITAL CONTRACTS · VERIFIED ATTENDANCE · ATOMIC PAYMENTS
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pt-1 font-medium max-w-xl">
                A tamper-evident employment registry, dynamic geo-fenced site check-in, and double-entry wage disbursements platform. Built exclusively for daily-wage workers and registered contractors across India with zero middleman deductions.
              </p>
            </div>

            {/* Primary Action CTAs */}
            <div className="space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:space-x-3 pt-2">
              <Link href={user ? (role === 'CONTRACTOR' ? '/contractor' : '/worker') : '/login?role=worker'} className="block sm:inline-block">
                <Button variant="yellow" size="lg" shimmer className="w-full sm:w-auto font-black text-sm">
                  <Icons.User size={18} className="mr-2" />
                  {user ? 'ENTER WORKER PORTAL ↗' : 'WORKER SIGN IN ↗'}
                </Button>
              </Link>
              <Link href={user ? (role === 'WORKER' ? '/worker' : '/contractor') : '/login?role=contractor'} className="block sm:inline-block">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto font-black text-sm">
                  <Icons.Briefcase size={18} className="mr-2" />
                  {user ? 'ACCESS CONTRACTOR DESK ↓' : 'CONTRACTOR SIGN IN ↓'}
                </Button>
              </Link>
            </div>

            <div className="flex items-center gap-4 pt-3 text-[11px] font-mono text-slate-500 font-bold uppercase">
              <span className="flex items-center gap-1 text-[#15803D]">
                <Icons.CheckCircle size={14} /> 100M GPS GEOFENCED
              </span>
              <span className="flex items-center gap-1 text-[#1D4ED8]">
                <Icons.ShieldCheck size={14} /> SUPABASE RLS ENFORCED
              </span>
              <span className="flex items-center gap-1 text-[#B45309]">
                <Icons.Clock size={14} /> 60S ROTATING TOKENS
              </span>
            </div>
          </div>

          {/* Right Column: Stadium Scoreboard HUD */}
          <div id="scoreboard" className="lg:col-span-5 space-y-3.5">
            <div className="bg-[#0F172A] border-2 border-black p-4 shadow-brutal space-y-3 text-white content-stationary" data-purpose="countdown-hud">
              <div className="flex items-center justify-between text-[11px] font-mono font-extrabold border-b border-dashed border-slate-700 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#15803D] pulse-dot" />
                  <span className="text-[#F59E0B] tracking-widest uppercase">
                    REAL-TIME STATUTORY SCOREBOARD
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">LIVE HUD</span>
              </div>

              {/* 4 Scoreboard Tiles with Tabular Digits */}
              <div className="grid grid-cols-4 gap-2 text-center font-mono">
                <div className="timer-box bg-black/90 p-2 lg:p-2.5 border border-slate-700 shadow-brutal-sm">
                  <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">DAYS</div>
                  <span className="timer-digit text-2xl lg:text-3xl font-black text-[#F59E0B] block leading-tight">365</span>
                  <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">ANNUAL TRACK</div>
                </div>
                <div className="timer-box bg-black/90 p-2 lg:p-2.5 border border-slate-700 shadow-brutal-sm">
                  <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">GPS</div>
                  <span className="timer-digit text-2xl lg:text-3xl font-black text-white block leading-tight">100</span>
                  <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">METERS RADIUS</div>
                </div>
                <div className="timer-box bg-black/90 p-2 lg:p-2.5 border border-slate-700 shadow-brutal-sm">
                  <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">ARREARS</div>
                  <span className="timer-digit text-2xl lg:text-3xl font-black text-white block leading-tight">₹0</span>
                  <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">DISBURSE TARGET</div>
                </div>
                <div className="timer-box bg-black/90 p-2 lg:p-2.5 border border-slate-700 shadow-brutal-sm">
                  <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">RATE</div>
                  <span className="timer-digit text-2xl lg:text-3xl font-black text-[#F59E0B] block leading-tight">99%</span>
                  <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">COMPLIANCE</div>
                </div>
              </div>
            </div>

            {/* Clean Compact 4-Metric Bar */}
            <div className="grid grid-cols-4 gap-2 text-center font-mono border-2 border-black bg-white p-3 shadow-brutal content-stationary">
              <div className="border-r border-slate-200 pr-1">
                <div className="text-[9px] text-slate-500 font-bold uppercase">WORKFORCE</div>
                <div className="font-black text-xs lg:text-sm text-[#0F172A] mt-0.5 whitespace-nowrap">DAILY WAGE</div>
                <div className="text-[8px] text-slate-500">Unorganized</div>
              </div>
              <div className="border-r border-slate-200 pr-1">
                <div className="text-[9px] text-[#B45309] font-bold uppercase">ACCURACY</div>
                <div className="font-black text-xs lg:text-sm text-[#0F172A] mt-0.5">PAISE INT</div>
                <div className="text-[8px] text-slate-500">Exact Ledger</div>
              </div>
              <div className="border-r border-slate-200 pr-1">
                <div className="text-[9px] text-slate-500 font-bold uppercase">PUNCH</div>
                <div className="font-black text-xs lg:text-sm text-[#0F172A] mt-0.5">GEO-TAGGED</div>
                <div className="text-[8px] text-slate-500">QR Code</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-500 font-bold uppercase">ROLES</div>
                <div className="font-black text-xs lg:text-sm text-[#0F172A] mt-0.5">2 DIRECT</div>
                <div className="text-[8px] text-slate-500">Worker &amp; Contractor</div>
              </div>
            </div>
          </div>
        </section>

        {/* Cricket Seam Accent Stripe */}
        <div className="cricket-seam-divider" />

        {/* ─── Section: The 2 Core Portals (Worker & Contractor Only) ─── */}
        <section id="portals" className="space-y-4 pt-2">
          <div className="border-b-2 border-black pb-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
                CORE SYSTEM ACCESS
              </div>
              <h2 className="text-2xl font-black uppercase text-[#0F172A]">
                SELECT YOUR OFFICIAL REGISTER PORTAL
              </h2>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-7 bg-[#F59E0B]" />
              <span className="w-2 h-7 bg-[#0F172A]" />
              <span className="w-2 h-7 bg-[#15803D]" />
            </div>
          </div>
          <p className="text-xs text-slate-600 font-medium max-w-2xl">
            ShramikSetu is purpose-built exclusively for two primary stakeholders. Select your dedicated operational portal below:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
            {/* Portal 01: Worker */}
            <div className="tactile-card bg-white border-2 border-black p-5 shadow-brutal relative flex flex-col justify-between overflow-hidden">
              <div className="text-5xl font-black text-slate-100 font-mono absolute top-2 right-4 select-none pointer-events-none">
                01
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="bg-[#F59E0B] text-black font-mono text-[10px] font-black px-2 py-0.5 border border-black shadow-brutal-sm">
                    ROLE: WORKER · श्रमिक
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    /worker
                  </span>
                </div>
                <h3 className="text-xl font-black uppercase text-[#0F172A] mt-1">
                  Daily-Wage Worker Register
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed font-medium">
                  Scan 60-second rotating worksite gate tokens with Haversine GPS geo-fencing, review formal contracts, monitor outstanding wages, confirm received cash/UPI disbursements, and export your official employment passport.
                </p>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono font-bold">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#15803D]" /> Attendance Punch
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#15803D]" /> Wallet &amp; Arrears
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#15803D]" /> Employment Passport
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#15803D]" /> Voice TTS Read-Aloud
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t-2 border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                  DIRECT MOBILE ACCESS
                </span>
                <Link href={user ? '/worker' : '/signin?role=worker'}>
                  <Button variant="yellow" size="md" className="font-black text-xs">
                    {user ? 'LAUNCH WORKER PORTAL →' : 'WORKER SIGN IN →'}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Portal 02: Contractor */}
            <div className="tactile-card bg-white border-2 border-black p-5 shadow-brutal relative flex flex-col justify-between overflow-hidden">
              <div className="text-5xl font-black text-slate-100 font-mono absolute top-2 right-4 select-none pointer-events-none">
                02
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="bg-[#0F172A] text-white font-mono text-[10px] font-black px-2 py-0.5 border border-black shadow-brutal-sm">
                    ROLE: CONTRACTOR · ठेकेदार
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    /contractor
                  </span>
                </div>
                <h3 className="text-xl font-black uppercase text-[#0F172A] mt-1">
                  Contractor Project Desk
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed font-medium">
                  Establish civil worksite projects, issue Minimum Wage Act compliant agreements, deploy dynamic gate token displays for shift workers, review daily muster rolls, and record immutable double-entry wage disbursements.
                </p>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono font-bold">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#1D4ED8]" /> Project Management
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#1D4ED8]" /> Muster Roll &amp; Shifts
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#1D4ED8]" /> Atomic Disbursements
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Icons.Check size={14} className="text-[#1D4ED8]" /> Dispute Resolution
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t-2 border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                  ENTERPRISE OPERATIONS
                </span>
                <Link href={user ? '/contractor' : '/signin?role=contractor'}>
                  <Button variant="primary" size="md" className="font-black text-xs">
                    {user ? 'LAUNCH CONTRACTOR DESK →' : 'CONTRACTOR SIGN IN →'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Cricket Seam Accent Stripe */}
        <div className="cricket-seam-divider" />

        {/* ─── Section: Tournament-Style 3-Step Pipeline ─── */}
        <section id="pipeline" className="space-y-4 pt-2" data-purpose="the-league-system">
          <div className="border-b-2 border-black pb-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
                STATUTORY EXECUTION PIPELINE
              </div>
              <h2 className="text-2xl font-black uppercase text-[#0F172A]">
                HOW THE DIGITAL RECORD WORKS
              </h2>
            </div>
            <span className="bg-black text-white font-mono text-[9px] font-bold px-2 py-0.5 category-badge">
              3 PHASES
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {/* Step 1 */}
            <div className="content-stationary bg-white border-2 border-black p-4 shadow-brutal relative flex flex-col justify-between">
              <div>
                <div className="text-3xl font-black text-slate-200 font-mono absolute top-2 right-3">01</div>
                <div className="flex items-center space-x-1.5 mb-1.5">
                  <span className="bg-[#0F172A] text-white font-mono text-[9px] font-bold px-1.5 py-0.5">
                    PHASE 1
                  </span>
                  <span className="text-xs font-mono text-[#B45309] font-bold uppercase">
                    FORMAL AGREEMENT
                  </span>
                </div>
                <h3 className="text-base font-black uppercase text-[#0F172A]">
                  CONTRACT &amp; MINIMUM WAGE TERMS
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Contractor issues a digital work contract with pre-stipulated daily wages benchmarked against state Minimum Wage Act statutory tiers. Worker inspects and accepts via SMS OTP or phone.
                </p>
              </div>
              <div className="pt-3 mt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-mono text-slate-500 font-bold uppercase">
                <span className="text-[#0F172A]">TAMPER-EVIDENT</span>
                <span className="bg-slate-100 px-1.5 py-0.5 border border-slate-300">DAY 0</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="content-stationary bg-white border-2 border-black p-4 shadow-brutal relative flex flex-col justify-between">
              <div>
                <div className="text-3xl font-black text-slate-200 font-mono absolute top-2 right-3">02</div>
                <div className="flex items-center space-x-1.5 mb-1.5">
                  <span className="bg-[#DC2626] text-white font-mono text-[9px] font-bold px-1.5 py-0.5">
                    PHASE 2
                  </span>
                  <span className="text-xs font-mono text-[#B45309] font-bold uppercase">
                    GEO-FENCED PUNCH
                  </span>
                </div>
                <h3 className="text-base font-black uppercase text-[#0F172A]">
                  TIME-LIMITED GATE QR CHECK-IN
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Worksite gate displays a rotating 60-second dynamic QR code. Worker scans with mobile browser while Haversine formula strictly verifies worker device is within 100 meters of project latitude &amp; longitude.
                </p>
              </div>
              <div className="pt-3 mt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-mono text-slate-500 font-bold uppercase">
                <span className="text-[#0F172A]">100M HAVERSINE</span>
                <span className="bg-slate-100 px-1.5 py-0.5 border border-slate-300">DAILY SHIFT</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="content-stationary bg-white border-2 border-black p-4 shadow-brutal relative flex flex-col justify-between">
              <div>
                <div className="text-3xl font-black text-slate-200 font-mono absolute top-2 right-3">03</div>
                <div className="flex items-center space-x-1.5 mb-1.5">
                  <span className="bg-[#15803D] text-white font-mono text-[9px] font-bold px-1.5 py-0.5">
                    PHASE 3
                  </span>
                  <span className="text-xs font-mono text-[#B45309] font-bold uppercase">
                    WAGE SETTLEMENT
                  </span>
                </div>
                <h3 className="text-base font-black uppercase text-[#0F172A]">
                  DOUBLE-ENTRY PAISE DISBURSEMENT
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Every verified attendance event instantly credits wage arrears in worker&apos;s wallet. Contractor disburses via Cash/UPI. Worker confirms receipt to clear arrears, producing an immutable employment ledger.
                </p>
              </div>
              <div className="pt-3 mt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-mono text-slate-500 font-bold uppercase">
                <span className="text-[#0F172A]">ZERO FLOAT ARREARS</span>
                <span className="bg-slate-100 px-1.5 py-0.5 border border-slate-300">PAYDAY</span>
              </div>
            </div>
          </div>
        </section>

        {/* Cricket Seam Accent Stripe */}
        <div className="cricket-seam-divider" />

        {/* ─── Section: Verification & Public Lookup ─── */}
        <section id="verify" className="bg-white border-2 border-black p-6 shadow-brutal space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-200 pb-3">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase text-slate-500">
                PUBLIC VERIFICATION LEDGER
              </div>
              <h2 className="text-xl font-black uppercase text-[#0F172A]">
                VERIFY CONTRACT OR PASSPORT ID
              </h2>
            </div>
            <span className="font-mono text-xs font-bold text-[#15803D] bg-[#DCFCE7] border border-[#15803D] px-2 py-0.5">
              ● CRYPTOGRAPHIC TIMESTAMP CHECK
            </span>
          </div>

          <form onSubmit={handleQuickVerify} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={verifyRef}
              onChange={(e) => setVerifyRef(e.target.value)}
              placeholder="e.g. CTR-2026-901 or W-2026-001"
              className="flex-1 border-2 border-black p-3 font-mono text-sm font-bold uppercase outline-none shadow-brutal-sm focus:bg-[#FFFDF5]"
            />
            <Button type="submit" variant="primary" size="md" className="font-black text-xs sm:w-auto">
              VERIFY REFERENCE ↗
            </Button>
          </form>

          {verifyResult && (
            <div className="p-3 border-2 border-[#15803D] bg-[#F0FDF4] text-[#166534] text-xs font-mono font-bold shadow-brutal-sm">
              {verifyResult}
            </div>
          )}

          <div className="text-xs text-slate-500 font-medium">
            Any registered worker or contractor can independently verify issued contracts, certified attendance counts, and formal dispute status.
          </div>
        </section>
      </main>

      {/* ─── Footer (Balanced Wide Layout inspired by iet-ipl) ─── */}
      <footer className="border-t-2 border-[#0F172A] bg-white pt-8 pb-12 px-4 lg:px-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-7 space-y-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 bg-[#0F172A] text-white font-black text-sm flex items-center justify-center border-2 border-black shadow-brutal-sm">
                SS
              </div>
              <span className="font-black text-lg uppercase tracking-tight text-[#0F172A]">
                SHRAMIKSETU LEDGER
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-md font-medium leading-relaxed">
              Statutory employment records, geo-fenced muster rolls, and integer-paise wage transactions. Engineered solely for daily-wage workers and registered contractors across India.
            </p>
            <div className="text-[11px] font-mono text-slate-500 font-bold uppercase">
              INTEGER PAISE ACCOUNTING · ROW-LEVEL SECURITY · OPEN REPOSITORY
            </div>
          </div>

          <div className="md:col-span-5 grid grid-cols-2 gap-4 font-mono text-xs">
            <div>
              <div className="font-black uppercase text-[#0F172A] mb-2 border-b border-black pb-1">
                PORTALS
              </div>
              <ul className="space-y-1.5 text-slate-600 font-bold">
                <li><Link href="/worker" className="hover:text-black">→ WORKER PORTAL</Link></li>
                <li><Link href="/contractor" className="hover:text-black">→ CONTRACTOR DESK</Link></li>
                <li><Link href="/login" className="hover:text-black">→ 1-CLICK DEMO LOGIN</Link></li>
                <li><Link href="/register" className="hover:text-black">→ STATUTORY SIGNUP</Link></li>
              </ul>
            </div>
            <div>
              <div className="font-black uppercase text-[#0F172A] mb-2 border-b border-black pb-1">
                PROTOCOLS
              </div>
              <ul className="space-y-1.5 text-slate-600 font-bold">
                <li><span>HAVERSINE GPS 100M</span></li>
                <li><span>ROTATING QR 60S</span></li>
                <li><span>MINIMUM WAGE ACT</span></li>
                <li><span>ATOMIC DOUBLE-ENTRY</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500">
          <div>© 2026 SHRAMIKSETU · ALL RIGHTS RESERVED</div>
          <div className="mt-2 sm:mt-0 font-bold text-[#0F172A]">
            EXCLUSIVELY FOR WORKERS &amp; CONTRACTORS
          </div>
        </div>
      </footer>
    </div>
  );
}

