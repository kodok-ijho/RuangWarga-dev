import React from 'react';
import { AiOutlineCalendar, AiOutlinePushpin, AiOutlineRight, AiOutlineUser } from 'react-icons/ai';
import Badge from '../ui/Badge';
import { formatDate } from '../../services/dataHelpers';

/**
 * AnnouncementCard
 * Kartu pengumuman modern yang memprioritaskan:
 * - Judul (bold, jelas)
 * - Tanggal & Penulis
 * - Badge Urgensi (Mendesak / Penting / Info)
 * - Ringkasan padat (line-clamp-2, no wall of text)
 * - Action trigger (touch target >= 44px)
 */
export default function AnnouncementCard({
  announcement,
  onSelect,
  className = '',
}) {
  if (!announcement) return null;

  const {
    title,
    date,
    author,
    urgency = 'info',
    category,
    summary,
    is_pinned = false,
  } = announcement;

  const getUrgencyBadge = (u) => {
    switch (u) {
      case 'urgent':
        return <Badge variant="danger" size="sm">🔥 Mendesak</Badge>;
      case 'important':
        return <Badge variant="warning" size="sm">⚠️ Penting</Badge>;
      case 'info':
      default:
        return <Badge variant="info" size="sm">ℹ️ Info</Badge>;
    }
  };

  return (
    <div
      onClick={() => onSelect && onSelect(announcement)}
      className={`group relative rounded-2xl border p-4 sm:p-5 shadow-xs transition-all hover:shadow-sm ${
        is_pinned
          ? 'border-gold-300/80 bg-gold-50/20'
          : 'border-slate-200/80 bg-white hover:border-slate-300'
      } ${onSelect ? 'cursor-pointer active:bg-slate-50/90' : ''} ${className}`}
    >
      {/* Baris Atas: Urgensi, Kategori, Pin & Tanggal */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {getUrgencyBadge(urgency)}
          {category && (
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {category}
            </span>
          )}
          {is_pinned && (
            <span className="inline-flex items-center gap-0.5 text-gold-700 font-bold text-[11px]">
              <AiOutlinePushpin className="text-sm" /> Disematkan
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-slate-400 text-[11px]">
          <AiOutlineCalendar className="text-xs" />
          <span>{formatDate(date)}</span>
        </div>
      </div>

      {/* Judul Pengumuman */}
      <h3 className="mt-2.5 text-base font-bold text-slate-900 tracking-tight line-clamp-2 group-hover:text-forest-800 transition-colors">
        {title}
      </h3>

      {/* Ringkasan Padat (Maks 2 Baris) */}
      {summary && (
        <p className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
          {summary}
        </p>
      )}

      {/* Baris Bawah: Penulis & Aksi */}
      <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
        <span className="text-slate-500 flex items-center gap-1 text-[11px] truncate max-w-[200px]">
          <AiOutlineUser className="text-slate-400 shrink-0" />
          <span className="truncate">{author || 'Pengurus Komunitas'}</span>
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onSelect) onSelect(announcement);
          }}
          className="inline-flex min-h-[44px] items-center gap-1 font-bold text-forest-800 group-hover:text-forest-900 transition-colors px-2 py-1 rounded-lg"
          aria-label={`Baca selengkapnya mengenai ${title}`}
        >
          <span>Baca Selengkapnya</span>
          <AiOutlineRight className="text-[11px] transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
