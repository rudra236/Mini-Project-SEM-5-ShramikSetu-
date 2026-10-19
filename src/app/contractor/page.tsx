'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';

export default function ContractorDashboardPage() {
  const { user, profiles, refreshProfile } = useAuth();
  const contractorProfile = profiles?.contractor;

  const [projects, setProjects] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [counts, setCounts] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Contractor Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editLicenseNumber, setEditLicenseNumber] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  useEffect(() => {
    if (contractorProfile || user) {
      setEditCompanyName(contractorProfile?.company_name || '');
      setEditFullName(contractorProfile?.full_name || '');
      setEditLicenseNumber(contractorProfile?.license_number || '');
      setEditPhone(user?.phone || '');
    }
  }, [contractorProfile, user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    setIsSavingProfile(true);

    try {
      await api.contractors.updateProfile({
        companyName: editCompanyName.trim(),
        fullName: editFullName.trim() || undefined,
        licenseNumber: editLicenseNumber.trim() || null,
        phone: editPhone.trim() || null,
      });

      await refreshProfile();
      setProfileSaveSuccess(true);
      setTimeout(() => {
        setIsEditModalOpen(false);
        setProfileSaveSuccess(false);
      }, 1000);
    } catch (err: any) {
      setProfileSaveError(err.message || 'Failed to update contractor profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    const fetchData = async (showLoading = true) => {
      try {
        if (showLoading) setIsLoading(true);
        const [projRes, contRes, attRes, countsRes] = await Promise.allSettled([
          api.projects.list(),
          api.contracts.list(),
          api.attendance.list(),
          api.counts.get({ scope: 'contractor' }),
        ]);

        if (projRes.status === 'fulfilled' && projRes.value.success) {
          setProjects(projRes.value.projects || []);
        }
        if (contRes.status === 'fulfilled' && contRes.value.success) {
          setContracts(contRes.value.contracts || []);
        }
        if (attRes.status === 'fulfilled' && attRes.value.success) {
          setAttendance(attRes.value.attendanceEvents || []);
        }
        if (countsRes.status === 'fulfilled' && countsRes.value.success && countsRes.value.counts) {
          setCounts(countsRes.value.counts);
        }
      } catch {
        // Non-critical
      } finally {
        if (showLoading) setIsLoading(false);
      }
    };

    fetchData(true);
    // Poll every 15 seconds
    const interval = setInterval(() => fetchData(false), 15000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return <LoadingState message="COMPILING PROJECT MUSTER ROLL..." skeleton />;
  }

  const activeContractsCount = contracts.filter((c) => c.status === 'ACTIVE').length;
  const pendingContractsCount = contracts.filter((c) => c.status === 'PENDING_ACCEPTANCE').length;

  return (
    <div className="w-full p-4 sm:p-6 space-y-5">
      {/* Title bar */}
      <div className="border-2 border-black bg-white p-5 sm:p-6 shadow-brutal flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#15803D] pulse-dot" />
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-[#B45309]">
              CONTRACTOR OPERATIONAL DESK · ठेकेदार
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase text-[#0F172A] tracking-tight">
            Projects &amp; Workforce Muster
          </h1>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Active civil sites, worker muster rolls, and statutory double-entry disbursements.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsEditModalOpen(true)}
          >
            ✏ EDIT PROFILE
          </Button>
          <Link href="/contractor/projects/new">
            <Button variant="primary" size="md" shimmer>
              <Icons.Plus size={16} className="mr-1.5" />
              CREATE PROJECT ↗
            </Button>
          </Link>
          {projects.length > 0 && (
            <Link href={`/contractor/projects/${projects[0].id}`}>
              <Button variant="yellow" size="md">
                <Icons.QrCode size={16} className="mr-1.5" />
                GATE TOKEN DISPENSER
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ─── Edit Contractor Profile Modal ─── */}
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
                  STATUTORY REGISTRY · ठेकेदार विवरण
                </div>
                <h2 className="text-xl font-black uppercase text-[#0F172A] tracking-tight">
                  Edit Contractor Profile
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
                  COMPANY / FIRM NAME *
                </label>
                <input
                  type="text"
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  placeholder="Registered company or firm name"
                  className="w-full min-h-[44px] border-2 border-black p-2.5 text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-[#0F172A] mb-1">
                  CONTACT PERSON NAME
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Full name of principal contractor"
                  className="w-full min-h-[44px] border-2 border-black p-2.5 text-sm outline-none focus:bg-[#FFFDF5] shadow-brutal-sm"
                />
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
                    LICENSE NO. (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    value={editLicenseNumber}
                    onChange={(e) => setEditLicenseNumber(e.target.value)}
                    placeholder="Contractor license number"
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

      {/* ─── Stadium Scoreboard HUD (iet-ipl Inspiration) ─── */}
      <div className="bg-[#0F172A] border-2 border-black p-4 shadow-brutal space-y-3 text-white content-stationary">
        <div className="flex items-center justify-between text-[11px] font-mono font-extrabold border-b border-dashed border-slate-700 pb-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] pulse-dot" />
            <span className="text-[#F59E0B] tracking-widest uppercase">
              OPERATIONAL SCOREBOARD HUD
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">REAL-TIME MUSTER</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
          <div className="bg-black/90 p-2.5 border border-slate-700 shadow-brutal-sm">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">PROJECTS</div>
            <span className="timer-digit text-2xl lg:text-3xl font-black text-[#F59E0B] block leading-tight">
              {projects.length}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">ACTIVE SITES</div>
          </div>
          <div className="bg-black/90 p-2.5 border border-slate-700 shadow-brutal-sm">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">WORKERS</div>
            <span className="timer-digit text-2xl lg:text-3xl font-black text-white block leading-tight">
              {counts ? counts.activeWorkforce : activeContractsCount}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">ACTIVE WORKFORCE</div>
          </div>
          <div className="bg-black/90 p-2.5 border border-slate-700 shadow-brutal-sm">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">PENDING</div>
            <span className="timer-digit text-2xl lg:text-3xl font-black text-[#EA580C] block leading-tight">
              {counts ? counts.pendingInvites : pendingContractsCount}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">PENDING INVITES</div>
          </div>
          <div className="bg-black/90 p-2.5 border border-slate-700 shadow-brutal-sm">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">SHIFTS</div>
            <span className="timer-digit text-2xl lg:text-3xl font-black text-[#15803D] block leading-tight">
              {counts ? counts.punchedToday : attendance.length}
            </span>
            <div className="text-[8px] text-slate-500 border-t border-slate-800 mt-1">
              {counts ? counts.formattedPunched : 'VERIFIED TODAY'}
            </div>
          </div>
        </div>
      </div>

      {/* Project Table / Cards */}
      <div className="bg-white border-2 border-black shadow-brutal">
        <div className="p-3.5 bg-slate-100 border-b-2 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-mono">
          <span className="text-xs font-black uppercase tracking-wider text-[#0F172A]">
            SITE PROJECTS REGISTER · परियोजना अभिलेख ({projects.length})
          </span>
          <span className="text-[10px] text-slate-500 font-bold">
            CLICK TO ACCESS MUSTER ROLLS, ROTATING TOKENS &amp; PAYMENTS
          </span>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            title="NO PROJECTS REGISTERED"
            message="You have not created any worksite projects yet. Create your first project to issue employment contracts and attendance tokens."
            actionText="CREATE FIRST PROJECT"
            onAction={() => { window.location.href = '/contractor/projects/new'; }}
          />
        ) : (
          <div className="divide-y-2 divide-slate-100">
            {projects.map((p, idx) => {
              const projectContracts = contracts.filter((c) => c.project_id === p.id);
              const pCounts = counts?.projectCounts?.[p.id];
              const activeCount = pCounts ? pCounts.activeWorkforce : projectContracts.filter((c) => ['ACCEPTED', 'accepted', 'ACTIVE', 'active'].includes(c.status) && !c.end_reason).length;
              const pendingCount = pCounts ? pCounts.pendingInvites : projectContracts.filter((c) => ['PENDING', 'pending', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(c.status)).length;
              return (
                <div
                  key={p.id}
                  className="tactile-card p-4 hover:bg-slate-50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#1D4ED8]"
                >
                  <div>
                    <div className="flex items-center space-x-2 font-mono text-[10px] text-slate-500 font-bold">
                      <span className="bg-slate-200 text-black px-1.5 py-0.5 border border-slate-300">
                        SITE {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span>REF #{p.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <h3 className="text-lg font-black uppercase text-[#0F172A] mt-1">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 font-medium">
                      {p.description || 'Civil Works & Construction Infrastructure'}
                    </p>
                    <div className="text-[11px] font-mono text-slate-600 font-bold mt-1.5 flex flex-wrap items-center gap-3">
                      <span>SCHEDULE: {p.start_date} {p.end_date ? `to ${p.end_date}` : '(Ongoing)'}</span>
                      <span className="text-[#15803D]">● {activeCount} ACTIVE WORKERS {pendingCount > 0 ? `· ${pendingCount} PENDING` : ''}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link href={`/contractor/projects/${p.id}`}>
                      <Button variant="secondary" size="sm">
                        VIEW ROSTER &amp; MUSTER →
                      </Button>
                    </Link>
                    <Link href={`/contractor/projects/${p.id}/payments`}>
                      <Button variant="verified" size="sm">
                        DISBURSE WAGES ₹
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

