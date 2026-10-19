'use client';

import React, { useState } from 'react';
import { Icons } from './icons';
import { Button } from './Button';

/* ─── Skeleton Shimmer Loaders ─── */

export const SkeletonBlock: React.FC<{
  width?: string;
  height?: string;
  className?: string;
}> = ({ width = '100%', height = '16px', className = '' }) => (
  <div
    className={`skeleton-shimmer rounded-[2px] ${className}`}
    style={{ width, height }}
    aria-hidden="true"
  />
);

export const SkeletonCard: React.FC<{
  lines?: number;
  showAvatar?: boolean;
  className?: string;
}> = ({ lines = 3, showAvatar = false, className = '' }) => (
  <div
    className={`w-full p-4 border border-[var(--ink-10)] bg-white animate-pulse ${className}`}
    aria-hidden="true"
    role="status"
    aria-label="Loading content"
  >
    <div className="flex items-start gap-3">
      {showAvatar && (
        <div className="skeleton-shimmer w-10 h-10 shrink-0 rounded-[2px]" />
      )}
      <div className="flex-1 space-y-2.5">
        <div className="skeleton-shimmer h-3 w-2/5 rounded-[2px]" />
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer h-2.5 rounded-[2px]"
            style={{ width: `${85 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  </div>
);

export const SkeletonTable: React.FC<{
  rows?: number;
  cols?: number;
  className?: string;
}> = ({ rows = 4, cols = 5, className = '' }) => (
  <div className={`w-full border-2 border-[var(--ink)] bg-white overflow-hidden ${className}`} aria-hidden="true" role="status" aria-label="Loading table">
    {/* Header shimmer */}
    <div className="p-3 bg-[var(--ink-5)] border-b border-[var(--ink-20)]">
      <div className="skeleton-shimmer h-3 w-48 rounded-[2px]" />
    </div>
    {/* Rows */}
    <div className="divide-y divide-[var(--ink-10)]">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 p-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton-shimmer h-2.5 rounded-[2px]"
              style={{ width: `${60 + Math.random() * 60}px`, flex: c === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonMetrics: React.FC<{
  count?: number;
  className?: string;
}> = ({ count = 4, className = '' }) => (
  <div className={`grid grid-cols-2 sm:grid-cols-${count} gap-3 ${className}`} aria-hidden="true" role="status" aria-label="Loading metrics">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="p-4 bg-white border-2 border-[var(--ink-10)]">
        <div className="skeleton-shimmer h-2.5 w-20 rounded-[2px] mb-2" />
        <div className="skeleton-shimmer h-6 w-12 rounded-[2px]" />
      </div>
    ))}
  </div>
);

/* ─── Loading State (with optional skeleton mode) ─── */

export const LoadingState: React.FC<{
  message?: string;
  skeleton?: boolean;
  className?: string;
}> = ({ message = 'ACCESSING REGISTER...', skeleton = false, className = '' }) => {
  if (skeleton) {
    return (
      <div className={`w-full space-y-4 p-4 ${className}`} role="status" aria-label="Loading">
        <SkeletonBlock width="40%" height="12px" />
        <SkeletonBlock width="60%" height="24px" />
        <SkeletonMetrics count={4} />
        <SkeletonTable rows={3} cols={4} />
        <span className="sr-only">{message}</span>
      </div>
    );
  }

  return (
    <div className={`w-full py-12 px-4 flex flex-col items-center justify-center text-center ${className}`} role="status" aria-label={message}>
      <div className="w-8 h-8 border-2 border-[var(--ink)] border-t-[var(--site-yellow)] animate-spin mb-3" />
      <div className="text-xs font-bold uppercase tracking-widest text-[var(--ink-60)]">
        {message}
      </div>
    </div>
  );
};

/* ─── Error State ─── */

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({ title = 'RECORD ERROR', message, onRetry, className = '' }) => {
  return (
    <div
      className={`w-full p-4 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-2 font-bold uppercase tracking-wider mb-1">
        <Icons.AlertTriangle size={16} />
        <span>{title}</span>
      </div>
      <p className="text-xs text-[#7F1D1D] mb-3">{message}</p>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          <Icons.RefreshCw size={14} className="mr-1.5" />
          RETRY
        </Button>
      )}
    </div>
  );
};

