import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AiOutlineSearch,
  AiOutlineHome,
  AiOutlineEnvironment,
  AiOutlinePhone,
  AiOutlineStar,
  AiOutlineAppstore,
  AiOutlineClose,
  AiOutlinePlus,
} from 'react-icons/ai';
import {
  TbAirConditioning,
  TbBath,
  TbBed,
  TbHanger,
  TbWifi,
  TbFlame,
  TbToolsKitchen2,
  TbBolt,
  TbCheck,
} from 'react-icons/tb';
import { MdDesk } from 'react-icons/md';
import { HiOutlineSparkles } from 'react-icons/hi';
import { fetchPublicListings, filterAndSortRoomListings } from '../../services/publicListingService';
import { KOS_FACILITIES } from '../../config/kosFacilities';

/**
 * Pemetaan nama fasilitas standar kos ke ikon Tabler / Material UI
 */
export const FACILITY_ICON_MAP = {
  'AC': TbAirConditioning,
  'Kamar Mandi Dalam': TbBath,
  'Kasur & Bantal': TbBed,
  'Lemari Pakaian': TbHanger,
  'Meja Belajar': MdDesk,
  'WiFi Internet': TbWifi,
  'Water Heater': TbFlame,
  'Dapur Bersama': TbToolsKitchen2,
  'Listrik Token Mandiri': TbBolt,
};

/**
 * Mengambil komponen ikon yang sesuai untuk sebuah fasilitas
 */
export function getFacilityIcon(facilityName) {
  if (!facilityName) return TbCheck;
  if (FACILITY_ICON_MAP[facilityName]) return FACILITY_ICON_MAP[facilityName];

  const lower = String(facilityName).toLowerCase();
  if (lower.includes('ac') || lower.includes('pendingin')) return TbAirConditioning;
  if (lower.includes('kamar mandi') || lower.includes('toilet') || lower.includes('bath')) return TbBath;
  if (lower.includes('kasur') || lower.includes('bed') || lower.includes('springbed') || lower.includes('bantal')) return TbBed;
  if (lower.includes('lemari') || lower.includes('wardrobe') || lower.includes('hanger')) return TbHanger;
  if (lower.includes('meja') || lower.includes('kursi') || lower.includes('desk')) return MdDesk;
  if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet')) return TbWifi;
  if (lower.includes('heater') || lower.includes('pemanas') || lower.includes('air panas')) return TbFlame;
  if (lower.includes('dapur') || lower.includes('kitchen')) return TbToolsKitchen2;
  if (lower.includes('listrik') || lower.includes('token')) return TbBolt;

  return TbCheck;
}

/**
 * Format angka ke mata uang Rupiah
 */
