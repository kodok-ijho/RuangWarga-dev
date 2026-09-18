import React from 'react';

export function EmptyState({
  title = 'Belum Ada Data',
  description = 'Data untuk kategori atau filter ini belum tersedia saat ini.',
  icon: Icon,
  action,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3.5 my-3 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-xs">
        {Icon ? (
          <Icon className="text-2xl text-slate-600" aria-hidden="true" />
        ) : (
          <span className="text-2xl" role="img" aria-label="empty">
            📭
          </span>
        )}
      </div>

      <div className="max-w-sm space-y-1">
        <h4 className="text-sm sm:text-base font-bold text-slate-900 font-display">
          {title}
        </h4>
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>

      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
