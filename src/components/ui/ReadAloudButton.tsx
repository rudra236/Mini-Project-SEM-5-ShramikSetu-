'use client';

import React, { useState, useEffect } from 'react';
import { Locale } from '@/locales';
import { TextToSpeechService } from '@/lib/services/tts-service';
import { Icons } from './icons';

interface ReadAloudButtonProps {
  text: string;
  locale: Locale;
  label?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'compact';
}

export function ReadAloudButton({
  text,
  locale,
  label,
  className = '',
  variant = 'primary',
}: ReadAloudButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showFallbackModal, setShowFallbackModal] = useState(false);

  useEffect(() => {
    return () => {
      TextToSpeechService.stop();
    };
  }, []);

  const handleToggleSpeak = () => {
    if (isSpeaking) {
      TextToSpeechService.stop();
      setIsSpeaking(false);
      return;
    }

    if (!TextToSpeechService.isSupported()) {
      setShowFallbackModal(true);
      return;
    }

    const success = TextToSpeechService.speak(
      text,
      locale,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false),
      () => {
        setIsSpeaking(false);
        setShowFallbackModal(true);
      }
    );

    if (!success) {
      setShowFallbackModal(true);
    }
  };

  const defaultLabel =
    locale === 'hi' ? 'सुनो' : locale === 'mr' ? 'ऐका' : 'Read Aloud';
  const speakingLabel =
    locale === 'hi' ? 'रोकें' : locale === 'mr' ? 'थांबवा' : 'Stop Audio';

  if (variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={handleToggleSpeak}
          aria-label={isSpeaking ? speakingLabel : (label || defaultLabel)}
          title={label || defaultLabel}
          className={`min-h-[38px] px-2.5 py-1 flex items-center justify-center gap-1.5 font-mono font-bold text-xs uppercase rounded-[2px] border-2 shadow-brutal-sm transition-colors ${
            isSpeaking
              ? 'bg-[#B91C1C] text-white border-[#7F1D1D] animate-pulse'
              : 'bg-[var(--site-yellow)] text-[var(--ink)] border-[var(--ink)] hover:bg-[#FBBF24]'
          } ${className}`}
        >
          {isSpeaking ? (
            <>
              <Icons.Volume2 size={16} className="animate-bounce" />
              <span>{speakingLabel}</span>
            </>
          ) : (
            <>
              <Icons.Volume2 size={16} />
              <span>{label || defaultLabel}</span>
            </>
          )}
        </button>

        {showFallbackModal && (
          <FallbackAudioModal
            text={text}
            locale={locale}
            onClose={() => setShowFallbackModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggleSpeak}
        aria-label={isSpeaking ? speakingLabel : (label || defaultLabel)}
        className={`min-h-[48px] px-4 py-2.5 flex items-center justify-center gap-2.5 font-bold text-sm uppercase rounded-[3px] border-2 shadow-sm transition-transform active:scale-[0.98] ${
          isSpeaking
            ? 'bg-[#991B1B] text-white border-[#7F1D1D] animate-pulse'
            : variant === 'secondary'
            ? 'bg-white text-[var(--ink)] border-[var(--ink)] hover:bg-[var(--ink-5)]'
            : 'bg-[var(--site-yellow)] text-[var(--ink)] border-[var(--ink)] hover:bg-[#FBBF24]'
        } ${className}`}
      >
        <Icons.Volume2 size={22} className={isSpeaking ? 'animate-bounce' : ''} />
        <span className="tracking-wide">
          {isSpeaking ? speakingLabel : (label || defaultLabel)}
        </span>
      </button>

      {showFallbackModal && (
        <FallbackAudioModal
          text={text}
          locale={locale}
          onClose={() => setShowFallbackModal(false)}
        />
      )}
    </>
  );
}

function FallbackAudioModal({
  text,
  locale,
  onClose,
}: {
  text: string;
  locale: Locale;
  onClose: () => void;
}) {
  const title =
    locale === 'hi' ? 'पढ़कर सुनाने का विवरण' : locale === 'mr' ? 'वाचून दाखवलेला तपशील' : 'Audio Transcript';
  const closeBtnText =
    locale === 'hi' ? 'ठीक है, समझ गया' : locale === 'mr' ? 'समजले' : 'Close';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-white border-2 border-[var(--ink)] max-w-md w-full p-6 shadow-2xl rounded-[3px]">
        <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--ink)]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[var(--site-yellow)] border border-[var(--ink)] rounded-[2px]">
              <Icons.Volume2 size={20} className="text-[var(--ink)]" />
            </span>
            <h3 className="font-bold text-base uppercase text-[var(--ink)]">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center text-[var(--ink)] hover:bg-[var(--ink-5)] rounded-[2px]"
          >
            <Icons.X size={24} />
          </button>
        </div>

        <div className="py-5">
          <p className="text-base sm:text-lg font-semibold text-[var(--ink)] leading-relaxed bg-[var(--paper)] p-4 border border-[var(--ink-20)] rounded-[2px]">
            "{text}"
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full min-h-[48px] py-3 px-4 bg-[var(--site-orange)] text-white font-bold text-sm uppercase rounded-[2px] hover:bg-[#A83E12] transition-colors"
          >
            {closeBtnText}
          </button>
        </div>
      </div>
    </div>
  );
}
