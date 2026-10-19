import React from 'react';

export interface StripSectionProps {
  title?: string;
  titleHindi?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'highlight' | 'warning' | 'verified';
  className?: string;
  headerBorder?: boolean;
}

export const StripSection: React.FC<StripSectionProps> = ({
  title,
  titleHindi,
  action,
  children,
  variant = 'default',
  className = '',
  headerBorder = true,
}) => {
  let accentBorder = 'border-l-4 border-l-black';

  if (variant === 'highlight') {
    accentBorder = 'border-l-4 border-l-[#F59E0B]';
  } else if (variant === 'warning') {
    accentBorder = 'border-l-4 border-l-[#EA580C]';
  } else if (variant === 'verified') {
    accentBorder = 'border-l-4 border-l-[#15803D]';
  }

  return (
    <section className={`w-full bg-white border-2 border-black shadow-brutal ${accentBorder} ${className}`}>
      {(title || action) && (
        <div
          className={`px-3.5 sm:px-4 py-2.5 bg-slate-50 ${
            headerBorder ? 'border-b-2 border-slate-200' : ''
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="text-xs sm:text-sm font-mono font-black tracking-wider uppercase text-[#0F172A] flex items-center gap-1.5 flex-wrap">
                  <span className="whitespace-normal break-normal">{title}</span>
                  {titleHindi && (
                    <span className="text-[11px] text-slate-500 font-bold">
                      · {titleHindi}
                    </span>
                  )}
                </h3>
              )}
            </div>
            {action && (
              <div className="flex items-center gap-2 flex-wrap sm:shrink-0 justify-between sm:justify-end w-full sm:w-auto">
                {action}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="p-3.5 sm:p-4">{children}</div>
    </section>
  );
};

