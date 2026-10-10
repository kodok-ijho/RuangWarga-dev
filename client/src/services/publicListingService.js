/**
 * publicListingService.js
 * Service layer untuk Modul Listing Publik & Promosi (Phase 10, Spec §5.1, §6.1, §7.3)
 * Menangani query katalog listing publik (tanpa autentikasi), posting iklan warga/kamar,
 * dan pengecekan akses sesuai aturan RLS database.
 */

import { supabase } from './supabaseClient';
import { calculateQrisFee } from './dokuProtocol';
import { mockListingPricing, mockPublicListings } from './mockData';

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
 * Fetch katalog listing publik dari Supabase (bebas diakses tanpa login)
 * 
 * @param {Object} [filters={}]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchPublicListings(filters = {}) {
  const isDemo = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

  if (!isSupabaseConfigured() || isDemo) {
    let result = filterPublicListings(inMemoryListings, {
      type: filters.type,
      featuredOnly: filters.is_featured,
      query: filters.query,
    });
    result.sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return result;
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

  return data || [];
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
    const found = inMemoryListings.find((l) => String(l.id) === String(id));
    return found || null;
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

  return data;
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
let inMemoryListings = [...mockPublicListings];
let inMemoryListingPayments = [];

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
    const createdItem = {
      id: `listing-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ...listingRecord,
    };
    inMemoryListings.unshift(createdItem);
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
    return inMemoryListings.filter((l) => l.tenant_id === tenantId);
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
    const idx = inMemoryListings.findIndex((l) => String(l.id) === String(listingId));
    if (idx !== -1) {
      inMemoryListings[idx] = {
        ...inMemoryListings[idx],
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      return inMemoryListings[idx];
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

    const idx = inMemoryListings.findIndex((l) => String(l.id) === String(listingId));
    if (idx !== -1) {
      inMemoryListings[idx] = {
        ...inMemoryListings[idx],
        ...updateData,
      };
      return inMemoryListings[idx];
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
    const paymentId = `pay-lst-${Date.now()}`;
    const gatewayRef = `DOKU-LST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const targetListing = inMemoryListings.find((l) => String(l.id) === String(listingId));
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



