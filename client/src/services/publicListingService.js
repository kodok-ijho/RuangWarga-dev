/**
 * publicListingService.js
 * Service layer untuk Modul Listing Publik & Promosi (Phase 10, Spec §5.1, §6.1, §7.3)
 * Menangani query katalog listing publik (tanpa autentikasi), posting iklan warga/kamar,
 * dan pengecekan akses sesuai aturan RLS database.
 */

import { supabase } from './supabaseClient';
import { calculateQrisFee } from './dokuProtocol';
import { KOS_FACILITIES } from '../config/kosFacilities';

/**
 * Memeriksa apakah sebuah listing memenuhi syarat untuk dilihat oleh publik (termasuk anonim)
 * Sesuai RLS Policy: (status = 'active' AND expires_at > now())
 * 
 * @param {Object} listing - Data listing
 * @param {Date|string} [referenceTime=new Date()] - Waktu acuan
 * @returns {boolean}
 */
export function isListingVisibleToPublic(listing, referenceTime = new Date()) {
  if (!listing) return false;
  if (listing.status !== 'active') return false;
  
  const expiry = new Date(listing.expires_at);
  const now = new Date(referenceTime);
  return expiry.getTime() > now.getTime();
}

/**
 * Memeriksa apakah seorang anggota tenant diperbolehkan memposting listing baru
 * Sesuai RLS Policy: Subscription tenant BUKAN read_only (status 'trial' atau 'active')
 * dan membership berstatus 'approved'.
 * 
 * @param {string} subscriptionStatus - Status subscription tenant ('trial' | 'active' | 'read_only' | 'expired')
 * @param {string} memberStatus - Status keanggotaan tenant ('approved' | 'pending' | 'rejected')
 * @returns {boolean}
 */
export function canMemberPostListing(subscriptionStatus, memberStatus = 'approved') {
  if (memberStatus !== 'approved') return false;
  return subscriptionStatus === 'trial' || subscriptionStatus === 'active';
}

/**
 * Memeriksa apakah user berhak mengupdate atau menghapus listing
 * Sesuai RLS Policy: Pemilik postingan, Tenant Admin, atau Platform Admin
 * 
 * @param {Object} listing - Data listing
 * @param {Object} authContext - Konteks user { userId, isPlatformAdmin, memberRole, tenantId }
 * @returns {boolean}
 */
export function canUserManageListing(listing, { userId, isPlatformAdmin = false, memberRole = 'anggota', tenantId = null } = {}) {
  if (!listing) return false;
  if (isPlatformAdmin) return true;
  if (userId && (listing.posted_by_user_id === userId || listing.user_id === userId)) return true;
  if (tenantId && listing.tenant_id === tenantId && memberRole === 'admin') return true;
  return false;
}

/**
 * Menyaring daftar listing agar hanya yang memenuhi kriteria publik yang tampil
 * 
 * @param {Array<Object>} listings - Daftar listing mentah
 * @param {Object} options - Filter tambahan (type, search, city, etc.)
 * @param {Date|string} [referenceTime=new Date()]
 * @returns {Array<Object>}
 */
export function filterPublicListings(listings = [], options = {}, referenceTime = new Date()) {
  const { type, query, featuredOnly } = options;
  const now = new Date(referenceTime);

  return listings.filter((item) => {
    // Syarat mutlak publik: active & belum kedaluwarsa
    if (!isListingVisibleToPublic(item, now)) {
      return false;
    }

    // Filter tipe (room_vacancy | umkm)
    if (type && item.type !== type) {
      return false;
    }

    // Filter khusus featured/promoted
    if (featuredOnly && !item.is_featured) {
      return false;
    }

    // Filter kata kunci pencarian
    if (query && query.trim() !== '') {
      const q = query.toLowerCase().trim();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchLoc = item.location_hint?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchLoc) {
        return false;
      }
    }

    return true;
  });
}

