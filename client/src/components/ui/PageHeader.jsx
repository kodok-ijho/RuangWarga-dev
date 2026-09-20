import React from 'react';
import { Link } from 'react-router-dom';
import { AiOutlineArrowLeft } from 'react-icons/ai';

export function PageHeader({
  title,
  description,
  badge,
  icon: Icon,
  actions,
  backTo,
  onBack,
  className = '',
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 ${className}`}>
      <div className="flex items-start gap-3">
        {(backTo || onBack) && (
          <div className="mt-1 shrink-0">
            {backTo ? (
              <Link
                to={backTo}
                aria-label="Kembali"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition pv-focus-ring"
                title="Kembali"
              >
                <AiOutlineArrowLeft className="text-base" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={onBack}
                aria-label="Kembali"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition pv-focus-ring"
                title="Kembali"
              >
                <AiOutlineArrowLeft className="text-base" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {Icon && (
          <div className="p-2.5 rounded-2xl bg-slate-100 text-slate-800 border border-slate-200 shrink-0 mt-0.5">
            <Icon className="text-xl" aria-hidden="true" />
          </div>
        )}

        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-title-page truncate">{title}</h1>
            {badge}
          </div>
          {description && <p className="text-meta">{description}</p>}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 pt-1 sm:pt-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
