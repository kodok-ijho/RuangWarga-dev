import { describe, it, expect, vi } from 'vitest';
import { supabase } from './supabaseClient';
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
  fetchPublicListings,
  fetchPublicListingById,
  resolveListingFacilities,
  filterAndSortRoomListings,
  normalizePhoneNumber,
  buildListingWhatsAppUrl,
} from './publicListingService';

describe('publicListingService - Unit Tests (T10.2: RLS & Public Access)', () => {
  const mockNow = new Date('2026-10-01T12:00:00Z');

  describe('isListingVisibleToPublic (RLS Rule: status = active AND expires_at > now())', () => {
    it('mengizinkan akses publik untuk listing active yang belum kedaluwarsa', () => {
      const activeListing = {
        id: 'list-1',
        title: 'Kamar Kos Mahasiswa',
        status: 'active',
        expires_at: '2026-10-15T00:00:00Z',
      };
      expect(isListingVisibleToPublic(activeListing, mockNow)).toBe(true);
    });

    it('menolak akses publik untuk listing yang sudah expired', () => {
      const expiredListing = {
        id: 'list-2',
        title: 'Kamar Kos Lama',
        status: 'expired',
        expires_at: '2026-09-30T00:00:00Z',
      };
      expect(isListingVisibleToPublic(expiredListing, mockNow)).toBe(false);
    });

    it('menolak akses publik jika status active tapi expires_at sudah lewat', () => {
      const lateListing = {
        id: 'list-3',
        title: 'Kamar Kos Terlewat',
        status: 'active',
        expires_at: '2026-09-30T23:59:59Z',
      };
      expect(isListingVisibleToPublic(lateListing, mockNow)).toBe(false);
    });

    it('menolak akses publik untuk listing yang sudah rented_or_sold', () => {
      const soldListing = {
        id: 'list-4',
        title: 'Kamar Kos Sudah Laku',
        status: 'rented_or_sold',
        expires_at: '2026-10-20T00:00:00Z',
      };
      expect(isListingVisibleToPublic(soldListing, mockNow)).toBe(false);
    });

    it('mengembalikan false jika data listing tidak ada', () => {
      expect(isListingVisibleToPublic(null, mockNow)).toBe(false);
      expect(isListingVisibleToPublic(undefined, mockNow)).toBe(false);
    });
  });

  describe('canMemberPostListing (RLS Insert Guard: Tenant subscription bukan read_only)', () => {
    it('mengizinkan posting jika tenant subscription berstatus trial dan member approved', () => {
      expect(canMemberPostListing('trial', 'approved')).toBe(true);
    });

    it('mengizinkan posting jika tenant subscription berstatus active dan member approved', () => {
      expect(canMemberPostListing('active', 'approved')).toBe(true);
    });

    it('menolak posting jika tenant subscription berstatus read_only (pembatasan subscription gate)', () => {
      expect(canMemberPostListing('read_only', 'approved')).toBe(false);
    });

    it('menolak posting jika tenant subscription berstatus expired', () => {
      expect(canMemberPostListing('expired', 'approved')).toBe(false);
    });

    it('menolak posting jika keanggotaan belum diapprove (misal status pending)', () => {
      expect(canMemberPostListing('active', 'pending')).toBe(false);
      expect(canMemberPostListing('trial', 'rejected')).toBe(false);
    });
  });

  describe('canUserManageListing (RLS Update/Delete: Owner, Tenant Admin, Platform Admin)', () => {
    const sampleListing = {
      id: 'list-100',
      tenant_id: 'tenant-kos-1',
      posted_by_user_id: 'user-alice',
    };

    it('mengizinkan pemilik postingan untuk mengelola listingnya', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-alice',
          isPlatformAdmin: false,
          memberRole: 'anggota',
          tenantId: 'tenant-kos-1',
        })
      ).toBe(true);
    });

    it('mengizinkan tenant admin dari tenant terkait untuk mengelola listing anggotanya', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-admin',
          isPlatformAdmin: false,
          memberRole: 'admin',
          tenantId: 'tenant-kos-1',
        })
      ).toBe(true);
    });

    it('mengizinkan platform admin mengelola listing apa pun', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-platform-admin',
          isPlatformAdmin: true,
        })
      ).toBe(true);
    });

    it('menolak anggota lain di tenant yang sama untuk mengedit listing bukan miliknya', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-bob',
          isPlatformAdmin: false,
          memberRole: 'anggota',
          tenantId: 'tenant-kos-1',
        })
      ).toBe(false);
    });

    it('menolak admin dari tenant lain untuk mengedit listing', () => {
      expect(
        canUserManageListing(sampleListing, {
          userId: 'user-other-admin',
          isPlatformAdmin: false,
          memberRole: 'admin',
          tenantId: 'tenant-other-99',
        })
      ).toBe(false);
    });
  });

  describe('filterPublicListings (Katalog Listing Publik)', () => {
    const rawListings = [
      {
        id: '1',
        type: 'room_vacancy',
        title: 'Kost Putri Kamar AC Bersih',
        description: 'Dekat kampus UGM dan minimarket',
        location_hint: 'Sleman, Depok',
        status: 'active',
        expires_at: '2026-10-20T00:00:00Z',
        is_featured: true,
      },
      {
        id: '2',
        type: 'umkm',
        title: 'Catering Rumahan Bu Joko',
        description: 'Menerima pesanan tumpeng dan nasi box',
        location_hint: 'Sleman, Mlati',
        status: 'active',
        expires_at: '2026-10-15T00:00:00Z',
        is_featured: false,
      },
      {
        id: '3',
        type: 'room_vacancy',
        title: 'Kost Murah Dekat Stasiun',
        description: 'Sudah penuh',
        location_hint: 'Kota Yogyakarta',
        status: 'rented_or_sold',
        expires_at: '2026-10-30T00:00:00Z',
        is_featured: false,
      },
      {
        id: '4',
        type: 'umkm',
        title: 'Laundry Kiloan Bersih Wangi',
        description: 'Promo bulan lalu',
        location_hint: 'Bantul',
        status: 'expired',
        expires_at: '2026-09-25T00:00:00Z',
        is_featured: false,
      },
    ];

    it('hanya meloloskan listing yang active dan belum kedaluwarsa ke publik', () => {
      const publicOnly = filterPublicListings(rawListings, {}, mockNow);
      expect(publicOnly).toHaveLength(2);
      expect(publicOnly.map((l) => l.id)).toEqual(['1', '2']);
    });

    it('dapat menyaring berdasarkan tipe listing (room_vacancy)', () => {
      const rooms = filterPublicListings(rawListings, { type: 'room_vacancy' }, mockNow);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].id).toBe('1');
    });

    it('dapat menyaring berdasarkan tipe listing (umkm)', () => {
      const umkm = filterPublicListings(rawListings, { type: 'umkm' }, mockNow);
      expect(umkm).toHaveLength(1);
      expect(umkm[0].id).toBe('2');
    });

    it('dapat menyaring berdasarkan pencarian teks (judul / deskripsi / lokasi)', () => {
      const searchRes = filterPublicListings(rawListings, { query: 'catering' }, mockNow);
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].title).toContain('Catering');

      const searchLoc = filterPublicListings(rawListings, { query: 'Depok' }, mockNow);
      expect(searchLoc).toHaveLength(1);
      expect(searchLoc[0].id).toBe('1');
    });

    it('dapat menyaring khusus listing yang dipromosikan (is_featured)', () => {
      const featured = filterPublicListings(rawListings, { featuredOnly: true }, mockNow);
      expect(featured).toHaveLength(1);
      expect(featured[0].id).toBe('1');
    });
  });

  describe('Listing Pricing Catalogue & Helpers (T10.3)', () => {
    const samplePricing = [
      { id: 'p1', listing_type: 'room_vacancy', is_featured: false, duration_days: 30, price: 15000 },
      { id: 'p2', listing_type: 'room_vacancy', is_featured: true, duration_days: 30, price: 35000 },
      { id: 'p3', listing_type: 'umkm', is_featured: false, duration_days: 30, price: 10000 },
      { id: 'p4', listing_type: 'umkm', is_featured: true, duration_days: 30, price: 25000 },
    ];

    it('getPricingForListing menemukan tarif yang tepat untuk kamar kos biasa (Rp 15.000)', () => {
      const priceItem = getPricingForListing(samplePricing, {
        listingType: 'room_vacancy',
        isFeatured: false,
        durationDays: 30,
      });
      expect(priceItem).toBeDefined();
      expect(priceItem.price).toBe(15000);
    });

    it('getPricingForListing menemukan tarif yang tepat untuk kamar kos featured (Rp 35.000)', () => {
      const priceItem = getPricingForListing(samplePricing, {
        listingType: 'room_vacancy',
        isFeatured: true,
        durationDays: 30,
      });
      expect(priceItem).toBeDefined();
      expect(priceItem.price).toBe(35000);
    });

    it('getPricingForListing menemukan tarif yang tepat untuk UMKM biasa (Rp 10.000) dan featured (Rp 25.000)', () => {
      const regularUmkm = getPricingForListing(samplePricing, {
        listingType: 'umkm',
        isFeatured: false,
      });
      expect(regularUmkm.price).toBe(10000);

      const featuredUmkm = getPricingForListing(samplePricing, {
        listingType: 'umkm',
        isFeatured: true,
      });
      expect(featuredUmkm.price).toBe(25000);
    });

    it('getPricingForListing mengembalikan null jika kombinasi tidak ditemukan', () => {
      const notFound = getPricingForListing(samplePricing, {
        listingType: 'room_vacancy',
        isFeatured: false,
        durationDays: 90, // tidak ada paket 90 hari
      });
      expect(notFound).toBeNull();
    });

    it('fetchListingPricing mengembalikan seluruh data pricing mock di mode demo', async () => {
      const pricing = await fetchListingPricing();
      expect(Array.isArray(pricing)).toBe(true);
      expect(pricing.length).toBeGreaterThanOrEqual(4);
      expect(pricing.some((p) => p.listing_type === 'room_vacancy')).toBe(true);
      expect(pricing.some((p) => p.listing_type === 'umkm')).toBe(true);
    });

    it('fetchListingPricing dapat memfilter berdasarkan tipe listing', async () => {
      const kosPricing = await fetchListingPricing({ listingType: 'room_vacancy' });
      expect(Array.isArray(kosPricing)).toBe(true);
      expect(kosPricing.every((p) => p.listing_type === 'room_vacancy')).toBe(true);
      expect(kosPricing.length).toBe(2); // regular & featured
    });
  });

  describe('Post Listing Operations & Management (T10.4)', () => {
    it('melempar error jika tenantId tidak disertakan saat membuat listing', async () => {
      await expect(createPublicListing('', { title: 'Test', contact_phone: '08123' })).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );
    });

    it('melempar error jika judul iklan atau nomor kontak kosong', async () => {
      await expect(createPublicListing('demo-tenant-1', { title: '', contact_phone: '08123' })).rejects.toThrow(
        'Judul listing wajib diisi.'
      );
      await expect(createPublicListing('demo-tenant-1', { title: 'Judul Valid', contact_phone: '' })).rejects.toThrow(
        'Nomor kontak WhatsApp/telepon wajib diisi.'
      );
    });

    it('berhasil membuat listing kamar kos baru dengan status pending_payment (F6 pay-first)', async () => {
      const newListing = await createPublicListing('demo-tenant-kos', {
        unit_id: 101,
        type: 'room_vacancy',
        title: 'Kamar 101 - Kos Melati Eksklusif',
        description: 'AC, kamar mandi dalam, WiFi, water heater',
        price: 1500000,
        contact_phone: '081234567890',
        location_hint: 'Sleman, Depok',
        is_featured: false,
        duration_days: 30,
      });

      expect(newListing).toBeDefined();
      expect(newListing.id).toBeDefined();
      expect(newListing.tenant_id).toBe('demo-tenant-kos');
      expect(newListing.unit_id).toBe(101);
      expect(newListing.type).toBe('room_vacancy');
      expect(newListing.status).toBe('pending_payment');
      expect(newListing.expires_at).toBeNull();
      expect(newListing.is_featured).toBe(false);

      // Setelah invoice dibayar dan diverifikasi, status menjadi active
      const pay = await createListingPayment(newListing.id, { isFeatured: false, durationDays: 30 });
      const verified = await verifyListingPayment(pay.paymentId, pay.gatewayRef);
      expect(verified.status).toBe('active');
    });

    it('berhasil membuat listing UMKM warga dengan status pending_payment dan aktif setelah bayar featured', async () => {
      const umkmListing = await createPublicListing('demo-tenant-rtrw', {
        unit_id: null,
        type: 'umkm',
        title: 'Katering Nasi Kotak Ibu Joko',
        category: 'Kuliner & Makanan',
        description: 'Menerima pesanan tumpeng dan nasi kotak untuk rapat RT',
        price: 25000,
        contact_phone: '081999888777',
        location_hint: 'Blok B2 No. 5',
        is_featured: true,
        duration_days: 30,
      });

      expect(umkmListing).toBeDefined();
      expect(umkmListing.type).toBe('umkm');
      expect(umkmListing.status).toBe('pending_payment');
      expect(umkmListing.is_featured).toBe(false);
      expect(umkmListing.expires_at).toBeNull();

      // Bayar paket unggulan
      const pay = await createListingPayment(umkmListing.id, { isFeatured: true, durationDays: 30 });
      const verified = await verifyListingPayment(pay.paymentId, pay.gatewayRef);
      expect(verified.status).toBe('active');
      expect(verified.isFeatured).toBe(true);
    });

    it('fetchTenantListings mengembalikan daftar listing milik tenant yang diminta', async () => {
      const tenantListings = await fetchTenantListings('demo-tenant-kos');
      expect(Array.isArray(tenantListings)).toBe(true);
      expect(tenantListings.length).toBeGreaterThan(0);
      expect(tenantListings.every((l) => l.tenant_id === 'demo-tenant-kos')).toBe(true);
    });

    it('updateListingStatus berhasil mengubah status menjadi rented_or_sold dan active', async () => {
      // Buat item untuk dites
      const item = await createPublicListing('demo-tenant-kos', {
        title: 'Kamar Siap Diuji Status',
        contact_phone: '08123456789',
        type: 'room_vacancy',
      });

      // Tandai rented_or_sold
      const updatedSold = await updateListingStatus(item.id, 'rented_or_sold');
      expect(updatedSold).toBeDefined();
      expect(updatedSold.status).toBe('rented_or_sold');

      // Aktifkan kembali
      const updatedActive = await updateListingStatus(item.id, 'active');
      expect(updatedActive.status).toBe('active');

      // Error jika status tidak valid
      await expect(updateListingStatus(item.id, 'invalid_status')).rejects.toThrow(
        'Status tidak valid'
      );
      await expect(updateListingStatus('', 'active')).rejects.toThrow(
        'Listing ID wajib disertakan.'
      );
    });

    it('renewListing berhasil memperpanjang masa aktif 30 hari dan mengubah status ke active', async () => {
      const item = await createPublicListing('demo-tenant-rtrw', {
        title: 'Catering Segera Kedaluwarsa',
        contact_phone: '08123456789',
        type: 'umkm',
        status: 'expired',
      });

      const renewed = await renewListing(item.id, {
        durationDays: 30,
        isFeatured: true,
      });

      expect(renewed).toBeDefined();
      expect(renewed.status).toBe('active');
      expect(renewed.is_featured).toBe(true);
      expect(renewed.featured_until).toBeDefined();

      const createdDate = new Date();
      const expiryDate = new Date(renewed.expires_at);
      const diffDays = Math.round((expiryDate - createdDate) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);

      // Validasi error jika listingId kosong
      await expect(renewListing('')).rejects.toThrow('Listing ID wajib disertakan.');
    });

    it('non-demo renewListing tidak memanggil .update() kolom masa tayang dan melempar error proteksi', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'valid-key-xyz');

      const fromSpy = vi.spyOn(supabase, 'from');

      await expect(renewListing('live-listing-uuid-1', { durationDays: 30 })).rejects.toThrow(
        'Perpanjangan masa tayang di lingkungan live hanya dapat dilakukan melalui alur pembayaran resmi (createListingPayment).'
      );

      expect(fromSpy).not.toHaveBeenCalled();

      fromSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('deleteListing berhasil menghapus listing dari daftar', async () => {
      const item = await createPublicListing('demo-tenant-rtrw', {
        title: 'Listing Untuk Dihapus',
        contact_phone: '08123456789',
        type: 'umkm',
      });

      const deleteRes = await deleteListing(item.id);
      expect(deleteRes).toBe(true);

      const remaining = await fetchTenantListings('demo-tenant-rtrw');
      expect(remaining.some((l) => l.id === item.id)).toBe(false);

      // Validasi error jika listingId kosong
      await expect(deleteListing('')).rejects.toThrow('Listing ID wajib disertakan.');
    });
  });

  describe('publicListingService - Unit Tests (T10.6: Edge Function / Payment Processing)', () => {
    it('createListingPayment membuat invoice pembayaran kamar kos reguler & featured', async () => {
      const kosItem = await createPublicListing('demo-tenant-kos', {
        title: 'Kamar Melati No 3',
        contact_phone: '08123456789',
        type: 'room_vacancy',
      });

      // Reguler: 15.000
      const regPayment = await createListingPayment(kosItem.id, {
        isFeatured: false,
        durationDays: 30,
      });

      expect(regPayment.success).toBe(true);
      expect(regPayment.paymentId).toBeDefined();
      expect(regPayment.baseAmount).toBe(15000);
      expect(regPayment.amount).toBe(15113);
      expect(regPayment.isFeatured).toBe(false);
      expect(regPayment.gatewayRef).toMatch(/^DOKU-/);
      expect(regPayment.qrisString).toBeDefined();
      expect(regPayment.paymentUrl).toBeDefined();

      // Featured: 35.000 + MDR 0.75% (263) = 35.263
      const featPayment = await createListingPayment(kosItem.id, {
        isFeatured: true,
        durationDays: 30,
      });

      expect(featPayment.success).toBe(true);
      expect(featPayment.baseAmount).toBe(35000);
      expect(featPayment.amount).toBe(35263);
      expect(featPayment.isFeatured).toBe(true);
    });

    it('createListingPayment membuat invoice pembayaran UMKM reguler & featured', async () => {
      const umkmItem = await createPublicListing('demo-tenant-rtrw', {
        title: 'Catering Bu Nur',
        contact_phone: '08198765432',
        type: 'umkm',
      });

      // Reguler: 10.000 + MDR 0.75% (75) = 10.075
      const regPayment = await createListingPayment(umkmItem.id, {
        isFeatured: false,
        durationDays: 30,
      });
      expect(regPayment.baseAmount).toBe(10000);
      expect(regPayment.amount).toBe(10075);

      // Featured: 25.000 + MDR 0.75% (188) = 25.188
      const featPayment = await createListingPayment(umkmItem.id, {
        isFeatured: true,
        durationDays: 30,
      });
      expect(featPayment.baseAmount).toBe(25000);
      expect(featPayment.amount).toBe(25188);
    });

    it('createListingPayment melempar error jika listingId tidak disertakan', async () => {
      await expect(createListingPayment('')).rejects.toThrow('Listing ID wajib disertakan untuk pembayaran.');
    });

    it('verifyListingPayment memverifikasi invoice dan mengaktifkan status/featured pada listing', async () => {
      // 1. Buat listing awal
      const item = await createPublicListing('demo-tenant-rtrw', {
        title: 'Jasa Servis AC RT 05',
        contact_phone: '08122334455',
        type: 'umkm',
        status: 'expired',
      });

      // 2. Buat pembayaran featured
      const payment = await createListingPayment(item.id, {
        isFeatured: true,
        durationDays: 30,
      });

      // 3. Verifikasi pembayaran
      const verifyRes = await verifyListingPayment(payment.paymentId, payment.gatewayRef);
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.status).toBe('active');
      expect(verifyRes.isFeatured).toBe(true);

      // 4. Cek status pembayaran dari fetchListingPaymentStatus
      const paymentStatus = await fetchListingPaymentStatus(payment.paymentId);
      expect(paymentStatus.status).toBe('paid');
    });

    it('verifyListingPayment melempar error jika paymentId kosong', async () => {
      await expect(verifyListingPayment('')).rejects.toThrow('Payment ID wajib disertakan.');
    });

    it('verifyListingPayment pada mode non-demo membaca status tabel dan tidak memanggil activate_listing_payment RPC', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-123');

      const rpcSpy = vi.spyOn(supabase, 'rpc');
      const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { status: 'paid' },
              error: null,
            }),
          }),
        }),
      });

      try {
        const res = await verifyListingPayment('550e8400-e29b-41d4-a716-446655440000');
        expect(res).toEqual({
          success: true,
          status: 'paid',
        });
        expect(rpcSpy).not.toHaveBeenCalledWith('activate_listing_payment', expect.anything());
        expect(fromSpy).toHaveBeenCalledWith('listing_payments');
      } finally {
        rpcSpy.mockRestore();
        fromSpy.mockRestore();
        vi.unstubAllEnvs();
      }
    });
  });


  describe('publicListingService - Unit Tests (T10.8 & T10.9: Public Directory & Featured Priority)', () => {
    it('fetchPublicListings mengembalikan kamar kos aktif dengan listing is_featured di posisi teratas', async () => {
      const kosListings = await fetchPublicListings({ type: 'room_vacancy' });
      expect(kosListings).toBeDefined();
      expect(Array.isArray(kosListings)).toBe(true);

      if (kosListings.length > 1) {
        // Verifikasi bahwa listing pertama adalah featured jika ada setidaknya satu featured listing
        const hasFeatured = kosListings.some((l) => l.is_featured);
        if (hasFeatured) {
          expect(kosListings[0].is_featured).toBe(true);
        }
      }
    });

    it('fetchPublicListings mengembalikan listing UMKM sesuai filter type', async () => {
      const umkmListings = await fetchPublicListings({ type: 'umkm' });
      expect(umkmListings).toBeDefined();
      expect(Array.isArray(umkmListings)).toBe(true);
      expect(umkmListings.every((l) => l.type === 'umkm')).toBe(true);
    });

    it('fetchPublicListingById berhasil mengembalikan detail single listing', async () => {
      const item = await createPublicListing('demo-tenant-rtrw', {
        title: 'Kue Lapis Legit Nyonya',
        contact_phone: '08123456789',
        type: 'umkm',
      });

      const detail = await fetchPublicListingById(item.id);
      expect(detail).toBeDefined();
      expect(detail.id).toBe(item.id);
      expect(detail.title).toBe('Kue Lapis Legit Nyonya');

      // Mengembalikan null jika id kosong atau tidak ada
      expect(await fetchPublicListingById('')).toBeNull();
      expect(await fetchPublicListingById('non-existent-id-999')).toBeNull();
    });

    it('LIST-UI-1.2: resolveListingFacilities memprioritaskan properti facilities, unit metadata, lalu ekstraksi deskripsi', () => {
      // 1. Prioritas 1: properti facilities
      const listingWithFacilities = {
        title: 'Kamar Kos Biasa',
        facilities: ['AC', 'WiFi Internet'],
      };
      expect(resolveListingFacilities(listingWithFacilities)).toEqual(['AC', 'WiFi Internet']);

      // 2. Prioritas 2: metadata kamar terkait (unit_id)
      const listingNoFacilities = {
        title: 'Kamar Kos Melati 102',
        unit_id: 102,
      };
      const unitMetadata = {
        facilities: ['Kamar Mandi Dalam', 'Kasur & Bantal', 'Lemari Pakaian'],
      };
      expect(resolveListingFacilities(listingNoFacilities, unitMetadata)).toEqual([
        'Kamar Mandi Dalam',
        'Kasur & Bantal',
        'Lemari Pakaian',
      ]);

      // 3. Prioritas 3: fallback ekstraksi cerdas dari judul & deskripsi
      const listingExtract = {
        title: 'Kamar Kos Cozy AC',
        description: 'Fasilitas kamar mandi dalam, kasur springbed, lemari pakaian, water heater, dan WiFi kencang.',
      };
      const extracted = resolveListingFacilities(listingExtract);
      expect(extracted).toContain('AC');
      expect(extracted).toContain('Kamar Mandi Dalam');
      expect(extracted).toContain('Kasur & Bantal');
      expect(extracted).toContain('Lemari Pakaian');
      expect(extracted).toContain('Water Heater');
      expect(extracted).toContain('WiFi Internet');
    });

    it('LIST-UI-1.2: fetchPublicListings mengembalikan data listing kamar kos yang diperkaya fasilitas', async () => {
      const kosListings = await fetchPublicListings({ type: 'room_vacancy' });
      expect(kosListings).toBeDefined();
      expect(kosListings.length).toBeGreaterThan(0);
      const firstKos = kosListings[0];
      expect(Array.isArray(firstKos.facilities)).toBe(true);
      expect(firstKos.facilities.length).toBeGreaterThan(0);
    });
  });

  describe('LIST-UI-1.3: filterAndSortRoomListings (Logika Filter & Urutan Katalog Kos)', () => {
    const sampleKosListings = [
      {
        id: 'kos-1',
        title: 'Kamar 101 - Kos Flamboyan Putra AC Dekat UGM',
        category: 'Putra',
        price: 850000,
        facilities: ['AC', 'Kasur & Bantal', 'WiFi Internet'],
        location_hint: 'Sleman, Pogung',
        is_featured: false,
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'kos-2',
        title: 'Kamar 202 - Kos Cantika Putri Eksklusif',
        category: 'Putri',
        price: 1500000,
        facilities: ['AC', 'Kamar Mandi Dalam', 'WiFi Internet', 'Water Heater'],
        location_hint: 'Sleman, Seturan',
        is_featured: true,
        created_at: '2026-10-05T12:00:00Z',
      },
      {
        id: 'kos-3',
        title: 'Kamar 303 - Paviliun Campur Mewah Luas',
        category: 'Campur',
        price: 2500000,
        facilities: ['AC', 'Kamar Mandi Dalam', 'Kasur & Bantal', 'Lemari Pakaian', 'WiFi Internet', 'Dapur Bersama'],
        location_hint: 'Kota Yogyakarta, Gejayan',
        is_featured: false,
        created_at: '2026-10-10T08:00:00Z',
      },
      {
        id: 'kos-4',
        title: 'Kamar 404 - Kos Sederhana Putra Non AC',
        category: 'Putra',
        price: 600000,
        facilities: ['Kasur & Bantal', 'Lemari Pakaian'],
        location_hint: 'Bantul, Sewon',
        is_featured: false,
        created_at: '2026-10-08T14:00:00Z',
      },
      {
        id: 'kos-5',
        title: 'Kamar 505 - Kos Putri Melati Kamar Mandi Dalam',
        category: 'Putri',
        price: 1800000,
        // Belum ada property facilities, akan di-resolve dari title & description
        description: 'Fasilitas kamar mandi dalam, ac dingin, dan wifi internet lancar',
        location_hint: 'Sleman, Depok',
        is_featured: false,
        created_at: '2026-10-12T09:00:00Z',
      },
      {
        id: 'kos-6',
        title: 'Kamar 606 - Kos Hubungi Pengelola',
        category: 'Campur',
        price: null,
        facilities: ['WiFi Internet'],
        location_hint: 'Kota Yogyakarta',
        is_featured: false,
        created_at: '2026-10-02T09:00:00Z',
      },
    ];

    // 1. FILTER TIPE (Putra / Putri / Campur)
    describe('Filter Tipe (category: Putra / Putri / Campur)', () => {
      it('menyaring hanya kamar Putra ketika category "Putra" dipilih', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { category: 'Putra' });
        expect(result.length).toBe(2);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['kos-1', 'kos-4']));
        expect(result.every((r) => r.category === 'Putra')).toBe(true);
      });

      it('menyaring hanya kamar Putri ketika category "Putri" dipilih (case-insensitive)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { category: 'putri' });
        expect(result.length).toBe(2);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['kos-2', 'kos-5']));
        expect(result.every((r) => r.category === 'Putri')).toBe(true);
      });

      it('menyaring hanya kamar Campur ketika category "Campur" dipilih', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { category: 'Campur' });
        expect(result.length).toBe(2);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['kos-3', 'kos-6']));
        expect(result.every((r) => r.category === 'Campur')).toBe(true);
      });

      it('mengembalikan seluruh listing ketika category "all" atau tidak diset', () => {
        const resultAll = filterAndSortRoomListings(sampleKosListings, { category: 'all' });
        expect(resultAll.length).toBe(sampleKosListings.length);

        const resultEmpty = filterAndSortRoomListings(sampleKosListings, {});
        expect(resultEmpty.length).toBe(sampleKosListings.length);
      });
    });

    // 2. FILTER RENTANG HARGA (< 1 jt, 1-2 jt, > 2 jt)
    describe('Filter Rentang Harga (preset: < 1 jt, 1-2 jt, > 2 jt)', () => {
      it('menyaring kamar dengan harga < 1 jt (< Rp 1.000.000)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { priceRange: 'under1m' });
        expect(result.length).toBe(2);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['kos-1', 'kos-4']));
        expect(result.every((r) => r.price < 1000000)).toBe(true);

        // Alias preset '< 1 jt'
        const resultAlias = filterAndSortRoomListings(sampleKosListings, { priceRange: '< 1 jt' });
        expect(resultAlias.length).toBe(2);
      });

      it('menyaring kamar dengan harga 1-2 jt (Rp 1.000.000 - Rp 2.000.000)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { priceRange: '1m-2m' });
        expect(result.length).toBe(2);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['kos-2', 'kos-5']));
        expect(result.every((r) => r.price >= 1000000 && r.price <= 2000000)).toBe(true);

        // Alias preset '1-2 jt'
        const resultAlias = filterAndSortRoomListings(sampleKosListings, { priceRange: '1-2 jt' });
        expect(resultAlias.length).toBe(2);
      });

      it('menyaring kamar dengan harga > 2 jt (> Rp 2.000.000)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { priceRange: 'above2m' });
        expect(result.length).toBe(1);
        expect(result[0].id).toBe('kos-3');
        expect(result[0].price).toBe(2500000);

        // Alias preset '> 2 jt'
        const resultAlias = filterAndSortRoomListings(sampleKosListings, { priceRange: '> 2 jt' });
        expect(resultAlias.length).toBe(1);
      });

      it('mengabaikan kamar tanpa harga (null) ketika filter harga aktif', () => {
        const resultUnder1m = filterAndSortRoomListings(sampleKosListings, { priceRange: 'under1m' });
        expect(resultUnder1m.some((r) => r.id === 'kos-6')).toBe(false);

        const resultAbove2m = filterAndSortRoomListings(sampleKosListings, { priceRange: 'above2m' });
        expect(resultAbove2m.some((r) => r.id === 'kos-6')).toBe(false);
      });
    });

    // 3. FILTER FASILITAS (Multi-pilih & pencocokan dengan resolveListingFacilities)
    describe('Filter Fasilitas (multi-pilih dari kosFacilities)', () => {
      it('menyaring kamar yang memiliki fasilitas tertentu (mis. AC)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { facilities: ['AC'] });
        // kos-1, kos-2, kos-3, dan kos-5 (via description extraction)
        expect(result.length).toBe(4);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['kos-1', 'kos-2', 'kos-3', 'kos-5']));
      });

      it('menyaring kamar dengan multi-pilih fasilitas (kondisi AND: harus memiliki semua yang dipilih)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, {
          facilities: ['AC', 'Kamar Mandi Dalam'],
        });
        // kos-2, kos-3, dan kos-5 memiliki AC DAN Kamar Mandi Dalam
        expect(result.length).toBe(3);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['kos-2', 'kos-3', 'kos-5']));
        expect(result.some((r) => r.id === 'kos-1')).toBe(false); // kos-1 tidak punya Kamar Mandi Dalam
      });

      it('mendukung format facilities berupa string comma-separated dari URL query params', () => {
        const result = filterAndSortRoomListings(sampleKosListings, {
          facilities: 'AC, Water Heater',
        });
        expect(result.length).toBe(1);
        expect(result[0].id).toBe('kos-2');
      });

      it('mengembalikan array kosong jika tidak ada kamar yang memenuhi seluruh fasilitas yang dipilih', () => {
        const result = filterAndSortRoomListings(sampleKosListings, {
          facilities: ['Dapur Bersama', 'Water Heater'],
        });
        expect(result.length).toBe(0);
      });
    });

    // 4. PENGURUTAN (Termurah / Termahal / Terbaru)
    describe('Pengurutan Listing (Termurah / Termahal / Terbaru)', () => {
      it('mengurutkan berdasarkan "Termurah" (harga terendah ke tertinggi)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { sortBy: 'termurah' });
        const prices = result.map((r) => r.price).filter((p) => p !== null);
        for (let i = 0; i < prices.length - 1; i++) {
          expect(prices[i]).toBeLessThanOrEqual(prices[i + 1]);
        }
        expect(result[0].id).toBe('kos-4'); // 600.000
        expect(result[1].id).toBe('kos-1'); // 850.000
        // Item dengan harga null diletakkan paling akhir
        expect(result[result.length - 1].id).toBe('kos-6');
      });

      it('mengurutkan berdasarkan "Termahal" (harga tertinggi ke terendah)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { sortBy: 'termahal' });
        const prices = result.map((r) => r.price).filter((p) => p !== null);
        for (let i = 0; i < prices.length - 1; i++) {
          expect(prices[i]).toBeGreaterThanOrEqual(prices[i + 1]);
        }
        expect(result[0].id).toBe('kos-3'); // 2.500.000
        expect(result[1].id).toBe('kos-5'); // 1.800.000
        // Item dengan harga null diletakkan paling akhir
        expect(result[result.length - 1].id).toBe('kos-6');
      });

      it('mengurutkan berdasarkan "Terbaru" (default: is_featured diutamakan, lalu created_at terbaru)', () => {
        const result = filterAndSortRoomListings(sampleKosListings, { sortBy: 'terbaru' });
        // kos-2 adalah is_featured: true, sehingga berada di urutan teratas
        expect(result[0].id).toBe('kos-2');
        expect(result[0].is_featured).toBe(true);

        // Setelah featured, listing non-featured diurutkan dari created_at terbaru: kos-5 (12 Okt), kos-3 (10 Okt), kos-4 (8 Okt)
        expect(result[1].id).toBe('kos-5');
        expect(result[2].id).toBe('kos-3');
        expect(result[3].id).toBe('kos-4');
      });
    });

    // 5. KOMBINASI FILTER & FUNGSI MURNI
    describe('Kombinasi Filter & Immutability', () => {
      it('menggabungkan filter Tipe, Harga, Fasilitas, dan Pencarian', () => {
        const result = filterAndSortRoomListings(sampleKosListings, {
          category: 'Putri',
          priceRange: '1m-2m',
          facilities: ['Kamar Mandi Dalam'],
          query: 'Seturan',
        });

        expect(result.length).toBe(1);
        expect(result[0].id).toBe('kos-2');
        expect(result[0].title).toContain('Cantika Putri');
      });

      it('merupakan fungsi murni (pure function) yang tidak memutasi array input', () => {
        const originalCopy = JSON.parse(JSON.stringify(sampleKosListings));
        filterAndSortRoomListings(sampleKosListings, { sortBy: 'termurah' });
        expect(sampleKosListings).toEqual(originalCopy);
      });

      it('menangani input array kosong atau null secara aman', () => {
        expect(filterAndSortRoomListings([], { category: 'Putra' })).toEqual([]);
        expect(filterAndSortRoomListings(null, {})).toEqual([]);
        expect(filterAndSortRoomListings(undefined, {})).toEqual([]);
      });
    });
  });

  // LIST-UI-1.4: Helper WhatsApp & Normalisasi Nomor Telepon
  describe('LIST-UI-1.4: Helper WhatsApp & Normalisasi Nomor Kontak', () => {
    describe('normalizePhoneNumber', () => {
      it('menormalisasi format lokal 08xx menjadi 628xx', () => {
        expect(normalizePhoneNumber('081234567890')).toBe('6281234567890');
        expect(normalizePhoneNumber('08987654321')).toBe('628987654321');
      });

      it('menormalisasi format +62 menjadi 62', () => {
        expect(normalizePhoneNumber('+6281234567890')).toBe('6281234567890');
        expect(normalizePhoneNumber('+6285712345678')).toBe('6285712345678');
      });

      it('membuang spasi, tanda hubung (-), titik, dan tanda kurung', () => {
        expect(normalizePhoneNumber('0812-3456-7890')).toBe('6281234567890');
        expect(normalizePhoneNumber('+62 812 3456 7890')).toBe('6281234567890');
        expect(normalizePhoneNumber('+62-812-3456-7890')).toBe('6281234567890');
        expect(normalizePhoneNumber('(0812) 3456.7890')).toBe('6281234567890');
      });

      it('mempertahankan format yang sudah diawali 62', () => {
        expect(normalizePhoneNumber('6281234567890')).toBe('6281234567890');
      });

      it('menambahkan prefix 62 jika diawali digit 8 (mis. 81234567890)', () => {
        expect(normalizePhoneNumber('81234567890')).toBe('6281234567890');
      });

      it('mengembalikan null untuk nomor kosong, null, undefined, atau tidak valid', () => {
        expect(normalizePhoneNumber('')).toBeNull();
        expect(normalizePhoneNumber(null)).toBeNull();
        expect(normalizePhoneNumber(undefined)).toBeNull();
        expect(normalizePhoneNumber('abcde')).toBeNull();
        expect(normalizePhoneNumber('123')).toBeNull(); // terlalu pendek
        expect(normalizePhoneNumber('08')).toBeNull(); // terlalu pendek
      });
    });

    describe('buildListingWhatsAppUrl', () => {
      it('menghasilkan URL WhatsApp yang valid dengan pesan ter-encode', () => {
        const listing = {
          title: 'Kamar 101 - Kos Melati Harmoni',
          price: 1500000,
          contact_phone: '081234567890',
        };

        const url = buildListingWhatsAppUrl(listing, 'Kos Melati Harmoni');
        expect(url).toBeDefined();
        expect(url).toContain('https://wa.me/6281234567890?text=');

        // Pesan yang diharapkan: 'Halo, saya tertarik dengan iklan "Kamar 101 - Kos Melati Harmoni" (Rp1.500.000/bulan) di RuangWarga. Apakah masih tersedia?'
        const expectedMessage =
          'Halo, saya tertarik dengan iklan "Kamar 101 - Kos Melati Harmoni" (Rp1.500.000/bulan) di RuangWarga. Apakah masih tersedia?';
        expect(url).toBe(`https://wa.me/6281234567890?text=${encodeURIComponent(expectedMessage)}`);
      });

      it('bekerja dengan nomor yang memiliki format +62, spasi, dan tanda hubung', () => {
        const listing = {
          title: 'Kamar A2 Putri',
          price: 900000,
          contact_phone: '+62 813-9876-5432',
        };

        const url = buildListingWhatsAppUrl(listing);
        expect(url).toContain('https://wa.me/6281398765432?text=');
        expect(url).toContain(encodeURIComponent('Kamar A2 Putri'));
        expect(url).toContain(encodeURIComponent('Rp900.000/bulan'));
      });

      it('memformat harga 0 jika listing tidak memiliki harga yang valid', () => {
        const listing = {
          title: 'Kamar Tanpa Harga',
          price: null,
          contact_phone: '08122334455',
        };

        const url = buildListingWhatsAppUrl(listing);
        expect(url).toContain(encodeURIComponent('(Rp0/bulan)'));
      });

      it('mengembalikan null jika nomor kontak tidak ada atau tidak valid', () => {
        expect(buildListingWhatsAppUrl(null)).toBeNull();
        expect(buildListingWhatsAppUrl({})).toBeNull();
        expect(buildListingWhatsAppUrl({ contact_phone: '' })).toBeNull();
        expect(buildListingWhatsAppUrl({ contact_phone: 'tidak-ada-nomor' })).toBeNull();
      });
    });
  });
});