function isSupabaseConfigured() {
  if (typeof import.meta === 'undefined' || !import.meta.env) return false;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('placeholder'));
}

/**
 * Menyelesaikan daftar fasilitas kamar untuk sebuah listing.
 * Bila iklan tidak punya kolom fasilitas, dibaca dari tenant_units.metadata
 * kamar terkait lewat service, atau ekstraksi fasilitas standar kos dari teks (KOS_FACILITIES).
 *
 * @param {Object} listing
 * @param {Object} [unitMetadata=null]
 * @returns {Array<string>}
 */
export function resolveListingFacilities(listing, unitMetadata = null) {
  if (!listing) return [];

  // 1. Jika sudah ada kolom / property facilities berupa array
  if (Array.isArray(listing.facilities) && listing.facilities.length > 0) {
    return listing.facilities;
  }

  // 2. Jika ada fasilitas di metadata kamar terkait (tenant_units.metadata)
  if (Array.isArray(unitMetadata?.facilities) && unitMetadata.facilities.length > 0) {
    return unitMetadata.facilities;
  }

  // 3. Fallback: Ekstraksi fasilitas yang cocok dengan KOS_FACILITIES dari judul & deskripsi
  const text = `${listing.title || ''} ${listing.description || ''}`;
  if (!text.trim()) return [];

  const detected = [];
  const patterns = [
    { name: 'AC', regex: /\b(ac|air conditioner|pendingin ruangan)\b/i },
    { name: 'Kamar Mandi Dalam', regex: /\b(kamar mandi dalam|km dalam|en-suite|ensuite)\b/i },
    { name: 'Kasur & Bantal', regex: /\b(kasur|springbed|spring bed|bantal|tempat tidur|bed)\b/i },
    { name: 'Lemari Pakaian', regex: /\b(lemari|wardrobe|almari)\b/i },
    { name: 'Meja Belajar', regex: /\b(meja belajar|meja kerja|meja|kursi)\b/i },
    { name: 'WiFi Internet', regex: /\b(wifi|wi-fi|internet|hotspot)\b/i },
    { name: 'Water Heater', regex: /\b(water heater|pemanas air|air panas)\b/i },
    { name: 'Dapur Bersama', regex: /\b(dapur bersama|dapur|kitchen)\b/i },
    { name: 'Listrik Token Mandiri', regex: /\b(listrik token|token listrik|meteran sendiri)\b/i },
  ];

  for (const { name, regex } of patterns) {
    if (KOS_FACILITIES.includes(name) && regex.test(text) && !detected.includes(name)) {
      detected.push(name);
    }
  }

  return detected;
}

/**
 * Normalisasi nomor telepon kontak ke format internasional Indonesia (62...) (LIST-UI-1.4)
 * - 08xx -> 628xx
 * - +62 -> 62
 * - Membuang karakter spasi, tanda hubung (-), titik, dan tanda kurung.
 * - Mengembalikan null jika nomor kosong atau tidak valid.
 *
 * @param {string} phone
 * @returns {string|null}
 */
export function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;

  // Hapus spasi, strip/tanda hubung, tanda kurung, titik
  let cleaned = phone.trim().replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Hapus semua karakter non-digit yang mungkin tersisa
  cleaned = cleaned.replace(/\D/g, '');

  if (!cleaned) return null;

  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }

  // Validasi nomor WhatsApp: harus berawalan '62' dan memiliki panjang wajar (9 - 16 digit)
  if (!cleaned.startsWith('62') || cleaned.length < 9 || cleaned.length > 16) {
    return null;
  }

  return cleaned;
}

/**
 * Membuat tautan WhatsApp murni untuk menghubungi pengelola iklan kamar kos (LIST-UI-1.4)
 *
 * @param {Object} listing - Data listing kamar kos
 * @param {string} [tenantName=''] - Nama tenant/kos (opsional)
 * @returns {string|null} - URL https://wa.me/<nomor>?text=<pesan> atau null jika nomor kontak tidak valid
 */
