'use client';

import React from 'react';
import { Icons } from './icons';

export interface VerifiedStampProps {
  label?: string;
  sublabel?: string;
  timestamp?: string;
  animate?: boolean;
  className?: string;
}

export const VerifiedStamp: React.FC<VerifiedStampProps> = ({
  label = 'VERIFIED',
  sublabel = 'HAZIRI RECORDED · उपस्थिति दर्ज',
  timestamp,
  animate = true,
  className = '',
}) => {
  return (
    <div
      className={`inline-flex flex-col items-center justify-center p-3 border-4 border-[#1E7A4B] text-[#1E7A4B] bg-[#EBF7F0] select-none ${
        animate ? 'stamp-animation' : ''
      } ${className}`}
      style={{
        maskImage: 'radial-gradient(circle, black 80%, rgba(0,0,0,0.8) 100%)',
      }}
    >
      <div className="flex items-center gap-1.5 font-bold tracking-widest text-lg sm:text-xl uppercase border-b-2 border-[#1E7A4B] pb-1 w-full justify-center">
        <Icons.CheckCircle size={22} />
        <span>{label}</span>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider mt-1 text-[#155A36]">
        {sublabel}
      </div>
      {timestamp && (
        <div className="font-data text-[11px] font-semibold mt-0.5 text-[#155A36]">
          {timestamp}
        </div>
      )}
    </div>
  );
};
