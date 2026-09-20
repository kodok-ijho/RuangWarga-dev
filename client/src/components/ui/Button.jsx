import React, { forwardRef } from 'react';

const PRIMARY_STYLE =
  'bg-slate-900 text-white font-semibold hover:bg-slate-800 active:scale-[0.98] border border-slate-900 shadow-xs';

const VARIANTS = {
  primary: PRIMARY_STYLE,
  secondary:
    'bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 active:scale-[0.98] border border-slate-200/80 shadow-xs',
  tenant:
    'bg-[var(--tenant-primary,#0f172a)] text-white font-semibold hover:opacity-90 active:scale-[0.98] shadow-xs border border-black/10',
  outline:
    'bg-white text-slate-800 font-semibold border border-slate-200 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] shadow-xs',
  ghost:
    'text-slate-700 font-semibold hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] border border-transparent',
  destructive:
    'bg-rose-600 text-white font-semibold border border-rose-700 hover:bg-rose-700 active:scale-[0.98] shadow-xs',
  danger:
    'bg-rose-50 text-rose-700 font-semibold border border-rose-200/80 hover:bg-rose-100 active:scale-[0.98]',
  // Aliases backward-compatible
  neutral: PRIMARY_STYLE,
  brand: PRIMARY_STYLE,
};

const SIZES = {
  sm: 'min-h-[36px] px-3 text-xs rounded-lg gap-1.5',
  md: 'min-h-[44px] px-4 text-sm rounded-xl gap-2',
  lg: 'min-h-[48px] px-5 text-base rounded-xl gap-2.5',
};

export const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    icon: Icon,
    iconRight: IconRight,
    disabled = false,
    className = '',
    type = 'button',
    ...props
  },
  ref
) {
  const variantClass = VARIANTS[variant] || VARIANTS.primary;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center select-none transition-all pv-focus-ring disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-current shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : Icon ? (
        <Icon className="text-base shrink-0" aria-hidden="true" />
      ) : null}
      {children}
      {!isLoading && IconRight ? (
        <IconRight className="text-base shrink-0" aria-hidden="true" />
      ) : null}
    </button>
  );
});

export default Button;