export function buildListingWhatsAppUrl(listing, tenantName = '') {
  if (!listing || !listing.contact_phone) return null;

  const cleanNumber = normalizePhoneNumber(listing.contact_phone);
  if (!cleanNumber) return null;

  const title = listing.title ? String(listing.title).trim() : 'Kamar Kos';
  const rawPrice = listing.price;
  const formattedPrice =
    rawPrice !== null && rawPrice !== undefined && !isNaN(Number(rawPrice))
      ? new Intl.NumberFormat('id-ID').format(Number(rawPrice))
      : '0';

  // Format pesan: 'Halo, saya tertarik dengan iklan "<judul>" (Rp<harga>/bulan) di RuangWarga. Apakah masih tersedia?'
  const message = `Halo, saya tertarik dengan iklan "${title}" (Rp${formattedPrice}/bulan) di RuangWarga. Apakah masih tersedia?`;

  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Menyaring dan mengurutkan daftar listing kamar kos publik (LIST-UI-1.3)
 * Fungsi murni tanpa efek samping untuk digunakan di katalog direktori maupun pengujian unit.
 *
 * @param {Array<Object>} listings - Daftar listing kamar kos
 * @param {Object} [filters={}] - Objek filter dan urutan
 * @param {string} [filters.category] - Filter tipe: 'Putra' | 'Putri' | 'Campur' | 'all'
 * @param {string} [filters.roomType] - Alias untuk filters.category
 * @param {string} [filters.priceRange] - Preset harga: '< 1 jt' | 'under1m' | '1-2 jt' | '1m-2m' | '> 2 jt' | 'above2m' | 'all'
 * @param {Array<string>|string} [filters.facilities] - Fasilitas yang harus dimiliki (multi-pilih, mencocokkan dengan resolveListingFacilities)
 * @param {'terbaru'|'termurah'|'termahal'|'newest'|'cheapest'|'expensive'} [filters.sortBy='terbaru'] - Opsi pengurutan
 * @param {string} [filters.query] - Kata kunci pencarian (judul, deskripsi, lokasi, fasilitas)
 * @param {boolean} [filters.featuredOnly=false] - Khusus listing berstatus is_featured
 * @returns {Array<Object>}
 */
export function filterAndSortRoomListings(listings = [], filters = {}) {
  if (!Array.isArray(listings)) return [];

  const {
    category,
    roomType,
    priceRange,
    facilities = [],
    sortBy = 'terbaru',
    query = '',
    featuredOnly = false,
  } = filters;

  const targetCategory = category || roomType;
  const selectedFacilities = Array.isArray(facilities)
    ? facilities.filter(Boolean)
    : typeof facilities === 'string' && facilities.trim()
    ? facilities.split(',').map((f) => f.trim()).filter(Boolean)
    : [];

  // 1. PENYARINGAN (FILTER)
  const filtered = listings.filter((item) => {
    if (!item) return false;

    // Filter Unggulan
    if (featuredOnly && !item.is_featured) {
      return false;
    }

    // Filter Tipe (Putra / Putri / Campur dari category)
    if (targetCategory && targetCategory !== 'all') {
      const itemCat = String(item.category || '').toLowerCase().trim();
      if (itemCat !== String(targetCategory).toLowerCase().trim()) {
        return false;
      }
    }

    // Filter Rentang Harga (preset: < 1 jt, 1-2 jt, > 2 jt)
    if (priceRange && priceRange !== 'all') {
      const price = Number(item.price);
      if (isNaN(price) || item.price === null || item.price === undefined) {
        return false;
      }

      const pRangeNormalized = String(priceRange).toLowerCase().replace(/\s+/g, '');
      if (
        pRangeNormalized === 'under1m' ||
        pRangeNormalized === '<1jt' ||
        pRangeNormalized === '<1juta' ||
        pRangeNormalized === 'under_1m'
      ) {
        if (price >= 1000000) return false;
      } else if (
        pRangeNormalized === '1m-2m' ||
        pRangeNormalized === '1-2jt' ||
        pRangeNormalized === '1-2juta'
      ) {
        if (price < 1000000 || price > 2000000) return false;
      } else if (
        pRangeNormalized === 'above2m' ||
        pRangeNormalized === '>2jt' ||
        pRangeNormalized === '>2juta' ||
        pRangeNormalized === 'above_2m'
      ) {
        if (price <= 2000000) return false;
      }
    }

    // Filter Fasilitas (multi-pilih: harus memiliki seluruh fasilitas yang dipilih)
    if (selectedFacilities.length > 0) {
      const itemFacs = (
        Array.isArray(item.facilities) && item.facilities.length > 0
          ? item.facilities
          : resolveListingFacilities(item)
      ).map((f) => String(f).toLowerCase().trim());

      const hasAllSelectedFacilities = selectedFacilities.every((fac) =>
        itemFacs.includes(String(fac).toLowerCase().trim())
      );

      if (!hasAllSelectedFacilities) {
        return false;
      }
    }

    // Filter Kata Kunci Pencarian (query)
    if (query && query.trim() !== '') {
      const q = query.toLowerCase().trim();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchLoc = item.location_hint?.toLowerCase().includes(q);
      const itemFacs = Array.isArray(item.facilities)
        ? item.facilities
        : resolveListingFacilities(item);
      const matchFacilities = itemFacs.some((f) => String(f).toLowerCase().includes(q));

      if (!matchTitle && !matchDesc && !matchLoc && !matchFacilities) {
        return false;
      }
    }

    return true;
  });

  // 2. PENGURUTAN (SORT)
  return [...filtered].sort((a, b) => {
    const sortNormalized = String(sortBy || 'terbaru').toLowerCase().trim();

    if (sortNormalized === 'termurah' || sortNormalized === 'cheapest' || sortNormalized === 'price_asc') {
      const priceA = a.price !== null && a.price !== undefined && !isNaN(Number(a.price)) ? Number(a.price) : Infinity;
      const priceB = b.price !== null && b.price !== undefined && !isNaN(Number(b.price)) ? Number(b.price) : Infinity;
      if (priceA !== priceB) {
        return priceA - priceB;
      }
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }

    if (sortNormalized === 'termahal' || sortNormalized === 'expensive' || sortNormalized === 'price_desc') {
      const priceA = a.price !== null && a.price !== undefined && !isNaN(Number(a.price)) ? Number(a.price) : -Infinity;
      const priceB = b.price !== null && b.price !== undefined && !isNaN(Number(b.price)) ? Number(b.price) : -Infinity;
      if (priceA !== priceB) {
        return priceB - priceA;
      }
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }

    // Default: 'terbaru' / 'newest'
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

/**
 * Memperkaya daftar listing dengan fasilitas kamar dari metadata unit atau deskripsi
 *
 * @param {Array<Object>} items
 * @returns {Promise<Array<Object>>}
 */
async function enrichListingsWithFacilities(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const unitIds = items
    .filter((item) => !Array.isArray(item.facilities) && item.unit_id)
    .map((item) => item.unit_id);

  const unitsMetadataMap = {};

  if (unitIds.length > 0) {
    if (isSupabaseConfigured()) {
      try {
        const { data: unitsData } = await supabase
          .from('tenant_units')
          .select('id, metadata')
          .in('id', unitIds);
        if (Array.isArray(unitsData)) {
          unitsData.forEach((u) => {
            if (u && u.id) unitsMetadataMap[u.id] = u.metadata;
          });
        }
      } catch (_err) {
        // Fallback gracefully jika ada limitasi RLS
      }
    } else {
      try {
        const { mockUnits } = await import('./mockData');
        if (Array.isArray(mockUnits)) {
          mockUnits.forEach((u) => {
            if (u && u.id) unitsMetadataMap[u.id] = u.metadata || {};
          });
        }
      } catch (_e) {
        // Abaikan jika mock data tidak terload
      }
    }
  }

  return items.map((item) => {
    const unitMeta = item.unit_id ? unitsMetadataMap[item.unit_id] : null;
    return {
      ...item,
      facilities: resolveListingFacilities(item, unitMeta),
    };
  });
}

/**
 * Fetch katalog listing publik dari Supabase (bebas diakses tanpa login)
 * 
 * @param {Object} [filters={}]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchPublicListings(filters = {}) {
  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo) {
    const listings = await getInMemoryListings();
    let result = filterPublicListings(listings, {
      type: filters.type,
      featuredOnly: filters.is_featured,
      query: filters.query,
    });
    result.sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return enrichListingsWithFacilities(result);
  }

  let query = supabase
    .from('public_listings')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.type) {
    query = query.eq('type', filters.type);
  }

  if (filters.is_featured !== undefined) {
    query = query.eq('is_featured', filters.is_featured);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Gagal memuat listing publik: ${error.message}`);
  }

  return enrichListingsWithFacilities(data || []);
}

/**
 * Fetch detail satu listing publik berdasarkan ID (tanpa login)
 * 
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function fetchPublicListingById(id) {
  if (!id) return null;
  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(id).startsWith('mock-') || String(id).startsWith('listing-')) {
    const listings = await getInMemoryListings();
    const found = listings.find((l) => String(l.id) === String(id));
    if (!found) return null;
    const enriched = await enrichListingsWithFacilities([found]);
    const item = enriched[0] || null;
    if (item && !item.tenant_name && item.tenant_id === 'demo-tenant-kos') {
      item.tenant_name = 'Kos Melati Harmoni';
    }
    return item;
  }

  const { data, error } = await supabase
    .from('public_listings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[fetchPublicListingById] Error: ${error.message}`);
    return null;
  }

  const enriched = await enrichListingsWithFacilities([data]);
  return enriched[0] || null;
}

/**
 * Mencari tarif spesifik dari katalog listing_pricing
 * 
 * @param {Array<Object>} pricingList - Array tarif dari listing_pricing
 * @param {Object} criteria - { listingType, isFeatured, durationDays }
 * @returns {Object|null}
 */
export function getPricingForListing(pricingList = [], { listingType, isFeatured = false, durationDays = 30 } = {}) {
  if (!Array.isArray(pricingList) || !listingType) return null;
  return (
    pricingList.find(
      (p) =>
        p.listing_type === listingType &&
        Boolean(p.is_featured) === Boolean(isFeatured) &&
        Number(p.duration_days) === Number(durationDays)
    ) || null
  );
}

/**
 * Fetch daftar tarif listing untuk publik (katalog pricing listing)
 * 
 * @param {Object} [options={}] - { listingType }
 * @returns {Promise<Array<Object>>}
 */
export async function fetchListingPricing(options = {}) {
  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo) {
    const { mockListingPricing } = await import('./mockData');
    let result = [...mockListingPricing];
    if (options.listingType) {
      result = result.filter((p) => p.listing_type === options.listingType);
    }
    return result;
  }

  let query = supabase
    .from('listing_pricing')
    .select('*')
    .order('price', { ascending: true });

  if (options.listingType) {
    query = query.eq('listing_type', options.listingType);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Gagal memuat tarif listing: ${error.message}`);
  }

  return data || [];
}

// In-memory list untuk demo mode
let inMemoryListings = null;
let inMemoryListingPayments = [];

/**
 * Mengambil cache in-memory listing publik secara lazy (DEBT-1.3)
 */
export async function getInMemoryListings() {
  if (inMemoryListings === null) {
    const { mockPublicListings } = await import('./mockData');
    inMemoryListings = [...mockPublicListings];
  }
  return inMemoryListings;
}

/**
 * Membuat postingan listing publik baru (FR-25, FR-27, FR-28, FR-29)
 * 
 * @param {string} tenantId
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createPublicListing(tenantId, payload = {}) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan.');
  }
  if (!payload.title || !payload.title.trim()) {
    throw new Error('Judul listing wajib diisi.');
  }
  if (!payload.contact_phone || !payload.contact_phone.trim()) {
    throw new Error('Nomor kontak WhatsApp/telepon wajib diisi.');
  }

  const now = new Date();

  const listingRecord = {
    tenant_id: tenantId,
    unit_id: payload.unit_id ? Number(payload.unit_id) : null,
    posted_by: payload.posted_by || 'mem-default-poster',
    type: payload.type || 'room_vacancy',
    title: payload.title.trim(),
    description: payload.description ? payload.description.trim() : '',
    category: payload.category ? payload.category.trim() : null,
    price: payload.price !== undefined && payload.price !== '' ? Number(payload.price) : null,
    photos: Array.isArray(payload.photos) ? payload.photos : [],
    contact_phone: payload.contact_phone.trim(),
    location_hint: payload.location_hint ? payload.location_hint.trim() : null,
    is_featured: false,
    featured_until: null,
    status: 'pending_payment',
    expires_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(tenantId).startsWith('demo-')) {
    const listings = await getInMemoryListings();
    const createdItem = {
      id: `listing-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ...listingRecord,
    };
    listings.unshift(createdItem);
    return createdItem;
  }

  const { data, error } = await supabase
    .from('public_listings')
    .insert([{
      tenant_id: listingRecord.tenant_id,
      unit_id: listingRecord.unit_id,
      posted_by: listingRecord.posted_by,
      type: listingRecord.type,
      title: listingRecord.title,
      description: listingRecord.description,
      category: listingRecord.category,
      price: listingRecord.price,
      photos: listingRecord.photos,
      contact_phone: listingRecord.contact_phone,
      location_hint: listingRecord.location_hint,
    }])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal membuat listing publik: ${error.message}`);
  }

  return data;
}

/**
 * Fetch semua listing milik tenant tertentu (untuk kelola postingan di dashboard tenant)
 * 
 * @param {string} tenantId
 * @returns {Promise<Array<Object>>}
 */
export async function fetchTenantListings(tenantId) {
  if (!tenantId) return [];

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(tenantId).startsWith('demo-')) {
    const listings = await getInMemoryListings();
    return listings.filter((l) => l.tenant_id === tenantId);
  }

  const { data, error } = await supabase
    .from('public_listings')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Gagal memuat listing tenant: ${error.message}`);
  }

  return data || [];
}

