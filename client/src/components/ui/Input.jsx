import React, { forwardRef } from 'react';

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    icon: Icon,
    iconRight: IconRight,
    id,
    className = '',
    disabled = false,
    required = false,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-slate-700 select-none"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        {Icon && (
          <div className="pointer-events-none absolute left-3 flex items-center text-slate-400">
            <Icon className="text-base" aria-hidden="true" />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all pv-focus-ring disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${
            Icon ? 'pl-9' : ''
          } ${IconRight ? 'pr-9' : ''} ${
            error
              ? 'border-rose-300 focus:border-rose-500 focus-visible:ring-rose-500/20'
              : 'border-slate-200 focus:border-gold-500 focus-visible:ring-gold-500/20'
          } ${className}`}
          {...props}
        />

        {IconRight && (
          <div className="pointer-events-none absolute right-3 flex items-center text-slate-400">
            <IconRight className="text-base" aria-hidden="true" />
          </div>
        )}
      </div>

      {error ? (
        <p className="text-xs text-rose-600 font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Input;