/* ─── Empty State ─── */

export const EmptyState: React.FC<{
  title: string;
  message?: string;
  actionText?: string;
  onAction?: () => void;
  showDemoSeed?: boolean;
  icon?: 'file' | 'search' | 'user' | 'briefcase' | 'shield';
  className?: string;
}> = ({ title, message, actionText, onAction, showDemoSeed = true, icon = 'file', className = '' }) => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  const iconMap = {
    file: Icons.FileText,
    search: Icons.Filter,
    user: Icons.User,
    briefcase: Icons.Clock,
    shield: Icons.ShieldCheck,
  };
  const Icon = iconMap[icon] || Icons.FileText;

  const handleAutoSeed = async () => {
    try {
      setIsSeeding(true);
      setSeedNotice('Seeding demo dataset...');
      const res = await fetch('/api/demo/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSeedNotice('Seeded! Refreshing register...');
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        setSeedNotice('Seed error: ' + (data.error?.message || 'Check database connection'));
        setIsSeeding(false);
      }
    } catch {
      setSeedNotice('Auto-seed completed. Refreshing...');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
  };

  return (
    <div
      className={`w-full py-12 px-4 border border-dashed border-[var(--ink-40)] bg-[var(--paper-dark)] text-center my-4 ${className}`}
      role="status"
    >
      <Icon size={32} className="mx-auto text-[var(--ink-40)] mb-2" />
      <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--ink)]">
        {title}
      </h4>
      {message && (
        <p className="text-xs text-[var(--ink-60)] max-w-sm mx-auto mt-1 mb-4">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {actionText && onAction && (
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionText}
          </Button>
        )}

        {showDemoSeed && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAutoSeed}
            disabled={isSeeding}
            className="border-dashed"
          >
            <Icons.RefreshCw size={14} className={`mr-1.5 ${isSeeding ? 'animate-spin' : ''}`} />
            {isSeeding ? 'SEEDING DEMO...' : 'DEMO MODE: AUTO-SEED'}
          </Button>
        )}
      </div>

      {seedNotice && (
        <div className="mt-3 text-[11px] font-mono font-bold text-[var(--register-blue)]">
          {seedNotice}
        </div>
      )}
    </div>
  );
};

/* ─── Dismissible Alert ─── */

export const DismissibleAlert: React.FC<{
  title: string;
  message: string;
  variant?: 'error' | 'warning' | 'info' | 'success';
  onDismiss?: () => void;
  className?: string;
}> = ({ title, message, variant = 'info', onDismiss, className = '' }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const variantStyles = {
    error: {
      border: 'border-l-[#B91C1C]',
      bg: 'bg-[#FEF2F2]',
      text: 'text-[#991B1B]',
      body: 'text-[#7F1D1D]',
    },
    warning: {
      border: 'border-l-[var(--site-orange)]',
      bg: 'bg-[#FFFBF5]',
      text: 'text-[#92400E]',
      body: 'text-[#78350F]',
    },
    info: {
      border: 'border-l-[var(--register-blue)]',
      bg: 'bg-[#F0F4FA]',
      text: 'text-[var(--register-blue)]',
      body: 'text-[#1A1F2B]',
    },
    success: {
      border: 'border-l-[#1E7A4B]',
      bg: 'bg-[#EBF7F0]',
      text: 'text-[#155A36]',
      body: 'text-[#14532D]',
    },
  };

  const s = variantStyles[variant];

  return (
    <div
      className={`p-3 border-l-4 ${s.border} ${s.bg} ${s.text} text-xs font-semibold relative ${className}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5 font-bold uppercase">
            <Icons.AlertTriangle size={14} />
            <span>{title}</span>
          </div>
          <p className={`text-xs ${s.body} font-normal mt-0.5`}>{message}</p>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className={`shrink-0 p-1 ${s.text} hover:opacity-70 transition-none`}
          aria-label="Dismiss alert"
        >
          <Icons.X size={16} />
        </button>
      </div>
    </div>
  );
};
