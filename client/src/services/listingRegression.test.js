/**
 * listingRegression.test.js — T11.3 Regression Test Modul Listing Publik (Phase 10)
 *
 * Menguji modul listing publik & promosi:
 *   1. Posting listing kos & UMKM (Metadata kamar, UMKM, harga, pembayaran terpisah)
 *   2. Proteksi Subscription Gate pada posting listing (FR-26, T10.10)
 *   3. Akses publik tanpa autentikasi (Anonymous access ke direktori & detail)
 *   4. Agregasi listing lintas tenant dengan prioritas featured (T10.9)
 *   5. Siklus kedaluwarsa & auto-hide listing expired dari direktori publik (FR-28, FR-29)
 *   6. Pembaruan (renewal) & manajemen status listing (rented_or_sold, delete)
 *
 * Ref: task.md T11.3, requirement.md FR-22 s/d FR-30, specification.md §5.1, §6.1, §7.3
 */
import { describe, it, expect } from 'vitest';
import {
  isListingVisibleToPublic,
  canMemberPostListing,
  canUserManageListing,
  filterPublicListings,
  getPricingForListing,
  fetchListingPricing,
  createPublicListing,
  fetchTenantListings,
  updateListingStatus,
  renewListing,
  deleteListing,
  createListingPayment,
  verifyListingPayment,
  fetchListingPaymentStatus,
  checkListingExpirations,
  fetchPublicListings,
  fetchPublicListingById,
} from './publicListingService';

