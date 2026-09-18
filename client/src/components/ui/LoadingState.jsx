import React from 'react';

export function LoadingState({
  message = 'Memuat data...',
  size = 'md',
  className = '',
}) {
  const spinnerSize =
    size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-10 w-10' : 'h-7 w-7';

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 space-y-3 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`${spinnerSize} rounded-full border-2 border-slate-200 border-t-gold-500 animate-spin`}
        aria-hidden="true"
      />
      {message && <p className="text-xs text-slate-500 font-medium">{message}</p>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 rounded-xl ${className}`}
      aria-hidden="true"
    />
  );
}

export default LoadingState;
