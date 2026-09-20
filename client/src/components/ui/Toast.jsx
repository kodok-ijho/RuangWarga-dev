import React from 'react';
import {
  AiOutlineCheckCircle,
  AiOutlineCloseCircle,
  AiOutlineInfoCircle,
  AiOutlineWarning,
  AiOutlineClose,
} from 'react-icons/ai';

const ICONS = {
  success: AiOutlineCheckCircle,
  error: AiOutlineCloseCircle,
  danger: AiOutlineCloseCircle,
  info: AiOutlineInfoCircle,
  warning: AiOutlineWarning,
};

const STYLES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  error: 'bg-rose-50 border-rose-200 text-rose-900',
  danger: 'bg-rose-50 border-rose-200 text-rose-900',
  info: 'bg-sky-50 border-sky-200 text-sky-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
};

export function Toast({
  type = 'info',
  message,
  title,
  onClose,
  className = '',
  ...props
}) {
  const Icon = ICONS[type] || AiOutlineInfoCircle;
  const styleClass = STYLES[type] || STYLES.info;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-xl border p-4 shadow-rw-popover text-xs transition-all ${styleClass} ${className}`}
      {...props}
    >
      <Icon className="text-lg shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 space-y-0.5 min-w-0">
        {title && <p className="font-bold text-slate-900">{title}</p>}
        {message && <p className="leading-relaxed">{message}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-black/5 transition"
        >
          <AiOutlineClose className="text-xs" />
        </button>
      )}
    </div>
  );
}

export default Toast;
