import React, { forwardRef } from 'react';

export const Select = forwardRef(function Select(
  {
    label,
    error,
    helperText,
    options = [],
    id,
    className = '',
    disabled = false,
    required = false,
    children,
    ...props
  },
  ref
) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-slate-700 select-none"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all pv-focus-ring appearance-none disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed pr-9 font-medium ${
            error
              ? 'border-rose-300 focus:border-rose-500 focus-visible:ring-rose-500/20'
              : 'border-slate-200 focus:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-900/10'
          } ${className}`}
          {...props}
        >
          {options.length > 0
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>

        <div className="pointer-events-none absolute right-3 flex items-center text-slate-400">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
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

export default Select;