/**
 * Memperbarui status tayang listing (misal: tandai rented_or_sold atau reaktifkan)
 * 
 * @param {string} listingId
 * @param {'active' | 'rented_or_sold' | 'expired'} newStatus
 * @returns {Promise<Object>}
 */
export async function updateListingStatus(listingId, newStatus) {
  if (!listingId) {
    throw new Error('Listing ID wajib disertakan.');
  }

  const validStatuses = ['active', 'rented_or_sold', 'expired'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Status tidak valid. Harus salah satu dari: ${validStatuses.join(', ')}`);
  }

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(listingId).startsWith('listing-') || String(listingId).startsWith('mock-')) {
    const listings = await getInMemoryListings();
    const idx = listings.findIndex((l) => String(l.id) === String(listingId));
    if (idx !== -1) {
      listings[idx] = {
        ...listings[idx],
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      return listings[idx];
    }
    return { id: listingId, status: newStatus };
  }

  // Non-demo: validasi transisi status konsisten dengan trigger database
  if (newStatus === 'active') {
    const { data: existing, error: fetchErr } = await supabase
      .from('public_listings')
      .select('expires_at')
      .eq('id', listingId)
      .single();

    if (fetchErr || !existing) {
      throw new Error(`Listing tidak ditemukan: ${fetchErr?.message || ''}`);
    }

    if (new Date(existing.expires_at) <= new Date()) {
      throw new Error('Listing yang sudah kedaluwarsa tidak dapat diaktifkan kembali tanpa perpanjangan pembayaran.');
    }
  }

  const { data, error } = await supabase
    .from('public_listings')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal memperbarui status listing: ${error.message}`);
  }

  return data;
}

