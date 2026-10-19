'use client';

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'warning' | 'verified' | 'yellow' | 'ghost' | 'danger' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
  shimmer?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      isLoading = false,
      disabled = false,
      shimmer = false,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'mechanical-btn inline-flex items-center justify-center font-extrabold uppercase tracking-wider select-none disabled:opacity-50 disabled:cursor-not-allowed text-center transition-all duration-100';

    const sizeStyles = {
      sm: 'min-h-[44px] px-3 py-1.5 text-xs rounded-[2px] shadow-brutal-sm',
      md: 'min-h-[44px] px-4 py-2 text-xs sm:text-sm rounded-[2px] shadow-brutal',
      lg: 'min-h-[52px] px-6 py-3 text-sm sm:text-base rounded-[2px] shadow-brutal-lg',
    };

    const variantStyles = {
      primary:
        'bg-[#0F172A] text-white hover:bg-[#1E293B] border-2 border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      secondary:
        'bg-white text-[#0F172A] hover:bg-slate-50 border-2 border-[#0F172A] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      warning:
        'bg-[#EA580C] text-white hover:bg-[#C2410C] border-2 border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      yellow:
        'bg-[#F59E0B] text-[#0F172A] hover:bg-[#D97706] border-2 border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      amber:
        'bg-[#F59E0B] text-[#0F172A] hover:bg-[#D97706] border-2 border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      verified:
        'bg-[#15803D] text-white hover:bg-[#166534] border-2 border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      danger:
        'bg-[#DC2626] text-white hover:bg-[#B91C1C] border-2 border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      ghost:
        'bg-transparent text-[#0F172A] hover:bg-slate-100 border-2 border-[#0F172A] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    };

    const shimmerClass = shimmer ? 'btn-cricket-stroke' : '';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`
          ${baseStyles}
          ${sizeStyles[size]}
          ${variantStyles[variant]}
          ${shimmerClass}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>PROCESSING...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

