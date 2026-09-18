import React from 'react';
import { Link } from 'react-router-dom';
import {
  AiOutlineCalendar,
  AiOutlineEnvironment,
  AiOutlineFolderOpen,
  AiOutlineTeam,
  AiOutlineWallet,
  AiOutlineEdit,
  AiOutlineDelete,
} from 'react-icons/ai';
import Badge from '../ui/Badge';
import { formatDateTime } from '../../services/dataHelpers';

/**
 * EventCard
 * Komponen kartu kegiatan/acara warga yang modern dan touch-friendly.
 */
export default function EventCard({
  event,
  isAdmin = false,
  isPanitiaOpen = false,
  leader,
  treasurer,
  onTogglePanitia,
  onEdit,
  onDelete,
}) {
  if (!event) return null;

  const {
    id,
    title,
    event_code,
    event_date,
    location,
    description,
    documentation_url,
    status = 'draft',
  } = event;

  const getStatusBadge = (st) => {
    switch (st) {
      case 'active':
        return <Badge variant="success" size="sm">Sedang Berlangsung</Badge>;
      case 'completed':
        return <Badge variant="info" size="sm">Selesai</Badge>;
      case 'cancelled':
        return <Badge variant="danger" size="sm">Dibatalkan</Badge>;
      case 'archived':
        return <Badge variant="warning" size="sm">Diarsipkan</Badge>;
      case 'draft':
      default:
        return <Badge variant="default" size="sm">Draf</Badge>;
    }
  };

  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm flex flex-col justify-between">
      <div>
        {/* Header Kartu: Kode, Judul, Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {event_code && (
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-gold-700 bg-gold-50 border border-gold-200 px-2 py-0.5 rounded-md inline-block mb-1">
                {event_code}
              </span>
            )}
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug">
              {title}
            </h3>
          </div>

          <div className="shrink-0">
            {getStatusBadge(status)}
          </div>
        </div>

        {/* Tanggal & Lokasi */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="flex items-center gap-1.5 font-medium">
            <AiOutlineCalendar className="text-slate-400 text-sm shrink-0" />
            <span>{formatDateTime(event_date)}</span>
          </span>
          {location && (
            <span className="flex items-center gap-1.5 text-slate-500">
              <AiOutlineEnvironment className="text-slate-400 text-sm shrink-0" />
              <span>{location}</span>
            </span>
          )}
        </div>

        {/* Deskripsi */}
        {description && (
          <p className="mt-2.5 text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
            {description}
          </p>
        )}

        {/* Link Dokumentasi Folder */}
        {documentation_url && (
          <div className="mt-3">
            <a
              href={documentation_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50/80 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors"
            >
              <AiOutlineFolderOpen className="text-sm" />
              <span>Buka Folder Dokumentasi Kegiatan</span>
            </a>
          </div>
        )}

        {/* Highlight Kepanitiaan Utama */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 text-[11px] ${
            leader ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span>👑</span>
            <span>Ketua: {leader ? (leader.profile_name || 'Terisi') : 'Belum di-assign'}</span>
          </span>

          <span className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 text-[11px] ${
            treasurer ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span>💰</span>
            <span>Bendahara: {treasurer ? (treasurer.profile_name || 'Terisi') : 'Belum di-assign'}</span>
          </span>
        </div>
      </div>

      {/* Footer Aksi */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/events/${id}`}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-forest-800 hover:bg-forest-900 text-gold-400 font-bold px-3 py-1.5 text-xs shadow-xs transition-colors"
          >
            <AiOutlineWallet className="text-sm" />
            <span>Lihat Keuangan</span>
          </Link>

          {onTogglePanitia && (
            <button
              type="button"
              onClick={onTogglePanitia}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-3 py-1.5 text-xs shadow-2xs transition-colors"
            >
              <AiOutlineTeam className="text-sm" />
              <span>{isPanitiaOpen ? 'Tutup Panitia' : 'Kelola Panitia'}</span>
            </button>
          )}
        </div>

        {/* Action Edit & Hapus untuk Admin */}
        {isAdmin && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 pv-focus-ring transition-colors"
                title={`Edit event ${title}`}
                aria-label={`Edit event ${title}`}
              >
                <AiOutlineEdit className="text-base" aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 pv-focus-ring transition-colors"
                title={`Hapus event ${title}`}
                aria-label={`Hapus event ${title}`}
              >
                <AiOutlineDelete className="text-base" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
