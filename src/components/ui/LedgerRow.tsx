import React from 'react';
import { formatRupees } from '@/lib/money';
import { StatusPill, StatusType } from './StatusPill';

export interface LedgerRowProps {
  date: string;
  title: string;
  subtitle?: string;
  amountPaise?: number | bigint;
  type?: 'CREDIT' | 'DEBIT' | 'WAGE' | 'ATTENDANCE';
  status?: StatusType;
  onClick?: () => void;
  className?: string;
}

export const LedgerRow: React.FC<LedgerRowProps> = ({
  date,
  title,
  subtitle,
  amountPaise,
  type = 'WAGE',
  status,
  onClick,
  className = '',
}) => {
  const isCredit = type === 'CREDIT' || type === 'WAGE';
  const isDebit = type === 'DEBIT';

  return (
    <div
      onClick={onClick}
      className={`group w-full py-3 px-4 border-b border-[var(--ink-10)] flex items-center justify-between gap-4 transition-none select-none hover:bg-[var(--ink-5)] hover:border-l-2 hover:border-l-[var(--register-blue)] ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="font-data text-xs text-[var(--ink-60)] pt-0.5 whitespace-nowrap">
          {date}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-[var(--ink)] truncate uppercase">
            {title}
          </div>
          {subtitle && (
            <div className="text-xs text-[var(--ink-60)] truncate font-mono">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-right">
        {amountPaise !== undefined && (
          <div className="font-data font-bold text-sm">
            <span
              className={
                isCredit
                  ? 'text-[#1E7A4B]'
                  : isDebit
                  ? 'text-[var(--ink)]'
                  : 'text-[var(--ink)]'
              }
            >
              {isCredit ? '+' : isDebit ? '-' : ''}
              {formatRupees(amountPaise, true)}
            </span>
          </div>
        )}

        {status && <StatusPill status={status} />}
      </div>
    </div>
  );
};
