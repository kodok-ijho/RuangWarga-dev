// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoomListingDirectory, {
  RoomListingCard,
  RoomImagePlaceholder,
  getFacilityIcon,
  formatRupiah,
} from './RoomListingDirectory';
import * as publicListingService from '../../services/publicListingService';

afterEach(cleanup);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui, { initialEntries = ['/'] } = {}) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RoomListingDirectory & RoomListingCard (LIST-UI-1.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. RENDER KARTU DENGAN DAN TANPA FOTO
  describe('Render Foto Utama & Fallback Ilustrasi (Rasio 4:3)', () => {
    it('merender kartu dengan foto utama rasio 4:3 bila foto tersedia', () => {
      const mockListing = {
        id: 'kos-foto-1',
        title: 'Kos Melati Harmoni - Kamar 101',
        category: 'Campur',
        price: 1500000,
        photos: ['https://example.com/photos/room-1.jpg'],
        location_hint: 'Sleman, Dekat UGM',
        facilities: ['AC', 'WiFi Internet'],
        is_featured: false,
      };

      renderWithProviders(<RoomListingCard listing={mockListing} />);

      const img = screen.getByRole('img', { name: mockListing.title });
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('https://example.com/photos/room-1.jpg');

      // Memastikan container foto memiliki rasio 4:3
      const photoContainer = img.closest('.aspect-\\[4\\/3\\]');
      expect(photoContainer).toBeTruthy();
      expect(screen.queryByTestId('room-photo-placeholder')).toBeNull();
    });

    it('merender fallback ilustrasi jika kartu tidak memiliki foto (photos kosong)', () => {
      const mockListingNoPhoto = {
        id: 'kos-no-photo',
        title: 'Kos Anggrek Indah - Kamar 02',
        category: 'Putri',
        price: 1200000,
        photos: [],
        location_hint: 'Pogung Baru',
        facilities: ['Kamar Mandi Dalam'],
        is_featured: false,
      };

      renderWithProviders(<RoomListingCard listing={mockListingNoPhoto} />);

      expect(screen.queryByRole('img')).toBeNull();
      const placeholder = screen.getByTestId('room-photo-placeholder');
      expect(placeholder).toBeTruthy();
      expect(screen.getByText('Foto belum tersedia')).toBeTruthy();
    });

    it('beralih ke fallback ilustrasi jika foto gagal dimuat (onError)', () => {
      const mockListingBrokenPhoto = {
        id: 'kos-broken-photo',
        title: 'Kos Melati - Kamar 03',
        category: 'Putra',
        price: 1000000,
        photos: ['https://invalid-domain.com/broken.jpg'],
        location_hint: 'Gejayan',
        facilities: ['Kasur & Bantal'],
        is_featured: false,
      };

      renderWithProviders(<RoomListingCard listing={mockListingBrokenPhoto} />);

      const img = screen.getByRole('img', { name: mockListingBrokenPhoto.title });
      expect(img).toBeTruthy();

      // Trigger image error
      fireEvent.error(img);

      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByTestId('room-photo-placeholder')).toBeTruthy();
    });
  });

  // 2. BADGE KATEGORI (PUTRA / PUTRI / CAMPUR)
  describe('Badge Kategori (Putra / Putri / Campur)', () => {
    it('merender badge Putra dengan benar dari category', () => {
      const mockListing = {
        id: 'kos-putra',
        title: 'Kos Putra Mahasiswa Jaya',
        category: 'Putra',
        price: 900000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListing} />);
      const badge = screen.getByTestId('badge-category');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('Putra');
    });

    it('merender badge Putri dengan benar dari category', () => {
      const mockListing = {
        id: 'kos-putri',
        title: 'Kos Putri Cantika Indah',
        category: 'Putri',
        price: 1400000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListing} />);
      const badge = screen.getByTestId('badge-category');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('Putri');
    });

    it('merender badge Campur dengan benar dari category', () => {
      const mockListing = {
        id: 'kos-campur',
        title: 'Kos Paviliun Asri Harmoni',
        category: 'Campur',
        price: 2000000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListing} />);
      const badge = screen.getByTestId('badge-category');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('Campur');
    });

    it('tidak merender badge kategori bila category null atau kosong', () => {
      const mockListingNoCat = {
        id: 'kos-no-cat',
        title: 'Kamar Kos Tanpa Kategori',
        category: null,
        price: 1000000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListingNoCat} />);
      expect(screen.queryByTestId('badge-category')).toBeNull();
    });
  });

  // 3. BADGE UNGGULAN BILA is_featured
  describe('Badge Unggulan (is_featured)', () => {
    it('merender badge Unggulan bila is_featured bernilai true', () => {
      const mockListingFeatured = {
        id: 'kos-featured-1',
        title: 'Kos Eksklusif UGM Prime',
        is_featured: true,
        price: 2500000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListingFeatured} />);
      const featuredBadge = screen.getByTestId('badge-featured');
      expect(featuredBadge).toBeTruthy();
      expect(featuredBadge.textContent).toContain('Unggulan');
    });

    it('tidak merender badge Unggulan bila is_featured bernilai false', () => {
      const mockListingRegular = {
        id: 'kos-regular-1',
        title: 'Kos Standar Melati',
        is_featured: false,
        price: 800000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListingRegular} />);
      expect(screen.queryByTestId('badge-featured')).toBeNull();
    });
  });

  // 4. HARGA BESAR 'Rp X / bulan'
  describe('Format & Penampilan Harga', () => {
    it('merender harga besar dengan format Rupiah dan satuan / bulan', () => {
      const mockListing = {
        id: 'kos-price-1',
        title: 'Kos Melati Deluxe',
        price: 1850000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListing} />);
      const priceContainer = screen.getByTestId('listing-price-container');
      expect(priceContainer.textContent).toMatch(/Rp\s*1\.850\.000/i);
      expect(priceContainer.textContent).toContain('/ bulan');
    });

    it('merender teks fallback jika harga belum ditentukan', () => {
      const mockListingNoPrice = {
        id: 'kos-no-price',
        title: 'Kos Melati Standar',
        price: null,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListingNoPrice} />);
      expect(screen.getByText('Hubungi Pengelola')).toBeTruthy();
    });
  });

  // 5. FASILITAS: MAKSIMAL 4 IKON + '+N'
  describe('Fasilitas: Maksimal 4 Ikon Fasilitas + "+N"', () => {
    it('merender maksimal 4 ikon fasilitas dan menampilkan badge overflow +N bila fasilitas > 4', () => {
      const mockListing6Facilities = {
        id: 'kos-6-fac',
        title: 'Kos Super Lengkap 6 Fasilitas',
        facilities: [
          'AC',
          'WiFi Internet',
          'Kamar Mandi Dalam',
          'Kasur & Bantal',
          'Lemari Pakaian',
          'Water Heater',
        ],
        price: 2200000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListing6Facilities} />);

      const icons = screen.getAllByTestId('facility-icon-item');
      expect(icons).toHaveLength(4);

      // Badge overflow +2 (6 - 4)
      const overflowBadge = screen.getByTestId('facility-overflow-badge');
      expect(overflowBadge).toBeTruthy();
      expect(overflowBadge.textContent).toContain('+2');
    });

    it('merender semua ikon fasilitas tanpa badge overflow bila fasilitas <= 4', () => {
      const mockListing3Facilities = {
        id: 'kos-3-fac',
        title: 'Kos Standar 3 Fasilitas',
        facilities: ['AC', 'WiFi Internet', 'Kamar Mandi Dalam'],
        price: 1500000,
        photos: [],
      };

      renderWithProviders(<RoomListingCard listing={mockListing3Facilities} />);

      const icons = screen.getAllByTestId('facility-icon-item');
      expect(icons).toHaveLength(3);
      expect(screen.queryByTestId('facility-overflow-badge')).toBeNull();
    });
  });

  // 6. SKELETON SAAT MEMUAT & EMPTY STATE PADA DIREKTORI
  describe('RoomListingDirectory: Skeleton & Empty State', () => {
    it('menampilkan skeleton loading saat data sedang dimuat', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListings').mockReturnValue(
        new Promise(() => {}) // Pending promise to keep loading state
      );

      renderWithProviders(<RoomListingDirectory />);

      const skeletonGrid = screen.getByTestId('listing-loading-skeleton-grid');
      expect(skeletonGrid).toBeTruthy();
      const skeletons = screen.getAllByTestId('room-listing-skeleton');
      expect(skeletons.length).toBeGreaterThanOrEqual(4);
    });

    it('menampilkan empty state yang mengajak pemilik kos "Pasang iklan di RuangWarga" bila tidak ada iklan', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListings').mockResolvedValue([]);

      renderWithProviders(<RoomListingDirectory />);

      await waitFor(() => {
        expect(screen.getByTestId('empty-listing-state')).toBeTruthy();
      });

      expect(screen.getByText('Belum Ada Kamar Kos yang Tayang')).toBeTruthy();
      expect(
        screen.getByText(/Pasang iklan di RuangWarga agar cepat tersewa langsung ke calon penyewa tanpa calo/i)
      ).toBeTruthy();

      const ctaLink = screen.getByRole('link', { name: /Pasang Iklan di RuangWarga/i });
      expect(ctaLink).toBeTruthy();
      expect(ctaLink.getAttribute('href')).toBe('/login');
    });

    it('merender grid responsif (1 HP, 2 tablet, 3-4 desktop) saat data listing tersedia', async () => {
      const mockData = [
        {
          id: 'k1',
          title: 'Kamar 101 - Kos Flamboyan',
          category: 'Putra',
          price: 1100000,
          location_hint: 'Kaliurang KM 5',
          facilities: ['AC', 'WiFi Internet'],
          is_featured: true,
          photos: ['https://example.com/k1.jpg'],
        },
        {
          id: 'k2',
          title: 'Kamar 102 - Kos Mawar',
          category: 'Putri',
          price: 950000,
          location_hint: 'Seturan',
          facilities: ['Kasur & Bantal', 'Lemari Pakaian'],
          is_featured: false,
          photos: [],
        },
      ];

      vi.spyOn(publicListingService, 'fetchPublicListings').mockResolvedValue(mockData);

      renderWithProviders(<RoomListingDirectory />);

      await waitFor(() => {
        expect(screen.getByTestId('room-listing-grid')).toBeTruthy();
      });

      const grid = screen.getByTestId('room-listing-grid');
      expect(grid.className).toContain('grid-cols-1');
      expect(grid.className).toContain('sm:grid-cols-2');
      expect(grid.className).toContain('lg:grid-cols-3');
      expect(grid.className).toContain('xl:grid-cols-4');

      const cards = screen.getAllByTestId('room-listing-card');
      expect(cards).toHaveLength(2);
    });
  });

  // 7. HELPER FUNCTIONS
  describe('Helper Functions (formatRupiah & getFacilityIcon)', () => {
    it('formatRupiah memformat angka dengan tepat', () => {
      expect(formatRupiah(1500000)).toMatch(/Rp\s*1\.500\.000/);
      expect(formatRupiah(null)).toBe('Hubungi Pengelola');
      expect(formatRupiah(undefined)).toBe('Hubungi Pengelola');
    });

    it('getFacilityIcon mengembalikan komponen ikon yang tepat', () => {
      const acIcon = getFacilityIcon('AC');
      expect(acIcon).toBeDefined();

      const wifiIcon = getFacilityIcon('WiFi Internet');
      expect(wifiIcon).toBeDefined();

      const defaultIcon = getFacilityIcon('Fasilitas Unik Lainnya');
      expect(defaultIcon).toBeDefined();
    });
  });

  // 8. LIST-UI-1.3: QUERY STRING URL (useSearchParams), FILTER CHIPS & URUTAN
  describe('LIST-UI-1.3: Sinkronisasi Query String URL & Filter Chips', () => {
    const mockDirectoryListings = [
      {
        id: 'kos-katalog-1',
        title: 'Kamar Putri Melati AC UGM',
        category: 'Putri',
        price: 1500000,
        location_hint: 'Sleman, Pogung',
        facilities: ['AC', 'WiFi Internet', 'Kamar Mandi Dalam'],
        is_featured: true,
        created_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'kos-katalog-2',
        title: 'Kamar Putra Murah Non AC',
        category: 'Putra',
        price: 750000,
        location_hint: 'Bantul',
        facilities: ['Kasur & Bantal', 'Lemari Pakaian'],
        is_featured: false,
        created_at: '2026-10-05T08:00:00Z',
      },
      {
        id: 'kos-katalog-3',
        title: 'Kamar Campur Gejayan Deluxe',
        category: 'Campur',
        price: 2400000,
        location_hint: 'Gejayan',
        facilities: ['AC', 'WiFi Internet', 'Water Heater'],
        is_featured: false,
        created_at: '2026-10-12T11:00:00Z',
      },
    ];

    it('membaca query string URL dan mengaktifkan chip Tipe, Harga, Fasilitas, dan Sort yang sesuai', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListings').mockResolvedValue(mockDirectoryListings);

      // Render dengan query string lengkap di URL
      renderWithProviders(<RoomListingDirectory />, {
        initialEntries: [
          '/listing/kos?category=Putri&price=1m-2m&facilities=AC,WiFi+Internet&sort=termurah&featured=true',
        ],
      });

      // Tunggu hingga data termuat dan kartu kamar kos tampil
      await waitFor(() => {
        expect(screen.getAllByTestId('room-listing-card')).toHaveLength(1);
      });

      // 1. Chip Tipe Putri aktif
      const chipPutri = screen.getByTestId('filter-type-putri');
      expect(chipPutri.className).toContain('bg-forest-800');
      expect(chipPutri.className).toContain('text-gold-300');

      // 2. Chip Harga 1-2 Juta aktif
      const chipHarga = screen.getByTestId('filter-price-1m-2m');
      expect(chipHarga.className).toContain('bg-forest-800');

      // 3. Chip Fasilitas AC dan WiFi Internet aktif
      const chipAc = screen.getByTestId('filter-facility-AC');
      expect(chipAc.className).toContain('bg-forest-800');
      const chipWifi = screen.getByTestId('filter-facility-WiFi Internet');
      expect(chipWifi.className).toContain('bg-forest-800');

      // 4. Dropdown Sort memiliki value 'termurah'
      const sortSelect = screen.getByTestId('sort-select');
      expect(sortSelect.value).toBe('termurah');

      // 5. Toggle Unggulan aktif
      const featuredBtn = screen.getByTestId('filter-featured-toggle');
      expect(featuredBtn.className).toContain('border-amber-400');

      // 6. Hasil yang tampil hanya kos-katalog-1
      const cards = screen.getAllByTestId('room-listing-card');
      expect(cards).toHaveLength(1);
      expect(screen.getByText('Kamar Putri Melati AC UGM')).toBeTruthy();
      expect(screen.getByTestId('results-count').textContent).toContain('1 kamar');

      // 7. Tombol Reset Filter terlihat di header
      expect(screen.getByTestId('btn-reset-filters')).toBeTruthy();
    });

    it('mengklik tombol Reset Filter membersihkan semua filter aktif', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListings').mockResolvedValue(mockDirectoryListings);

      renderWithProviders(<RoomListingDirectory />, {
        initialEntries: ['/listing/kos?category=Putri'],
      });

      // Tunggu hingga data termuat dan kartu tampil (hanya kos Putri yang tampil, 1 kamar)
      await waitFor(() => {
        expect(screen.getAllByTestId('room-listing-card')).toHaveLength(1);
      });

      expect(screen.getByTestId('btn-reset-filters')).toBeTruthy();

      // Klik reset
      fireEvent.click(screen.getByTestId('btn-reset-filters'));

      await waitFor(() => {
        // Setelah reset, semua 3 kamar tampil kembali
        expect(screen.getAllByTestId('room-listing-card')).toHaveLength(3);
      });

      // Tombol Reset Filter tidak lagi tampil
      expect(screen.queryByTestId('btn-reset-filters')).toBeNull();
    });

    it('mengklik chip tipe mengupdate filter hasil kamar kos', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListings').mockResolvedValue(mockDirectoryListings);

      renderWithProviders(<RoomListingDirectory />, {
        initialEntries: ['/listing/kos'],
      });

      await waitFor(() => {
        expect(screen.getAllByTestId('room-listing-card')).toHaveLength(3);
      });

      // Klik chip Putra
      const chipPutra = screen.getByTestId('filter-type-putra');
      fireEvent.click(chipPutra);

      await waitFor(() => {
        const cards = screen.getAllByTestId('room-listing-card');
        expect(cards).toHaveLength(1);
        expect(screen.getByText('Kamar Putra Murah Non AC')).toBeTruthy();
      });
    });
  });
});
