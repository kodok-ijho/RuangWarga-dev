import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineCalendar,
  AiOutlineEnvironment,
  AiOutlineClockCircle,
  AiOutlineWarning,
  AiOutlineReload,
  AiOutlineClose,
  AiOutlineWhatsApp,
} from 'react-icons/ai';
import Modal from '../../components/Modal';
import { useTenant } from '../../hooks/useTenant';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import {
  fetchTenantEvents,
  createTenantEvent,
  updateTenantEvent,
  deleteTenantEvent,
  uploadAnnouncementImage,
  getAnnouncementImageUrl,
} from '../../services/tenantOperationalService';
import {
  buildGoogleCalendarLink,
  buildEventShareUrl,
  formatEventDateTimeWib,
} from '../../utils/eventLinks';

/**
 * Mengonversi nilai string input datetime-local ("YYYY-MM-DDTHH:mm" atau "YYYY-MM-DDTHH:mm:ss")
 * yang diinterpretasikan sebagai zona waktu Asia/Jakarta (WIB, UTC+7) ke string ISO 8601 UTC.
 *
 * Contoh:
 * '2026-11-01T19:30' -> '2026-11-01T12:30:00.000Z'
 *
 * @param {string} localValue
 * @returns {string|null} ISO 8601 UTC string atau null jika tidak valid
 */
export function datetimeLocalToWibIso(localValue) {
  if (!localValue || typeof localValue !== 'string') return null;
  const trimmed = localValue.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('T');
  if (parts.length !== 2) return null;
  const [datePart, timePart] = parts;
  if (!datePart || !timePart) return null;

  const timeSubParts = timePart.split(':');
  if (timeSubParts.length < 2) return null;
  const hour = timeSubParts[0].padStart(2, '0');
  const minute = timeSubParts[1].padStart(2, '0');
  const second = (timeSubParts[2] || '00').padStart(2, '0');

  const isoWithOffset = `${datePart}T${hour}:${minute}:${second}+07:00`;
  const dateObj = new Date(isoWithOffset);
  if (Number.isNaN(dateObj.getTime())) return null;

  return dateObj.toISOString();
}

/**
 * Mengonversi ISO string atau Date ke string datetime-local ("YYYY-MM-DDTHH:mm")
 * dalam zona waktu Asia/Jakarta (WIB, UTC+7).
 *
 * @param {string|Date} isoString
 * @returns {string} String datetime-local atau '' jika tidak valid
 */
