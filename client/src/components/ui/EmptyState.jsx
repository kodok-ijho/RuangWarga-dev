import React from 'react';

export function EmptyState({
  title = 'Belum Ada Data',
  description = 'Data untuk kategori atau filter ini belum tersedia saat ini.',
  icon,
  action,
  compact = false,
  className = '',
}) {
  const isEmojiOrString = typeof icon === 'string';
  const IconComponent = typeof icon === 'function' ? icon : null;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-2xl bg-slate-50/70 border border-slate-200/80 my-3 transition-all ${
        compact ? 'p-5 sm:p-6 space-y-2.5' : 'p-8 sm:p-12 space-y-3.5'
      } ${className}`}
    >
      <div
        className={`${
          compact ? 'w-10 h-10 rounded-xl text-xl' : 'w-12 h-12 rounded-2xl text-2xl'
        } bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-2xs shrink-0`}
      >
        {isEmojiOrString ? (
          <span role="img" aria-label="icon">
            {icon}
          </span>
        ) : IconComponent ? (
          <IconComponent className={`${compact ? 'text-xl' : 'text-2xl'} text-slate-600`} aria-hidden="true" />
        ) : (
          <span role="img" aria-label="empty">
            📭
          </span>
        )}
      </div>

      <div className="max-w-sm space-y-1">
        <h4
          className={`${
            compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
          } font-bold text-slate-900 font-display`}
        >
          {title}
        </h4>
        {description && (
          <p
            className={`${
              compact ? 'text-[11px]' : 'text-xs'
            } text-slate-500 leading-relaxed`}
          >
            {description}
          </p>
        )}
      </div>

      {action && <div className={compact ? 'pt-1.5' : 'pt-2'}>{action}</div>}
    </div>
  );
}

export default EmptyState;