export function formatRupiah(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Hubungi Pengelola';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Placeholder / Fallback ilustrasi foto kamar kos rasio 4:3
 */
export function RoomImagePlaceholder({ className = '' }) {
  return (
    <div
      data-testid="room-photo-placeholder"
      className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-forest-50 via-forest-100/60 to-forest-200/40 p-4 text-center select-none ${className}`}
    >
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-forest-100 bg-white/90 text-forest-700 shadow-sm">
        <AiOutlineHome className="text-2xl" />
      </div>
      <span className="text-xs font-semibold text-forest-700">Foto belum tersedia</span>
      <span className="mt-0.5 text-[10px] text-forest-400">Kamar Kos RuangWarga</span>
    </div>
  );
}

/**
 * Kartu komponen untuk satu kamar kos di katalog / direktori (LIST-UI-1.2)
 * Rasio 4:3 foto utama, badge Putra/Putri/Campur, nama kos + kamar, lokasi,
 * maks 4 ikon fasilitas + '+N', harga besar Rp X / bulan, badge Unggulan.
 */
export function RoomListingCard({ listing }) {
  const [imgError, setImgError] = useState(false);

  const photos = Array.isArray(listing.photos) ? listing.photos.filter(Boolean) : [];
  const hasPhoto = photos.length > 0 && !imgError;
  const photoUrl = hasPhoto ? photos[0] : null;

  // Fasilitas
  const facilities = Array.isArray(listing.facilities) ? listing.facilities : [];
  const visibleFacilities = facilities.slice(0, 4);
  const remainingFacilityCount = facilities.length > 4 ? facilities.length - 4 : 0;

  // WhatsApp link
  const cleanPhone = String(listing.contact_phone || '').replace(/[^0-9]/g, '');
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(
        `Halo, saya melihat kamar "${listing.title}" di RuangWarga dan berminat menyewa. Apakah masih tersedia?`
      )}`
    : null;

  // Badge Kategori Styling
  const categoryLabel = listing.category ? String(listing.category).trim() : null;
  const categoryLower = categoryLabel ? categoryLabel.toLowerCase() : '';
  let categoryBadgeClass = 'bg-forest-800/90 text-white';
  if (categoryLower === 'putra') {
    categoryBadgeClass = 'bg-sky-800/95 text-sky-50 border border-sky-400/30';
  } else if (categoryLower === 'putri') {
    categoryBadgeClass = 'bg-rose-800/95 text-rose-50 border border-rose-400/30';
  } else if (categoryLower === 'campur') {
    categoryBadgeClass = 'bg-amber-800/95 text-amber-50 border border-amber-400/30';
  }

  return (
    <article
      data-testid="room-listing-card"
      className={`group flex flex-col rounded-2xl bg-white overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        listing.is_featured
          ? 'border-2 border-amber-400/90 shadow-md ring-1 ring-amber-200/50'
          : 'border border-forest-100 shadow-sm'
      }`}
    >
      {/* 1. FOTO UTAMA RASIO 4:3 DENGAN BADGE */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-forest-100">
        <Link
          to={`/listing/kos/${listing.id}`}
          className="block h-full w-full focus:outline-none"
          tabIndex={-1}
        >
          {hasPhoto ? (
            <img
              src={photoUrl}
              alt={listing.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <RoomImagePlaceholder />
          )}
        </Link>

        {/* Badge Unggulan (Kiri Atas) */}
        {listing.is_featured && (
          <span
            data-testid="badge-featured"
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-gold-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-md select-none"
          >
            <AiOutlineStar className="text-white text-xs" /> Unggulan
          </span>
        )}

        {/* Badge Tipe / Kategori Putra, Putri, Campur (Kanan Atas) */}
        {categoryLabel && (
          <span
            data-testid="badge-category"
            className={`absolute right-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur-sm select-none ${categoryBadgeClass}`}
          >
            {categoryLabel}
          </span>
        )}
      </div>

      {/* 2. DETAIL INFORMASI KARTU */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {/* Nama Kos + Kamar */}
        <h3 className="font-serif text-base font-bold text-forest-900 line-clamp-1 group-hover:text-forest-700 transition-colors">
          <Link to={`/listing/kos/${listing.id}`} className="hover:underline focus:outline-none">
            {listing.title}
          </Link>
        </h3>

        {/* Lokasi */}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-forest-600 line-clamp-1">
          <AiOutlineEnvironment className="text-forest-500 flex-shrink-0 text-sm" />
          <span>{listing.location_hint || 'Lokasi strategis'}</span>
        </div>

        {/* Fasilitas Kamar (Maksimal 4 ikon fasilitas + '+N') */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap" data-testid="facility-icons-wrapper">
          {visibleFacilities.map((fac, idx) => {
            const IconComponent = getFacilityIcon(fac);
            return (
              <span
                key={idx}
                data-testid="facility-icon-item"
                title={fac}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-forest-50 border border-forest-100 text-forest-700 text-sm transition-colors hover:bg-forest-100"
              >
                <IconComponent />
              </span>
            );
          })}

          {remainingFacilityCount > 0 && (
            <span
              data-testid="facility-overflow-badge"
              title={`${remainingFacilityCount} fasilitas lainnya`}
              className="inline-flex h-7 px-2 items-center justify-center rounded-lg bg-forest-100 text-[11px] font-bold text-forest-800 border border-forest-200/60 select-none"
            >
              +{remainingFacilityCount}
            </span>
          )}

          {facilities.length === 0 && (
            <span className="text-[11px] text-forest-400 italic">
              Fasilitas standar siap huni
            </span>
          )}
        </div>

        {/* 3. HARGA BESAR 'Rp X / bulan' & AKSI */}
        <div className="mt-auto pt-4 border-t border-forest-100 flex items-center justify-between gap-2">
          <div data-testid="listing-price-container">
            <span className="text-lg sm:text-xl font-extrabold text-forest-900 block leading-tight">
              {formatRupiah(listing.price)}
            </span>
            {listing.price && (
              <span className="text-[11px] text-forest-500 font-medium">/ bulan</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              to={`/listing/kos/${listing.id}`}
              className="rounded-xl bg-forest-50 hover:bg-forest-100 border border-forest-200 px-3 py-1.5 text-xs font-bold text-forest-800 transition-colors"
            >
              Detail
            </Link>

            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Chat via WhatsApp"
                aria-label={`Chat WhatsApp untuk kamar ${listing.title}`}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors"
              >
                <AiOutlinePhone className="text-sm" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Skeleton Loader Kartu untuk loading state ala marketplace
 */
export function RoomListingSkeleton() {
  return (
    <div
      data-testid="room-listing-skeleton"
      className="flex flex-col rounded-2xl bg-white border border-forest-100 shadow-sm overflow-hidden animate-pulse"
    >
      <div className="aspect-[4/3] w-full bg-forest-100/70" />
      <div className="p-4 sm:p-5 space-y-3">
        <div className="h-5 w-3/4 rounded bg-forest-100/80" />
        <div className="h-3.5 w-1/2 rounded bg-forest-100/60" />
        <div className="flex gap-1.5 pt-1">
          <div className="h-7 w-7 rounded-lg bg-forest-100/70" />
          <div className="h-7 w-7 rounded-lg bg-forest-100/70" />
          <div className="h-7 w-7 rounded-lg bg-forest-100/70" />
          <div className="h-7 w-7 rounded-lg bg-forest-100/70" />
        </div>
        <div className="pt-3 border-t border-forest-100 flex items-center justify-between">
          <div className="h-6 w-28 rounded bg-forest-100/80" />
          <div className="h-8 w-16 rounded-xl bg-forest-100/70" />
        </div>
      </div>
    </div>
  );
}

/**
 * Halaman Direktori Katalog Kamar Kos Publik (LIST-UI-1.2)
 * Lapisan /listing netral RuangWarga tanpa branding tenant.
 */
export const TYPE_OPTIONS = [
  { label: 'Semua Tipe', value: 'all' },
  { label: 'Putra', value: 'Putra' },
  { label: 'Putri', value: 'Putri' },
  { label: 'Campur', value: 'Campur' },
];

export const PRICE_OPTIONS = [
  { label: 'Semua Harga', value: 'all' },
  { label: '< 1 Juta', value: 'under1m' },
  { label: '1 - 2 Juta', value: '1m-2m' },
  { label: '> 2 Juta', value: 'above2m' },
];

/**
 * Halaman Direktori Katalog Kamar Kos Publik (LIST-UI-1.2 & LIST-UI-1.3)
 * Lapisan /listing netral RuangWarga tanpa branding tenant.
 * Dilengkapi filter chip tipe, harga, fasilitas multi-pilih, dan urutan yang tersimpan di URL.
 */
export default function RoomListingDirectory() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Membaca filter dari URL Search Params (LIST-UI-1.3)
  const categoryFilter = searchParams.get('category') || 'all';
  const priceFilter = searchParams.get('price') || 'all';
  const sortOption = searchParams.get('sort') || 'terbaru';
  const searchQuery = searchParams.get('q') || '';
  const featuredOnly = searchParams.get('featured') === 'true';

  const facilitiesParam = searchParams.get('facilities');
  const selectedFacilities = useMemo(() => {
    if (!facilitiesParam) return [];
    return facilitiesParam.split(',').map((f) => f.trim()).filter(Boolean);
  }, [facilitiesParam]);

  // Menggunakan React Query untuk mengambil data listing dari service
  const {
    data: listings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['publicListings', 'room_vacancy'],
    queryFn: () => fetchPublicListings({ type: 'room_vacancy' }),
  });

  // Logika filter dan urut WAJIB di client/src/services/publicListingService.js
  const filteredListings = useMemo(() => {
    return filterAndSortRoomListings(listings, {
      category: categoryFilter,
      priceRange: priceFilter,
      facilities: selectedFacilities,
      sortBy: sortOption,
      query: searchQuery,
      featuredOnly,
    });
  }, [listings, categoryFilter, priceFilter, selectedFacilities, sortOption, searchQuery, featuredOnly]);

  const hasActiveFilters = Boolean(
    searchQuery ||
    (categoryFilter && categoryFilter !== 'all') ||
    (priceFilter && priceFilter !== 'all') ||
    selectedFacilities.length > 0 ||
    sortOption !== 'terbaru' ||
    featuredOnly
  );

  const updateFilterParam = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (
        !value ||
        value === 'all' ||
        value === '' ||
        (Array.isArray(value) && value.length === 0) ||
        value === false
      ) {
        next.delete(key);
      } else if (Array.isArray(value)) {
        next.set(key, value.join(','));
      } else {
        next.set(key, String(value));
      }
      return next;
    });
  };

  const handleSearchChange = (val) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!val || !val.trim()) {
        next.delete('q');
      } else {
        next.set('q', val);
      }
      return next;
    }, { replace: true });
  };

  const toggleFacility = (facilityName) => {
    const exists = selectedFacilities.includes(facilityName);
    const updated = exists
      ? selectedFacilities.filter((f) => f !== facilityName)
      : [...selectedFacilities, facilityName];
    updateFilterParam('facilities', updated);
  };

  const handleResetFilters = () => {
    setSearchParams({});
  };

  return (
    <div className="min-h-screen bg-forest-50/40 text-forest-900 flex flex-col justify-between">
      {/* HEADER NAVIGASI PUBLIK NETRAL RUANGWARGA */}
      <header className="sticky top-0 z-30 border-b border-forest-100 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/listing/kos" className="flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-800 text-gold-400 font-serif font-bold text-lg shadow-sm group-hover:bg-forest-900 transition-colors">
                RW
              </div>
              <div>
                <span className="font-serif font-bold text-forest-900 text-lg leading-none block">
                  RuangWarga
                </span>
                <span className="block text-[10px] font-semibold tracking-wider text-forest-500 uppercase">
                  Katalog Publik
                </span>
              </div>
            </Link>

            {/* Navigasi Kategori */}
            <div className="hidden md:flex items-center ml-6 gap-1 bg-forest-50 p-1 rounded-xl border border-forest-100">
              <Link
                to="/listing/kos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-forest-800 text-white shadow-sm"
              >
                <AiOutlineHome className="text-sm" /> Kamar Kos
              </Link>
              <Link
                to="/listing/umkm"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-forest-700 hover:text-forest-900 hover:bg-forest-100/60"
              >
                <AiOutlineAppstore className="text-sm" /> UMKM Warga
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="pv-btn-primary text-xs py-2 px-3.5 rounded-xl shadow-sm inline-flex items-center gap-1.5"
            >
              <AiOutlinePlus className="text-sm" /> Pasang Iklan Kos
            </Link>
          </div>
        </div>
      </header>

      {/* HERO & SEARCH BAR */}
      <main className="flex-1 pb-16">
        <section className="bg-gradient-to-b from-forest-800 to-forest-900 text-white py-12 px-4 sm:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-700/80 px-3.5 py-1 text-xs font-semibold text-gold-300 border border-forest-600 mb-4 shadow-sm">
              <HiOutlineSparkles className="text-gold-400 text-sm" /> Etalase Kamar Kos Bebas Calo
            </span>
            <h1 className="font-serif text-3xl font-extrabold sm:text-4xl text-white tracking-tight">
              Temukan Kamar Kos Nyaman &amp; Terpercaya
            </h1>
            <p className="mt-3 text-sm sm:text-base text-forest-200 max-w-2xl mx-auto">
              Hubungi pengelola kos langsung tanpa perantara. Transparan, terverifikasi, dan bebas biaya tambahan.
            </p>

            {/* SEARCH BOX & FILTERS */}
            <div className="mt-8 rounded-2xl bg-white p-4 sm:p-5 text-forest-900 shadow-xl border border-forest-100/20 text-left space-y-3.5">
              {/* Baris 1: Search Input & Toggle Unggulan */}
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <AiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-400 text-lg" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Cari lokasi, nama kos, atau fasilitas..."
                    className="w-full rounded-xl border border-forest-200 pl-10 pr-9 py-2.5 text-xs sm:text-sm focus:border-forest-600 focus:outline-none focus:ring-1 focus:ring-forest-600 placeholder-forest-400 bg-white"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-forest-400 hover:text-forest-700 p-1"
                      aria-label="Hapus kata kunci"
                    >
                      <AiOutlineClose className="text-sm" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="filter-featured-toggle"
                  onClick={() => updateFilterParam('featured', !featuredOnly)}
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all shrink-0 ${
                    featuredOnly
                      ? 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-gold-400 font-bold'
                      : 'border-forest-200 bg-white text-forest-700 hover:bg-forest-50'
                  }`}
                >
                  <AiOutlineStar className={featuredOnly ? 'text-gold-600 text-sm' : 'text-forest-400 text-sm'} />
                  <span>Unggulan</span>
                </button>
              </div>

              {/* Baris 2: Chip Tipe (Putra / Putri / Campur) - Scrollable Horizontal di Mobile */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-xs font-bold text-forest-700 whitespace-nowrap shrink-0">
                  Tipe:
                </span>
                <div className="flex items-center gap-1.5">
                  {TYPE_OPTIONS.map((opt) => {
                    const isActive =
                      (opt.value === 'all' && (categoryFilter === 'all' || !categoryFilter)) ||
                      categoryFilter.toLowerCase() === opt.value.toLowerCase();
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`filter-type-${opt.value.toLowerCase()}`}
                        onClick={() => updateFilterParam('category', opt.value)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                          isActive
                            ? 'bg-forest-800 text-gold-300 border border-forest-900 ring-1 ring-gold-400/40 shadow-xs'
                            : 'bg-forest-50/80 text-forest-700 border border-forest-200/80 hover:bg-forest-100 hover:text-forest-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Baris 3: Chip Rentang Harga (preset: < 1 jt, 1-2 jt, > 2 jt) - Scrollable Horizontal di Mobile */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-xs font-bold text-forest-700 whitespace-nowrap shrink-0">
                  Harga:
                </span>
                <div className="flex items-center gap-1.5">
                  {PRICE_OPTIONS.map((opt) => {
                    const isActive =
                      (opt.value === 'all' && (priceFilter === 'all' || !priceFilter)) ||
                      priceFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`filter-price-${opt.value}`}
                        onClick={() => updateFilterParam('price', opt.value)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                          isActive
                            ? 'bg-forest-800 text-gold-300 border border-forest-900 ring-1 ring-gold-400/40 shadow-xs'
                            : 'bg-forest-50/80 text-forest-700 border border-forest-200/80 hover:bg-forest-100 hover:text-forest-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Baris 4: Chip Fasilitas (Multi-Pilih dari kosFacilities.js) - Scrollable Horizontal di Mobile */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-xs font-bold text-forest-700 whitespace-nowrap shrink-0">
                  Fasilitas:
                </span>
                <div className="flex items-center gap-1.5">
                  {KOS_FACILITIES.map((fac) => {
                    const isSelected = selectedFacilities.includes(fac);
                    const IconComponent = getFacilityIcon(fac);
                    return (
                      <button
                        key={fac}
                        type="button"
                        data-testid={`filter-facility-${fac}`}
                        onClick={() => toggleFacility(fac)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all ${
                          isSelected
                            ? 'bg-forest-800 text-gold-300 border border-forest-900 ring-1 ring-gold-400/40 shadow-xs font-semibold'
                            : 'bg-forest-50/80 text-forest-700 border border-forest-200/80 hover:bg-forest-100 hover:text-forest-900 font-medium'
                        }`}
                      >
                        <IconComponent className={isSelected ? 'text-gold-400 text-sm' : 'text-forest-500 text-sm'} />
                        <span>{fac}</span>
                        {isSelected && <TbCheck className="text-gold-400 text-xs ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTAINER HASIL DIREKTORI */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-8">
          {/* Navigasi Mobile Kategori */}
          <div className="flex md:hidden items-center justify-center gap-2 mb-6">
            <Link
              to="/listing/kos"
              className="flex-1 text-center py-2 rounded-xl text-xs font-bold bg-forest-800 text-white shadow-sm"
            >
              Kamar Kos
            </Link>
            <Link
              to="/listing/umkm"
              className="flex-1 text-center py-2 rounded-xl text-xs font-semibold bg-white border border-forest-200 text-forest-800"
            >
              UMKM Warga
            </Link>
          </div>

          {/* Baris Judul, Urutkan & Total Listing */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="font-serif text-xl font-bold text-forest-900 sm:text-2xl">
                Kamar Kos Tersedia
              </h2>
              <p className="text-xs text-forest-500 mt-0.5" data-testid="results-count">
                {!isLoading && `Menampilkan ${filteredListings.length} kamar siap huni`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Dropdown Urutkan */}
              <div className="flex items-center gap-1.5 text-xs text-forest-600">
                <label htmlFor="sortSelect" className="font-medium whitespace-nowrap">
                  Urutkan:
                </label>
                <select
                  id="sortSelect"
                  data-testid="sort-select"
                  value={sortOption}
                  onChange={(e) => updateFilterParam('sort', e.target.value)}
                  className="rounded-xl border border-forest-200 bg-white px-3 py-1.5 text-xs font-semibold text-forest-800 shadow-2xs focus:border-forest-600 focus:outline-none"
                >
                  <option value="terbaru">Terbaru</option>
                  <option value="termurah">Termurah</option>
                  <option value="termahal">Termahal</option>
                </select>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  data-testid="btn-reset-filters"
                  onClick={handleResetFilters}
                  className="text-xs font-semibold text-forest-700 hover:text-forest-900 underline whitespace-nowrap"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          {/* SKELETON SAAT MEMUAT */}
          {isLoading ? (
            <div
              data-testid="listing-loading-skeleton-grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <RoomListingSkeleton key={i} />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-800">
              <p className="text-sm font-semibold">Gagal memuat katalog kamar kos.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 pv-btn-primary text-xs"
              >
                Coba Lagi
              </button>
            </div>
          ) : filteredListings.length === 0 ? (
            /* EMPTY STATE MENGAJAK PEMILIK KOS 'Pasang iklan di RuangWarga' */
            <div
              data-testid="empty-listing-state"
              className="rounded-3xl border border-dashed border-forest-200 bg-white p-8 sm:p-14 text-center shadow-sm max-w-2xl mx-auto"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-50 text-forest-700 text-3xl mb-4 border border-forest-100">
                <AiOutlineHome />
              </div>
              <h3 className="font-serif text-xl font-bold text-forest-900">
                {hasActiveFilters
                  ? 'Tidak Ada Kamar yang Sesuai Filter'
                  : 'Belum Ada Kamar Kos yang Tayang'}
              </h3>
              <p className="mt-2 text-sm text-forest-600 max-w-md mx-auto leading-relaxed">
                {hasActiveFilters
                  ? 'Coba atur ulang kata kunci pencarian, rentang harga, atau tipe kamar kos Anda.'
                  : 'Punya kamar kos atau kontrakan kosong? Pasang iklan di RuangWarga agar cepat tersewa langsung ke calon penyewa tanpa calo.'}
              </p>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    data-testid="btn-reset-filters-empty"
                    onClick={handleResetFilters}
                    className="pv-btn-primary text-xs py-2 px-4 rounded-xl"
                  >
                    Reset Filter
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="pv-btn-primary text-xs py-2.5 px-5 rounded-xl shadow-sm inline-flex items-center gap-2"
                  >
                    <AiOutlinePlus className="text-sm" /> Pasang Iklan di RuangWarga
                  </Link>
                )}
              </div>
            </div>
          ) : (
            /* GRID KARTU RESPONSIF: 1 HP, 2 TABLET, 3-4 DESKTOP */
            <div
              data-testid="room-listing-grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {filteredListings.map((item) => (
                <RoomListingCard key={item.id} listing={item} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FOOTER PUBLIK NETRAL RUANGWARGA */}
      <footer className="border-t border-forest-100 bg-white py-8 text-center text-xs text-forest-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-forest-800">RuangWarga SaaS Multi-Tenant</span>
            <span>&bull;</span>
            <span>Katalog Publik Terbuka</span>
          </div>
          <div className="flex items-center gap-4 text-forest-600">
            <Link to="/listing/kos" className="hover:text-forest-900 font-semibold">
              Kamar Kos
            </Link>
            <Link to="/listing/umkm" className="hover:text-forest-900">
              UMKM Warga
            </Link>
            <Link to="/login" className="hover:text-forest-900">
              Portal Pengelola
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
