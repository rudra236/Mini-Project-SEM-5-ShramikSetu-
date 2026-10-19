'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icons } from './icons';
import { Button } from './Button';

export interface TokenDisplayProps {
  token: string;
  shortCode?: string;
  expiresAt: string;
  projectName?: string;
  worksiteName?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const TokenDisplay: React.FC<TokenDisplayProps> = ({
  token,
  shortCode,
  expiresAt,
  projectName = 'SITE ATTENDANCE',
  worksiteName,
  onRefresh,
  isRefreshing = false,
}) => {
  const [qrSvg, setQrSvg] = useState<string>('');
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [totalTtlSec, setTotalTtlSec] = useState<number>(900); // default 15 min
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;

    QRCode.toString(
      token,
      {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#1A1F2B',
          light: '#00000000', // transparent background
        },
        errorCorrectionLevel: 'M',
      },
      (err, svg) => {
        if (!err && svg) {
          setQrSvg(svg);
        }
      }
    );
  }, [token]);

  useEffect(() => {
    if (!expiresAt) return;

    const expiry = new Date(expiresAt).getTime();
    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiry - now) / 1000));
      setTimeLeftSec(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(timeLeftSec / 60);
  const seconds = timeLeftSec % 60;
  const isExpired = timeLeftSec <= 0;
  const progressPercent = Math.min(100, Math.max(0, (timeLeftSec / totalTtlSec) * 100));

  return (
    <div className="w-full max-w-md mx-auto bg-white border-2 border-[var(--ink)] p-6 text-center">
      <div className="border-b-2 border-[var(--ink)] pb-3 mb-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--ink-60)]">
          DAILY GATE TOKEN · दैनिक उपस्थिति टोकन
        </div>
        <h2 className="text-xl font-bold uppercase text-[var(--ink)] mt-0.5">
          {projectName}
        </h2>
        {worksiteName && (
          <div className="text-xs text-[var(--ink-60)] font-semibold mt-0.5">
            {worksiteName}
          </div>
        )}
      </div>

      {/* QR Code Container */}
      <div className="relative w-[min(260px,75vw)] h-[min(260px,75vw)] max-w-full aspect-square mx-auto my-2 border-2 border-[var(--ink)] p-3 bg-white flex items-center justify-center">
        {isExpired ? (
          <div className="text-center p-4">
            <Icons.AlertCircle size={48} className="mx-auto text-[#B91C1C] mb-2" />
            <div className="font-bold text-sm text-[#B91C1C] uppercase">TOKEN EXPIRED</div>
            <div className="text-xs text-[var(--ink-60)] mt-1">Generate a new token for workers</div>
          </div>
        ) : qrSvg ? (
          <div
            className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : (
          <div className="text-xs text-[var(--ink-60)] animate-pulse">GENERATING TOKEN QR...</div>
        )}
      </div>

      {/* Countdown strip */}
      <div className="my-4 bg-[var(--paper-dark)] p-3 border border-[var(--ink-20)]">
        <div className="flex items-center justify-between text-xs font-bold uppercase mb-1.5">
          <span className="flex items-center gap-1.5 text-[var(--ink)]">
            <Icons.Clock size={14} />
            EXPIRES IN:
          </span>
          <span className="font-data text-sm font-bold text-[var(--site-orange)]">
            {isExpired ? (
              '00:00 (EXPIRED)'
            ) : (
              `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            )}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-white border border-[var(--ink-20)] overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              isExpired
                ? 'bg-[#B91C1C]'
                : timeLeftSec < 120
                ? 'bg-[var(--site-orange)]'
                : 'bg-[var(--site-yellow)]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 6-Digit Alphanumeric Code for Workers */}
      <div className="mb-4 p-3 sm:p-4 bg-[#FFFDF5] border-2 border-[var(--site-orange)] text-center rounded-[2px]">
        <span className="text-[11px] uppercase font-black text-[var(--site-orange)] tracking-wider block mb-1">
          6-DIGIT GATE ATTENDANCE CODE · हाजिरी कोड
        </span>
        <div className="font-data text-3xl sm:text-5xl font-black tracking-[0.15em] sm:tracking-[0.25em] text-[var(--ink)] select-all py-2 break-all">
          {shortCode || '------'}
        </div>
        <div className="flex items-center justify-center gap-2 mt-1">
          {shortCode && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(shortCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase underline text-[var(--ink-80)] hover:text-black flex items-center justify-center"
            >
              {copied ? '✓ COPIED TO CLIPBOARD' : '📋 COPY 6-DIGIT CODE'}
            </button>
          )}
        </div>
        <p className="text-[10px] text-[var(--ink-60)] mt-2 font-medium">
          Workers entering attendance on mobile can scan the QR code above or type this 6-digit code
        </p>
      </div>

      {onRefresh && (
        <Button
          variant="yellow"
          fullWidth
          size="md"
          onClick={onRefresh}
          isLoading={isRefreshing}
          className="min-h-[48px] font-black uppercase text-xs"
        >
          <Icons.RefreshCw size={16} className="mr-2" />
          REGENERATE GATE TOKEN
        </Button>
      )}
    </div>
  );
};
