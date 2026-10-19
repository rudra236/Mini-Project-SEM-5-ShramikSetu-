'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { LoadingState } from '@/components/ui/FeedbackStates';
import QRCode from 'qrcode';

const TERMINAL_TIMEOUT_MS = 10000;
const QR_ROTATION_INTERVAL_MS = 30000; // 30 seconds

export default function SupervisorQrKioskPage() {
  const { user, role, isLoading: authLoading } = useAuth();

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedWorksiteId, setSelectedWorksiteId] = useState<string>('');

  // QR state
  const [qrSvg, setQrSvg] = useState<string>('');
  const [shortCode, setShortCode] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [timeLeftSec, setTimeLeftSec] = useState<number>(30);
  const [todayCheckinsCount, setTodayCheckinsCount] = useState<number>(0);
  const [reviewQueueCount, setReviewQueueCount] = useState<number>(0);

  // Review queue modal state
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<{ [id: string]: string }>({});
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isMountedRef = useRef(true);
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  // Generate QR SVG from token string
  const renderQr = useCallback(async (token: string) => {
    try {
      const svg = await QRCode.toString(token, {
        type: 'svg',
        margin: 1,
        color: { dark: '#1A1F2B', light: '#00000000' },
        errorCorrectionLevel: 'M',
      });
      if (isMountedRef.current) setQrSvg(svg);
    } catch {
      // QR generation failure is non-critical
    }
  }, []);

  // Issue a new rotating token
  const generateNewToken = useCallback(async (projId: string, wsId: string) => {
    if (!projId || !wsId) return;

    try {
      setIsGenerating(true);
      setErrorMessage(null);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Token generation timed out after 10s')), TERMINAL_TIMEOUT_MS)
      );

      const tokenPromise = api.attendance.createToken({
        projectId: projId,
        worksiteId: wsId,
        ttlSeconds: 30,
      });

      const res = await Promise.race([tokenPromise, timeoutPromise]);

      if (isMountedRef.current && res.success) {
        setShortCode(res.shortCode);
        setExpiresAt(res.expiresAt);
        setTimeLeftSec(res.ttlSeconds);
        await renderQr(res.token);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Failed to create QR attendance token.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  }, [renderQr]);

  // Start auto-rotation
  const startRotation = useCallback((projId: string, wsId: string) => {
    // Clear any existing rotation timer
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);

    // Generate first token immediately
    generateNewToken(projId, wsId);

    // Rotate every 30 seconds
    rotationTimerRef.current = setInterval(() => {
      if (isMountedRef.current) {
        generateNewToken(projId, wsId);
      }
    }, QR_ROTATION_INTERVAL_MS);
  }, [generateNewToken]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    const updateCountdown = () => {
      const expiry = new Date(expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiry - now) / 1000));
      if (isMountedRef.current) setTimeLeftSec(diff);
    };

    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [expiresAt]);

  // Initialize supervisor data
  const initSupervisorData = useCallback(async () => {
    if (authLoading) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setAuthError(false);

      if (!user) {
        setAuthError(true);
        throw new Error('Authentication required. Missing or invalid supervisor session.');
      }

      if (role !== 'SUPERVISOR' && role !== 'ADMIN') {
        setAuthError(true);
        throw new Error(`Access restricted. Current role (${role}) does not have supervisor gate permissions.`);
      }

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Site gate terminal initialization timed out after 10 seconds. Check network connection.')), TERMINAL_TIMEOUT_MS)
      );

      const fetchPromise = Promise.allSettled([
        api.projects.list(),
        api.attendance.list(),
      ]);

      const [projRes, attRes] = await Promise.race([fetchPromise, timeoutPromise]);

      if (!isMountedRef.current) return;

      let pList: any[] = [];
      if (projRes.status === 'fulfilled' && projRes.value.success) {
        pList = projRes.value.projects || [];
        setProjects(pList);
      } else if (projRes.status === 'rejected') {
        const reason = (projRes.reason as any)?.message || 'Failed to load assigned worksites.';
        if (reason.toLowerCase().includes('auth') || reason.toLowerCase().includes('session')) {
          setAuthError(true);
        }
        throw new Error(reason);
      }

      if (attRes.status === 'fulfilled' && attRes.value.success) {
        const events = attRes.value.attendanceEvents || [];
        const todayStr = new Date().toISOString().split('T')[0];
        const todayCount = events.filter(
          (e: any) => e.attendance_date === todayStr || (e.created_at && e.created_at.startsWith(todayStr))
        ).length;
        setTodayCheckinsCount(todayCount);
      }

      if (pList.length === 0) {
        throw new Error('No active worksites assigned to your supervisor account. Contact your contractor or administrator.');
      }

      const firstProject = pList[0];
      const firstWorksite = firstProject?.worksites?.[0];
      const projId = firstProject.id;
      const wsId = firstWorksite?.id;

      setSelectedProjectId(projId);
      if (wsId) {
        setSelectedWorksiteId(wsId);
        startRotation(projId, wsId);
      } else {
        throw new Error('Project has no worksite with coordinates. The contractor must register site coordinates first.');
      }

      // Load review queue count
      try {
        const reviewRes = await api.attendance.getReviewQueue(projId);
        if (reviewRes.success) {
          setReviewQueueCount(reviewRes.reviewItems?.length || 0);
        }
      } catch {
        // Non-blocking
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Failed to initialize gate terminal.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [authLoading, user, role, startRotation]);

  useEffect(() => {
    initSupervisorData();
  }, [initSupervisorData]);

  const loadReviewQueue = useCallback(async (projId?: string) => {
    const idToUse = projId || selectedProjectId;
    if (!idToUse) return;
    try {
      setIsLoadingReview(true);
      setReviewError(null);
      const res = await api.attendance.getReviewQueue(idToUse);
      if (res.success) {
        setReviewItems(res.reviewItems || []);
        setReviewQueueCount(res.reviewItems?.length || 0);
      }
    } catch (err: any) {
      setReviewError(err.message || 'Failed to load review queue.');
    } finally {
      setIsLoadingReview(false);
    }
  }, [selectedProjectId]);

  const openReviewModal = () => {
    setIsReviewOpen(true);
    loadReviewQueue();
  };

  const handleResolveReview = async (reviewItemId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      setResolvingId(reviewItemId);
      setReviewError(null);
      const note = reviewNotes[reviewItemId] || '';
      const res = await api.attendance.resolveReview({
        reviewItemId,
        decision,
        notes: note.trim() || undefined,
      });

      if (res.success) {
        setReviewSuccessMsg(
          decision === 'APPROVED'
            ? '✓ Punch approved and marked as VERIFIED.'
            : '✕ Punch rejected. Fraud flag confirmed.'
        );
        setReviewItems((prev) => prev.filter((item) => item.id !== reviewItemId));
        setReviewQueueCount((prev) => Math.max(0, prev - 1));
        setTimeout(() => setReviewSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setReviewError(err.message || 'Failed to resolve review item.');
    } finally {
      setResolvingId(null);
    }
  };

  const handleProjectChange = (newId: string) => {
    const proj = projects.find((p) => p.id === newId);
    const ws = proj?.worksites?.[0];
    setSelectedProjectId(newId);
    if (ws?.id) {
      setSelectedWorksiteId(ws.id);
      startRotation(newId, ws.id);
    }
    // Update review count for newly selected project
    api.attendance.getReviewQueue(newId).then((r) => {
      if (r.success) setReviewQueueCount(r.reviewItems?.length || 0);
    }).catch(() => {});
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="w-full">
        <LoadingState message="INITIALIZING SITE GATE TERMINAL (MAX 10S)..." />
        <div className="text-center mt-3 text-[11px] font-mono text-[var(--ink-60)]">
          VERIFYING SUPERVISOR CREDENTIALS & WORKSITE GEOFENCE...
        </div>
      </div>
    );
  }

  // Error state with retry
  if (errorMessage && projects.length === 0) {
    return (
      <div className="w-full bg-white border-2 border-[var(--ink)] p-6 shadow-sm text-center">
        <div className="w-12 h-12 bg-[#FEF2F2] border-2 border-[#B91C1C] rounded-full flex items-center justify-center mx-auto mb-3 text-[#B91C1C]">
          <Icons.AlertTriangle size={24} />
        </div>
        <div className="text-[10px] font-bold font-mono tracking-widest text-[#B91C1C] uppercase mb-1">
          GATE TERMINAL INITIALIZATION FAILED
        </div>
        <h2 className="text-base font-bold uppercase text-[var(--ink)] mb-2">
          Unable to Open Gate Terminal
        </h2>
        <div className="p-3 bg-[#FEF2F2] border border-[#B91C1C] text-[#991B1B] text-xs font-mono mb-4 text-left whitespace-pre-wrap">
          Reason: {errorMessage}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            variant="primary"
            onClick={() => initSupervisorData()}
            size="md"
          >
            <Icons.RefreshCw size={16} className="mr-1.5" />
            RETRY INITIALIZATION
          </Button>

          {authError && (
            <Link href="/login?redirect=/supervisor">
              <Button variant="warning" size="md" fullWidth>
                SIGN IN AS SUPERVISOR
              </Button>
            </Link>
          )}

          <Link href="/">
            <Button variant="ghost" size="md">
              RETURN HOME
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isExpired = timeLeftSec <= 0;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const progressPercent = Math.min(100, Math.max(0, (timeLeftSec / 30) * 100));

  return (
    <div className={`w-full ${isFullscreen ? 'fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-4' : ''}`}>
      {/* Top controls */}
      <div className="flex items-center justify-between mb-3">
        {projects.length > 1 && (
          <select
            value={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="border-2 border-[var(--ink)] p-1.5 text-xs font-bold uppercase bg-white max-w-[200px]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-2">
          {reviewQueueCount > 0 && (
            <button
              onClick={openReviewModal}
              className="flex items-center gap-1 text-[#B91C1C] text-xs font-bold bg-[#FEF2F2] border border-[#B91C1C] px-2 py-1 hover:bg-[#FEE2E2] transition-colors"
              title="Click to review flagged punches"
            >
              <Icons.AlertTriangle size={12} />
              <span>{reviewQueueCount} FLAGGED · REVIEW</span>
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-2 border-2 border-[var(--ink)] bg-white hover:bg-[var(--paper)] text-xs font-bold uppercase"
          >
            {isFullscreen ? '✕ EXIT' : '⛶ FULLSCREEN'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 mb-3 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 font-bold uppercase">
              <Icons.AlertTriangle size={14} />
              <span>GATE WARNING</span>
            </div>
            <button
              onClick={() => startRotation(selectedProjectId, selectedWorksiteId)}
              className="text-[11px] font-mono underline hover:text-black uppercase"
            >
              Retry
            </button>
          </div>
          {errorMessage}
        </div>
      )}

      {/* Full-screen QR display */}
      <div className="w-full max-w-lg mx-auto bg-white border-2 border-[var(--ink)] text-center">
        {/* Header */}
        <div className="border-b-2 border-[var(--ink)] p-4 bg-[var(--paper)]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--ink-60)] mb-0.5">
            SCAN TO MARK ATTENDANCE · हाज़िरी के लिए स्कैन करें
          </div>
          <h2 className="text-lg font-bold uppercase text-[var(--ink)]">
            {selectedProject?.name || 'SITE GATE'}
          </h2>
          <div className="text-[10px] font-mono text-[var(--ink-60)] mt-0.5">
            AUTO-ROTATING EVERY 30 SECONDS
          </div>
        </div>

        {/* QR Code */}
        <div className="p-6">
          <div className={`relative w-72 h-72 mx-auto border-2 border-[var(--ink)] p-4 bg-white flex items-center justify-center ${isGenerating ? 'animate-pulse' : ''}`}>
            {isExpired ? (
              <div className="text-center p-4">
                <Icons.AlertCircle size={48} className="mx-auto text-[#B91C1C] mb-2" />
                <div className="font-bold text-sm text-[#B91C1C] uppercase">TOKEN EXPIRED</div>
                <div className="text-xs text-[var(--ink-60)] mt-1">Next token generating...</div>
              </div>
            ) : qrSvg ? (
              <div
                className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="text-xs text-[var(--ink-60)] animate-pulse">GENERATING QR...</div>
            )}
          </div>
        </div>

        {/* Countdown bar */}
        <div className="mx-6 mb-4 bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
          <div className="flex items-center justify-between text-xs font-bold uppercase mb-1.5">
            <span className="flex items-center gap-1.5 text-[var(--ink)]">
              <Icons.Clock size={14} />
              EXPIRES IN:
            </span>
            <span className={`font-data text-sm font-bold ${isExpired ? 'text-[#B91C1C]' : timeLeftSec < 10 ? 'text-[var(--site-orange)] animate-pulse' : 'text-[#1E7A4B]'}`}>
              {isExpired ? '00:00' : `00:${String(timeLeftSec).padStart(2, '0')}`}
            </span>
          </div>
          <div className="w-full h-2.5 bg-white border border-[var(--ink-20)] overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                isExpired ? 'bg-[#B91C1C]'
                : timeLeftSec < 10 ? 'bg-[var(--site-orange)]'
                : 'bg-[#1E7A4B]'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 6-digit manual code fallback */}
        <div className="mx-6 mb-4 p-3 bg-[#FFFDF5] border-2 border-dashed border-[var(--site-orange)]">
          <div className="text-[10px] uppercase font-bold text-[var(--ink-60)] mb-1">
            MANUAL CODE (IF CAMERA FAILS) · कोड (कैमरा खराब हो तो)
          </div>
          <div className="font-data text-3xl font-bold tracking-[0.3em] text-[var(--ink)] select-all">
            {shortCode || '------'}
          </div>
        </div>

        {/* Manual refresh */}
        <div className="px-6 pb-4">
          <Button
            variant="yellow"
            fullWidth
            size="md"
            onClick={() => generateNewToken(selectedProjectId, selectedWorksiteId)}
            isLoading={isGenerating}
          >
            <Icons.RefreshCw size={16} className="mr-2" />
            FORCE NEW TOKEN
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-4 flex gap-3">
        <div className="flex-1 p-3 bg-white border-2 border-[var(--ink)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1E7A4B] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              CHECKED IN TODAY:
            </span>
          </div>
          <span className="font-data font-bold text-lg text-[#1E7A4B]">
            {todayCheckinsCount}
          </span>
        </div>
        {reviewQueueCount > 0 ? (
          <button
            onClick={openReviewModal}
            className="flex-1 p-3 bg-[#FEF2F2] border-2 border-[#B91C1C] flex items-center justify-between text-left hover:bg-[#FEE2E2] transition-colors"
            title="Open Fraud Review Queue"
          >
            <span className="text-xs font-bold uppercase text-[#B91C1C] flex items-center gap-1.5">
              <Icons.AlertTriangle size={14} />
              FRAUD FLAGS:
            </span>
            <span className="font-data font-bold text-sm text-[#B91C1C] underline">
              {reviewQueueCount} REVIEW →
            </span>
          </button>
        ) : (
          <button
            onClick={openReviewModal}
            className="flex-1 p-3 bg-white border-2 border-[var(--ink-20)] flex items-center justify-between text-left hover:bg-[var(--paper)] transition-colors"
            title="Open Fraud Review Queue"
          >
            <span className="text-xs font-bold uppercase text-[var(--ink-60)] flex items-center gap-1.5">
              <Icons.ShieldCheck size={14} />
              FRAUD QUEUE:
            </span>
            <span className="font-data text-xs text-[var(--ink-60)]">
              0 FLAGS
            </span>
          </button>
        )}
      </div>

      {/* Fraud Review Queue Modal */}
      {isReviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl bg-white border-2 border-[var(--ink)] shadow-2xl max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-[var(--paper)] border-b-2 border-[var(--ink)] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono font-bold tracking-widest text-[#B91C1C] uppercase flex items-center gap-1.5">
                  <Icons.AlertTriangle size={12} />
                  ANTI-FRAUD & GEOFENCE AUDIT
                </div>
                <h3 id="review-modal-title" className="text-base font-bold uppercase text-[var(--ink)]">
                  Gate Review Queue · फर्जीवाड़ा समीक्षा
                </h3>
              </div>
              <button
                onClick={() => setIsReviewOpen(false)}
                className="p-1.5 border border-[var(--ink)] hover:bg-[var(--paper-dark)] text-xs font-bold"
                aria-label="Close review queue"
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Notifications inside modal */}
            {reviewSuccessMsg && (
              <div className="p-3 bg-[#ECFDF5] border-b border-[#059669] text-[#065F46] text-xs font-bold flex items-center gap-2">
                <Icons.CheckCircle size={16} />
                <span>{reviewSuccessMsg}</span>
              </div>
            )}
            {reviewError && (
              <div className="p-3 bg-[#FEF2F2] border-b border-[#DC2626] text-[#991B1B] text-xs font-bold flex items-center gap-2">
                <Icons.AlertCircle size={16} />
                <span>{reviewError}</span>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {isLoadingReview ? (
                <div className="py-8">
                  <LoadingState message="LOADING REVIEW QUEUE..." />
                </div>
              ) : reviewItems.length === 0 ? (
                <div className="text-center py-10 text-[var(--ink-60)]">
                  <Icons.ShieldCheck size={40} className="mx-auto mb-2 text-[#1E7A4B]" />
                  <div className="font-bold uppercase text-xs text-[var(--ink)]">
                    No Flagged Punches Pending Review
                  </div>
                  <div className="text-[11px] font-mono mt-1">
                    All gate punches for this worksite meet geofence, accuracy, and signature requirements.
                  </div>
                </div>
              ) : (
                reviewItems.map((item) => {
                  const flags = parseReasons(item.flag_reasons);
                  const att = item.attendance_events || {};
                  const workerName = item.workers?.full_name || 'Worker';
                  const workerCode = item.workers?.internal_worker_id || item.worker_id;

                  return (
                    <div
                      key={item.id}
                      className="border-2 border-[var(--ink)] p-4 bg-[var(--paper)] text-left space-y-3"
                    >
                      {/* Worker info & time */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-sm text-[var(--ink)]">
                            {workerName}
                          </div>
                          <div className="text-[10px] font-mono text-[var(--ink-60)]">
                            ID: {workerCode} · {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-[#FEF2F2] text-[#B91C1C] border border-[#B91C1C]">
                          {item.severity || 'FLAGGED'}
                        </span>
                      </div>

                      {/* Flags breakdown */}
                      <div className="flex flex-wrap gap-1.5">
                        {flags.map((flag: string, fIdx: number) => (
                          <span
                            key={fIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-[#FEF2F2] text-[#B91C1C] border border-[#B91C1C]"
                          >
                            <Icons.AlertTriangle size={10} />
                            {flag}
                          </span>
                        ))}
                      </div>

                      {/* Geolocation & Telemetry telemetry data */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2.5 border border-[var(--ink-20)]">
                        <div>
                          <span className="text-[var(--ink-60)]">Gate Distance: </span>
                          <span className="font-bold text-[#B91C1C]">
                            {att.calculated_distance_meters != null
                              ? `${att.calculated_distance_meters}m`
                              : 'Unknown'}{' '}
                            (Limit: {att.allowed_radius_meters || 100}m)
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-60)]">GPS Accuracy: </span>
                          <span className="font-bold">
                            {att.gps_accuracy_meters != null
                              ? `±${att.gps_accuracy_meters}m`
                              : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-60)]">Mock Location: </span>
                          <span className={`font-bold ${att.mock_location_flag ? 'text-[#B91C1C]' : 'text-[#1E7A4B]'}`}>
                            {att.mock_location_flag ? 'DETECTED (YES)' : 'NO'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-60)]">Worker Coords: </span>
                          <span className="font-bold">
                            {att.worker_latitude ? `${Number(att.worker_latitude).toFixed(4)}, ${Number(att.worker_longitude).toFixed(4)}` : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Resolution notes & actions */}
                      <div className="space-y-2 pt-1 border-t border-[var(--ink-20)]">
                        <input
                          type="text"
                          value={reviewNotes[item.id] || ''}
                          onChange={(e) =>
                            setReviewNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder="Supervisor note (e.g., Confirmed worker at Gate 2 in person)..."
                          className="w-full border border-[var(--ink)] p-2 text-xs font-mono bg-white"
                        />

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResolveReview(item.id, 'APPROVED')}
                            disabled={resolvingId === item.id}
                            className="flex-1 py-2 bg-[#1E7A4B] text-white text-xs font-bold uppercase hover:bg-[#165B37] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Icons.CheckCircle size={14} />
                            {resolvingId === item.id ? 'PROCESSING...' : 'APPROVE (MARK VERIFIED)'}
                          </button>
                          <button
                            onClick={() => handleResolveReview(item.id, 'REJECTED')}
                            disabled={resolvingId === item.id}
                            className="flex-1 py-2 bg-[#B91C1C] text-white text-xs font-bold uppercase hover:bg-[#991B1B] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Icons.AlertCircle size={14} />
                            {resolvingId === item.id ? 'PROCESSING...' : 'REJECT PUNCH'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-[var(--paper)] border-t-2 border-[var(--ink)] flex justify-between items-center text-[10px] font-mono text-[var(--ink-60)]">
              <span>All approval/rejection decisions are immutable and logged to audit trail.</span>
              <button
                onClick={() => loadReviewQueue()}
                disabled={isLoadingReview}
                className="underline hover:text-[var(--ink)] uppercase font-bold"
              >
                REFRESH QUEUE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseReasons(reasons: any): string[] {
  if (Array.isArray(reasons)) return reasons;
  if (typeof reasons === 'string') {
    try {
      const parsed = JSON.parse(reasons);
      if (Array.isArray(parsed)) return parsed;
      return [reasons];
    } catch {
      return [reasons];
    }
  }
  return [];
}
