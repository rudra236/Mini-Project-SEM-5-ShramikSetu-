'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { StatusPill } from '@/components/ui/StatusPill';
import { TokenDisplay } from '@/components/ui/TokenDisplay';
import { formatRupees } from '@/lib/money';
import { useAuth } from '@/lib/auth-context';
import { LoadingState, EmptyState } from '@/components/ui/FeedbackStates';

export default function ContractorProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { t } = useAuth();
  const [project, setProject] = useState<any | null>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [counts, setCounts] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Quick token generation state
  const [activeToken, setActiveToken] = useState<{ token: string; shortCode?: string; expiresAt: string } | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

  // Tab selection: 'muster' vs 'attendance'
  const [activeTab, setActiveTab] = useState<'muster' | 'attendance'>('muster');

  // Attendance manual review / correction modal state
  const [attendanceToReview, setAttendanceToReview] = useState<any | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // End Assignment / Removal Modal State
  const [contractToTerminate, setContractToTerminate] = useState<any | null>(null);
  const [terminateReason, setTerminateReason] = useState('');
  const [confirmDues, setConfirmDues] = useState(false);
  const [calculatedDuesPaise, setCalculatedDuesPaise] = useState(0);
  const [isTerminating, setIsTerminating] = useState(false);
  const [terminateError, setTerminateError] = useState<string | null>(null);

  const fetchProjectData = async () => {
    try {
      setIsLoading(true);
      const [projRes, contRes, attRes, countsRes] = await Promise.allSettled([
        api.projects.list(projectId),
        api.contracts.list(),
        api.attendance.list(),
        api.counts.get({ scope: 'project', projectId }),
      ]);

      if (projRes.status === 'fulfilled' && projRes.value.success) {
        setProject(projRes.value.project);
        if (projRes.value.counts) {
          setCounts(projRes.value.counts);
        }
      }
      if (countsRes.status === 'fulfilled' && countsRes.value.success && countsRes.value.counts) {
        setCounts(countsRes.value.counts);
      }
      if (contRes.status === 'fulfilled' && contRes.value.success) {
        const filtered = (contRes.value.contracts || []).filter((c: any) => c.project_id === projectId);
        setContracts(filtered);
      }
      if (attRes.status === 'fulfilled' && attRes.value.success) {
        const filtered = (attRes.value.attendanceEvents || []).filter((e: any) => e.project_id === projectId);
        setAttendance(filtered);
      }

      // Fetch active gate token for this project
      try {
        const tokenRes = await fetch(`/api/attendance/token/active?projectId=${projectId}`).then((r) => r.json());
        if (tokenRes.success && tokenRes.activeToken?.token) {
          setActiveToken({
            token: tokenRes.activeToken.token,
            shortCode: tokenRes.activeToken.shortCode,
            expiresAt: tokenRes.activeToken.expiresAt,
          });
        }
      } catch {
        // Non-blocking
      }
    } catch {
      // Handled
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel invite state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchProjectData();
      // Poll every 15 seconds per requirement
      const interval = setInterval(fetchProjectData, 15000);
      return () => clearInterval(interval);
    }
  }, [projectId]);

  const handleCancelInvite = async (contractId: string) => {
    try {
      setCancellingId(contractId);
      setTokenNotice(null);
      const res = await api.contracts.cancel(contractId);
      if (res.success) {
        setTokenNotice('Assignment invitation cancelled.');
        await fetchProjectData();
      }
    } catch (err: any) {
      setTokenNotice(`Error cancelling invitation: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  const handleIssueGateToken = async () => {
    try {
      setIsGeneratingToken(true);
      setTokenNotice(null);
      const worksiteId = project?.worksites?.[0]?.id;

      const res = await api.attendance.createToken({
        projectId,
        worksiteId: worksiteId || undefined,
        ttlSeconds: 15 * 60,
      });

      if (res.success) {
        setActiveToken({ token: res.token, shortCode: res.shortCode, expiresAt: res.expiresAt });
        setTokenNotice(`Active shift token generated: 6-Digit Code is ${res.shortCode || 'READY'}`);
      }
    } catch (err: any) {
      const isRawError = !err.message || err.message.includes('syntax') || err.message.includes('uuid') || err.message.includes('database');
      const safeMsg = isRawError ? 'Failed to generate gate token. Please retry.' : err.message;
      setTokenNotice(`Token generation error: ${safeMsg}`);
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const openTerminateModal = (c: any) => {
    setContractToTerminate(c);
    setTerminateReason('');
    setConfirmDues(false);
    setTerminateError(null);

    // Calculate unresolved dues based on logged shifts
    const workerAtt = attendance.filter(
      (a) =>
        (a.worker_id === c.worker_id || a.worker_id === c.worker_user_id) &&
        a.project_id === projectId &&
        a.status !== 'REJECTED'
    );
    const wage = c.daily_wage || 60638;
    const estDues = workerAtt.length * wage;
    setCalculatedDuesPaise(estDues);
  };

  const handleConfirmTerminate = async () => {
    if (!contractToTerminate) return;
    if (!terminateReason.trim()) {
      setTerminateError('Please specify the reason for ending this assignment.');
      return;
    }
    if (calculatedDuesPaise > 0 && !confirmDues) {
      setTerminateError(`You must confirm the outstanding wage dues of ${formatRupees(calculatedDuesPaise)} to proceed.`);
      return;
    }

    try {
      setIsTerminating(true);
      setTerminateError(null);
      const res = await api.contracts.terminate(contractToTerminate.id, {
        reason: terminateReason.trim(),
        confirmOutstandingDues: confirmDues,
      });

      if (res.success) {
        setContractToTerminate(null);
        setTokenNotice(`Worker assignment soft-ended. Moved to Completed roster.`);
        await fetchProjectData();
      }
    } catch (err: any) {
      setTerminateError(err.message || 'Failed to end assignment.');
    } finally {
      setIsTerminating(false);
    }
  };

  const handleResolveAttendance = async () => {
    if (!attendanceToReview) return;
    try {
      setIsSubmittingReview(true);
      setReviewError(null);
      await api.attendance.resolveReview({
        attendanceEventId: attendanceToReview.id,
        decision: reviewDecision,
        notes: reviewNotes.trim() || undefined,
      });
      setTokenNotice(`Attendance punch ${reviewDecision === 'APPROVED' ? 'approved & verified' : 'marked as rejected'}.`);
      setAttendanceToReview(null);
      setReviewNotes('');
      await fetchProjectData();
    } catch (err: any) {
      setReviewError(err.message || 'Failed to submit attendance review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="ACCESSING PROJECT MUSTER REGISTER..." />;
  }

  const activeContracts = contracts.filter((c) =>
    ['ACTIVE', 'ACCEPTED', 'accepted'].includes(c.status)
  );
  const completedContracts = contracts.filter((c) =>
    ['COMPLETED', 'TERMINATED', 'REJECTED', 'CANCELLED', 'ENDED', 'completed', 'terminated', 'rejected', 'cancelled', 'ended'].includes(c.status)
  );

  return (
    <div className="w-full p-4 sm:p-6">
      {/* Back button & top bar */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <Link
          href="/contractor"
          className="min-h-[44px] text-xs font-bold uppercase text-[var(--ink)] hover:underline inline-flex items-center gap-1"
        >
          <Icons.ArrowLeft size={16} />
          ALL PROJECTS
        </Link>
        <span className="font-mono text-xs text-[var(--ink-60)]">
          PROJECT ID: #{projectId.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {tokenNotice && (
        <div
          className={`p-3.5 mb-4 border-2 font-mono text-xs font-bold flex items-center justify-between break-words [overflow-wrap:anywhere] ${
            tokenNotice.includes('error') || tokenNotice.includes('Failed')
              ? 'border-red-600 bg-red-50 text-red-700'
              : 'border-emerald-600 bg-emerald-50 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2 break-words [overflow-wrap:anywhere] min-w-0 pr-2">
            <span className="shrink-0">{tokenNotice.includes('error') || tokenNotice.includes('Failed') ? '⚠️' : '✓'}</span>
            <span className="break-words [overflow-wrap:anywhere]">{tokenNotice}</span>
          </div>
          <button
            onClick={() => setTokenNotice(null)}
            className="text-xs underline hover:opacity-75 uppercase shrink-0"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Project Overview Card */}
      <div className="bg-white border-2 border-[var(--ink)] p-5 sm:p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b-2 border-[var(--ink)] pb-4 mb-4">
          <div>
            <div className="text-[10px] font-bold font-mono tracking-widest uppercase text-[var(--register-blue)]">
              WORKSITE REGISTER · कार्यस्थल परियोजना
            </div>
            <h1 className="text-xl sm:text-2xl font-bold uppercase text-[var(--ink)] mt-0.5">
              {project?.name || 'Site Project'}
            </h1>
            {project?.worksites?.[0] && (
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-[var(--register-blue)] border border-blue-200 text-xs font-semibold">
                  <Icons.MapPin size={12} />
                  {project.worksites[0].name}
                </span>
                {project.worksites[0].radius_meters && (
                  <span className="text-[11px] font-mono text-[var(--ink-60)]">
                    (Geofence: {project.worksites[0].radius_meters}m)
                  </span>
                )}
              </div>
            )}
            <p className="text-xs text-[var(--ink-60)] mt-1 max-w-xl">
              {project?.description || 'Active infrastructure and civil construction site.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full lg:w-auto shrink-0">
            <Button
              variant="yellow"
              size="md"
              onClick={handleIssueGateToken}
              isLoading={isGeneratingToken}
              className="w-full sm:w-auto"
            >
              <Icons.QrCode size={16} className="mr-1.5" />
              GENERATE GATE TOKEN
            </Button>
            <Link href={`/contractor/projects/${projectId}/contracts/new`} className="w-full sm:w-auto">
              <Button variant="primary" size="md" className="w-full sm:w-auto">
                <Icons.Plus size={16} className="mr-1.5" />
                ADD WORKER / CONTRACT
              </Button>
            </Link>
            <Link href={`/contractor/projects/${projectId}/payments`} className="w-full sm:w-auto">
              <Button variant="verified" size="md" className="w-full sm:w-auto">
                RECORD PAYMENT
              </Button>
            </Link>
          </div>
        </div>

        {/* Project Meta Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-10)]">
            <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
              {t.counts?.activeWorkforce || 'ACTIVE WORKFORCE'}
            </span>
            <span className="font-data text-lg font-bold text-[var(--ink)]">
              {counts ? counts.activeWorkforce : activeContracts.length} {t.counts?.workers || 'workers'}
            </span>
          </div>
          <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-10)]">
            <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
              {t.counts?.pendingInvites || 'PENDING INVITES'}
            </span>
            <span className="font-data text-lg font-bold text-[#EA580C]">
              {counts ? counts.pendingInvites : contracts.filter((c) => ['PENDING', 'pending', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(c.status)).length} {t.counts?.pending || 'pending'}
            </span>
          </div>
          <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-10)]">
            <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
              {t.counts?.todaysShifts || "TODAY'S SHIFTS"}
            </span>
            <span className="font-data text-lg font-bold text-[#1E7A4B]">
              {counts?.formattedPunched ?? `${attendance.length} / ${counts ? counts.activeWorkforce : activeContracts.length} ${t.counts?.punched || 'punched'}`}
            </span>
          </div>
          <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-10)]">
            <span className="text-[10px] uppercase font-bold text-[var(--ink-60)] block">
              {t.counts?.completedPast || 'COMPLETED / PAST'}
            </span>
            <span className="font-data text-lg font-bold text-slate-600">
              {counts ? counts.completedPast : completedContracts.length} {t.counts?.records || 'records'}
            </span>
          </div>
        </div>
      </div>

      {/* Live Generated Token Screen */}
      {activeToken && (
        <div className="mb-6 p-4 bg-[var(--paper-dark)] border-2 border-[var(--ink)]">
          <div className="flex justify-between items-center mb-3">
            <div className="text-xs font-bold uppercase text-[var(--site-orange)] flex items-center gap-1.5">
              <Icons.QrCode size={16} />
              <span>LIVE SITE GATE TOKEN (DISPLAY TO ARRIVING WORKERS)</span>
            </div>
            <button
              onClick={() => setActiveToken(null)}
              className="text-xs font-bold text-[var(--ink-60)] hover:text-[var(--ink)] uppercase"
            >
              CLOSE TOKEN
            </button>
          </div>
          <TokenDisplay
            token={activeToken.token}
            shortCode={activeToken.shortCode}
            expiresAt={activeToken.expiresAt}
            projectName={project?.name}
            onRefresh={handleIssueGateToken}
            isRefreshing={isGeneratingToken}
          />
        </div>
      )}

      {/* Tabs Bar: Muster Roll vs Live Attendance */}
      <div className="bg-white border-2 border-[var(--ink)]">
        <div className="flex border-b-2 border-[var(--ink)] bg-slate-100 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('muster')}
            className={`min-h-[44px] px-4 sm:px-5 py-2.5 text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 border-r border-[var(--ink-20)] shrink-0 ${
              activeTab === 'muster'
                ? 'bg-white text-[var(--ink)] border-b-2 border-b-transparent -mb-[2px] shadow-sm font-black'
                : 'text-[var(--ink-60)] hover:bg-slate-200'
            }`}
          >
            <Icons.User size={16} />
            <span>CONTRACTED MUSTER ROLL ({activeContracts.length} ACTIVE)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`min-h-[44px] px-4 sm:px-5 py-2.5 text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'attendance'
                ? 'bg-white text-[var(--ink)] border-b-2 border-b-transparent -mb-[2px] shadow-sm font-black'
                : 'text-[var(--ink-60)] hover:bg-slate-200'
            }`}
          >
            <Icons.Clock size={16} />
            <span>LIVE ATTENDANCE &amp; HISTORY ({attendance.length} PUNCHES)</span>
          </button>
        </div>

        {activeTab === 'muster' && (
          <div>
            <div className="p-3 bg-[var(--ink-5)] border-b border-[var(--ink-20)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                {t.counts?.contractedWorkforceMuster || 'CONTRACTED WORKFORCE MUSTER'} · श्रमिक सूची ({counts ? counts.activeWorkforce : activeContracts.length} {t.counts?.active || 'active'} · {counts ? counts.pendingInvites : contracts.filter((c) => ['PENDING', 'pending', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(c.status)).length} {t.counts?.pending || 'pending'})
              </span>
              <Link
                href={`/contractor/projects/${projectId}/contracts/new`}
                className="min-h-[44px] text-xs font-bold text-[var(--register-blue)] hover:underline uppercase flex items-center gap-1 shrink-0"
              >
                <Icons.Plus size={14} />
                ADD WORKER TO SITE
              </Link>
            </div>

            {contracts.length === 0 ? (
              <EmptyState
                title="NO WORKERS CONTRACTED"
                message="There are no active contracts for this project. Issue employment contracts to register daily-wage workers to this site."
                actionText="ISSUE FIRST CONTRACT"
                onAction={() => (window.location.href = `/contractor/projects/${projectId}/contracts/new`)}
              />
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-[var(--paper-dark)] border-b border-[var(--ink-20)] text-[10px] font-bold uppercase tracking-wider text-[var(--ink-60)]">
                    <tr>
                      <th className="p-3">WORKER NAME</th>
                      <th className="p-3">SKILL / OCCUPATION</th>
                      <th className="p-3">DAILY WAGE</th>
                      <th className="p-3">FREQUENCY</th>
                      <th className="p-3">STATUS</th>
                      <th className="p-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ink-10)]">
                    {contracts.map((c) => {
                      const isPending = ['PENDING', 'pending', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(c.status);
                      const isAccepted = ['ACCEPTED', 'accepted', 'ACTIVE', 'active'].includes(c.status);
                      const isRejected = ['REJECTED', 'rejected'].includes(c.status);
                      const isCancelled = ['CANCELLED', 'cancelled'].includes(c.status);

                      return (
                        <tr key={c.id} className="hover:bg-[var(--paper)] transition-none">
                          <td className="p-3">
                            <div className="font-bold uppercase text-[var(--ink)]">
                              {c.workers?.full_name || 'Worker'}
                            </div>
                            <div className="font-mono text-[10px] text-[var(--ink-60)]">
                              ID: {c.workers?.internal_worker_id || c.worker_id?.slice(0, 8)}
                            </div>
                            {isRejected && c.rejection_reason && (
                              <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-sm font-semibold mt-1">
                                Reason: {c.rejection_reason}
                              </div>
                            )}
                            {c.end_date && !isAccepted && !isPending && (
                              <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                Ended: {c.end_date} {c.end_reason ? `(${c.end_reason})` : ''}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold uppercase">{c.work_type}</div>
                            <div className="text-[10px] text-[var(--ink-60)]">{c.workers?.skill_category || 'SKILLED'}</div>
                          </td>
                          <td className="p-3 font-data font-bold text-sm text-[var(--register-blue)]">
                            {formatRupees(c.daily_wage)}/day
                          </td>
                          <td className="p-3 uppercase font-semibold">
                            {c.payment_frequency || 'DAILY'}
                          </td>
                          <td className="p-3">
                            <StatusPill status={c.status} />
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1.5 items-center">
                              {isPending && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleCancelInvite(c.id)}
                                  isLoading={cancellingId === c.id}
                                >
                                  CANCEL INVITE
                                </Button>
                              )}
                              {isAccepted && (
                                <>
                                  <Link href={`/contractor/projects/${projectId}/payments?contractId=${c.id}`}>
                                    <Button variant="secondary" size="sm">
                                      DISBURSE
                                    </Button>
                                  </Link>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => openTerminateModal(c)}
                                  >
                                    REMOVE
                                  </Button>
                                </>
                              )}
                              {(isRejected || isCancelled) && (
                                <Link href={`/contractor/projects/${projectId}/contracts/new?workerLoginId=${c.workers?.internal_worker_id || ''}`}>
                                  <Button variant="yellow" size="sm">
                                    RE-INVITE
                                  </Button>
                                </Link>
                              )}
                              {!isPending && !isAccepted && !isRejected && !isCancelled && (
                                <span className="text-[11px] font-mono text-slate-500 uppercase px-2 py-1 bg-slate-100 border border-slate-200">
                                  COMPLETED
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'attendance' && (
          <div>
            <div className="p-3 bg-[var(--ink-5)] border-b border-[var(--ink-20)] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                LIVE SITE ATTENDANCE REGISTER · उपस्थिति सूची ({attendance.length} TOTAL PUNCHES)
              </span>
              <div className="text-[11px] font-mono text-[var(--ink-60)]">
                Geofence Radius: {project?.worksites?.[0]?.radius_meters || 100}m
              </div>
            </div>

            {attendance.length === 0 ? (
              <EmptyState
                title="NO ATTENDANCE PUNCHES RECORDED"
                message="No worker attendance events have been logged at this worksite yet. Generate a Gate Token to allow arriving workers to verify and punch in."
                actionText="GENERATE GATE TOKEN"
                onAction={handleIssueGateToken}
              />
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-[var(--paper-dark)] border-b border-[var(--ink-20)] text-[10px] font-bold uppercase tracking-wider text-[var(--ink-60)]">
                    <tr>
                      <th className="p-3">WORKER NAME</th>
                      <th className="p-3">TIMESTAMP (IST)</th>
                      <th className="p-3">PUNCH</th>
                      <th className="p-3">METHOD</th>
                      <th className="p-3">LOCATION / GEOFENCE</th>
                      <th className="p-3">STATUS</th>
                      <th className="p-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ink-10)]">
                    {attendance.map((att) => {
                      const punchDate = att.created_at
                        ? new Date(att.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                        : att.date;
                      const isFlaggedOrPending =
                        att.status === 'FLAGGED' || att.status === 'PENDING_REVIEW' || att.review_status === 'PENDING';

                      return (
                        <tr key={att.id} className="hover:bg-[var(--paper)] transition-none">
                          <td className="p-3">
                            <div className="font-bold uppercase text-[var(--ink)]">
                              {att.workers?.full_name || 'Worker'}
                            </div>
                            <div className="font-mono text-[10px] text-[var(--ink-60)]">
                              ID: {att.workers?.internal_worker_id || att.worker_id?.slice(0, 8)}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-[11px]">
                            {punchDate}
                          </td>
                          <td className="p-3 font-mono font-bold">
                            <span
                              className={`px-2 py-0.5 text-[10px] uppercase border ${
                                att.punch_type === 'OUT'
                                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                                  : 'bg-blue-50 text-blue-700 border-blue-300'
                              }`}
                            >
                              {att.punch_type || 'IN'}
                            </span>
                          </td>
                          <td className="p-3 uppercase text-[11px] font-mono">
                            {att.verification_method || (att.manual_code_hash ? 'MANUAL CODE' : 'QR TOKEN')}
                          </td>
                          <td className="p-3 font-mono text-[11px]">
                            {att.distance_meters !== null && att.distance_meters !== undefined
                              ? `${att.distance_meters}m from site`
                              : 'GPS Verified'}
                          </td>
                          <td className="p-3">
                            <StatusPill status={att.status || 'VERIFIED'} />
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              variant={isFlaggedOrPending ? 'warning' : 'secondary'}
                              size="sm"
                              onClick={() => {
                                setAttendanceToReview(att);
                                setReviewDecision('APPROVED');
                                setReviewNotes('');
                                setReviewError(null);
                              }}
                            >
                              {isFlaggedOrPending ? 'REVIEW PUNCH' : 'MANUAL CORRECTION'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* End Assignment / Remove Modal */}
      {contractToTerminate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white border-2 border-[var(--ink)] max-w-lg w-full p-6 text-[var(--ink)] shadow-2xl">
            <div className="border-b border-[var(--ink-20)] pb-3 mb-4">
              <div className="text-xs font-bold uppercase text-[#B91C1C]">END WORKER ASSIGNMENT · कार्यमुक्ती</div>
              <h3 className="text-lg font-bold uppercase mt-0.5">
                Remove {contractToTerminate.workers?.full_name || 'Worker'}
              </h3>
              <p className="text-xs text-[var(--ink-60)]">
                ID: {contractToTerminate.workers?.internal_worker_id || contractToTerminate.worker_id} · Trade: {contractToTerminate.work_type}
              </p>
            </div>

            {terminateError && (
              <div className="p-3 mb-4 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold">
                ⚠️ {terminateError}
              </div>
            )}

            {calculatedDuesPaise > 0 && (
              <div className="p-3.5 mb-4 border-2 border-amber-600 bg-amber-50 text-amber-900 text-xs">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span>⚠️</span>
                  <span>UNRESOLVED WAGE DUES DETECTED</span>
                </div>
                <p className="mb-2">
                  This worker has logged shifts on this project with estimated pending wage dues of{' '}
                  <strong className="text-sm font-data">{formatRupees(calculatedDuesPaise)}</strong>.
                </p>
                <label className="flex items-start gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmDues}
                    onChange={(e) => setConfirmDues(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I acknowledge and confirm ending this assignment with {formatRupees(calculatedDuesPaise)} in unresolved dues.
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">
                  REASON FOR ENDING ASSIGNMENT *
                </label>
                <textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder="e.g. Work package completed, worker released, mutual agreement..."
                  rows={3}
                  className="w-full border-2 border-[var(--ink)] p-2.5 text-xs outline-none focus:bg-[#FFFDF5]"
                  required
                />
              </div>
              <p className="text-[11px] text-[var(--ink-60)]">
                ℹ️ History will be preserved. This assignment will be marked as Completed and remain visible on both contractor muster roll and the worker&apos;s digital passport.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setContractToTerminate(null)}
                disabled={isTerminating}
              >
                CANCEL
              </Button>
              <Button
                variant="danger"
                size="md"
                fullWidth
                isLoading={isTerminating}
                onClick={handleConfirmTerminate}
              >
                CONFIRM & END ASSIGNMENT
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Review / Manual Correction Modal */}
      {attendanceToReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white border-2 border-[var(--ink)] max-w-lg w-full p-6 text-[var(--ink)] shadow-2xl">
            <div className="border-b border-[var(--ink-20)] pb-3 mb-4">
              <div className="text-xs font-bold uppercase text-[var(--register-blue)]">
                ATTENDANCE SHIFT AUDIT &amp; CORRECTION · उपस्थिति सत्यापन
              </div>
              <h3 className="text-lg font-bold uppercase mt-0.5">
                {attendanceToReview.workers?.full_name || 'Worker'} &mdash; Shift Punch
              </h3>
              <p className="text-xs text-[var(--ink-60)]">
                Worker ID: {attendanceToReview.workers?.internal_worker_id || attendanceToReview.worker_id?.slice(0, 8)} · Punch: {attendanceToReview.punch_type || 'IN'} · Date: {attendanceToReview.created_at ? new Date(attendanceToReview.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : attendanceToReview.date}
              </p>
            </div>

            {reviewError && (
              <div className="p-3 mb-4 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold">
                ⚠️ {reviewError}
              </div>
            )}

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">
                  REVIEW DECISION · सत्यापन निर्णय *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewDecision('APPROVED')}
                    className={`p-2.5 text-xs font-bold border-2 text-center transition-all ${
                      reviewDecision === 'APPROVED'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    ✓ APPROVE / VERIFY SHIFT
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewDecision('REJECTED')}
                    className={`p-2.5 text-xs font-bold border-2 text-center transition-all ${
                      reviewDecision === 'REJECTED'
                        ? 'border-red-600 bg-red-50 text-red-800'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    ✕ REJECT SHIFT
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1">
                  CORRECTION / AUDIT NOTES (OPTIONAL)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Verified on-site presence with supervisor, biometric mismatch resolved..."
                  rows={3}
                  className="w-full border-2 border-[var(--ink)] p-2.5 text-xs outline-none focus:bg-[#FFFDF5]"
                />
              </div>

              <p className="text-[11px] text-[var(--ink-60)]">
                ℹ️ Approving an attendance punch confirms wage entitlement in the double-entry statutory ledger for the worker.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setAttendanceToReview(null)}
                disabled={isSubmittingReview}
              >
                CANCEL
              </Button>
              <Button
                variant={reviewDecision === 'APPROVED' ? 'verified' : 'danger'}
                size="md"
                fullWidth
                isLoading={isSubmittingReview}
                onClick={handleResolveAttendance}
              >
                SUBMIT CORRECTION
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