/**
 * Memperpanjang masa aktif postingan listing (FR-28, FR-29)
 * 
 * @param {string} listingId
 * @param {Object} [options={}] - { durationDays, isFeatured }
 * @returns {Promise<Object>}
 */
export async function renewListing(listingId, { durationDays = 30, isFeatured = false } = {}) {
  if (!listingId) {
    throw new Error('Listing ID wajib disertakan.');
  }

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(listingId).startsWith('listing-') || String(listingId).startsWith('mock-')) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const updateData = {
      status: 'active',
      expires_at: expiresAt,
      is_featured: Boolean(isFeatured),
      featured_until: Boolean(isFeatured) ? expiresAt : null,
      updated_at: now.toISOString(),
    };

    const listings = await getInMemoryListings();
    const idx = listings.findIndex((l) => String(l.id) === String(listingId));
    if (idx !== -1) {
      listings[idx] = {
        ...listings[idx],
        ...updateData,
      };
      return listings[idx];
    }
    return { id: listingId, ...updateData };
  }

  // Non-demo: Dilarang update kolom masa tayang secara langsung dari klien.
  // Wajib melalui alur pembuatan invoice pembayaran (createListingPayment) dan webhook gateway.
  throw new Error(
    'Perpanjangan masa tayang di lingkungan live hanya dapat dilakukan melalui alur pembayaran resmi (createListingPayment).'
  );
}