describe('Modul Listing Publik — Regression Test (T11.3)', () => {
  const kosTenantId = 'demo-tenant-kos';
  const rtrwTenantId = 'demo-tenant-rtrw';

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Posting Listing Kos & UMKM + Alur Pembayaran Terpisah
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Posting Listing Kos & UMKM (FR-22, FR-23, FR-24, FR-25)', () => {
    it('pemilik kos dapat membuat listing kamar kosong dengan data lengkap', async () => {
      const roomListing = await createPublicListing(kosTenantId, {
        title: 'Kamar VIP Lantai 2 AC & Kamar Mandi Dalam',
        description: 'Kamar kos nyaman full furnished dekat kampus UGM.',
        contact_phone: '081234567891',
        type: 'room_vacancy',
        price: 1500000,
        location_hint: 'Sleman, Yogyakarta',
        is_featured: false,
        duration_days: 30,
      });

      expect(roomListing).toBeDefined();
      expect(roomListing.id).toBeDefined();
      expect(roomListing.tenant_id).toBe(kosTenantId);
      expect(roomListing.type).toBe('room_vacancy');
      expect(roomListing.status).toBe('pending_payment');
      expect(roomListing.expires_at).toBeNull();
      expect(roomListing.price).toBe(1500000);
      expect(roomListing.location_hint).toBe('Sleman, Yogyakarta');
      expect(roomListing.contact_phone).toBe('081234567891');
    });

    it('warga RT/RW dapat membuat listing usaha UMKM dengan kategori produk', async () => {
      const umkmListing = await createPublicListing(rtrwTenantId, {
        title: 'Warung Nasi Gudeg Bu Sri',
        description: 'Gudeg khas Jogja asli resep turun temurun, menerima pesanan nasi box.',
        category: 'Kuliner',
        contact_phone: '081399887766',
        type: 'umkm',
        location_hint: 'Ruko Palm Village Blok B-02',
        is_featured: true,
        duration_days: 30,
      });

      expect(umkmListing).toBeDefined();
      expect(umkmListing.id).toBeDefined();
      expect(umkmListing.tenant_id).toBe(rtrwTenantId);
      expect(umkmListing.type).toBe('umkm');
      expect(umkmListing.category).toBe('Kuliner');
      expect(umkmListing.status).toBe('pending_payment');
      expect(umkmListing.is_featured).toBe(false);
      expect(umkmListing.location_hint).toContain('Palm Village');

      // Bayar paket unggulan
      const payRes = await createListingPayment(umkmListing.id, { isFeatured: true, durationDays: 30 });
      const verified = await verifyListingPayment(payRes.paymentId, payRes.gatewayRef);
      expect(verified.status).toBe('active');
      expect(verified.isFeatured).toBe(true);
    });

    it('katalog harga membedakan tarif listing reguler vs featured (T10.3)', async () => {
      const pricingList = await fetchListingPricing();
      expect(Array.isArray(pricingList)).toBe(true);
      expect(pricingList.length).toBeGreaterThanOrEqual(4);

      const kosRegular = getPricingForListing(pricingList, { listingType: 'room_vacancy', isFeatured: false });
      const kosFeatured = getPricingForListing(pricingList, { listingType: 'room_vacancy', isFeatured: true });
      const umkmRegular = getPricingForListing(pricingList, { listingType: 'umkm', isFeatured: false });
      const umkmFeatured = getPricingForListing(pricingList, { listingType: 'umkm', isFeatured: true });

      expect(kosRegular.price).toBeGreaterThan(0);
      expect(kosFeatured.price).toBeGreaterThan(kosRegular.price);
      expect(umkmRegular.price).toBeGreaterThan(0);
      expect(umkmFeatured.price).toBeGreaterThan(umkmRegular.price);
    });

    it('alur pembayaran listing berjalan terpisah dari subscription utama platform (T10.6)', async () => {
      // 1. Buat listing baru
      const listing = await createPublicListing(kosTenantId, {
        title: 'Kamar Standar Promo Bulanan',
        contact_phone: '081234567890',
        type: 'room_vacancy',
        is_featured: true,
        duration_days: 30,
      });

      // 2. Buat invoice pembayaran listing
      const paymentInvoice = await createListingPayment(listing.id, {
        isFeatured: true,
        durationDays: 30,
      });

      expect(paymentInvoice).toBeDefined();
      expect(paymentInvoice.paymentId).toBeDefined();
      expect(paymentInvoice.amount).toBeGreaterThan(0);
      expect(paymentInvoice.paymentUrl).toBeDefined();

      // 3. Verifikasi pembayaran berhasil (simulasi webhook settlement)
      const verified = await verifyListingPayment(paymentInvoice.paymentId, 'MYR-LIST-TEST-2026');

      expect(verified.success).toBe(true);
      expect(verified.status).toBe('active');

      // 4. Status invoice dapat dipantau via fetchListingPaymentStatus
      const checkStatus = await fetchListingPaymentStatus(paymentInvoice.paymentId);
      expect(checkStatus.status).toBe('paid');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Proteksi Subscription Gate pada Posting Listing (FR-26, T10.10)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Subscription Gate pada Modul Listing (FR-26, T10.10)', () => {
    it('mengizinkan posting listing saat subscription tenant aktif atau trial', () => {
      expect(canMemberPostListing('active', 'approved')).toBe(true);
      expect(canMemberPostListing('trial', 'approved')).toBe(true);
    });

    it('memblokir posting listing saat status subscription read_only (FR-26)', () => {
      expect(canMemberPostListing('read_only', 'approved')).toBe(false);
      expect(canMemberPostListing('expired', 'approved')).toBe(false);
    });

    it('memblokir anggota yang status membership-nya belum approved (pending/rejected)', () => {
      expect(canMemberPostListing('active', 'pending')).toBe(false);
      expect(canMemberPostListing('active', 'rejected')).toBe(false);
    });

    it('canUserManageListing memastikan kontrol akses edit/delete listing berada di tangan pemilik atau admin', () => {
      const listing = {
        id: 'list-101',
        tenant_id: kosTenantId,
        posted_by_user_id: 'user-pemilik-kos',
      };

      // Pemilik listing sendiri diizinkan
      expect(canUserManageListing(listing, { userId: 'user-pemilik-kos' })).toBe(true);

      // Admin tenant diizinkan
      expect(
        canUserManageListing(listing, {
          userId: 'user-lain',
          tenantId: kosTenantId,
          memberRole: 'admin',
        })
      ).toBe(true);

      // Platform admin selalu diizinkan
      expect(canUserManageListing(listing, { isPlatformAdmin: true })).toBe(true);

      // Anggota lain dari tenant yang sama TIDAK diizinkan
      expect(
        canUserManageListing(listing, {
          userId: 'user-anggota-lain',
          tenantId: kosTenantId,
          memberRole: 'anggota',
        })
      ).toBe(false);

      // User asing beda tenant TIDAK diizinkan
      expect(
        canUserManageListing(listing, {
          userId: 'user-asing',
          tenantId: 'tenant-lain',
          memberRole: 'admin',
        })
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Akses Publik Tanpa Autentikasi (FR-27, Spec §7.3)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Akses Direktori Publik Tanpa Login (FR-27, Spec §7.3)', () => {
    it('fetchPublicListings dapat dipanggil secara bebas tanpa authentication token / sesi login', async () => {
      const publicListings = await fetchPublicListings();
      expect(Array.isArray(publicListings)).toBe(true);
      expect(publicListings.length).toBeGreaterThan(0);

      // Seluruh listing publik harus memiliki field penting untuk pengunjung
      publicListings.forEach((item) => {
        expect(item.id).toBeDefined();
        expect(item.title).toBeDefined();
        expect(item.type).toBeDefined();
        expect(item.contact_phone).toBeDefined();
        // Listing yang tampil harus berstatus active
        expect(item.status).toBe('active');
      });
    });

    it('fetchPublicListingById mengembalikan rincian lengkap untuk halaman publik /listing/:id', async () => {
      const item = await createPublicListing(kosTenantId, {
        title: 'Kamar Kos Putri Dekat RS Sardjito',
        description: 'Lokasi strategis dekat RS Sardjito, fasilitas water heater, WiFi 100Mbps.',
        contact_phone: '081122334455',
        type: 'room_vacancy',
        price: 1800000,
        location_hint: 'Sleman',
      });

      const detail = await fetchPublicListingById(item.id);
      expect(detail).toBeDefined();
      expect(detail.id).toBe(item.id);
      expect(detail.title).toBe('Kamar Kos Putri Dekat RS Sardjito');
      expect(detail.description).toContain('RS Sardjito');
      expect(detail.price).toBe(1800000);
      expect(detail.location_hint).toBe('Sleman');
    });

    it('fetchPublicListingById mengembalikan null jika listing tidak ditemukan atau kosong', async () => {
      expect(await fetchPublicListingById(null)).toBeNull();
      expect(await fetchPublicListingById('')).toBeNull();
      expect(await fetchPublicListingById('id-listing-tidak-pernah-ada')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Listing Lintas Tenant & Prioritas Tampilan Featured (T10.9)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Agregasi Lintas Tenant & Tampilan Prioritas Featured (T10.9)', () => {
    it('katalog publik mengagregasikan listing dari berbagai tenant yang berbeda', async () => {
      // Buat listing dari tenant kos
      await createPublicListing(kosTenantId, {
        title: 'Kamar Melati #1',
        type: 'room_vacancy',
        contact_phone: '08123456789',
      });

      // Buat listing dari tenant RT/RW
      await createPublicListing(rtrwTenantId, {
        title: 'Katering Sehat Bu RT',
        type: 'umkm',
        contact_phone: '08123456780',
      });

      const allListings = await fetchPublicListings();
      const tenantIds = allListings.map((l) => l.tenant_id);

      // Verifikasi listing berasal dari lebih dari satu tenant
      const uniqueTenants = new Set(tenantIds);
      expect(uniqueTenants.size).toBeGreaterThanOrEqual(2);
    });

    it('filterPublicListings memisahkan listing kos (/listing/kos) dan UMKM (/listing/umkm)', async () => {
      const kosListings = await fetchPublicListings({ type: 'room_vacancy' });
      expect(kosListings.length).toBeGreaterThan(0);
      expect(kosListings.every((l) => l.type === 'room_vacancy')).toBe(true);

      const umkmListings = await fetchPublicListings({ type: 'umkm' });
      expect(umkmListings.length).toBeGreaterThan(0);
      expect(umkmListings.every((l) => l.type === 'umkm')).toBe(true);
    });

    it('listing dengan is_featured = true diprioritaskan di posisi teratas pada katalog publik', async () => {
      // Buat listing biasa
      await createPublicListing(kosTenantId, {
        title: 'Kamar Kos Reguler Non-Featured',
        type: 'room_vacancy',
        contact_phone: '08123456789',
        is_featured: false,
      });

      // Buat listing featured
      await createPublicListing(kosTenantId, {
        title: 'Kamar Kos Mewah Priority Featured',
        type: 'room_vacancy',
        contact_phone: '08123456789',
        is_featured: true,
      });

      const listings = await fetchPublicListings({ type: 'room_vacancy' });
      expect(listings.length).toBeGreaterThanOrEqual(2);

      // Temukan index listing featured pertama dan non-featured pertama
      const firstFeaturedIndex = listings.findIndex((l) => l.is_featured === true);
      const firstRegularIndex = listings.findIndex((l) => l.is_featured === false);

      if (firstFeaturedIndex !== -1 && firstRegularIndex !== -1) {
        expect(firstFeaturedIndex).toBeLessThan(firstRegularIndex);
      }
    });

    it('pencarian berdasarkan kata kunci (query) menyaring listing dengan tepat lintas tenant', () => {
      const rawListings = [
        {
          id: '1',
          title: 'Kos Exclusive Dekat UGM',
          description: 'Nyaman dan strategis',
          type: 'room_vacancy',
          status: 'active',
          expires_at: '2026-12-31T00:00:00Z',
        },
        {
          id: '2',
          title: 'Jasa Servis AC Bersama',
          description: 'Melayani cuci dan isi freon',
          type: 'umkm',
          status: 'active',
          expires_at: '2026-12-31T00:00:00Z',
        },
        {
          id: '3',
          title: 'Warung Kopi Senja',
          description: 'Kopi robusta dan arabika',
          type: 'umkm',
          status: 'active',
          expires_at: '2026-12-31T00:00:00Z',
        },
      ];

      const searchUGM = filterPublicListings(rawListings, { query: 'UGM' });
      expect(searchUGM.length).toBe(1);
      expect(searchUGM[0].id).toBe('1');

      const searchKopi = filterPublicListings(rawListings, { query: 'kopi' });
      expect(searchKopi.length).toBe(1);
      expect(searchKopi[0].id).toBe('3');

      const searchAC = filterPublicListings(rawListings, { query: 'freon' });
      expect(searchAC.length).toBe(1);
      expect(searchAC[0].id).toBe('2');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Listing Expired Otomatis Tersembunyi dari Direktori Publik (FR-28, FR-29)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Siklus Expiration & Auto-Hide Listing Publik (FR-28, FR-29)', () => {
    const fixedNow = new Date('2026-10-01T00:00:00Z');

    it('isListingVisibleToPublic menyembunyikan listing yang masa aktifnya telah habis', () => {
      const activeValid = {
        id: '1',
        status: 'active',
        expires_at: '2026-10-15T00:00:00Z',
      };
      expect(isListingVisibleToPublic(activeValid, fixedNow)).toBe(true);

      const activePastExpiry = {
        id: '2',
        status: 'active',
        expires_at: '2026-09-25T00:00:00Z', // Lewat dari fixedNow
      };
      expect(isListingVisibleToPublic(activePastExpiry, fixedNow)).toBe(false);

      const alreadyExpiredStatus = {
        id: '3',
        status: 'expired',
        expires_at: '2026-09-20T00:00:00Z',
      };
      expect(isListingVisibleToPublic(alreadyExpiredStatus, fixedNow)).toBe(false);
    });

    it('isListingVisibleToPublic menyembunyikan listing yang sudah laku (rented_or_sold)', () => {
      const rentedListing = {
        id: '4',
        status: 'rented_or_sold',
        expires_at: '2026-10-20T00:00:00Z',
      };
      expect(isListingVisibleToPublic(rentedListing, fixedNow)).toBe(false);
    });

    it('filterPublicListings tidak menyertakan listing expired dalam output katalog publik', () => {
      const mixedListings = [
        { id: '1', title: 'Listing Aktif', status: 'active', expires_at: '2026-10-20T00:00:00Z' },
        { id: '2', title: 'Listing Expired Status', status: 'expired', expires_at: '2026-09-10T00:00:00Z' },
        { id: '3', title: 'Listing Expired Time', status: 'active', expires_at: '2026-09-20T00:00:00Z' },
        { id: '4', title: 'Listing Tersewa', status: 'rented_or_sold', expires_at: '2026-10-25T00:00:00Z' },
      ];

      const visible = filterPublicListings(mixedListings, {}, fixedNow);
      expect(visible.length).toBe(1);
      expect(visible[0].id).toBe('1');
    });

    it('job checkListingExpirations otomatis menandai listing kedaluwarsa menjadi expired (T10.7)', async () => {
      // 1. Buat listing dengan masa aktif singkat dan bayar
      const shortListing = await createPublicListing(kosTenantId, {
        title: 'Kamar Kos Promo Kilat',
        type: 'room_vacancy',
        contact_phone: '08123456789',
        duration_days: 1,
      });
      const pay = await createListingPayment(shortListing.id, { durationDays: 1 });
      await verifyListingPayment(pay.paymentId, pay.gatewayRef);

      // 2. Jalankan checkListingExpirations dengan referensi waktu 5 hari ke depan
      const futureTime = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const res = await checkListingExpirations(futureTime);
      expect(res.success).toBe(true);

      // 3. Verifikasi status listing berubah jadi expired
      const tenantListings = await fetchTenantListings(kosTenantId);
      const target = tenantListings.find((l) => l.id === shortListing.id);
      expect(target).toBeDefined();
      expect(target.status).toBe('expired');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Pembaruan Listing (Renewal) & Manajemen Status
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Pembaruan (Renewal) & Manajemen Status Listing', () => {
    it('pemilik listing dapat menandai kamar/produk sebagai rented_or_sold', async () => {
      const item = await createPublicListing(kosTenantId, {
        title: 'Kamar Kos Segera Terisi',
        type: 'room_vacancy',
        contact_phone: '08123456789',
      });
      // Aktifkan terlebih dahulu lewat pembayaran
      const pay = await createListingPayment(item.id, { durationDays: 30 });
      await verifyListingPayment(pay.paymentId, pay.gatewayRef);

      const updated = await updateListingStatus(item.id, 'rented_or_sold');
      expect(updated.status).toBe('rented_or_sold');

      // Setelah ditandai rented_or_sold, listing tidak boleh muncul lagi di direktori publik
      expect(isListingVisibleToPublic(updated)).toBe(false);
    });

    it('pemilik listing dapat memperpanjang (renewListing) masa tayang listing expired', async () => {
      const expiredItem = await createPublicListing(rtrwTenantId, {
        title: 'Catering Arisan Nusantara',
        type: 'umkm',
        contact_phone: '08123456789',
        duration_days: 1,
      });
      // Aktifkan terlebih dahulu
      const payExp = await createListingPayment(expiredItem.id, { durationDays: 1 });
      await verifyListingPayment(payExp.paymentId, payExp.gatewayRef);

      // Tandai expired
      await updateListingStatus(expiredItem.id, 'expired');

      // Perpanjang 30 hari lagi
      const renewed = await renewListing(expiredItem.id, { durationDays: 30 });
      expect(renewed.status).toBe('active');
      expect(new Date(renewed.expires_at).getTime()).toBeGreaterThan(Date.now());
      expect(isListingVisibleToPublic(renewed)).toBe(true);
    });

    it('pemilik listing dapat menghapus listing (deleteListing)', async () => {
      const toDelete = await createPublicListing(kosTenantId, {
        title: 'Kamar Kos Dihapus',
        type: 'room_vacancy',
        contact_phone: '08123456789',
      });

      const isDeleted = await deleteListing(toDelete.id);
      expect(isDeleted).toBe(true);

      const detail = await fetchPublicListingById(toDelete.id);
      expect(detail).toBeNull();
    });
  });
});
