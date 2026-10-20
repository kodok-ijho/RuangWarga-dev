import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlinePushpin,
  AiOutlineWarning,
  AiOutlineReload,
  AiOutlinePicture,
  AiOutlineClose,
  AiOutlineWhatsApp,
} from 'react-icons/ai';
import Modal from '../../components/Modal';
import { useTenant } from '../../hooks/useTenant';
import { useTenantAccess } from '../../hooks/useTenantAccess';
import { useToast } from '../../hooks/useToast';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import {
  fetchTenantAnnouncements,
  createTenantAnnouncement,
  updateTenantAnnouncement,
  deleteTenantAnnouncement,
  uploadAnnouncementImage,
  getAnnouncementImageUrl,
} from '../../services/tenantOperationalService';
import { buildAnnouncementShareUrl } from '../../utils/waReminder';

/**
 * Format tanggal terbit dalam zona waktu Asia/Jakarta (id-ID).
 * Contoh: "20 Oktober 2026"
 */
export function formatAnnouncementDate(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Komponen gambar pengumuman yang dimuat secara asinkron per kartu
 * dengan indikator keadaan memuat dan gagal.
 */
function AnnouncementImage({ imagePath, title }) {
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
        Memuat gambar...
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="w-full py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
        Gagal memuat gambar
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 max-h-96 flex items-center justify-center">
      <img
        src={imageUrl}
        alt={title || 'Gambar pengumuman'}
        className="w-full h-auto max-h-96 object-contain rounded-xl"
        onError={() => setError(true)}
      />
    </div>
  );
}

