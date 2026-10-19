import React from 'react';
import { Icons } from './icons';

export interface ComplianceBadgeProps {
  status: 'COMPLIANT' | 'REVIEW_REQUIRED' | 'POTENTIAL_NON_COMPLIANCE' | 'INSUFFICIENT_DATA' | string;
  ruleUsed?: string;
  className?: string;
  compact?: boolean;
}

export const ComplianceBadge: React.FC<ComplianceBadgeProps> = ({
  status,
  ruleUsed,
  className = '',
  compact = false,
}) => {
  const norm = (status || '').toUpperCase();

  if (compact) {
    if (norm === 'COMPLIANT') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1E7A4B] bg-[#EBF7F0] border border-[#1E7A4B] px-1.5 py-0.5 rounded-[2px]">
          <Icons.Check size={12} />
          COMPLIANT
        </span>
      );
    }
    if (norm === 'REVIEW_REQUIRED') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#854D0E] bg-[#FEFCE8] border border-[#CA8A04] px-1.5 py-0.5 rounded-[2px]">
          <Icons.AlertTriangle size={12} />
          REVIEW
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#991B1B] bg-[#FDF2F2] border border-[#B91C1C] px-1.5 py-0.5 rounded-[2px]">
        <Icons.AlertCircle size={12} />
        NON-COMPLIANT
      </span>
    );
  }

  let borderClass = 'border-[var(--ink-20)] bg-[var(--paper-dark)]';
  let title = 'UNKNOWN COMPLIANCE';
  let icon = <Icons.AlertCircle size={18} className="text-[var(--ink-60)]" />;

  if (norm === 'COMPLIANT') {
    borderClass = 'border-l-4 border-l-[#1E7A4B] bg-[#EBF7F0] text-[#155A36]';
    title = 'STATUTORY WAGE COMPLIANT';
    icon = <Icons.ShieldCheck size={20} className="text-[#1E7A4B]" />;
  } else if (norm === 'REVIEW_REQUIRED') {
    borderClass = 'border-l-4 border-l-[var(--site-yellow)] bg-[#FEFCE8] text-[#854D0E]';
    title = 'REVIEW REQUIRED — POTENTIAL WAGE DISCREPANCY';
    icon = <Icons.AlertTriangle size={20} className="text-[#CA8A04]" />;
  } else if (norm === 'POTENTIAL_NON_COMPLIANCE' || norm === 'NON_COMPLIANCE') {
    borderClass = 'border-l-4 border-l-[#B91C1C] bg-[#FDF2F2] text-[#991B1B]';
    title = 'NON-COMPLIANT — BELOW STATUTORY MINIMUM WAGE';
    icon = <Icons.AlertCircle size={20} className="text-[#B91C1C]" />;
  }

  return (
    <div className={`p-3 border ${borderClass} ${className}`}>
      <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
        {icon}
        <span>{title}</span>
      </div>
      {ruleUsed && (
        <div className="text-[11px] font-mono mt-1 opacity-80">
          BENCHMARK: {ruleUsed}
        </div>
      )}
    </div>
  );
};
