import React from 'react';

export function DataRow({
  label,
  value,
  children,
  border = true,
  className = '',
  labelClassName = '',
  valueClassName = '',
}) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-2.5 ${
        border ? 'border-b border-slate-100 last:border-0' : ''
      } ${className}`}
    >
      <span className={`text-xs text-slate-500 font-medium ${labelClassName}`}>
        {label}
      </span>
      <div className={`text-xs sm:text-sm font-semibold text-slate-900 ${valueClassName}`}>
        {children !== undefined ? children : value ?? '—'}
      </div>
    </div>
  );
}

export default DataRow;