export default function TenantAnnouncements() {
  const { tenantId: routeTenantId } = useParams();
  const { activeTenantId } = useTenant();
  const tenantId = routeTenantId || activeTenantId;

  const toast = useToast();
  const { canManageAnnouncements } = useTenantAccess();
  const { canTransact, isReadOnly, tooltip } = useSubscriptionGate({
    actionName: 'Kelola pengumuman',
  });
  const canEdit = Boolean(canManageAnnouncements && canTransact);

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  // State Modal Buat / Ubah
  const [modalFormOpen, setModalFormOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null); // null = Buat baru
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [existingImagePath, setExistingImagePath] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // State Modal Konfirmasi Hapus
  const [modalDeleteOpen, setModalDeleteOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Muat daftar pengumuman
  const loadAnnouncements = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const data = await fetchTenantAnnouncements(tenantId);
      // Pastikan urutan: yang disematkan dulu, lalu terbaru
      const sorted = [...(data || [])].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        const timeA = new Date(a.published_at || a.created_at || 0).getTime();
        const timeB = new Date(b.published_at || b.created_at || 0).getTime();
        return timeB - timeA;
      });
      setAnnouncements(sorted);
    } catch (err) {
      toast.error(err.message || 'Gagal memuat pengumuman tenant.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  // Buka modal Buat Baru
  const handleOpenCreateModal = () => {
    setEditingAnnouncement(null);
    setFormTitle('');
    setFormBody('');
    setFormIsPinned(false);
    setSelectedFile(null);
    setExistingImagePath(null);
    setImagePreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setModalFormOpen(true);
  };

  // Buka modal Ubah
  const handleOpenEditModal = (ann) => {
    setEditingAnnouncement(ann);
    setFormTitle(ann.title || '');
    setFormBody(ann.body || '');
    setFormIsPinned(Boolean(ann.is_pinned));
    setSelectedFile(null);
    setExistingImagePath(ann.image_path || null);
    setImagePreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (ann.image_path) {
      getAnnouncementImageUrl(ann.image_path)
        .then((url) => {
          if (url) setImagePreviewUrl(url);
        })
        .catch(() => {});
    }

    setModalFormOpen(true);
  };

  // Buka modal Hapus
  const handleOpenDeleteModal = (ann) => {
    setAnnouncementToDelete(ann);
    setModalDeleteOpen(true);
  };

  // Tangani pemilihan file gambar dengan validasi ukuran 5 MB & format
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file gambar maksimal 5 MB.');
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

  // Simpan pengumuman (Buat atau Ubah)
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error('Judul pengumuman wajib diisi.');
      return;
    }
    if (formTitle.length > 150) {
      toast.error('Judul pengumuman maksimal 150 karakter.');
      return;
    }
    if (formBody.length > 5000) {
      toast.error('Isi pengumuman maksimal 5000 karakter.');
      return;
    }

    try {
      setIsSubmitting(true);

      // Unggah gambar terlebih dahulu jika ada file baru
      let finalImagePath = existingImagePath;
      if (selectedFile) {
        finalImagePath = await uploadAnnouncementImage(tenantId, selectedFile);
      }

      if (editingAnnouncement) {
        await updateTenantAnnouncement(editingAnnouncement.id, {
          title: formTitle.trim(),
          body: formBody,
          is_pinned: formIsPinned,
          image_path: finalImagePath,
        });
        toast.success('Pengumuman berhasil diperbarui.');
      } else {
        await createTenantAnnouncement(tenantId, {
          title: formTitle.trim(),
          body: formBody,
          is_pinned: formIsPinned,
          image_path: finalImagePath,
        });
        toast.success('Pengumuman berhasil dibuat.');
      }

      setModalFormOpen(false);
      await loadAnnouncements();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan pengumuman.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Konfirmasi hapus pengumuman
  const handleConfirmDelete = async () => {
    if (!announcementToDelete) return;
    try {
      setIsDeleting(true);
      await deleteTenantAnnouncement(announcementToDelete.id);
      toast.success('Pengumuman berhasil dihapus.');
      setModalDeleteOpen(false);
      setAnnouncementToDelete(null);
      await loadAnnouncements();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus pengumuman.');
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
            <span>Pengumuman Komunitas</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Informasi penting, kabar warga, dan pengumuman resmi pengurus.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAnnouncements}
            disabled={loading}
            className="p-2 sm:px-3 sm:py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs transition flex items-center gap-1.5"
            title="Segarkan Pengumuman"
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
              <span>Buat Pengumuman</span>
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
              {tooltip || 'Pengumuman tidak dapat dibuat, diubah, atau dihapus selama status langganan hanya-baca.'}
            </p>
          </div>
        </div>
      )}

      {/* ── 3. DAFTAR PENGUMUMAN ────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-200 border-t-emerald-700 animate-spin" />
          <p className="text-xs text-slate-500 mt-3">Memuat daftar pengumuman...</p>
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 p-6 space-y-3">
          <span className="text-4xl">📢</span>
          <div>
            <p className="text-sm font-bold text-slate-800">Belum ada pengumuman.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {canManageAnnouncements
                ? 'Gunakan tombol Buat Pengumuman di atas untuk menerbitkan informasi pertama kepada warga.'
                : 'Belum ada pengumuman yang diterbitkan oleh pengurus komunitas.'}
            </p>
          </div>
          {canManageAnnouncements && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenCreateModal}
                disabled={!canEdit}
                title={!canTransact ? tooltip : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AiOutlinePlus className="text-base" />
                <span>Buat Pengumuman Pertama</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => {
            const shareUrl = buildAnnouncementShareUrl({
              title: ann.title,
              body: ann.body,
              tenantId,
              origin: appOrigin,
            });

            return (
              <article
                key={ann.id}
                className={`pv-card bg-white rounded-2xl border p-5 sm:p-6 transition shadow-xs space-y-4 ${
                  ann.is_pinned
                    ? 'border-amber-300 ring-1 ring-amber-200 bg-amber-50/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header Kartu: Status Pin, Tanggal, & Aksi Kelola */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ann.is_pinned && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <AiOutlinePushpin className="text-xs text-amber-700" />
                        <span>Disematkan</span>
                      </span>
                    )}
                    <time
                      dateTime={ann.published_at || ann.created_at}
                      className="text-xs font-medium text-slate-500"
                    >
                      {formatAnnouncementDate(ann.published_at || ann.created_at)}
                    </time>
                  </div>

                  {canManageAnnouncements && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(ann)}
                        disabled={!canEdit}
                        title={!canTransact ? tooltip : 'Ubah pengumuman'}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AiOutlineEdit className="text-sm" />
                        <span>Ubah</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(ann)}
                        disabled={!canEdit}
                        title={!canTransact ? tooltip : 'Hapus pengumuman'}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-rose-700 hover:bg-rose-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AiOutlineDelete className="text-sm" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Judul Pengumuman */}
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  {ann.title}
                </h2>

                {/* Gambar (bila ada) */}
                {ann.image_path && (
                  <AnnouncementImage imagePath={ann.image_path} title={ann.title} />
                )}

                {/* Isi Pengumuman (baris baru dipertahankan) */}
                {ann.body && (
                  <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-line leading-relaxed break-words">
                    {ann.body}
                  </p>
                )}

                {/* Footer Kartu: Tombol Bagikan ke WA */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
                  >
                    <AiOutlineWhatsApp className="text-base text-emerald-600" />
                    <span>Bagikan ke WA</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── 4. MODAL FORMULIR (BUAT / UBAH PENGUMUMAN) ──────────────────────── */}
      <Modal
        open={modalFormOpen}
        onClose={() => {
          if (!isSubmitting) setModalFormOpen(false);
        }}
        title={editingAnnouncement ? 'Ubah Pengumuman' : 'Buat Pengumuman Baru'}
        size="lg"
      >
        <form onSubmit={handleSubmitForm} className="space-y-4">
          {/* Field Judul */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="announcement-title" className="font-semibold text-slate-800">
                Judul Pengumuman <span className="text-rose-500">*</span>
              </label>
              <span className={`text-[11px] ${formTitle.length > 150 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                {formTitle.length}/150
              </span>
            </div>
            <input
              id="announcement-title"
              type="text"
              required
              maxLength={150}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Contoh: Kerja Bakti Kebersihan Lingkungan RT 05"
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
            />
          </div>

          {/* Field Isi Pengumuman */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="announcement-body" className="font-semibold text-slate-800">
                Isi Pengumuman
              </label>
              <span className={`text-[11px] ${formBody.length > 5000 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                {formBody.length}/5000
              </span>
            </div>
            <textarea
              id="announcement-body"
              rows={6}
              maxLength={5000}
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder="Tuliskan isi pengumuman lengkap. Baris baru akan dipertahankan saat ditampilkan ke warga..."
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
            />
          </div>

          {/* Checkbox Sematkan di Atas */}
          <div className="flex items-center gap-2 pt-1">
            <input
              id="announcement-pin"
              type="checkbox"
              checked={formIsPinned}
              onChange={(e) => setFormIsPinned(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
            />
            <label htmlFor="announcement-pin" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
              Sematkan di atas (prioritas utama pada daftar pengumuman)
            </label>
          </div>

          {/* Input Gambar & Pratinjau */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-800">
              Poster / Gambar Lampiran (Opsional)
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
                  alt="Pratinjau poster pengumuman"
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
                <span>{editingAnnouncement ? 'Simpan Perubahan' : 'Terbitkan Pengumuman'}</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── 5. MODAL KONFIRMASI HAPUS ───────────────────────────────────────── */}
      <Modal
        open={modalDeleteOpen}
        onClose={() => {
          if (!isDeleting) setModalDeleteOpen(false);
        }}
        title="Hapus Pengumuman"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-700 leading-relaxed">
            Apakah Anda yakin ingin menghapus pengumuman{' '}
            <strong className="text-slate-900 font-bold">
              "{announcementToDelete?.title}"
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
                <span>Hapus Pengumuman</span>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
