/**
 * communityData.js
 * Layanan data default pengumuman komunitas (announcements) per vertikal.
 * Mendukung filter urgensi dan pencarian.
 */

export const DEFAULT_ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    tenant_id: 'default',
    title: 'Kerja Bakti Lingkungan & Fogging Nyamuk DBD',
    category: 'Kegiatan Warga',
    urgency: 'urgent', // 'urgent' | 'important' | 'info'
    date: '2026-03-18',
    author: 'Pengurus RT/RW',
    summary: 'Kerja bakti pembersihan saluran air dan fogging nyamuk akan dilaksanakan serentak hari Minggu pukul 07.00 WIB.',
    content: 'Sehubungan dengan musim hujan dan pencegahan penyakit demam berdarah (DBD), pengurus mengundang seluruh warga untuk berpartisipasi dalam kerja bakti massal. Titik kumpul berada di Pos Satpam Utama. Harap membawa peralatan kebersihan masing-masing. Tim fogging dari puskesmas akan mulai menyemprot pada pukul 09.00 WIB. Mohon pintu dan jendela rumah dibuka secukupnya serta makanan ditutup rapat.',
    action_label: 'Lihat Jadwal',
    is_pinned: true,
  },
  {
    id: 'ann-2',
    tenant_id: 'default',
    title: 'Pemberitahuan Pemeliharaan Lampu Jalan & Gerbang Utama',
    category: 'Fasilitas',
    urgency: 'important',
    date: '2026-03-15',
    author: 'Seksi Keamanan & Sarpras',
    summary: 'Perbaikan instalasi lampu penerangan jalan utama dan pemeliharaan palang pintu otomatis gerbang masuk komplek.',
    content: 'Akan dilakukan perbaikan instalasi kabel lampu penerangan jalan di Blok A dan Blok B serta penggantian sensor gerbang otomatis pada hari Kamis, 20 Maret 2026 mulai pukul 13.00 s/d 16.00 WIB. Selama proses perbaikan, akses masuk satu jalur akan dibuka secara manual oleh petugas keamanan. Mohon maklum atas ketidaknyamanan sementara ini.',
    is_pinned: false,
  },
  {
    id: 'ann-3',
    tenant_id: 'default',
    title: 'Pendaftaran Peserta Lomba HUT Kemerdekaan RI Telah Dibuka',
    category: 'Acara',
    urgency: 'info',
    date: '2026-03-10',
    author: 'Panitia Event',
    summary: 'Pendaftaran turnamen bulutangkis antar blok dan lomba anak-anak dapat dilakukan melalui koordinator masing-masing.',
    content: 'Dalam rangka memeriahkan peringatan kemerdekaan, panitia membuka pendaftaran lomba futsal anak, bulutangkis ganda putra/putri, serta lomba tumpeng antar RT. Pendaftaran tidak dipungut biaya dan terbuka untuk seluruh warga tetap maupun penghuni kontrakan/kos. Informasi lebih lanjut hubungi sekretariat panitia di Pos Warga.',
    is_pinned: false,
  },
];

export function getAnnouncementsByTenant(tenantId, options = {}) {
  // Jika ada data tersimpan di localStorage per tenant, gunakan itu; fallback ke default
  try {
    const customKey = `ruangwarga_announcements_${tenantId || 'default'}`;
    const stored = typeof window !== 'undefined' ? localStorage.getItem(customKey) : null;
    let list = stored ? JSON.parse(stored) : DEFAULT_ANNOUNCEMENTS;

    if (options.urgency && options.urgency !== 'all') {
      list = list.filter((item) => item.urgency === options.urgency);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          (item.content && item.content.toLowerCase().includes(q))
      );
    }

    // Urutkan pinned terlebih dahulu, lalu tanggal terbaru
    return [...list].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  } catch {
    return DEFAULT_ANNOUNCEMENTS;
  }
}
