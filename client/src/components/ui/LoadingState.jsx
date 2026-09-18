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
        className={`${spinnerSize} rounded-full border-2 border-slate-200 border-t-gold-500 animate-spin motion-reduce:animate-none`}
        aria-hidden="true"
      />
      {message && <p className="text-xs text-slate-500 font-medium">{message}</p>}
    </div>
  );
}

export function Skeleton({ className = '', rounded = 'rounded-xl' }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none bg-slate-200/70 ${rounded} ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 py-1 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton
          key={idx}
          className={`h-3.5 ${
            idx === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 3, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4 animate-pulse motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-200/80" />
          <div className="space-y-1.5">
            <div className="h-4 w-32 rounded-md bg-slate-200/80" />
            <div className="h-3 w-20 rounded-md bg-slate-200/60" />
          </div>
        </div>
        <div className="h-6 w-16 rounded-full bg-slate-200/70" />
      </div>

      <div className="space-y-2 pt-2 border-t border-slate-100">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between py-1"
          >
            <div className="h-3.5 w-24 rounded bg-slate-200/70" />
            <div className="h-3.5 w-32 rounded bg-slate-200/80" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ cols = 4, rows = 5, className = '' }) {
  return (
    <div
      className={`w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs animate-pulse motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    >
      {/* Header bar */}
      <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5 flex justify-between items-center">
        <div className="h-4 w-40 rounded-md bg-slate-200/80" />
        <div className="h-8 w-28 rounded-xl bg-slate-200/70" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-slate-200/60 bg-slate-100/50">
            <tr>
              {Array.from({ length: cols }).map((_, cIdx) => (
                <th key={cIdx} className="px-5 py-3">
                  <div
                    className={`h-3 rounded bg-slate-200/80 ${
                      cIdx === cols - 1 ? 'w-16 ml-auto' : 'w-20'
                    }`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, rIdx) => (
              <tr key={rIdx}>
                {Array.from({ length: cols }).map((_, cIdx) => (
                  <td key={cIdx} className="px-5 py-3.5">
                    <div
                      className={`h-3.5 rounded bg-slate-200/60 ${
                        cIdx === 0
                          ? 'w-24'
                          : cIdx === cols - 1
                          ? 'w-20 ml-auto'
                          : 'w-32'
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonList({ items = 4, className = '' }) {
  return (
    <div className={`space-y-2.5 animate-pulse motion-reduce:animate-none ${className}`} aria-hidden="true">
      {Array.from({ length: items }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-200/80 shrink-0" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 rounded bg-slate-200/80" />
              <div className="h-3 w-20 rounded bg-slate-200/60" />
            </div>
          </div>
          <div className="h-6 w-14 rounded-full bg-slate-200/70" />
        </div>
      ))}
    </div>
  );
}

export default LoadingState;
