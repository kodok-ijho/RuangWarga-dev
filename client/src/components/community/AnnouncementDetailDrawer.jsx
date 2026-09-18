import React from 'react';
import { AiOutlineCalendar, AiOutlinePushpin, AiOutlineUser } from 'react-icons/ai';
import Drawer from '../ui/Drawer';
import Badge from '../ui/Badge';
import { formatDate } from '../../services/dataHelpers';

/**
 * AnnouncementDetailDrawer
 * Level 3 progressive disclosure untuk membaca pengumuman warga secara penuh.
 */
export default function AnnouncementDetailDrawer({
  isOpen = false,
  onClose,
  announcement,
}) {
  if (!announcement) return null;

  const {
    title,
    date,
    author,
    urgency = 'info',
    category,
    content,
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
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Rincian Pengumuman"
      size="md"
    >
      <div className="space-y-4">
        {/* Header Badges */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {getUrgencyBadge(urgency)}
          {category && (
            <span className="font-semibold text-slate-600 uppercase tracking-wider text-[10px] bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              {category}
            </span>
          )}
          {is_pinned && (
            <span className="inline-flex items-center gap-1 text-gold-700 font-bold text-xs bg-gold-50 px-2.5 py-0.5 rounded-full border border-gold-200">
              <AiOutlinePushpin /> Pengumuman Disematkan
            </span>
          )}
        </div>

        {/* Judul Utama */}
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
          {title}
        </h2>

        {/* Meta Tanggal & Penulis */}
        <div className="flex items-center gap-3 text-xs text-slate-500 py-2 border-y border-slate-100">
          <span className="flex items-center gap-1">
            <AiOutlineCalendar className="text-slate-400" />
            <span>{formatDate(date)}</span>
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <AiOutlineUser className="text-slate-400" />
            <span className="font-medium text-slate-700">{author || 'Pengurus Komunitas'}</span>
          </span>
        </div>

        {/* Isi Pengumuman */}
        <div className="prose prose-sm text-slate-700 leading-relaxed pt-2 space-y-3">
          {content ? (
            <p className="whitespace-pre-line text-sm text-slate-800">{content}</p>
          ) : (
            <p className="text-sm text-slate-800">{summary}</p>
          )}
        </div>

        {/* Kotak Info Tambahan */}
        <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs text-slate-600 mt-6 space-y-1">
          <p className="font-semibold text-slate-800">📌 Catatan Pengurus:</p>
          <p>
            Apabila ada pertanyaan lebih lanjut mengenai informasi ini, silakan hubungi pengurus RT/RW atau sekretariat paguyuban melalui menu kontak warga.
          </p>
        </div>
      </div>
    </Drawer>
  );
}
