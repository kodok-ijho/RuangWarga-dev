import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AiOutlineArrowLeft,
  AiOutlineEnvironment,
  AiOutlineStar,
  AiOutlineShareAlt,
  AiOutlineCheckCircle,
  AiOutlineInfoCircle,
  AiOutlineLeft,
  AiOutlineRight,
} from 'react-icons/ai';
import { FaWhatsapp } from 'react-icons/fa';
import {
  fetchPublicListingById,
  resolveListingFacilities,
  buildListingWhatsAppUrl,
} from '../../services/publicListingService';
import {
  getFacilityIcon,
  formatRupiah,
  RoomImagePlaceholder,
} from './RoomListingDirectory';

/**
 * Menyelesaikan nama kos atau pengelola dari data listing
 */
export function resolveKosName(listing) {
  if (!listing) return 'Pengelola Kos';
  if (listing.tenant_name) return listing.tenant_name;
  if (listing.tenant?.name) return listing.tenant.name;
  if (listing.tenant_id === 'demo-tenant-kos') return 'Kos Melati Harmoni';

  // Ekstraksi nama kos dari judul bila berformat "Kamar X - Kos Y"
  if (listing.title && listing.title.includes(' - ')) {
    const parts = listing.title.split(' - ').map((s) => s.trim());
    const kosPart = parts.find((p) => /kos\b/i.test(p));
    if (kosPart) return kosPart;
    if (parts[1] && !/^kamar\b/i.test(parts[1])) return parts[1];
  }

  return 'Pengelola Kos';
}

