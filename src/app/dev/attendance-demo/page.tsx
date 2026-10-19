'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';

interface TokenData {
  project: { id: string; name: string };
  worksite: { id: string; name: string };
  qrToken: string;
  shortCode: string;
  expiresAt: string;
  ttlSeconds: number;
}

export default function DevAttendanceDemoPage() {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(300);
  const [copied, setCopied] = useState(false);

  const fetchToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev/attendance-token');
      if (!res.ok) {
        throw new Error('Failed to generate attendance token. Make sure DEMO_MODE=true.');
      }
      const data = await res.json();
      setTokenData(data);

      // Render QR code to data URL
      const dataUrl = await QRCode.toDataURL(data.qrToken, {
        width: 320,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setQrDataUrl(dataUrl);

      const msRemaining = new Date(data.expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(1, Math.floor(msRemaining / 1000)));
    } catch (err: any) {
      setError(err.message || 'Error generating token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      fetchToken();
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchToken();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, fetchToken]);

  const copyOtp = () => {
    if (tokenData?.shortCode) {
      navigator.clipboard.writeText(tokenData.shortCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] p-4 sm:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Banner */}
        <div className="bg-[#FFFBEB] border-2 border-[var(--site-orange)] p-3 text-xs font-bold uppercase tracking-wider text-[var(--site-orange)] flex items-center justify-between">
          <span>🛠️ DEV &amp; DEMO MODE ONLY — ATTENDANCE TEST KIOSK</span>
          <span className="bg-[var(--site-orange)] text-white px-2 py-0.5 text-[10px]">
            DEMO_MODE=true
          </span>
        </div>

        {/* Card */}
        <div className="bg-white border-2 border-[var(--ink)] shadow-[4px_4px_0px_#000] p-6 space-y-6">
          <div className="border-b-2 border-[var(--ink)] pb-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight">
                Supervisor Worksite Kiosk
              </h1>
              <p className="text-xs text-[var(--ink-60)] mt-0.5">
                Scan QR or enter 6-digit OTP from worker phone session
              </p>
            </div>
            <button
              onClick={fetchToken}
              disabled={loading}
              className="px-3 py-1.5 bg-[var(--paper-dark)] border-2 border-[var(--ink)] text-xs font-bold hover:bg-[var(--paper)]"
            >
              {loading ? 'Refreshing...' : 'Rotate Now ↺'}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-[#FEF2F2] border-2 border-[#B91C1C] text-[#991B1B] text-xs font-semibold">
              {error}
            </div>
          )}

          {tokenData && (
            <div className="space-y-6">
              {/* Project & Worksite info */}
              <div className="bg-[var(--paper)] border-2 border-[var(--ink)] p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold text-[var(--ink-60)]">PROJECT:</span>
                  <span className="font-mono font-bold">{tokenData.project?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-[var(--ink-60)]">WORKSITE:</span>
                  <span className="font-mono">{tokenData.worksite?.name}</span>
                </div>
                <div className="flex justify-between text-[11px] text-[var(--site-orange)] font-bold pt-1 border-t border-[var(--ink-10)]">
                  <span>TOKEN EXPIRES IN:</span>
                  <span className="font-mono">{secondsLeft}s (auto-rotates)</span>
                </div>
              </div>

              {/* Method A: QR Code */}
              <div className="text-center space-y-2">
                <div className="text-xs font-black uppercase tracking-wider text-[var(--ink-60)]">
                  Method 1: Project Daily QR Code
                </div>
                <div className="inline-block p-3 bg-white border-2 border-[var(--ink)] shadow-[2px_2px_0px_#000]">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Attendance QR Code"
                      className="w-64 h-64 mx-auto object-contain"
                    />
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center text-xs text-[var(--ink-60)]">
                      Rendering QR...
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[var(--ink-60)]">
                  Point the camera on Worker Attendance tab at this code
                </p>
              </div>

              {/* Method B: 6-Digit OTP */}
              <div className="text-center space-y-2 pt-2 border-t-2 border-dashed border-[var(--ink-20)]">
                <div className="text-xs font-black uppercase tracking-wider text-[var(--ink-60)]">
                  Method 2: 6-Digit Manual OTP
                </div>
                <div className="flex items-center justify-center gap-3">
                  <div className="text-4xl font-mono font-black tracking-[0.3em] bg-[var(--paper)] border-2 border-[var(--ink)] px-6 py-2 shadow-[2px_2px_0px_#000]">
                    {tokenData.shortCode}
                  </div>
                  <button
                    onClick={copyOtp}
                    className="min-h-[48px] px-4 py-2 bg-[var(--site-orange)] text-white text-xs font-bold border-2 border-[var(--ink)] hover:bg-[#e05d00] transition-colors"
                  >
                    {copied ? 'COPIED!' : 'COPY OTP'}
                  </button>
                </div>
                <p className="text-[11px] text-[var(--ink-60)]">
                  Valid for today. Worker can enter this directly if camera is unavailable
                </p>
              </div>

              {/* Quick links for testing */}
              <div className="pt-4 border-t-2 border-[var(--ink)] flex flex-col sm:flex-row gap-3">
                <Link
                  href="/worker/attendance"
                  className="flex-1 text-center py-2.5 bg-[var(--site-orange)] text-white text-xs font-bold uppercase border-2 border-[var(--ink)] hover:bg-[#e05d00]"
                >
                  Go to Worker Attendance →
                </Link>
                <Link
                  href="/worker"
                  className="flex-1 text-center py-2.5 bg-white text-[var(--ink)] text-xs font-bold uppercase border-2 border-[var(--ink)] hover:bg-[var(--paper-dark)]"
                >
                  Worker Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
