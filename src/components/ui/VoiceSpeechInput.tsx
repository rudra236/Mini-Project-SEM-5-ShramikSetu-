'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Locale } from '@/locales';
import { Icons } from './icons';

interface VoiceSpeechInputProps {
  locale: Locale;
  onTranscript: (text: string) => void;
  className?: string;
  buttonLabel?: string;
}

export function VoiceSpeechInput({
  locale,
  onTranscript,
  className = '',
  buttonLabel,
}: VoiceSpeechInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const startListening = () => {
    setErrorMessage(null);
    setInterimText('');

    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setErrorMessage(
        locale === 'hi'
          ? 'आपके ब्राउज़र में बोलकर लिखने की सुविधा उपलब्ध नहीं है।'
          : locale === 'mr'
          ? 'आपल्या ब्राउझरमध्ये बोलून लिहिण्याची सुविधा उपलब्ध नाही.'
          : 'Speech recognition is not supported in this browser.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      // Language setting
      recognition.lang = locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalResult = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalResult += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) {
          setInterimText(interim);
        }

        if (finalResult) {
          onTranscript(finalResult.trim());
          setInterimText('');
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMessage(
            locale === 'hi'
              ? 'माइक्रोफ़ोन की अनुमति अस्वीकृत है। कृपया ब्राउज़र में अनुमति दें।'
              : locale === 'mr'
              ? 'मायक्रोफोन परवानगी नाकारली गेली. कृपया परवानगी द्या.'
              : 'Microphone permission denied.'
          );
        } else if (event.error !== 'no-speech') {
          setErrorMessage(
            locale === 'hi'
              ? 'आवाज पहचानने में समस्या हुई। कृपया पुनः प्रयास करें।'
              : locale === 'mr'
              ? 'आवाज ओळखण्यात अडचण आली. पुन्हा प्रयत्न करा.'
              : 'Speech recognition error. Please try again.'
          );
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      setErrorMessage(err.message || 'Failed to start speech recognition');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const defaultLabel =
    locale === 'hi'
      ? 'बोलकर लिखें (माइक)'
      : locale === 'mr'
      ? 'बोलून लिहा (माइक)'
      : 'Voice Input';

  const listeningLabel =
    locale === 'hi'
      ? 'सुन रहे हैं... (रोकें)'
      : locale === 'mr'
      ? 'ऐकत आहे... (थांबवा)'
      : 'Listening... (Stop)';

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleListening}
          aria-label={isListening ? listeningLabel : (buttonLabel || defaultLabel)}
          className={`min-h-[48px] px-4 py-2.5 flex items-center justify-center gap-2.5 font-bold text-xs sm:text-sm uppercase rounded-[3px] border-2 transition-all ${
            isListening
              ? 'bg-[#B91C1C] text-white border-[#7F1D1D] animate-pulse shadow-md'
              : 'bg-[#EFF6FF] text-[#1E40AF] border-[#3B82F6] hover:bg-[#DBEAFE]'
          } ${className}`}
        >
          <Icons.Mic
            size={20}
            className={isListening ? 'animate-bounce text-white' : 'text-[#2563EB]'}
          />
          <span>{isListening ? listeningLabel : (buttonLabel || defaultLabel)}</span>
        </button>

        {isListening && (
          <span className="text-xs font-semibold text-[#B91C1C] flex items-center gap-1.5 animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B91C1C]" />
            {locale === 'hi' ? 'अब बोलें...' : locale === 'mr' ? 'आता बोला...' : 'Speak now...'}
          </span>
        )}
      </div>

      {interimText && (
        <div className="p-2.5 bg-yellow-50 border border-yellow-200 text-xs font-medium text-yellow-900 rounded-[2px] italic">
          "{interimText}"
        </div>
      )}

      {errorMessage && (
        <div className="p-2.5 bg-red-50 border border-red-200 text-xs font-medium text-red-700 rounded-[2px]">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