export default function RoomListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [photoErrors, setPhotoErrors] = useState({});
  const [copied, setCopied] = useState(false);

  // Touch tracking untuk swipe galeri di HP (tanpa library eksternal)
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  useEffect(() => {
    let isMounted = true;
    async function loadDetail() {
      setLoading(true);
      try {
        const data = await fetchPublicListingById(id);
        if (isMounted) setListing(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Gagal memuat detail kamar kos:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (id) {
      loadDetail();
    }
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: listing?.title || 'Kamar Kos di RuangWarga',
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div
        data-testid="detail-loading-skeleton"
        className="flex min-h-screen items-center justify-center bg-forest-50/40"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-forest-800 border-t-transparent" />
          <p className="text-xs font-semibold text-forest-700">Memuat informasi kamar kos...</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div
        data-testid="detail-not-found"
        className="flex min-h-screen flex-col items-center justify-center bg-forest-50/40 p-4 text-center"
      >
        <div className="max-w-md rounded-2xl border border-forest-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl text-amber-600">
            <AiOutlineInfoCircle />
          </div>
          <h2 className="font-serif text-xl font-bold text-forest-900">Kamar Tidak Ditemukan</h2>
          <p className="mt-2 text-xs leading-relaxed text-forest-500">
            Iklan kamar ini mungkin telah habis masa tayangnya, dinonaktifkan oleh pemilik kos,
            atau tautan yang Anda tuju sudah tidak valid.
          </p>
          <Link
            to="/listing/kos"
            className="pv-btn-primary mt-6 inline-flex items-center gap-2 text-xs"
          >
            <AiOutlineArrowLeft /> Kembali ke Katalog Kamar Kos
          </Link>
        </div>
      </div>
    );
  }

  // Pengolahan data listing
  const rawPhotos = Array.isArray(listing.photos) ? listing.photos.filter(Boolean) : [];
  const photos = rawPhotos.filter((_, idx) => !photoErrors[idx]);
  const hasPhotos = photos.length > 0;
  const currentPhoto = hasPhotos ? photos[activePhotoIdx] || photos[0] : null;

  const kosName = resolveKosName(listing);
  const facilities = resolveListingFacilities(listing);
  const waUrl = buildListingWhatsAppUrl(listing, kosName);

  // Swipe event handlers untuk galeri foto di HP
  const handleTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  };

  const handleTouchMove = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null || photos.length <= 1) return;
    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 45;

    if (diff > minSwipeDistance) {
      // Swipe kiri -> foto berikutnya
      setActivePhotoIdx((prev) => (prev + 1) % photos.length);
    } else if (diff < -minSwipeDistance) {
      // Swipe kanan -> foto sebelumnya
      setActivePhotoIdx((prev) => (prev - 1 + photos.length) % photos.length);
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  const prevPhoto = () => {
    if (photos.length <= 1) return;
    setActivePhotoIdx((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const nextPhoto = () => {
    if (photos.length <= 1) return;
    setActivePhotoIdx((prev) => (prev + 1) % photos.length);
  };

  // Badge tipe kos (Putra / Putri / Campur)
  const categoryLabel = listing.category ? String(listing.category).trim() : null;
  const categoryLower = categoryLabel ? categoryLabel.toLowerCase() : '';
  let categoryBadgeClass = 'bg-forest-800 text-white';
  if (categoryLower === 'putra') {
    categoryBadgeClass = 'bg-sky-800 text-sky-50 border border-sky-400/30';
  } else if (categoryLower === 'putri') {
    categoryBadgeClass = 'bg-rose-800 text-rose-50 border border-rose-400/30';
  } else if (categoryLower === 'campur') {
    categoryBadgeClass = 'bg-amber-800 text-amber-50 border border-amber-400/30';
  }

  return (
    <div className="min-h-screen bg-forest-50/40 text-forest-900 selection:bg-gold-500 selection:text-white">
      {/* 1. HEADER NAVIGASI / BREADCRUMB */}
      <header className="sticky top-0 z-30 border-b border-forest-100 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/listing/kos');
              }
            }}
            className="flex items-center gap-2 text-xs font-semibold text-forest-700 hover:text-forest-900 transition-colors"
          >
            <AiOutlineArrowLeft className="text-base" /> Kembali ke Katalog
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-xl border border-forest-200 bg-white px-3 py-1.5 text-xs font-semibold text-forest-700 hover:bg-forest-50 transition-colors"
            >
              <AiOutlineShareAlt className="text-sm" />
              {copied ? 'Tautan Disalin!' : 'Bagikan'}
            </button>
            <Link to="/listing/kos" className="pv-btn-primary text-xs py-1.5 px-3">
              Cari Kos Lain
            </Link>
          </div>
        </div>
      </header>

      {/* 2. KONTEN DETAIL UTAMA DENGAN PADDING BAWAH EXTRA UNTUK MOBILE */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 pb-28 lg:pb-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* KOLOM KIRI (FOTO, DETAIL & FASILITAS) */}
          <div className="lg:col-span-2 space-y-6">
            {/* GALERI FOTO */}
            <div
              data-testid="listing-gallery"
              className="overflow-hidden rounded-2xl bg-white border border-forest-100 shadow-xs"
            >
              {/* Gambar Besar dengan Touch Swipe Support */}
              <div
                data-testid="gallery-main-container"
                className="relative aspect-[16/10] w-full bg-forest-100 select-none overflow-hidden touch-pan-y"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {hasPhotos ? (
                  <img
                    key={currentPhoto}
                    src={currentPhoto}
                    alt={listing.title}
                    className="h-full w-full object-cover transition-opacity duration-300"
                    onError={() => {
                      setPhotoErrors((prev) => ({ ...prev, [activePhotoIdx]: true }));
                    }}
                  />
                ) : (
                  <RoomImagePlaceholder className="h-full w-full" />
                )}

                {/* Badge Unggulan (Kiri Atas) */}
                {listing.is_featured && (
                  <span
                    data-testid="badge-featured"
                    className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-gold-500 px-3 py-1 text-xs font-extrabold text-white shadow-md select-none"
                  >
                    <AiOutlineStar className="text-white text-sm" /> Kamar Unggulan
                  </span>
                )}

                {/* Badge Tipe / Kategori (Kanan Atas) */}
                {categoryLabel && (
                  <span
                    data-testid="badge-category"
                    className={`absolute right-4 top-4 rounded-lg px-3 py-1 text-xs font-bold shadow-md select-none ${categoryBadgeClass}`}
                  >
                    {categoryLabel}
                  </span>
                )}

                {/* Navigasi Panah Gambar Besar (Desktop / Touch) */}
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevPhoto}
                      aria-label="Foto sebelumnya"
                      className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 backdrop-blur-xs transition-colors"
                    >
                      <AiOutlineLeft className="text-sm" />
                    </button>
                    <button
                      type="button"
                      onClick={nextPhoto}
                      aria-label="Foto berikutnya"
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 backdrop-blur-xs transition-colors"
                    >
                      <AiOutlineRight className="text-sm" />
                    </button>

                    {/* Counter Foto */}
                    <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
                      {activePhotoIdx + 1} / {photos.length}
                    </span>
                  </>
                )}
              </div>

              {/* Thumbnails Foto bila foto > 1 */}
              {photos.length > 1 && (
                <div
                  data-testid="gallery-thumbnails"
                  className="flex gap-2.5 p-3 overflow-x-auto border-t border-forest-100 bg-forest-50/30"
                >
                  {photos.map((src, idx) => (
                    <button
                      key={idx}
                      type="button"
                      data-testid={`gallery-thumb-${idx}`}
                      onClick={() => setActivePhotoIdx(idx)}
                      className={`relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                        activePhotoIdx === idx
                          ? 'border-forest-800 ring-2 ring-forest-500 scale-[1.02]'
                          : 'border-transparent opacity-65 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={src}
                        alt={`Thumbnail ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* INFORMASI UTAMA: JUDUL, BADGE, LOKASI */}
            <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {categoryLabel && (
                  <span
                    className={`rounded-lg px-2.5 py-0.5 text-xs font-bold ${categoryBadgeClass}`}
                  >
                    {categoryLabel}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                  <AiOutlineCheckCircle className="text-emerald-600" /> Siap Huni
                </span>
                {listing.is_featured && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                    Iklan Prioritas
                  </span>
                )}
              </div>

              <h1
                data-testid="listing-title"
                className="font-serif text-2xl font-bold text-forest-900 sm:text-3xl leading-snug"
              >
                {listing.title}
              </h1>

              <div className="mt-2.5 flex items-center gap-2 text-xs sm:text-sm text-forest-600">
                <AiOutlineEnvironment className="text-forest-500 text-base flex-shrink-0" />
                <span data-testid="listing-location">
                  {listing.location_hint || 'Lokasi strategis, dekat fasilitas umum'}
                </span>
              </div>
            </div>

            {/* INFO PENGELOLA (NAMA KOS) */}
            <div
              data-testid="listing-manager-info"
              className="flex items-center gap-3.5 rounded-2xl border border-forest-100 bg-white p-5 shadow-xs"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-forest-800 text-white font-serif font-bold text-lg shadow-sm">
                {kosName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-forest-500 uppercase tracking-wider block">
                  Dikelola Oleh
                </span>
                <h3
                  data-testid="listing-kos-name"
                  className="font-serif text-base font-bold text-forest-900 truncate"
                >
                  {kosName}
                </h3>
                <p className="text-xs text-forest-600 mt-0.5">
                  Pengelola Terverifikasi di RuangWarga
                </p>
              </div>
            </div>

            {/* DAFTAR FASILITAS LENGKAP BERIKON */}
            <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-xs space-y-4">
              <h2 className="font-serif text-lg font-bold text-forest-900">
                Fasilitas Kamar & Sekitar
              </h2>

              {facilities.length > 0 ? (
                <div
                  data-testid="listing-facilities-grid"
                  className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                >
                  {facilities.map((fac, idx) => {
                    const IconComponent = getFacilityIcon(fac);
                    return (
                      <div
                        key={idx}
                        data-testid="facility-full-item"
                        className="flex items-center gap-3 rounded-xl border border-forest-100 bg-forest-50/50 p-3 text-forest-800"
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-forest-200 text-forest-700 text-lg shadow-2xs">
                          <IconComponent />
                        </div>
                        <span className="text-xs font-semibold leading-tight">{fac}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-forest-100 bg-forest-50/30 p-4 text-xs text-forest-500 italic">
                  Fasilitas standar siap huni. Hubungi pengelola untuk detail fasilitas kamar yang tersedia.
                </div>
              )}
            </div>

            {/* DESKRIPSI LENGKAP */}
            <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-xs space-y-3">
              <h2 className="font-serif text-lg font-bold text-forest-900">
                Deskripsi Kamar
              </h2>
              <div
                data-testid="listing-description"
                className="text-sm leading-relaxed text-forest-700 whitespace-pre-line"
              >
                {listing.description || 'Tidak ada deskripsi tambahan dari pemilik iklan.'}
              </div>
            </div>
          </div>

          {/* KOLOM KANAN DESKTOP (KOTAK HARGA MENEMPEL / STICKY) */}
          <div className="hidden lg:block">
            <div
              data-testid="desktop-price-card"
              className="sticky top-20 rounded-2xl border border-forest-100 bg-white p-6 shadow-md space-y-5"
            >
              <div>
                <span className="text-xs font-semibold text-forest-500 uppercase tracking-wider block">
                  Harga Sewa
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    data-testid="desktop-price-text"
                    className="font-serif text-3xl font-extrabold text-forest-900"
                  >
                    {formatRupiah(listing.price)}
                  </span>
                  <span className="text-xs font-semibold text-forest-500">/ bulan</span>
                </div>
              </div>

              <div className="rounded-xl border border-forest-100 bg-forest-50/60 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-forest-600">Status Kamar</span>
                  <span className="font-semibold text-emerald-800">Tersedia / Siap Huni</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-forest-600">Pengelola</span>
                  <span className="font-semibold text-forest-900 truncate max-w-[150px]">
                    {kosName}
                  </span>
                </div>
              </div>

              {/* Tombol Hijau WhatsApp Desktop */}
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="desktop-wa-button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3.5 text-sm font-bold text-white shadow-md transition-colors"
                >
                  <FaWhatsapp className="text-lg flex-shrink-0" />
                  <span>Hubungi via WhatsApp</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  data-testid="desktop-wa-button-disabled"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-100 px-4 py-3.5 text-xs font-semibold text-forest-400 cursor-not-allowed"
                >
                  <FaWhatsapp className="text-base" />
                  <span>Nomor WhatsApp Tidak Tersedia</span>
                </button>
              )}

              <div className="rounded-xl bg-blue-50/80 p-3.5 text-[11px] leading-relaxed text-blue-900 flex items-start gap-2.5 border border-blue-100">
                <AiOutlineInfoCircle className="text-base text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  Lakukan survei fisik ke kamar sebelum transfer uang muka atau biaya sewa guna memastikan kondisi kamar.
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. BAR BAWAH TETAP (FIXED) DI HP */}
      <aside
        data-testid="mobile-bottom-bar"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-forest-100 bg-white/95 px-4 py-3 backdrop-blur-md shadow-lg lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-forest-500 uppercase tracking-wider block">
              Harga Sewa
            </span>
            <div className="flex items-baseline gap-1 truncate">
              <span
                data-testid="mobile-price-text"
                className="font-serif text-lg font-extrabold text-forest-900 truncate"
              >
                {formatRupiah(listing.price)}
              </span>
              <span className="text-[11px] font-semibold text-forest-500 flex-shrink-0">/ bln</span>
            </div>
          </div>

          <div className="flex-shrink-0">
            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="mobile-wa-button"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-colors"
              >
                <FaWhatsapp className="text-base" />
                <span>Hubungi via WhatsApp</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                data-testid="mobile-wa-button-disabled"
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-forest-100 px-3 py-2 text-xs font-semibold text-forest-400 cursor-not-allowed"
              >
                <span>Kontak Tidak Tersedia</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
