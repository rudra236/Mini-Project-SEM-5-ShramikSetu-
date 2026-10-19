import React from 'react';

export type StatusType =
  | 'VERIFIED'
  | 'PENDING'
  | 'OFFERED'
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'COMPLIANT'
  | 'REVIEW_REQUIRED'
  | 'POTENTIAL_NON_COMPLIANCE'
  | 'NON_COMPLIANCE'
  | 'INSUFFICIENT_DATA'
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'WAITING_FOR_INFORMATION'
  | 'RESOLVED'
  | 'CLOSED'
  | 'DRAFT'
  | 'TERMINATED'
  | string;

interface StatusPillProps {
  status: StatusType;
  label?: string;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, label, className = '' }) => {
  const normalized = (status || '').toUpperCase();

  let bg = 'bg-[var(--ink-10)]';
  let text = 'text-[var(--ink)]';
  let border = 'border-[var(--ink-20)]';
  let dot = 'bg-[var(--ink)]';

  switch (normalized) {
    case 'VERIFIED':
    case 'ACCEPTED':
    case 'COMPLIANT':
    case 'RESOLVED':
      bg = 'bg-[#EBF7F0]';
      text = 'text-[#155A36]';
      border = 'border-[#1E7A4B]';
      dot = 'bg-[#1E7A4B]';
      break;

    case 'OFFERED':
    case 'PENDING':
    case 'PENDING_ACCEPTANCE':
    case 'OPEN':
    case 'DISPUTED':
      bg = 'bg-[#FEF3EB]';
      text = 'text-[#C04205]';
      border = 'border-[#E8540A]';
      dot = 'bg-[#E8540A]';
      break;

    case 'ACTIVE':
      bg = 'bg-[#EAF1F8]';
      text = 'text-[#1B4F8A]';
      border = 'border-[#1B4F8A]';
      dot = 'bg-[#1B4F8A]';
      break;

    case 'REJECTED':
    case 'POTENTIAL_NON_COMPLIANCE':
    case 'NON_COMPLIANCE':
    case 'TERMINATED':
      bg = 'bg-[#FDF2F2]';
      text = 'text-[#991B1B]';
      border = 'border-[#B91C1C]';
      dot = 'bg-[#B91C1C]';
      break;

    case 'REVIEW_REQUIRED':
    case 'UNDER_REVIEW':
    case 'WAITING_FOR_INFORMATION':
      bg = 'bg-[#FEFCE8]';
      text = 'text-[#854D0E]';
      border = 'border-[#CA8A04]';
      dot = 'bg-[#CA8A04]';
      break;

    case 'CANCELLED':
    case 'ENDED':
      bg = 'bg-[#F1F5F9]';
      text = 'text-[#475569]';
      border = 'border-[#94A3B8]';
      dot = 'bg-[#64748B]';
      break;

    default:
      bg = 'bg-[var(--paper-dark)]';
      text = 'text-[var(--ink)]';
      border = 'border-[var(--ink-20)]';
      dot = 'bg-[var(--ink-40)]';
      break;
  }

  const displayText = label || normalized.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-[2px] border ${bg} ${text} ${border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {displayText}
    </span>
  );
};
