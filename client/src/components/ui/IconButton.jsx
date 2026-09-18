import React, { forwardRef } from 'react';

const VARIANTS = {
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 border-transparent',
  outline: 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200 active:scale-95 shadow-xs',
  primary: 'bg-gold-500 text-forest-950 hover:bg-gold-400 active:scale-95 border-gold-600/30 shadow-xs',
  secondary: 'bg-forest-800 text-white hover:bg-forest-900 active:scale-95 border-forest-700/50 shadow-xs',
  danger: 'text-rose-600 hover:bg-rose-50 hover:text-rose-700 active:scale-95 border-rose-200/60',
};

const SIZES = {
  sm: 'h-8 w-8 text-sm min-h-[36px] min-w-[36px] rounded-lg',
  md: 'h-10 w-10 text-base min-h-[44px] min-w-[44px] rounded-xl',
  lg: 'h-12 w-12 text-lg min-h-[48px] min-w-[48px] rounded-xl',
};

export const IconButton = forwardRef(function IconButton(
  {
    icon: Icon,
    children,
    variant = 'outline',
    size = 'md',
    isLoading = false,
    className = '',
    type = 'button',
    'aria-label': ariaLabel,
    disabled = false,
    ...props
  },
  ref
) {
  const variantClass = VARIANTS[variant] || VARIANTS.outline;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center select-none border transition-all pv-focus-ring disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 ${variantClass} ${sizeClass} ${className}`}
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
        <Icon className="shrink-0" aria-hidden="true" />
      ) : (
        children
      )}
    </button>
  );
});

export default IconButton;
