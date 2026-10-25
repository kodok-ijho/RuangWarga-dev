// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RoomListingDetail, { resolveKosName } from './RoomListingDetail';
import * as publicListingService from '../../services/publicListingService';

afterEach(cleanup);

function renderDetailWithRouter(initialEntry = '/listing/kos/kamar-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/listing/kos/:id" element={<RoomListingDetail />} />
        <Route path="/listing/kos" element={<div>Katalog Kos</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RoomListingDetail (LIST-UI-1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCompleteListing = {
    id: 'kamar-101',
    title: 'Kamar 101 - Kos Melati Harmoni',
    category: 'Putra',
    price: 1500000,
    photos: [
      'https://example.com/foto-1.jpg',
      'https://example.com/foto-2.jpg',
      'https://example.com/foto-3.jpg',
    ],
    location_hint: 'Jl. Kaliurang KM 5, Sleman',
    facilities: ['AC', 'Kamar Mandi Dalam', 'WiFi Internet', 'Kasur & Bantal', 'Meja Belajar'],
    description: 'Kamar nyaman dan tenang, cocok untuk mahasiswa dan pekerja kantoran.',
    contact_phone: '081234567890',
    tenant_name: 'Kos Melati Harmoni',
    is_featured: true,
  };

  // 1. RENDER DETAIL LENGKAP
  describe('Render Informasi Detail Iklan Kos', () => {
    it('merender judul, lokasi, badge tipe, nama kos, harga, fasilitas, dan deskripsi dengan tepat', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue(mockCompleteListing);

      renderDetailWithRouter('/listing/kos/kamar-101');

      // Tunggu hingga loading selesai
      await waitFor(() => {
        expect(screen.getByTestId('listing-title')).toBeTruthy();
      });

      // 1. Judul
      expect(screen.getByTestId('listing-title').textContent).toBe('Kamar 101 - Kos Melati Harmoni');

      // 2. Lokasi
      expect(screen.getByTestId('listing-location').textContent).toContain('Jl. Kaliurang KM 5, Sleman');

      // 3. Badge Kategori / Tipe (Putra)
      const badgeCategory = screen.getByTestId('badge-category');
      expect(badgeCategory).toBeTruthy();
      expect(badgeCategory.textContent).toBe('Putra');

      // 4. Badge Unggulan
      expect(screen.getByTestId('badge-featured')).toBeTruthy();

      // 5. Info Pengelola (Nama Kos)
      expect(screen.getByTestId('listing-kos-name').textContent).toBe('Kos Melati Harmoni');

      // 6. Fasilitas Lengkap Berikon
      const facilityItems = screen.getAllByTestId('facility-full-item');
      expect(facilityItems.length).toBe(5);
      expect(screen.getByText('AC')).toBeTruthy();
      expect(screen.getByText('Kamar Mandi Dalam')).toBeTruthy();
      expect(screen.getByText('WiFi Internet')).toBeTruthy();

      // 7. Deskripsi
      expect(screen.getByTestId('listing-description').textContent).toContain('Kamar nyaman dan tenang');

      // 8. Harga Desktop
      expect(screen.getByTestId('desktop-price-text').textContent).toContain('1.500.000');

      // 9. Harga Mobile Bar
      expect(screen.getByTestId('mobile-price-text').textContent).toContain('1.500.000');
    });

    it('merender badge tipe Putri dan Campur dengan warna yang sesuai', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue({
        ...mockCompleteListing,
        category: 'Putri',
      });

      renderDetailWithRouter('/listing/kos/kamar-101');

      await waitFor(() => {
        expect(screen.getByTestId('badge-category')).toBeTruthy();
      });
      expect(screen.getByTestId('badge-category').textContent).toBe('Putri');
    });

    it('merender tampilan empty state bila kamar tidak ditemukan', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue(null);

      renderDetailWithRouter('/listing/kos/non-existent');

      await waitFor(() => {
        expect(screen.getByTestId('detail-not-found')).toBeTruthy();
      });
      expect(screen.getByText('Kamar Tidak Ditemukan')).toBeTruthy();
    });
  });

  // 2. GALERI FOTO, THUMBNAIL & TOUCH SWIPE
  describe('Galeri Foto (Thumbnail & Touch Swipe HP)', () => {
    it('mengganti gambar besar saat thumbnail diklik', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue(mockCompleteListing);

      renderDetailWithRouter('/listing/kos/kamar-101');

      await waitFor(() => {
        expect(screen.getByTestId('listing-gallery')).toBeTruthy();
      });

      // Foto awal adalah foto-1.jpg
      const mainImg = screen.getByRole('img', { name: mockCompleteListing.title });
      expect(mainImg.getAttribute('src')).toBe('https://example.com/foto-1.jpg');

      // Klik thumbnail kedua
      const thumb2 = screen.getByTestId('gallery-thumb-1');
      fireEvent.click(thumb2);

      // Gambar besar harus berganti ke foto-2.jpg
      const updatedImg = screen.getByRole('img', { name: mockCompleteListing.title });
      expect(updatedImg.getAttribute('src')).toBe('https://example.com/foto-2.jpg');

      // Klik thumbnail ketiga
      const thumb3 = screen.getByTestId('gallery-thumb-2');
      fireEvent.click(thumb3);

      const finalImg = screen.getByRole('img', { name: mockCompleteListing.title });
      expect(finalImg.getAttribute('src')).toBe('https://example.com/foto-3.jpg');
    });

    it('merespons touch swipe pada HP untuk berpindah foto berikutnya dan sebelumnya', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue(mockCompleteListing);

      renderDetailWithRouter('/listing/kos/kamar-101');

      await waitFor(() => {
        expect(screen.getByTestId('gallery-main-container')).toBeTruthy();
      });

      const container = screen.getByTestId('gallery-main-container');

      // 1. Simulasikan Swipe Kiri (touchStartX = 250, touchEndX = 100 -> diff = +150 > 45) -> Foto berikutnya
      fireEvent.touchStart(container, { touches: [{ clientX: 250 }] });
      fireEvent.touchMove(container, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(container);

      await waitFor(() => {
        const img = screen.getByRole('img', { name: mockCompleteListing.title });
        expect(img.getAttribute('src')).toBe('https://example.com/foto-2.jpg');
      });

      // 2. Simulasikan Swipe Kanan (touchStartX = 100, touchEndX = 250 -> diff = -150 < -45) -> Foto sebelumnya
      fireEvent.touchStart(container, { touches: [{ clientX: 100 }] });
      fireEvent.touchMove(container, { touches: [{ clientX: 250 }] });
      fireEvent.touchEnd(container);

      await waitFor(() => {
        const img = screen.getByRole('img', { name: mockCompleteListing.title });
        expect(img.getAttribute('src')).toBe('https://example.com/foto-1.jpg');
      });
    });

    it('menampilkan fallback ilustrasi bila listing tidak memiliki foto (photos kosong)', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue({
        ...mockCompleteListing,
        photos: [],
      });

      renderDetailWithRouter('/listing/kos/kamar-101');

      await waitFor(() => {
        expect(screen.getByTestId('listing-gallery')).toBeTruthy();
      });

      expect(screen.getByTestId('room-photo-placeholder')).toBeTruthy();
      expect(screen.getByText('Foto belum tersedia')).toBeTruthy();
      expect(screen.queryByTestId('gallery-thumbnails')).toBeNull();
    });
  });

  // 3. KOTAK HARGA DESKTOP (STICKY) & LINK WHATSAPP
  describe('Kotak Harga Desktop (Sticky) & Tombol WhatsApp', () => {
    it('merender kotak harga desktop menempel (sticky) dengan harga dan tombol WhatsApp hijau', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue(mockCompleteListing);

      renderDetailWithRouter('/listing/kos/kamar-101');

      await waitFor(() => {
        expect(screen.getByTestId('desktop-price-card')).toBeTruthy();
      });

      const desktopCard = screen.getByTestId('desktop-price-card');
      expect(desktopCard.className).toContain('sticky');

      const waBtn = screen.getByTestId('desktop-wa-button');
      expect(waBtn).toBeTruthy();
      expect(waBtn.getAttribute('target')).toBe('_blank');
      expect(waBtn.getAttribute('rel')).toBe('noopener noreferrer');
      expect(waBtn.className).toContain('bg-emerald-600');

      // Memastikan URL memanggil wa.me dengan nomor dan pesan ter-encode
      const href = waBtn.getAttribute('href');
      expect(href).toContain('https://wa.me/6281234567890?text=');
      expect(href).toContain(encodeURIComponent('Kamar 101 - Kos Melati Harmoni'));
      expect(href).toContain(encodeURIComponent('Rp1.500.000/bulan'));
    });

    it('menonaktifkan tombol WhatsApp jika nomor kontak pengelola tidak valid atau tidak tersedia', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue({
        ...mockCompleteListing,
        contact_phone: '',
      });

      renderDetailWithRouter('/listing/kos/kamar-101');

      await waitFor(() => {
        expect(screen.getByTestId('desktop-wa-button-disabled')).toBeTruthy();
      });

      const disabledBtn = screen.getByTestId('desktop-wa-button-disabled');
      expect(disabledBtn.hasAttribute('disabled')).toBe(true);
      expect(disabledBtn.textContent).toContain('Nomor WhatsApp Tidak Tersedia');

      const mobileDisabledBtn = screen.getByTestId('mobile-wa-button-disabled');
      expect(mobileDisabledBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  // 4. BAR BAWAH MOBILE (FIXED)
  describe('Bar Bawah Tetap (Fixed) pada HP', () => {
    it('merender fixed bottom bar dengan harga dan tombol WhatsApp untuk mobile', async () => {
      vi.spyOn(publicListingService, 'fetchPublicListingById').mockResolvedValue(mockCompleteListing);

      renderDetailWithRouter('/listing/kos/kamar-101');

      await waitFor(() => {
        expect(screen.getByTestId('mobile-bottom-bar')).toBeTruthy();
      });

      const mobileBar = screen.getByTestId('mobile-bottom-bar');
      expect(mobileBar.className).toContain('fixed');
      expect(mobileBar.className).toContain('bottom-0');

      const mobileWaBtn = screen.getByTestId('mobile-wa-button');
      expect(mobileWaBtn).toBeTruthy();
      expect(mobileWaBtn.getAttribute('target')).toBe('_blank');
      expect(mobileWaBtn.getAttribute('rel')).toBe('noopener noreferrer');
      expect(mobileWaBtn.getAttribute('href')).toContain('https://wa.me/6281234567890');
    });
  });

  // 5. HELPER resolveKosName
  describe('Helper resolveKosName', () => {
    it('mengembalikan tenant_name jika sudah ada di listing', () => {
      expect(resolveKosName({ tenant_name: 'Kos Bintang 5' })).toBe('Kos Bintang 5');
    });

    it('mengekstrak nama kos dari judul "Kamar 01 - Kos Anggrek"', () => {
      expect(resolveKosName({ title: 'Kamar 01 - Kos Anggrek' })).toBe('Kos Anggrek');
    });

    it('mengembalikan Kos Melati Harmoni untuk demo-tenant-kos', () => {
      expect(resolveKosName({ tenant_id: 'demo-tenant-kos' })).toBe('Kos Melati Harmoni');
    });

    it('mengembalikan Pengelola Kos sebagai fallback', () => {
      expect(resolveKosName(null)).toBe('Pengelola Kos');
      expect(resolveKosName({})).toBe('Pengelola Kos');
    });
  });
});
