'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { IdentityCard } from '@/components/ui/IdentityCard';
import { StripSection } from '@/components/ui/StripSection';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Icons } from '@/components/ui/icons';
import { ReadAloudButton } from '@/components/ui/ReadAloudButton';
import { formatRupees } from '@/lib/money';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';
import { TextToSpeechService } from '@/lib/services/tts-service';
import {
  saveCachedBalance,
  getCachedBalance,
  saveCachedAttendance,
  getCachedAttendance,
  saveCachedContracts,
  getCachedContracts,
} from '@/lib/offline-cache';

export default function WorkerHomePage() {
  const { user, profiles, locale, t, refreshProfile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [activeContract, setActiveContract] = useState<any | null>(() => getCachedContracts()?.data?.activeContract || null);
  const [pendingContract, setPendingContract] = useState<any | null>(() => getCachedContracts()?.data?.pendingContract || null);
  const [earnings, setEarnings] = useState<any | null>(() => getCachedBalance()?.data || null);
  const [todayAttendance, setTodayAttendance] = useState<any | null>(() => getCachedAttendance()?.data?.today || null);

  // Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editSkillCategory, setEditSkillCategory] = useState<'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED'>('SEMI_SKILLED');
  const [editPhone, setEditPhone] = useState('');
  const [editEmergencyContact, setEditEmergencyContact] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  useEffect(() => {
    if (profiles?.worker || user) {
      setEditFullName(profiles?.worker?.full_name || '');
      setEditOccupation(profiles?.worker?.occupation || '');
      setEditSkillCategory(profiles?.worker?.skill_category || 'SEMI_SKILLED');
      setEditPhone(user?.phone || '');
      setEditEmergencyContact(profiles?.worker?.emergency_contact || '');
    }
  }, [profiles?.worker, user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    setIsSavingProfile(true);

    try {
      await api.workers.updateProfile({
        fullName: editFullName.trim() || undefined,
        occupation: editOccupation.trim() || undefined,
        skillCategory: editSkillCategory,
        phone: editPhone.trim() || null,
        emergencyContact: editEmergencyContact.trim() || null,
      });

      await refreshProfile();
      setProfileSaveSuccess(true);
      setTimeout(() => {
        setIsEditModalOpen(false);
        setProfileSaveSuccess(false);
      }, 1000);
    } catch (err: any) {
      setProfileSaveError(err.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    const loadWorkerData = async (showLoading = true) => {
      try {
        if (showLoading) setIsLoading(true);
        const [contractsRes, earningsRes, attendanceRes, countsRes] = await Promise.allSettled([
          api.contracts.list(),
          api.earnings.get({ snapshot: true }),
          api.attendance.list(),
          api.counts.get({ scope: 'worker' }),
        ]);

        if (contractsRes.status === 'fulfilled' && contractsRes.value.success) {
          const contracts = contractsRes.value.contracts || [];
          const todayStr = new Date().toISOString().split('T')[0];
          const pending = contracts.find((c: any) =>
            ['PENDING', 'pending', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(c.status) && !c.end_reason
          );
          const active = contracts.find((c: any) =>
            ['ACCEPTED', 'accepted', 'ACTIVE', 'active'].includes(c.status) &&
            !c.end_reason &&
            (!c.end_date || c.end_date >= todayStr)
          );
          setPendingContract(pending || null);
          setActiveContract(active || null);
          saveCachedContracts({ pendingContract: pending || null, activeContract: active || null });
        }

        if (earningsRes.status === 'fulfilled' && earningsRes.value.success) {
          setEarnings(earningsRes.value);
          saveCachedBalance(earningsRes.value);
        }

        if (attendanceRes.status === 'fulfilled' && attendanceRes.value.success) {
          const events = attendanceRes.value.attendanceEvents || [];
          const todayStr = new Date().toISOString().split('T')[0];
          const today = events.find(
            (e: any) => (e.attendance_date === todayStr || (e.created_at && e.created_at.startsWith(todayStr))) && e.status !== 'REJECTED'
          );
          setTodayAttendance(today || null);
          saveCachedAttendance({ today: today || null, events });
        }
      } catch {
        // Fallback already populated from offline cache
      } finally {
        if (showLoading) setIsLoading(false);
      }
    };

    loadWorkerData(true);
    // Poll every 15 seconds per requirement
    const interval = setInterval(() => loadWorkerData(false), 15000);
    return () => clearInterval(interval);
  }, []);

  const workerProfile = profiles?.worker;

  if (isLoading && !earnings && !activeContract) {
    return <LoadingState message={t.common.loading} skeleton />;
  }

  // Spoken text helpers
  const todayShiftSpoken = TextToSpeechService.buildTodayShiftText({
    marked: Boolean(todayAttendance),
    projectName: todayAttendance?.projects?.name || activeContract?.projects?.name,
    locale,
  });

  const unpaidRupees = Math.round((earnings?.outstandingPaise || 0) / 100);
  const totalEarnedRupees = Math.round((earnings?.totalEarnedPaise || 0) / 100);
  const confirmedPaidRupees = Math.round((earnings?.totalPaidPaise || 0) / 100);
  const shiftsCount = earnings?.verifiedDaysCount || 0;

  const balanceSpoken = TextToSpeechService.buildBalanceText({
    unpaidRupees,
    totalEarnedRupees,
    confirmedPaidRupees,
    shiftsCount,
    locale,
  });

  const contractSpoken = activeContract
    ? TextToSpeechService.buildContractText({
        contractorName: activeContract.contractors?.company_name || 'Contractor',
        projectName: activeContract.projects?.name || 'Project Site',
        dailyWage: Math.round((activeContract.daily_wage || 0) / 100) || 500,
        hours: activeContract.expected_working_hours || 8,
        locale,
      })
    : '';

  return (
    <div className="w-full space-y-4">
      {/* Worker ID Card Strip */}
      <IdentityCard
        fullName={workerProfile?.full_name || '—'}
        internalWorkerId={workerProfile?.internal_worker_id || user?.login_id || 'Pending'}
        occupation={workerProfile?.occupation || '—'}
        skillCategory={workerProfile?.skill_category || '—'}
        phone={user?.phone || '—'}
        emergencyContact={workerProfile?.emergency_contact}
        isVerified={Boolean(workerProfile?.is_verified ?? true)}
        onEditProfile={() => setIsEditModalOpen(true)}
      />

      {/* ─── Edit Profile Modal ─── */}
      {isEditModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="bg-white border-2 border-black max-w-lg w-full p-6 shadow-brutal-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
              <div>
                <div className="text-[10px] font-mono font-black text-[#B45309] uppercase tracking-widest">
                  STATUTORY REGISTRY · आधिकारिक विवरण
                </div>
                <h2 className="text-xl font-black uppercase text-[#0F172A] tracking-tight">
                  Edit Worker Profile
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center border-2 border-black bg-white hover:bg-slate-100 font-mono font-bold text-sm shadow-brutal-sm"
              >
                ✕
              </button>
            </div>

            {profileSaveError && (
              <div className="p-3 mb-4 border-2 border-[#DC2626] bg-[#FEF2F2] text-[#991B1B] text-xs font-mono font-bold shadow-brutal-sm">
                ⚠️ {profileSaveError}
              </div>
            )}

            {profileSaveSuccess && (
              <div className="p-3 mb-4 border-2 border-[#15803D] bg-[#DCFCE7] text-[#15803D] text-xs font-mono font-bold shadow-brutal-sm">
                ✓ Profile updated successfully! Syncing live record...
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4 font-mono">
              <div>
                <label className="block text-[11px] font-black uppercase text-[#0F172A] mb-1">
                  FULL LEGAL NAME *
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Enter full legal name"
                  className="w-full min-h-[44px] border-2 border-black p-2.5 text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black uppercase text-[#0F172A] mb-1">
                    TRADE / OCCUPATION
                  </label>
                  <input
                    type="text"
                    value={editOccupation}
                    onChange={(e) => setEditOccupation(e.target.value)}
                    placeholder="e.g. Mason, Carpenter, Welder"
                    className="w-full min-h-[44px] border-2 border-black p-2.5 text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-[#0F172A] mb-1">
                    SKILL TIER
                  </label>
                  <select
                    value={editSkillCategory}
                    onChange={(e) => setEditSkillCategory(e.target.value as any)}
                    className="w-full min-h-[44px] border-2 border-black p-2.5 text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm bg-white"
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
                  <label className="block text-[11px] font-black uppercase text-[#0F172A] mb-1">
                    PHONE NUMBER
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. 98200 33001"
                    className="w-full min-h-[44px] border-2 border-black p-2.5 text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-[#0F172A] mb-1">
                    EMERGENCY CONTACT
                  </label>
                  <input
                    type="text"
                    value={editEmergencyContact}
                    onChange={(e) => setEditEmergencyContact(e.target.value)}
                    placeholder="e.g. 98200 99999"
                    className="w-full min-h-[44px] border-2 border-black p-2.5 text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t-2 border-slate-200 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setIsEditModalOpen(false)}
                  className="min-h-[44px]"
                >
                  CANCEL
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  shimmer
                  isLoading={isSavingProfile}
                  className="min-h-[44px] font-black uppercase"
                >
                  {isSavingProfile ? 'SAVING...' : 'SAVE PROFILE ↗'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Scoreboard HUD for Worker (iet-ipl Inspiration) ─── */}
      <div className="bg-[#0F172A] border-2 border-black p-4 shadow-brutal space-y-3 text-white content-stationary">
        <div className="flex items-center justify-between text-[11px] font-mono font-extrabold border-b border-dashed border-slate-700 pb-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#15803D] pulse-dot" />
            <span className="text-[#F59E0B] tracking-widest uppercase">
              WORKER STATUTORY SCOREBOARD
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">LIVE SYNC</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center font-mono">
          <div className="bg-black/90 p-1.5 sm:p-2.5 border border-slate-700 shadow-brutal-sm overflow-hidden">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold truncate">UNPAID</div>
            <span className="timer-digit text-xs xs:text-sm sm:text-xl font-black text-[#F59E0B] block leading-tight truncate px-0.5">
              {formatRupees(earnings?.outstandingPaise || 0, true)}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1 truncate">ARREARS</div>
          </div>
          <div className="bg-black/90 p-1.5 sm:p-2.5 border border-slate-700 shadow-brutal-sm overflow-hidden">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold truncate">SHIFTS</div>
            <span className="timer-digit text-xs xs:text-sm sm:text-xl font-black text-white block leading-tight truncate px-0.5">
              {earnings?.verifiedDaysCount || 0}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1 truncate">VERIFIED</div>
          </div>
          <div className="bg-black/90 p-1.5 sm:p-2.5 border border-slate-700 shadow-brutal-sm overflow-hidden">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold truncate">EARNED</div>
            <span className="timer-digit text-xs xs:text-sm sm:text-xl font-black text-white block leading-tight truncate px-0.5">
              {formatRupees(earnings?.totalEarnedPaise || 0, true)}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1 truncate">LIFETIME</div>
          </div>
          <div className="bg-black/90 p-1.5 sm:p-2.5 border border-slate-700 shadow-brutal-sm overflow-hidden">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold truncate">STATUS</div>
            <span className="timer-digit text-xs xs:text-sm sm:text-xl font-black text-[#15803D] block leading-tight truncate px-0.5">
              {todayAttendance ? 'PUNCHED' : 'READY'}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1 truncate">GEO-TAGGED</div>
          </div>
        </div>
      </div>

      {/* Pending Contract Alert Strip */}
      {pendingContract && (
        <StripSection
          title={t.workerHome.contractAlertTitle}
          variant="warning"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-mono font-bold text-sm text-[#0F172A] uppercase">
                {pendingContract.projects?.name || 'Site Project'}
              </div>
              <div className="text-xs text-slate-600 mt-0.5 font-medium">
                {t.roles.CONTRACTOR}: {pendingContract.contractors?.company_name || 'Builder'} · {formatRupees(pendingContract.daily_wage)}{t.common.perDay}
              </div>
              <div className="text-[11px] text-[#EA580C] font-mono font-bold mt-1">
                {t.workerHome.contractAlertDesc}
              </div>
            </div>
            <Link href={`/worker/contracts/${pendingContract.id}`}>
              <Button variant="warning" size="md">
                {t.workerHome.reviewTermsBtn}
              </Button>
            </Link>
          </div>
        </StripSection>
      )}

      {/* TODAY'S SHIFT ATTENDANCE STRIP WITH TTS ("READ ALOUD") */}
      <StripSection
        title={t.workerHome.todayShiftTitle}
        variant={todayAttendance ? 'verified' : 'highlight'}
        action={
          <div className="flex items-center gap-2">
            <ReadAloudButton
              text={todayShiftSpoken}
              locale={locale}
              variant="compact"
            />
            {todayAttendance ? (
              <StatusPill status="VERIFIED" label={t.workerHome.todayShiftVerified} />
            ) : (
              <StatusPill status="PENDING" label={t.workerHome.todayShiftPending} />
            )}
          </div>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-base font-bold uppercase text-[var(--ink)]">
              {todayAttendance
                ? todayAttendance.projects?.name || t.workerHome.todayShiftVerified
                : activeContract?.projects?.name || t.workerHome.todayShiftPending}
            </div>
            <div className="text-xs text-[var(--ink-60)]">
              {todayAttendance ? (
                <span className="text-[#155A36] font-semibold flex items-center gap-1">
                  <Icons.CheckCircle size={14} />
                  {t.workerHome.shiftPunchedAt} {new Date(todayAttendance.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.workerHome.gpsVerified}
                </span>
              ) : (
                t.workerHome.gateTokenDesc
              )}
            </div>
          </div>

          <div>
            {todayAttendance ? (
              <Link href="/worker/attendance">
                <Button variant="verified" size="md" className="min-h-[48px] w-full sm:w-auto">
                  <Icons.Check size={18} className="mr-1.5" />
                  {t.workerHome.viewPunchBtn}
                </Button>
              </Link>
            ) : (
              <Link href="/worker/attendance">
                <Button variant="primary" size="md" className="min-h-[48px] w-full sm:w-auto text-sm">
                  <Icons.QrCode size={20} className="mr-2" />
                  {t.workerHome.markAttendanceBtn}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </StripSection>

      {/* WAGES & WALLET SUMMARY STRIP WITH TTS ("READ ALOUD") */}
      <StripSection
        title={t.workerHome.wageLedgerTitle}
        action={
          <div className="flex items-center gap-2">
            <ReadAloudButton
              text={balanceSpoken}
              locale={locale}
              variant="compact"
            />
            <Link
              href="/worker/wallet"
              className="min-h-[38px] px-2 flex items-center text-xs font-mono font-bold text-[var(--register-blue)] hover:underline uppercase shrink-0"
            >
              {t.workerHome.viewWalletBtn} →
            </Link>
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 border-2 border-[var(--site-orange)] bg-[#FFF9F5] col-span-2 sm:col-span-1 rounded-[2px]">
            <div className="text-[10px] uppercase font-bold text-[var(--site-orange)]">
              {t.workerHome.unpaidWages}
            </div>
            <div className="font-data text-2xl font-extrabold text-[var(--site-orange)] mt-1">
              {formatRupees(earnings?.outstandingPaise || 0, true)}
            </div>
          </div>

          <div className="p-3 border border-[var(--ink-20)] bg-white rounded-[2px]">
            <div className="text-[10px] uppercase font-bold text-[var(--ink-60)]">
              {t.workerHome.verifiedShifts}
            </div>
            <div className="font-data text-xl font-bold text-[var(--ink)] mt-1">
              {earnings?.verifiedDaysCount || 0}
              <span className="text-xs font-normal text-[var(--ink-60)]"> {t.common.days}</span>
            </div>
          </div>

          <div className="p-3 border border-[var(--ink-20)] bg-white rounded-[2px]">
            <div className="text-[10px] uppercase font-bold text-[var(--ink-60)]">
              {t.workerHome.totalEarned}
            </div>
            <div className="font-data text-xl font-bold text-[#1E7A4B] mt-1">
              {formatRupees(earnings?.totalEarnedPaise || 0, true)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
          <Link href="/worker/wallet" className="flex-1">
            <Button variant="primary" size="md" fullWidth className="min-h-[48px]">
              {t.workerHome.confirmPaymentsBtn}
            </Button>
          </Link>
          <Link href="/worker/passport" className="flex-1">
            <Button variant="secondary" size="md" fullWidth className="min-h-[48px]">
              {t.workerHome.viewPassportBtn}
            </Button>
          </Link>
        </div>
      </StripSection>

      {/* ACTIVE WORK CONTRACT STRIP WITH TTS */}
      <StripSection
        title={t.workerHome.activeContractTitle}
        action={
          activeContract && (
            <div className="flex items-center gap-2">
              <ReadAloudButton
                text={contractSpoken}
                locale={locale}
                variant="compact"
              />
              <StatusPill status={activeContract.status || 'ACTIVE'} />
            </div>
          )
        }
      >
        {activeContract ? (
          <div>
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h4 className="text-base font-bold uppercase text-[var(--ink)]">
                  {activeContract.projects?.name || 'Project Work'}
                </h4>
                <div className="text-xs text-[var(--ink-60)]">
                  {t.roles.CONTRACTOR}: {activeContract.contractors?.company_name || 'Direct Contractor'} · {activeContract.work_type || 'Labour'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-[var(--ink-60)]">
                  {t.workerHome.stipulatedRate}
                </div>
                <div className="font-data font-bold text-base text-[var(--register-blue)]">
                  {formatRupees(activeContract.daily_wage)}
                  <span className="text-xs font-normal text-[var(--ink-60)]">{t.common.perDay}</span>
                </div>
              </div>
            </div>

            <div className="bg-[var(--paper-dark)] p-3 border border-[var(--ink-10)] grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mt-3 rounded-[2px]">
              <div>
                <span className="text-[10px] uppercase text-[var(--ink-60)] block">
                  {t.workerHome.expectedHours}
                </span>
                <span className="font-data font-bold">
                  {activeContract.expected_working_hours || 8.0} {t.common.hours}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-[var(--ink-60)] block">
                  {t.workerHome.payFrequency}
                </span>
                <span className="font-bold uppercase">
                  {activeContract.payment_frequency || 'DAILY'}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase text-[var(--ink-60)] block">
                  {t.workerHome.startDate}
                </span>
                <span className="font-data font-semibold">
                  {activeContract.start_date || 'Active'}
                </span>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <Link href={`/worker/contracts/${activeContract.id}`}>
                <Button variant="secondary" size="md" className="min-h-[48px]">
                  {t.workerHome.viewContractBtn}
                  <Icons.ArrowRight size={16} className="ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState
            title={t.workerHome.noContractTitle}
            message={t.workerHome.noContractDesc}
            actionText={t.workerHome.viewContractsBtn}
            onAction={() => {
              window.location.href = '/worker/contracts';
            }}
            icon="briefcase"
          />
        )}
      </StripSection>
    </div>
  );
}
