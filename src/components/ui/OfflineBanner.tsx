'use client';

import React, { useState, useEffect } from 'react';
import { Locale } from '@/locales';
import { Icons } from './icons';

interface OfflineBannerProps {
  locale: Locale;
  cachedAt?: string;
}

export function OfflineBanner({ locale, cachedAt }: OfflineBannerProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const timer = setTimeout(() => setJustReconnected(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !justReconnected) {
    return null;
  }

  if (justReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full bg-[#1E7A4B] text-white px-4 py-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-b-2 border-[#14532D] shadow-sm animate-fadeIn"
      >
        <Icons.CheckCircle size={18} />
        <span>
          {locale === 'hi'
            ? 'इंटरनेट जुड़ गया! डेटा सिंक हो रहा है...'
            : locale === 'mr'
            ? 'इंटरनेट सुरू झाले! डेटा सिंक होत आहे...'
            : 'Back online! Syncing latest data...'}
        </span>
      </div>
    );
  }

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="w-full bg-[#FFFBEB] text-[#92400E] border-b-2 border-[#F59E0B] px-4 py-2.5 shadow-sm"
    >
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="p-1 bg-[#F59E0B] text-[#1A1F2B] rounded-[2px] flex items-center justify-center">
            <Icons.AlertCircle size={18} />
          </span>
          <div>
            <div className="text-xs sm:text-sm font-bold uppercase tracking-wide">
              {locale === 'hi'
                ? 'ऑफ़लाइन मोड सक्रिय'
                : locale === 'mr'
                ? 'ऑफलाइन मोड सक्रिय'
                : 'Offline Mode Active'}
            </div>
            <div className="text-[11px] sm:text-xs text-[#78350F] font-medium">
              {locale === 'hi'
                ? 'इंटरनेट बंद है। पिछला सहेजा गया डेटा दिखाया जा रहा है।'
                : locale === 'mr'
                ? 'इंटरनेट बंद आहे. शेवटचा जतन केलेला डेटा दाखवत आहोत.'
                : 'No internet connection. Displaying cached records.'}
              {cachedAt && (
                <span className="ml-1 font-mono font-bold">
                  ({locale === 'hi' ? 'सहेजा समय:' : locale === 'mr' ? 'वेळ:' : 'Cached:'} {cachedAt})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="hidden sm:block">
          <span className="text-[10px] font-bold font-mono px-2 py-1 bg-[#FEF3C7] border border-[#F59E0B] rounded-[2px] uppercase">
            PWA OFFLINE SHELL
          </span>
        </div>
      </div>
    </aside>
  );
}