/**
 * Menghapus postingan listing
 * 
 * @param {string} listingId
 * @returns {Promise<boolean>}
 */
export async function deleteListing(listingId) {
  if (!listingId) {
    throw new Error('Listing ID wajib disertakan.');
  }

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(listingId).startsWith('listing-') || String(listingId).startsWith('mock-')) {
    await getInMemoryListings();
    inMemoryListings = inMemoryListings.filter((l) => String(l.id) !== String(listingId));
    return true;
  }

  const { error } = await supabase
    .from('public_listings')
    .delete()
    .eq('id', listingId);

  if (error) {
    throw new Error(`Gagal menghapus listing: ${error.message}`);
  }

  return true;
}

/**
 * Membuat transaksi pembayaran/invoice QRIS untuk postingan listing (FR-25, FR-29, T10.6)
 * Memanggil Edge Function `create-listing-payment` atau direct Supabase / mock fallback
 * 
 * @param {string} listingId
 * @param {Object} [options={}] - { isFeatured, durationDays }
 * @returns {Promise<Object>}
 */
export async function createListingPayment(listingId, { isFeatured = false, durationDays = 30 } = {}) {
  if (!listingId) {
    throw new Error('Listing ID wajib disertakan untuk pembayaran.');
  }

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(listingId).startsWith('listing-') || String(listingId).startsWith('mock-')) {
    const paymentId = `pay-lst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const gatewayRef = `DOKU-LST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const listings = await getInMemoryListings();
    const targetListing = listings.find((l) => String(l.id) === String(listingId));
    const listingType = targetListing?.type || 'room_vacancy';
    const baseAmount = listingType === 'room_vacancy'
      ? (isFeatured ? 35000 : 15000)
      : (isFeatured ? 25000 : 10000);
    const { fee: qrisFee, total: amount } = calculateQrisFee(baseAmount);

    const paymentRecord = {
      id: paymentId,
      listing_id: listingId,
      amount,
      status: 'pending',
      is_featured: Boolean(isFeatured),
      duration_days: Number(durationDays),
      qris_ref: gatewayRef,
      payment_url: `/t/mock/listings?payRef=${gatewayRef}`,
      created_at: new Date().toISOString(),
    };
    inMemoryListingPayments.push(paymentRecord);

    return {
      success: true,
      paymentId,
      gatewayRef,
      amount,
      baseAmount,
      qrisFee,
      isFeatured: Boolean(isFeatured),
      durationDays: Number(durationDays),
      paymentUrl: paymentRecord.payment_url,
      qrContent: `00020101021126580014ID.DOKU.WWW0118${gatewayRef}520458125303360540${amount}5802ID5910RuangWarga6007Jakarta6304ABCD`,
      qrisString: `00020101021126580014ID.DOKU.WWW0118${gatewayRef}520458125303360540${amount}5802ID5910RuangWarga6007Jakarta6304ABCD`,
    };
  }

  // Invoke Edge Function create-listing-payment (DOKU Platform QRIS)
  const { data, error } = await supabase.functions.invoke('create-listing-payment', {
    body: {
      listingId,
      isFeatured: Boolean(isFeatured),
      durationDays: Number(durationDays),
    },
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Gagal memproses pembuatan invoice pembayaran listing.');
  }

  return data;
}

