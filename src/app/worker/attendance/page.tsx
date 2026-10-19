'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { ReadAloudButton } from '@/components/ui/ReadAloudButton';

interface AttendanceRecord {
  id: string;
  date: string;
  punch_type: string;
  status: string;
  attendance_method?: string;
  created_at: string;
  projects?: { name: string; code?: string };
  worksites?: { name: string };
}

type CameraErrorState = {
  type: 'permission_denied' | 'not_found' | 'insecure_context' | 'generic';
  message: string;
};

function playSuccessBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio context may not be allowed without user interaction
  }
}

export default function WorkerAttendancePage() {
  const { user, locale, t } = useAuth();

  const [mode, setMode] = useState<'scan' | 'manual' | 'result'>('scan');
  const [manualCode, setManualCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    isAlreadyMarked?: boolean;
    status?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<CameraErrorState | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scanSuccessCue, setScanSuccessCue] = useState(false);
  // Today's status & Month history
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [monthHistory, setMonthHistory] = useState<AttendanceRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Scanner ref
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isStoppingRef = useRef<boolean>(false);
  // Fetch Attendance History and Today's Status
  const loadAttendanceHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await api.attendance.list();
      if (res.success && Array.isArray(res.attendanceEvents)) {
        const events = res.attendanceEvents as AttendanceRecord[];
        const todayStr = new Date().toISOString().split('T')[0];
        const todayPunch = events.find((ev) => ev.date === todayStr);
        setTodayRecord(todayPunch || null);

        const sorted = [...events].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setMonthHistory(sorted.slice(0, 31));
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadAttendanceHistory();
  }, [loadAttendanceHistory]);

  // Submit punch (either QR token or 6-digit OTP)
  const submitPunch = useCallback(
    async (opts: { qrToken?: string; manualCode?: string }) => {
      setIsSubmitting(true);
      setErrorMessage(null);
      setResult(null);

      try {
        const res = await api.attendance.mark({
          qrToken: opts.qrToken,
          manualCode: opts.manualCode,
          punchType: 'IN',
        });

        if (res.success) {
          const isAlready = !!res.attendanceEvent?.isAlreadyMarked;
          const msg = isAlready
            ? t.workerPortal.alreadyMarkedNotice
            : t.attendance.punchSuccessDesc;

          setResult({
            success: true,
            message: msg,
            isAlreadyMarked: isAlready,
            status: res.attendanceEvent?.status || 'VERIFIED',
          });
          setMode('result');
          loadAttendanceHistory();
        }
      } catch (err: any) {
        if (err.code === 'OTP_LOCKOUT' || err.code === 'CODE_LOCKOUT') {
          setErrorMessage(t.workerPortal.tooManyOtpAttempts);
        } else if (err.code === 'PREVIOUS_DAY_CODE') {
          setErrorMessage(t.attendance.invalidPreviousDay);
        } else if (err.code === 'FORGED_QR_TOKEN') {
          setErrorMessage(t.attendance.forgedOrTampered);
        } else {
          setErrorMessage(err.message || t.common.error);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [t, loadAttendanceHistory]
  );

  // Stop camera stream cleanly
  const stopScanner = useCallback(async () => {
    isStoppingRef.current = true;
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        // Safe unmount
      }
      html5QrCodeRef.current = null;
    }
    setIsScanningActive(false);
  }, []);

  // Start Live Camera Scanner
  const startScanner = useCallback(async () => {
    setCameraError(null);
    setScanSuccessCue(false);
    isStoppingRef.current = false;

    // Check secure context
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setCameraError({
        type: 'insecure_context',
        message: t.attendance.insecureContext,
      });
      return;
    }

    // Check media devices
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError({
        type: 'insecure_context',
        message: t.attendance.insecureContext,
      });
      return;
    }

    try {
      // Stop existing if any
      await stopScanner();
      isStoppingRef.current = false;

      const elementId = 'live-qr-scanner-viewfinder';
      const scanner = new Html5Qrcode(elementId);
      html5QrCodeRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.0,
      };

      const onScanSuccess = async (decodedText: string) => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;

        // Vibrate and beep
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch {}
        }
        playSuccessBeep();
        setScanSuccessCue(true);

        // Stop camera immediately
        try {
          if (scanner.isScanning) {
            await scanner.stop();
            scanner.clear();
          }
        } catch (e) {
          // Non-blocking
        } finally {
          setIsScanningActive(false);
        }

        // Auto-submit to check-in API
        await submitPunch({ qrToken: decodedText });
      };

      const onScanFailure = () => {
        // Normal scanning frame with no QR code detected - continue
      };

      try {
        // Try rear camera by default
        await scanner.start(
          { facingMode: 'environment' },
          config,
          onScanSuccess,
          onScanFailure
        );
        setIsScanningActive(true);
      } catch (cameraErr: any) {
        const errText = cameraErr?.name || cameraErr?.message || String(cameraErr);
        if (
          errText.includes('NotAllowedError') ||
          errText.includes('PermissionDeniedError') ||
          errText.includes('Permission') ||
          errText.includes('NotAllowed')
        ) {
          setCameraError({
            type: 'permission_denied',
            message: t.attendance.cameraPermissionDenied,
          });
        } else if (
          errText.includes('NotFoundError') ||
          errText.includes('DevicesNotFoundError') ||
          errText.includes('no camera')
        ) {
          setCameraError({
            type: 'not_found',
            message: t.attendance.noCameraFound,
          });
        } else {
          // If environment camera is rejected, try generic video device (front/webcam)
          try {
            await scanner.start(
              { facingMode: 'user' },
              config,
              onScanSuccess,
              onScanFailure
            );
            setIsScanningActive(true);
          } catch (fallbackErr: any) {
            const fallbackText = fallbackErr?.name || fallbackErr?.message || String(fallbackErr);
            if (
              fallbackText.includes('NotAllowedError') ||
              fallbackText.includes('Permission')
            ) {
              setCameraError({
                type: 'permission_denied',
                message: t.attendance.cameraPermissionDenied,
              });
            } else {
              setCameraError({
                type: 'generic',
                message: cameraErr?.message || t.attendance.cameraFallback,
              });
            }
          }
        }
      }
    } catch (err: any) {
      setCameraError({
        type: 'generic',
        message: err?.message || t.attendance.cameraFallback,
      });
    }
  }, [stopScanner, submitPunch, t]);

  useEffect(() => {
    if (mode === 'scan') {
      // Small timeout to allow DOM element to render
      const timer = setTimeout(() => {
        startScanner();
      }, 100);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [mode, startScanner, stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.length !== 6) {
      setErrorMessage(t.attendance.enter6DigitCode);
      return;
    }
    submitPunch({ manualCode });
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Back link */}
      <div>
        <Link
          href="/worker"
          className="min-h-[48px] inline-flex items-center gap-1.5 text-xs font-bold uppercase text-[var(--ink)] hover:underline"
        >
          <Icons.ArrowLeft size={18} />
          <span>{t.common.back}</span>
        </Link>
      </div>

      {/* TODAY'S STATUS CARD */}
      <div className="bg-white border-2 border-[var(--ink)] border-t-8 border-t-[var(--site-orange)] p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink-60)]">
                {t.workerPortal.todayStatus}
              </h2>
              <div className="text-sm font-black text-[var(--ink)]">
                {new Date().toLocaleDateString(
                  locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN',
                  {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }
                )}
              </div>
            </div>
          </div>

          <div>
            {todayRecord ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F0FDF4] border-2 border-[#1E7A4B] text-[#1E7A4B] text-xs font-black uppercase rounded-[2px]">
                <Icons.CheckCircle size={14} />
                <span>{locale === 'hi' ? 'हाजिरी दर्ज' : locale === 'mr' ? 'हजेरी नोंदवली' : 'Marked'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FFFBEB] border-2 border-[var(--site-orange)] text-[var(--site-orange)] text-xs font-black uppercase rounded-[2px]">
                <span>{locale === 'hi' ? 'बाकी है' : locale === 'mr' ? 'प्रलंबित' : 'Pending'}</span>
              </span>
            )}
          </div>
        </div>

        {todayRecord && (
          <div className="mt-3 pt-3 border-t border-[var(--ink-10)] text-xs space-y-1 text-[var(--ink-80)]">
            <div className="flex justify-between">
              <span className="text-[var(--ink-60)]">{t.workerPortal.markedAt}:</span>
              <span className="font-mono font-bold">
                {new Date(todayRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-60)]">{locale === 'hi' ? 'विधि:' : locale === 'mr' ? 'पद्धत:' : 'Method:'}</span>
              <span className="font-semibold">
                {todayRecord.attendance_method === 'otp'
                  ? t.workerPortal.methodOtp
                  : t.workerPortal.methodQr}
              </span>
            </div>
            {todayRecord.projects?.name && (
              <div className="flex justify-between">
                <span className="text-[var(--ink-60)]">{locale === 'hi' ? 'परियोजना:' : locale === 'mr' ? 'प्रकल्प:' : 'Project:'}</span>
                <span className="font-semibold text-right">{todayRecord.projects.name}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ATTENDANCE CHECK-IN CARD */}
      <div className="bg-white border-2 border-[var(--ink)] shadow-sm">
        <div className="p-4 border-b-2 border-[var(--ink)] bg-[var(--paper)] flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold uppercase text-[var(--ink)]">
              {t.attendance.title}
            </h1>
            <p className="text-xs text-[var(--ink-60)] mt-0.5">
              {t.attendance.subtitle}
            </p>
          </div>
          <ReadAloudButton
            text={
              todayRecord
                ? t.attendance.ttsTodayShiftVerified
                : t.attendance.ttsTodayShiftPending
            }
            locale={locale}
            variant="compact"
          />
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            className="m-4 p-3 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold flex items-center gap-2"
          >
            <Icons.AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Mode Tabs (>=48px touch targets) */}
        {mode !== 'result' && (
          <div className="flex border-b-2 border-[var(--ink)]">
            <button
              onClick={() => setMode('scan')}
              className={`flex-1 min-h-[48px] p-3 text-xs sm:text-sm font-bold uppercase text-center border-r border-[var(--ink-10)] flex items-center justify-center gap-2 transition-colors ${
                mode === 'scan'
                  ? 'bg-[var(--site-orange)] text-white shadow-inner'
                  : 'bg-white text-[var(--ink)] hover:bg-[var(--paper-dark)]'
              }`}
            >
              <Icons.Camera size={18} />
              <span>{t.attendance.scanQrTab}</span>
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 min-h-[48px] p-3 text-xs sm:text-sm font-bold uppercase text-center flex items-center justify-center gap-2 transition-colors ${
                mode === 'manual'
                  ? 'bg-[var(--site-orange)] text-white shadow-inner'
                  : 'bg-white text-[var(--ink)] hover:bg-[var(--paper-dark)]'
              }`}
            >
              <Icons.Hash size={18} />
              <span>{t.attendance.enterCodeTab}</span>
            </button>
          </div>
        )}

        {/* Live Camera Scanner Mode */}
        {mode === 'scan' && (
          <div className="p-4 space-y-3">
            {cameraError ? (
              <div className="w-full bg-[var(--paper-dark)] border-2 border-[var(--ink)] p-5 text-center space-y-3 rounded-[2px]">
                <div className="w-12 h-12 rounded-full bg-[#FFFBEB] border-2 border-[var(--site-orange)] flex items-center justify-center text-xl mx-auto">
                  {cameraError.type === 'permission_denied' ? '🔒' : cameraError.type === 'not_found' ? '📷' : '🌐'}
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-[var(--ink)]">
                    {cameraError.type === 'permission_denied'
                      ? (locale === 'hi' ? 'कैमरा अनुमति अस्वीकृत' : locale === 'mr' ? 'कॅमेरा परवानगी नाकारली' : 'Camera Permission Blocked')
                      : cameraError.type === 'not_found'
                      ? (locale === 'hi' ? 'कैमरा नहीं मिला' : locale === 'mr' ? 'कॅमेरा सापडला नाही' : 'No Camera Found')
                      : (locale === 'hi' ? 'सुरक्षित कनेक्शन (HTTPS) आवश्यक' : locale === 'mr' ? 'सुरक्षित कनेक्शन (HTTPS) आवश्यक' : 'Secure HTTPS Required')}
                  </div>
                  <p className="text-[11px] text-[var(--ink-80)] mt-1.5 max-w-xs mx-auto leading-relaxed">
                    {cameraError.message}
                  </p>
                </div>

                <div className="w-full flex flex-col gap-2 pt-2">
                  {cameraError.type === 'permission_denied' && (
                    <button
                      type="button"
                      onClick={() => startScanner()}
                      className="min-h-[48px] w-full px-4 py-2.5 bg-[var(--site-orange)] text-white text-xs font-black uppercase rounded-[2px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-sm"
                    >
                      <Icons.RefreshCw size={16} />
                      <span>{locale === 'hi' ? 'पुनः प्रयास करें' : locale === 'mr' ? 'पुन्हा प्रयत्न करा' : 'Try Again'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className="min-h-[48px] w-full px-4 py-2 bg-white border-2 border-[var(--ink)] text-xs font-bold uppercase hover:bg-[var(--paper)] flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Icons.Hash size={16} />
                    <span>{t.attendance.enterCodeTab}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full aspect-square bg-black border-2 border-[var(--ink)] overflow-hidden rounded-[2px] flex items-center justify-center">
                {/* html5-qrcode target container */}
                <div
                  id="live-qr-scanner-viewfinder"
                  className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
                />

                {/* Framed Viewfinder Overlay */}
                <div
                  className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-colors duration-300 ${
                    scanSuccessCue ? 'bg-green-500/20' : ''
                  }`}
                >
                  <div
                    className={`w-56 h-56 border-2 transition-all duration-300 relative ${
                      scanSuccessCue
                        ? 'border-green-500 scale-105'
                        : 'border-white/50'
                    }`}
                  >
                    <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-[var(--site-orange)]" />
                    <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-[var(--site-orange)]" />
                    <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-[var(--site-orange)]" />
                    <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-[var(--site-orange)]" />
                  </div>
                </div>

                {/* Bottom instructions badge */}
                <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
                  <span className="bg-black/80 text-white text-[11px] font-bold px-3 py-1.5 uppercase rounded-[2px] tracking-wider">
                    {scanSuccessCue ? '✓ QR DETECTED!' : t.attendance.pointAtQr}
                  </span>
                </div>
              </div>
            )}

            {/* Quick switcher to manual fallback */}
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setMode('manual')}
                className="min-h-[44px] text-xs font-bold uppercase underline text-[var(--ink-80)] hover:text-black py-2.5 px-3 inline-flex items-center justify-center"
              >
                {locale === 'hi'
                  ? 'कैमरा नहीं चल रहा? 6-अंकों का कोड दर्ज करें'
                  : locale === 'mr'
                  ? 'कॅमेरा चालत नाही? ६-अंकी कोड टाका'
                  : 'Prefer manual code? Enter 6-digit code instead'}
              </button>
            </div>
          </div>
        )}

        {/* Manual 6-Digit Code Mode */}
        {mode === 'manual' && (
          <div className="p-5 sm:p-6 space-y-4">
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-2 text-center">
                  {t.attendance.enter6DigitCode}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="off"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t.attendance.codePlaceholder}
                  className="w-full min-h-[56px] text-center text-3xl font-mono font-bold tracking-[0.4em] border-2 border-[var(--ink)] p-3 outline-none focus:bg-[#FFFDF5] focus:border-[var(--site-orange)] rounded-[2px]"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                isLoading={isSubmitting}
                disabled={manualCode.length !== 6 || isSubmitting}
                className="min-h-[52px] text-sm"
              >
                {t.attendance.submitPunchBtn}
              </Button>
            </form>

            {/* Explanatory Guide Box */}
            <div className="p-3 bg-[var(--paper-dark)] border border-[var(--ink-20)] text-[11px] text-[var(--ink-80)] space-y-1">
              <div className="font-bold uppercase text-[var(--ink)] flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>{locale === 'hi' ? '6-अंकों का कोड कहाँ से लें?' : locale === 'mr' ? '६-अंकी कोड कुठून घ्यावा?' : 'Where do I get this 6-digit code?'}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--ink-60)]">
                {locale === 'hi'
                  ? 'यह कोड आपके ठेकेदार या सुपरवाइजर की स्क्रीन पर उपलब्ध है। जब वे प्रोजेक्ट पेज पर "GENERATE GATE TOKEN" दबाते हैं, तो स्क्रीन पर 6-अंकों का कोड दिखाई देता है।'
                  : locale === 'mr'
                  ? 'हा कोड तुमच्या कंत्राटदाराच्या किंवा पर्यवेक्षकाच्या स्क्रीनवर उपलब्ध आहे. त्यांनी प्रोजेक्ट पेजवर "GENERATE GATE TOKEN" दाबल्यावर हा ६-अंकी कोड दिसतो.'
                  : 'Ask your site supervisor or contractor. When they open their project dashboard, a large 6-digit attendance code is displayed on their screen.'}
              </p>
            </div>
          </div>
        )}

        {/* Result Mode */}
        {mode === 'result' && result && (
          <div className="p-6 text-center space-y-4">
            <div
              className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
                result.success
                  ? 'bg-[#F0FDF4] border-2 border-[#1E7A4B]'
                  : 'bg-[#FEF2F2] border-2 border-[#B91C1C]'
              }`}
            >
              {result.success ? (
                <Icons.CheckCircle size={40} className="text-[#1E7A4B]" />
              ) : (
                <Icons.AlertCircle size={40} className="text-[#B91C1C]" />
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold uppercase text-[var(--ink)]">
                {result.isAlreadyMarked
                  ? (locale === 'hi' ? 'हाजिरी पहले से दर्ज है' : locale === 'mr' ? 'हजेरी आधीच नोंदवली आहे' : 'Already Marked')
                  : t.attendance.punchSuccessTitle}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--ink-60)] mt-1 max-w-sm mx-auto leading-relaxed">
                {result.message}
              </p>
            </div>

            <div className="flex justify-center">
              <ReadAloudButton
                text={result.message}
                locale={locale}
                variant="primary"
              />
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <Link href="/worker/wallet" className="w-full">
                <Button variant="primary" fullWidth size="lg" className="min-h-[52px] text-sm">
                  <Icons.Clock size={18} className="mr-2" />
                  {t.attendance.viewWalletAfterPunch}
                </Button>
              </Link>

              <button
                onClick={() => {
                  setResult(null);
                  setMode('scan');
                }}
                className="min-h-[48px] w-full py-2.5 bg-white border-2 border-[var(--ink)] text-xs font-bold uppercase hover:bg-[var(--paper-dark)]"
              >
                {locale === 'hi' ? 'वापस हाजिरी स्क्रीन' : locale === 'mr' ? 'परत हजेरी स्क्रीन' : 'Back to Attendance'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MONTH HISTORY / CALENDAR REGISTER */}
      <div className="bg-white border-2 border-[var(--ink)] p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b-2 border-[var(--ink)] pb-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--ink)]">
            {t.workerPortal.monthHistoryTitle}
          </h2>
          <span className="text-xs text-[var(--ink-60)] font-bold">
            {monthHistory.length} {locale === 'hi' ? 'दिन दर्ज' : locale === 'mr' ? 'दिवस नोंदवले' : 'shifts'}
          </span>
        </div>

        {isLoadingHistory ? (
          <div className="p-6 text-center text-xs text-[var(--ink-60)] font-bold">
            {locale === 'hi' ? 'हाजिरी लोड हो रही है...' : locale === 'mr' ? 'हजेरी लोड होत आहे...' : 'Loading register...'}
          </div>
        ) : monthHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--ink-60)]">
            {locale === 'hi' ? 'कोई हालिया हाजिरी दर्ज नहीं है' : locale === 'mr' ? 'कोणतीही अलिकडची हजेरी नोंदवलेली नाही' : 'No recorded attendance yet this month.'}
          </div>
        ) : (
          <div className="divide-y divide-[var(--ink-10)] max-h-60 overflow-y-auto">
            {monthHistory.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-[var(--ink)]">
                    {new Date(item.date).toLocaleDateString(
                      locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN',
                      {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--ink-60)]">
                    {item.projects?.name || 'Site Gate'} · {item.attendance_method === 'otp' ? 'OTP' : 'QR'}
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 text-[11px] font-bold uppercase rounded-[2px] ${
                    item.status === 'VERIFIED'
                      ? 'bg-[#F0FDF4] text-[#1E7A4B] border border-[#1E7A4B]'
                      : 'bg-[#FFFBEB] text-[var(--site-orange)] border border-[var(--site-orange)]'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
