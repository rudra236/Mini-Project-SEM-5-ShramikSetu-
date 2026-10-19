import React from 'react';
import { Icons } from './icons';

export interface IdentityCardProps {
  fullName?: string | null;
  workerId?: string | null;
  internalWorkerId?: string | null;
  occupation?: string | null;
  skillCategory?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  emergencyContact?: string | null;
  className?: string;
  isVerified?: boolean;
  onEditProfile?: () => void;
}

export const IdentityCard: React.FC<IdentityCardProps> = ({
  fullName,
  workerId,
  internalWorkerId,
  occupation,
  skillCategory,
  phone,
  photoUrl,
  emergencyContact,
  className = '',
  isVerified = true,
  onEditProfile,
}) => {
  const displayId = internalWorkerId || (workerId ? `W-${workerId.slice(0, 8).toUpperCase()}` : '—');
  const displayName = fullName || '—';
  const displaySkill = skillCategory || '—';
  const displayTrade = occupation || '—';

  return (
    <div
      className={`relative w-full bg-white border-2 border-black p-4 text-[#0F172A] shadow-brutal ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex gap-3 items-center">
          <div className="w-14 h-16 bg-slate-100 border-2 border-black shadow-brutal-sm flex items-center justify-center shrink-0 text-[#0F172A] overflow-hidden font-mono font-black text-lg">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              'ID'
            )}
          </div>

          <div className="min-w-0">
            <div className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest truncate">
              STATUTORY WORKER ID · श्रमिक पहचान
            </div>
            <h2 className="text-base sm:text-xl font-black uppercase leading-tight tracking-tight text-[#0F172A] truncate">
              {displayName}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1 font-mono">
              <span className="font-black text-xs bg-[#0F172A] text-white px-2 py-0.5 border border-black shadow-brutal-sm">
                {displayId}
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-black bg-[#FEF3C7] border border-black px-1.5 py-0.5 shadow-brutal-sm">
                {displaySkill}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 font-mono shrink-0">
          {isVerified && (
            <span className="text-[10px] uppercase font-black text-[#15803D] flex items-center gap-1 border-2 border-[#15803D] px-2 py-0.5 bg-[#DCFCE7] shadow-brutal-sm">
              <Icons.ShieldCheck size={12} />
              VERIFIED RECORD
            </span>
          )}
          {onEditProfile && (
            <button
              type="button"
              onClick={onEditProfile}
              className="min-h-[44px] text-xs font-mono font-black uppercase px-2.5 py-1 bg-white hover:bg-slate-100 border border-black shadow-brutal-sm text-[#0F172A] flex items-center gap-1 transition-all"
            >
              <Icons.Edit size={12} />
              EDIT PROFILE
            </button>
          )}
        </div>
      </div>

      <div className="mt-3.5 pt-3 border-t-2 border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
        <div>
          <span className="block text-[9px] uppercase font-bold text-slate-500">TRADE / OCCUPATION</span>
          <span className="font-black uppercase text-[#0F172A]">{displayTrade}</span>
        </div>
        <div>
          <span className="block text-[9px] uppercase font-bold text-slate-500">PHONE NUMBER</span>
          <span className="font-bold text-[#0F172A]">{phone || '—'}</span>
        </div>
        {emergencyContact && (
          <div className="col-span-2 sm:col-span-1">
            <span className="block text-[9px] uppercase font-bold text-slate-500">EMERGENCY NO.</span>
            <span className="font-bold text-[#0F172A]">{emergencyContact}</span>
          </div>
        )}
      </div>
    </div>
  );
};