export function isoToWibDatetimeLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const rawHour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;

  if (!year || !month || !day || !rawHour || !minute) return '';
  const hour = rawHour === '24' ? '00' : rawHour.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute.padStart(2, '0')}`;
}

/**
 * Mendapatkan potongan tanggal besar dan bulan untuk blok visual kalender
 * berdasarkan zona waktu Asia/Jakarta (WIB).
 *
 * @param {string|Date} dateInput
 * @returns {{ day: string, month: string, year: string }}
 */
export function getEventDateParts(dateInput) {
  if (!dateInput) return { day: '', month: '', year: '' };
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return { day: '', month: '', year: '' };
  const formatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(d);
  const day = parts.find((p) => p.type === 'day')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const year = parts.find((p) => p.type === 'year')?.value || '';
  return { day, month, year };
}

/**
 * Komponen gambar poster acara yang dimuat asinkron dengan penanganan loading & error.
 */
function EventImage({ imagePath, title }) {
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!imagePath) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);

    getAnnouncementImageUrl(imagePath)
      .then((url) => {
        if (!isMounted) return;
        if (url) {
          setImageUrl(url);
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [imagePath]);

  if (!imagePath) return null;

  if (loading) {
    return (
      <div className="w-full h-48 sm:h-56 bg-slate-100 rounded-xl animate-pulse flex items-center justify-center text-xs text-slate-400">
        Memuat poster acara...
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="w-full py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
        Gagal memuat poster acara
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 max-h-96 flex items-center justify-center">
      <img
        src={imageUrl}
        alt={title || 'Poster acara'}
        className="w-full h-auto max-h-96 object-contain rounded-xl"
        onError={() => setError(true)}
      />
    </div>
  );
}

export default function TenantEvents() {
  const { tenantId: routeTenantId } = useParams();
  const { activeTenantId } = useTenant();
  const tenantId = routeTenantId || activeTenantId;

  const toast = useToast();
  const { canManageAnnouncements } = useTenantAccess();
  const { canTransact, isReadOnly, tooltip } = useSubscriptionGate({
    actionName: 'Kelola acara',
  });
  const canEdit = Boolean(canManageAnnouncements && canTransact);

  // Tab State: 'upcoming' (Mendatang) | 'past' (Selesai)
  const [activeTab, setActiveTab] = useState('upcoming');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // State Modal Buat / Ubah Acara
  const [modalFormOpen, setModalFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [existingImagePath, setExistingImagePath] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // State Modal Konfirmasi Hapus
  const [modalDeleteOpen, setModalDeleteOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Muat daftar acara per tab (scope: 'upcoming' atau 'past')
  const loadEvents = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const data = await fetchTenantEvents(tenantId, { scope: activeTab });
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || 'Gagal memuat agenda acara tenant.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeTab, toast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Buka modal Buat Acara Baru
  const handleOpenCreateModal = () => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDescription('');
    setFormLocation('');
    setFormStartsAt('');
    setFormEndsAt('');
    setSelectedFile(null);
    setExistingImagePath(null);
    setImagePreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setModalFormOpen(true);
  };

  // Buka modal Ubah Acara
  const handleOpenEditModal = (evt) => {
    setEditingEvent(evt);
    setFormTitle(evt.title || '');
    setFormDescription(evt.description || '');
    setFormLocation(evt.location || '');
    setFormStartsAt(isoToWibDatetimeLocal(evt.starts_at));
    setFormEndsAt(isoToWibDatetimeLocal(evt.ends_at));
    setSelectedFile(null);
    setExistingImagePath(evt.image_path || null);
    setImagePreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (evt.image_path) {
      getAnnouncementImageUrl(evt.image_path)
        .then((url) => {
          if (url) setImagePreviewUrl(url);
        })
        .catch(() => {});
    }

    setModalFormOpen(true);
  };

  // Buka modal Konfirmasi Hapus
  const handleOpenDeleteModal = (evt) => {
    setEventToDelete(evt);
    setModalDeleteOpen(true);
  };

  // Validasi dan pilih file gambar poster (maks 5 MB, JPEG/PNG/WebP)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file gambar poster maksimal 5 MB.');
      e.target.value = '';
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Format gambar harus JPEG, PNG, atau WebP.');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  // Hapus gambar pada formulir
  const handleRemoveImage = () => {
    setSelectedFile(null);
    setExistingImagePath(null);
    setImagePreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Simpan acara (Buat atau Ubah)
  const handleSubmitForm = async (e) => {
    e.preventDefault();

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      toast.error('Nama acara wajib diisi.');
      return;
    }
    if (trimmedTitle.length > 150) {
      toast.error('Nama acara maksimal 150 karakter.');
      return;
    }

    if (!formStartsAt) {
      toast.error('Tanggal dan jam mulai acara wajib diisi.');
      return;
    }

    const startsAtIso = datetimeLocalToWibIso(formStartsAt);
    if (!startsAtIso) {
      toast.error('Format tanggal dan jam mulai acara tidak valid.');
      return;
    }

    let endsAtIso = null;
    if (formEndsAt) {
      endsAtIso = datetimeLocalToWibIso(formEndsAt);
      if (!endsAtIso) {
        toast.error('Format tanggal dan jam selesai acara tidak valid.');
        return;
      }
      if (new Date(endsAtIso).getTime() < new Date(startsAtIso).getTime()) {
        toast.error('Waktu selesai tidak boleh sebelum waktu mulai.');
        return;
      }
    }

    if (formDescription && formDescription.length > 5000) {
      toast.error('Deskripsi acara maksimal 5000 karakter.');
      return;
    }

    if (formLocation && formLocation.length > 200) {
      toast.error('Lokasi acara maksimal 200 karakter.');
      return;
    }

    try {
      setIsSubmitting(true);

      // Unggah gambar jika ada file baru yang dipilih
      let finalImagePath = existingImagePath;
      if (selectedFile) {
        finalImagePath = await uploadAnnouncementImage(tenantId, selectedFile);
      }

      const payload = {
        title: trimmedTitle,
        description: formDescription,
        location: formLocation.trim() || null,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        image_path: finalImagePath,
      };

      if (editingEvent) {
        await updateTenantEvent(editingEvent.id, payload);
        toast.success('Acara berhasil diperbarui.');
      } else {
        await createTenantEvent(tenantId, payload);
        toast.success('Acara berhasil dibuat.');
      }

      setModalFormOpen(false);
      await loadEvents();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan acara.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Konfirmasi hapus acara
  const handleConfirmDelete = async () => {
    if (!eventToDelete) return;
    try {
      setIsDeleting(true);
      await deleteTenantEvent(eventToDelete.id);
      toast.success('Acara berhasil dihapus.');
      setModalDeleteOpen(false);
      setEventToDelete(null);
      await loadEvents();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus acara.');
    } finally {
      setIsDeleting(false);
    }
  };

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6">
      {/* ── 1. HEADER SECTION ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Agenda &amp; Acara Komunitas</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Jadwal kegiatan warga, rapat lingkungan, kerja bakti, dan agenda komunitas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadEvents}
            disabled={loading}
            className="p-2 sm:px-3 sm:py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs transition flex items-center gap-1.5"
            title="Segarkan Acara"
          >
            <AiOutlineReload className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>

          {canManageAnnouncements && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={!canEdit}
              title={!canTransact ? tooltip : undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AiOutlinePlus className="text-base" />
              <span>Buat Acara</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 2. READ-ONLY BANNER JIKA BERLAKU ─────────────────────────────────── */}
      {isReadOnly && canManageAnnouncements && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/80 text-amber-800 text-xs flex items-start gap-2.5">
          <AiOutlineWarning className="text-amber-600 text-base shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Mode Hanya-Baca (Read-Only)</p>
            <p className="text-amber-700 mt-0.5">
              {tooltip || 'Acara tidak dapat dibuat, diubah, atau dihapus selama status langganan hanya-baca.'}
            </p>
          </div>
        </div>
      )}

      {/* ── 3. TABS: MENDATANG vs SELESAI ───────────────────────────────────── */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2 ${
            activeTab === 'upcoming'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Mendatang</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('past')}
          className={`pb-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2 ${
            activeTab === 'past'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Selesai</span>
        </button>
      </div>

      {/* ── 4. DAFTAR ACARA ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-200 border-t-emerald-700 animate-spin" />
          <p className="text-xs text-slate-500 mt-3">Memuat agenda acara...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 p-6 space-y-3">
          <span className="text-4xl">🗓️</span>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {activeTab === 'upcoming'
                ? 'Belum ada acara mendatang.'
                : 'Belum ada acara yang selesai.'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'upcoming'
                ? canManageAnnouncements
                  ? 'Gunakan tombol Buat Acara di atas untuk menjadwalkan agenda atau kegiatan baru bagi warga.'
                  : 'Belum ada agenda kegiatan yang dijadwalkan oleh pengurus komunitas.'
                : 'Histori acara yang telah terselenggara akan tercatat di sini.'}
            </p>
          </div>
          {activeTab === 'upcoming' && canManageAnnouncements && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenCreateModal}
                disabled={!canEdit}
                title={!canTransact ? tooltip : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AiOutlinePlus className="text-base" />
                <span>Buat Acara Pertama</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((evt) => {
            const dateParts = getEventDateParts(evt.starts_at);
            const timeWibStr = formatEventDateTimeWib(evt.starts_at, evt.ends_at);
            const shareUrl = buildEventShareUrl(
              evt,
              appOrigin ? `${appOrigin}/t/${tenantId}/events` : ''
            );
            const calendarUrl = buildGoogleCalendarLink({
              title: evt.title,
              description: evt.description,
              location: evt.location,
              starts_at: evt.starts_at,
              ends_at: evt.ends_at,
            });

            return (
              <article
                key={evt.id}
                className="pv-card bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-5 sm:p-6 transition shadow-xs space-y-4"
              >
                {/* Header Kartu: Blok Tanggal, Detail Acara, & Aksi Kelola */}
                <div className="flex items-start gap-3 sm:gap-4 justify-between">
                  <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                    {/* Blok Tanggal Besar + Bulan */}
                    <div className="flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 shrink-0 text-center select-none">
                      <span className="text-xl sm:text-2xl font-black leading-none">
                        {dateParts.day}
                      </span>
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-700 mt-0.5">
                        {dateParts.month}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words">
                        {evt.title}
                      </h2>

                      {/* Jam WIB & Lokasi */}
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-600 font-medium">
                        {timeWibStr && (
                          <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100">
                            <AiOutlineClockCircle className="text-xs" />
                            <span>{timeWibStr}</span>
                          </span>
                        )}

                        {evt.location && (
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <AiOutlineEnvironment className="text-xs text-slate-400" />
                            <span>{evt.location}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tombol Kelola (Ubah & Hapus) */}
                  {canManageAnnouncements && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(evt)}
                        disabled={!canEdit}
                        title={!canTransact ? tooltip : 'Ubah acara'}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AiOutlineEdit className="text-sm" />
                        <span>Ubah</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(evt)}
                        disabled={!canEdit}
                        title={!canTransact ? tooltip : 'Hapus acara'}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-rose-700 hover:bg-rose-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AiOutlineDelete className="text-sm" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Gambar Poster Acara (bila ada) */}
                {evt.image_path && (
                  <EventImage imagePath={evt.image_path} title={evt.title} />
                )}

                {/* Deskripsi Acara (baris baru dipertahankan) */}
                {evt.description && (
                  <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-line leading-relaxed break-words">
                    {evt.description}
                  </p>
                )}

                {/* Footer Kartu: Tombol Bagikan ke WA dan Tambah ke Kalender */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
                    >
                      <AiOutlineWhatsApp className="text-base text-emerald-600" />
                      <span>Bagikan ke WA</span>
                    </a>

                    {activeTab === 'upcoming' && (
                      <a
                        href={calendarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition"
                      >
                        <AiOutlineCalendar className="text-base text-slate-500" />
                        <span>Tambah ke Kalender</span>
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── 5. MODAL FORMULIR (BUAT / UBAH ACARA) ────────────────────────────── */}
      <Modal
        open={modalFormOpen}
        onClose={() => {
          if (!isSubmitting) setModalFormOpen(false);
        }}
        title={editingEvent ? 'Ubah Acara' : 'Buat Acara Baru'}
        size="lg"
      >
        <form onSubmit={handleSubmitForm} className="space-y-4">
          {/* Field Nama Acara */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="event-title" className="font-semibold text-slate-800">
                Nama Acara <span className="text-rose-500">*</span>
              </label>
              <span
                className={`text-[11px] ${
                  formTitle.length > 150 ? 'text-rose-600 font-bold' : 'text-slate-400'
                }`}
              >
                {formTitle.length}/150
              </span>
            </div>
            <input
              id="event-title"
              type="text"
              required
              maxLength={150}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Contoh: Kerja Bakti &amp; Senam Sehat Bersama"
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
            />
          </div>

          {/* Field Waktu Mulai & Waktu Selesai (WIB) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="event-starts-at" className="block text-xs font-semibold text-slate-800">
                Waktu Mulai (WIB) <span className="text-rose-500">*</span>
              </label>
              <input
                id="event-starts-at"
                type="datetime-local"
                required
                value={formStartsAt}
                onChange={(e) => setFormStartsAt(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <p className="text-[10px] text-slate-500">
                Zona Waktu Indonesia Barat (WIB, UTC+7).
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="event-ends-at" className="block text-xs font-semibold text-slate-800">
                Waktu Selesai (WIB, Opsional)
              </label>
              <input
                id="event-ends-at"
                type="datetime-local"
                value={formEndsAt}
                onChange={(e) => setFormEndsAt(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <p className="text-[10px] text-slate-500">
                Kosongkan bila selesai di hari yang sama tanpa jam pasti.
              </p>
            </div>
          </div>

          {/* Field Lokasi Acara */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="event-location" className="font-semibold text-slate-800">
                Lokasi Acara (Opsional)
              </label>
              <span
                className={`text-[11px] ${
                  formLocation.length > 200 ? 'text-rose-600 font-bold' : 'text-slate-400'
                }`}
              >
                {formLocation.length}/200
              </span>
            </div>
            <input
              id="event-location"
              type="text"
              maxLength={200}
              value={formLocation}
              onChange={(e) => setFormLocation(e.target.value)}
              placeholder="Contoh: Balai Warga RT 05 / Lapangan Utama Blok B"
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
            />
          </div>

          {/* Field Deskripsi Acara */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="event-description" className="font-semibold text-slate-800">
                Deskripsi Acara (Opsional)
              </label>
              <span
                className={`text-[11px] ${
                  formDescription.length > 5000 ? 'text-rose-600 font-bold' : 'text-slate-400'
                }`}
              >
                {formDescription.length}/5000
              </span>
            </div>
            <textarea
              id="event-description"
              rows={5}
              maxLength={5000}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Tuliskan susunan agenda, perlengkapan yang perlu dibawa warga, atau informasi tambahan lainnya..."
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
            />
          </div>

          {/* Input Gambar Poster & Pratinjau */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-800">
              Poster / Pamflet Acara (Opsional)
            </label>
            <p className="text-[11px] text-slate-500">
              Format: JPEG, PNG, WebP. Maksimal 5 MB.
            </p>

            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
            </div>

            {/* Pratinjau Gambar */}
            {imagePreviewUrl && (
              <div className="relative mt-2 p-2 bg-slate-50 border border-slate-200 rounded-xl inline-block max-w-full">
                <img
                  src={imagePreviewUrl}
                  alt="Pratinjau poster acara"
                  className="max-h-56 rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-3 right-3 bg-rose-600 hover:bg-rose-700 text-white p-1 rounded-full text-xs shadow-md transition"
                  title="Hapus gambar"
                >
                  <AiOutlineClose />
                </button>
              </div>
            )}
          </div>

          {/* Tombol Aksi Formulir */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setModalFormOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>{editingEvent ? 'Simpan Perubahan' : 'Simpan Acara'}</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── 6. MODAL KONFIRMASI HAPUS ─────────────────────────────────────────── */}
      <Modal
        open={modalDeleteOpen}
        onClose={() => {
          if (!isDeleting) setModalDeleteOpen(false);
        }}
        title="Hapus Acara"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-700 leading-relaxed">
            Apakah Anda yakin ingin menghapus acara{' '}
            <strong className="text-slate-900 font-bold">
              "{eventToDelete?.title}"
            </strong>
            ? Tindakan ini tidak dapat dibatalkan.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setModalDeleteOpen(false)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDeleting ? (
                <>
                  <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Menghapus...</span>
                </>
              ) : (
                <span>Hapus Acara</span>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
