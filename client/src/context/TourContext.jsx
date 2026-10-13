import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

const TourContext = createContext(null);

/**
 * Konfigurasi panduan terpisah per-halaman & per-aksi.
 */
export const TOURS_CONFIG = {
  dashboard: {
    key: 'pv_tour_dashboard',
    title: 'Panduan Dashboard',
    steps: [
      {
        id: 'dashboard-welcome',
        targetSelector: '[data-tour="dashboard-hero"]',
        fallbackSelector: 'main',
        title: 'Selamat Datang di RuangWarga! 👋',
        description: 'Pusat layanan informasi resmi komunitas untuk melihat ringkasan lingkungan dan mengakses fitur utama.',
      },
      {
        id: 'profile-detail',
        targetSelector: '[data-tour="profile-badge"], [data-tour="user-profile-button"]',
        fallbackSelector: '[data-tour="dashboard-hero"]',
        title: 'Identitas & Profil Warga 👤',
        description: 'Di sini Anda dapat melihat identitas Anda. Klik profil di atas untuk melengkapi nomor WhatsApp aktif agar menerima notifikasi tagihan IPL.',
      },
      {
        id: 'dashboard-features',
        targetSelector: '[data-tour="dashboard-features"]',
        fallbackSelector: 'main',
        title: 'Menu Fitur Cepat 📱',
        description: 'Gunakan shortcut ini untuk langsung membuka Matriks IPL, Denah Rumah & Mapsite, Direktori Warga, dan Dokumentasi Kegiatan.',
      },
    ],
  },

  payment_matrix: {
    key: 'pv_tour_payment_matrix',
    title: 'Panduan Matriks IPL',
    steps: [
      {
        id: 'matrix-legend',
        targetSelector: '[data-tour="matrix-pay-guide"]',
        fallbackSelector: '[data-tour="matrix-grid"]',
        title: 'Status Warna Iuran IPL 📅',
        description: 'Tabel ini menampilkan status iuran 12 bulan (Juli - Juni). Hijau = Lunas, Oranye = Menunggu Verifikasi, dan Kuning = Belum Bayar.',
      },
      {
        id: 'my-unit-row',
        targetSelector: '[data-tour="my-unit-row"]',
        fallbackSelector: '[data-tour="matrix-grid"]',
        title: 'Baris Rumah / Unit Anda 🏠',
        description: 'Ini adalah baris tagihan rumah Anda yang disorot. Klik kotak bulan yang belum lunas untuk memilih periode tagihan yang ingin dibayar.',
      },
      {
        id: 'matrix-action',
        targetSelector: '[data-tour="matrix-grid"]',
        fallbackSelector: 'main',
        title: 'Pilih & Mulai Pembayaran 💳',
        description: 'Setelah memilih bulan yang ingin dibayar, tombol pembayaran akan muncul di bawah. Anda dapat membayar via QRIS DOKU atau Transfer Bank.',
      },
    ],
  },

  pay_transfer: {
    key: 'pv_tour_pay_transfer',
    title: 'Panduan Transfer Bank',
    steps: [
      {
        id: 'pay-transfer-guide',
        targetSelector: '[data-tour="pay-transfer-guide"]',
        fallbackSelector: 'form',
        title: 'Metode Transfer Bank 🏦',
        description: 'Silakan transfer ke nomor rekening pengurus, lalu unggah foto/screenshot bukti transfer. Pembayaran akan diverifikasi oleh Bendahara.',
      },
    ],
  },

  pay_qris: {
    key: 'pv_tour_pay_qris',
    title: 'Panduan Bayar QRIS',
    steps: [
      {
        id: 'pay-qris-guide',
        targetSelector: '[data-tour="pay-qris-guide"]',
        fallbackSelector: 'form',
        title: 'Pembayaran Instan QRIS 📱',
        description: 'Scan kode QR langsung dari M-Banking/E-Wallet atau unduh gambar QRIS ke galeri HP. Sesuai regulasi Bank Indonesia, ada biaya layanan administrasi 0,7% yang dibebankan kepada pembayar.',
      },
    ],
  },

  houses: {
    key: 'pv_tour_houses',
    title: 'Panduan Denah & Rumah',
    steps: [
      {
        id: 'houses-mapsite',
        targetSelector: '[data-tour="houses-mapsite"]',
        fallbackSelector: 'main',
        title: 'Peta Denah Unit & Mapsite 🗺️',
        description: 'Peta resolusi tinggi posisi blok perumahan. Anda dapat memperbesar peta untuk melihat denah dengan jelas.',
      },
      {
        id: 'houses-stats',
        targetSelector: '[data-tour="houses-stats"]',
        fallbackSelector: '[data-tour="houses-mapsite"]',
        title: 'Statistik & Status Rumah 🏡',
        description: 'Pantau jumlah unit terhuni (skema komplit) dan unit kosong (skema basic) di seluruh blok perumahan.',
      },
    ],
  },

  residents: {
    key: 'pv_tour_residents',
    title: 'Panduan Direktori Warga',
    steps: [
      {
        id: 'residents-filters',
        targetSelector: '[data-tour="residents-filters"]',
        fallbackSelector: 'main',
        title: 'Pencarian & Filter Penghuni 🔍',
        description: 'Cari tetangga berdasarkan nama, nomor telepon, atau filter berdasarkan Blok dan status hunian.',
      },
      {
        id: 'residents-list',
        targetSelector: '[data-tour="residents-list"]',
        fallbackSelector: 'main',
        title: 'Buku Kontak Penghuni 👥',
        description: 'Daftar nomor kontak anggota komunitas untuk mempermudah komunikasi dan koordinasi lingkungan antar-tetangga.',
      },
    ],
  },
};