/**
 * Memverifikasi pembayaran listing dan mengaktifkan / memperpanjang masa tayang (T10.6)
 * Memanggil Edge Function `verify-listing-payment` atau RPC `activate_listing_payment`
 * 
 * @param {string} paymentId
 * @param {string} [gatewayRef]
 * @returns {Promise<Object>}
 */
export async function verifyListingPayment(paymentId, gatewayRef = null) {
  if (!paymentId) {
    throw new Error('Payment ID wajib disertakan.');
  }

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(paymentId).startsWith('pay-lst-') || String(paymentId).startsWith('mock-')) {
    const pIdx = inMemoryListingPayments.findIndex((p) => String(p.id) === String(paymentId));
    let listingId = null;
    let isFeatured = false;
    let durationDays = 30;

    if (pIdx !== -1) {
      inMemoryListingPayments[pIdx].status = 'paid';
      inMemoryListingPayments[pIdx].paid_at = new Date().toISOString();
      listingId = inMemoryListingPayments[pIdx].listing_id;
      isFeatured = inMemoryListingPayments[pIdx].is_featured;
      durationDays = inMemoryListingPayments[pIdx].duration_days || 30;
    }

    if (listingId) {
      await renewListing(listingId, { durationDays, isFeatured });
    }

    return {
      success: true,
      message: 'Pembayaran iklan berhasil diverifikasi (demo mode)',
      paymentId,
      listingId,
      status: 'active',
      isFeatured,
    };
  }

  // Non-demo: baca status listing_payments by id
  const { data: payRecord, error: payError } = await supabase
    .from('listing_payments')
    .select('status')
    .eq('id', paymentId)
    .single();

  if (payError) {
    throw new Error(`Gagal membaca status pembayaran listing: ${payError.message}`);
  }

  const status = payRecord?.status;
  return {
    success: status === 'paid',
    status,
  };
}

/**
 * Mengambil status pembayaran listing
 * 
 * @param {string} paymentId
 * @returns {Promise<Object>}
 */
export async function fetchListingPaymentStatus(paymentId) {
  if (!paymentId) return null;

  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo || String(paymentId).startsWith('pay-lst-') || String(paymentId).startsWith('mock-')) {
    const found = inMemoryListingPayments.find((p) => String(p.id) === String(paymentId));
    return found || { id: paymentId, status: 'pending' };
  }

  const { data, error } = await supabase
    .from('listing_payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error) {
    throw new Error(`Gagal mengambil status pembayaran: ${error.message}`);
  }

  return data;
}



