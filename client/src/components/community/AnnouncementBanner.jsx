import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AiOutlineNotification, AiOutlineRight, AiOutlineClose, AiOutlinePushpin } from 'react-icons/ai';
import AnnouncementDetailDrawer from './AnnouncementDetailDrawer';
import { formatDate } from '../../services/dataHelpers';

/**
 * AnnouncementBanner
 * Priority 3 placement di TenantDashboard.
 * Memberikan visibilitas instan untuk pengumuman penting/mendesak tanpa membebani layar.
 */
export default function AnnouncementBanner({
  announcement,
  tenantId,
  className = '',
}) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  if (!announcement || isDismissed) return null;

  const {
    title,
    summary,
    date,
    urgency = 'info',
    is_pinned,
  } = announcement;

  const getUrgencyStyles = () => {
    switch (urgency) {
      case 'urgent':
        return {
          wrapper: 'bg-gradient-to-r from-rose-50 via-rose-50/70 to-white border-rose-200/90 text-rose-900',
          iconBg: 'bg-rose-100 text-rose-700',
          badge: 'bg-rose-600 text-white',
          label: 'Mendesak',
        };
      case 'important':
        return {
          wrapper: 'bg-gradient-to-r from-amber-50 via-amber-50/70 to-white border-amber-200/90 text-amber-900',
          iconBg: 'bg-amber-100 text-amber-700',
          badge: 'bg-amber-600 text-white',
          label: 'Penting',
        };
      case 'info':
      default:
        return {
          wrapper: 'bg-gradient-to-r from-forest-50 via-slate-50 to-white border-forest-200/70 text-slate-900',
          iconBg: 'bg-forest-100 text-forest-800',
          badge: 'bg-forest-800 text-gold-400',
          label: 'Info Warga',
        };
    }
  };

  const style = getUrgencyStyles();

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-2xl border p-4 shadow-xs transition-all ${style.wrapper} ${className}`}
        role="region"
        aria-label="Pengumuman Penting"
      >
        <div className="flex items-start justify-between gap-3">
          {/* Ikon & Konten Singkat */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-2xs ${style.iconBg}`}>
              <AiOutlineNotification />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${style.badge}`}>
                  {style.label}
                </span>
                {is_pinned && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gold-700">
                    <AiOutlinePushpin /> Pinned
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">
                  {formatDate(date)}
                </span>
              </div>

              <h4 className="mt-1 text-sm font-bold text-slate-900 truncate">
                {title}
              </h4>
              <p className="mt-0.5 text-xs text-slate-600 line-clamp-1">
                {summary}
              </p>
            </div>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-black/5 transition-colors shrink-0"
            title="Sembunyikan Pengumuman Ini"
            aria-label="Tutup Pengumuman"
          >
            <AiOutlineClose className="text-sm" />
          </button>
        </div>

        {/* Action footer */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200/50 text-xs">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="font-bold text-forest-800 hover:text-forest-950 inline-flex items-center gap-1 transition-colors min-h-[36px]"
          >
            <span>Baca Selengkapnya</span>
            <AiOutlineRight className="text-[10px]" />
          </button>

          {tenantId && (
            <Link
              to={`/t/${tenantId}/announcements`}
              className="font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Semua Pengumuman →
            </Link>
          )}
        </div>
      </div>

      {/* Drawer rincian */}
      <AnnouncementDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        announcement={announcement}
      />
    </>
  );
}