export function TourProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [activeTourKey, setActiveTourKey] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const activeTour = activeTourKey ? TOURS_CONFIG[activeTourKey] : null;
  const steps = activeTour ? activeTour.steps : [];
  const currentStep = steps[currentStepIndex] || null;
  const isOpen = Boolean(activeTour && currentStep);

  // Mulai tur secara eksplisit (misal user klik tombol 💡 Panduan)
  const startTour = useCallback((tourKey = 'dashboard') => {
    if (!TOURS_CONFIG[tourKey]) return;
    setActiveTourKey(tourKey);
    setCurrentStepIndex(0);
  }, []);

  // Pemicu otomatis per-halaman (hanya jalan jika belum pernah dilihat)
  const triggerTour = useCallback((tourKey, force = false) => {
    if (!TOURS_CONFIG[tourKey]) return;
    const storageKey = TOURS_CONFIG[tourKey].key;
    const isCompleted = localStorage.getItem(storageKey);

    if (!isCompleted || force) {
      // Beri sedikit delay agar DOM halaman ter-render sempurna
      const timer = setTimeout(() => {
        setActiveTourKey(tourKey);
        setCurrentStepIndex(0);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, []);

  const skipTour = useCallback(() => {
    if (activeTourKey && TOURS_CONFIG[activeTourKey]) {
      localStorage.setItem(TOURS_CONFIG[activeTourKey].key, 'true');
    }
    setActiveTourKey(null);
    setCurrentStepIndex(0);
  }, [activeTourKey]);

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      // Selesai tur ini
      skipTour();
    }
  }, [currentStepIndex, steps.length, skipTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const resetAllTours = useCallback(() => {
    Object.values(TOURS_CONFIG).forEach((config) => {
      localStorage.removeItem(config.key);
    });
    startTour('dashboard');
  }, [startTour]);

  // Tutup tur jika logout
  useEffect(() => {
    if (!isAuthenticated) {
      setActiveTourKey(null);
      setCurrentStepIndex(0);
    }
  }, [isAuthenticated]);

  return (
    <TourContext.Provider
      value={{
        isOpen,
        activeTourKey,
        activeTour,
        currentStepIndex,
        totalSteps: steps.length,
        currentStep,
        startTour,
        triggerTour,
        skipTour,
        nextStep,
        prevStep,
        resetAllTours,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour harus digunakan di dalam <TourProvider>');
  }
  return ctx;
}
