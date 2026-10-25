# LIST-UI-1 — Laporan Akhir

Batch tugas **LIST-UI-1: Akses iklan kamar & tampilan katalog kos ala marketplace (Mamikos)**.
Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.
Semua task frontend selesai tanpa perubahan database schema, Edge Function pembayaran (PAY-1.7), atau package baru.

---

## Ringkasan Commit Task LIST-UI-1.1 s.d. LIST-UI-1.5

### 1. LIST-UI-1.1 — `bc5b140`
**feat(listing): LIST-UI-1.1 menu Iklan di navbar kos dan tombol Iklankan kamar kosong**
- Menambahkan menu **"Iklan"** di navbar tenant Kos (`TenantShell.jsx`) khusus pemegang izin `post_listing` / owner mengarah ke `/t/:id/listings`.
- Halaman **Iklan Saya** (`MyListings.jsx`) disesuaikan untuk tenant Kos dengan tombol utama "Pasang Iklan Kamar".
- Tombol/badge aksi iklan (`RoomListingAction.jsx`) pada kartu dan modal detail kamar (`Houses.jsx`):
  - Kamar kosong belum diiklankan: tombol "Iklankan" mengarah ke `/t/:id/listings/post?unitId=:unitId`.
  - Kamar dengan iklan aktif: badge hijau "Diiklankan".
  - Kamar menunggu pembayaran: badge amber "Menunggu bayar iklan".
  - Kamar occupied, penyewa biasa, atau tenant RT/RW tidak menampilkan tombol iklan.
- Unit test: `TenantShell.test.jsx`, `Houses.kos.test.jsx`, `MyListings.test.jsx`.

### 2. LIST-UI-1.2 — `0ad12c1`
**feat(listing): LIST-UI-1.2 katalog kos grid kartu ala marketplace**
- Mengrombak katalog publik `/listing/kos` (`RoomListingDirectory.jsx`) dengan grid kartu responsif (1 kolom HP, 2 tablet, 3-4 desktop).
- Kartu kos: rasio foto 4:3 dengan fallback ilustrasi SVG SVG placeholder, badge tipe **Putra / Putri / Campur** (dari `category`), nama kos + nama kamar, petunjuk lokasi (`location_hint`), deretan hingga 4 ikon fasilitas + badge "+N", harga besar **Rp X / bulan**, dan badge Unggulan ("Rekomendasi") untuk listing `is_featured`.
- State skeleton saat memuat data dan empty state yang mengajak pemilik kos bergabung.
- Unit test: `RoomListingDirectory.test.jsx`.

### 3. LIST-UI-1.3 — `47b43c7`
**feat(listing): LIST-UI-1.3 filter dan urutan katalog kos**
- Menambahkan logika filter dan pengurutan murni di `publicListingService.js` (`filterAndSortRoomListings`):
  - Chip tipe: **Semua**, **Putra**, **Putri**, **Campur** (mencocokkan `category`).
  - Rentang harga: preset **< 1 jt**, **1–2 jt**, **> 2 jt**.
  - Fasilitas: multi-pilih fasilitas standar kos (dari `config/kosFacilities.js`).
  - Urutkan: **Terbaru**, **Termurah**, **Termahal**.
  - Filter pencarian teks bebas (judul, deskripsi, lokasi).
- Sinkronisasi filter dua arah dengan query parameter URL (`category`, `price`, `facilities`, `sort`, `q`).
- Unit test: `publicListingService.test.js`, `RoomListingDirectory.test.jsx`.

### 4. LIST-UI-1.4 — `068ff34`
**feat(listing): LIST-UI-1.4 detail iklan kos dengan galeri dan tombol WhatsApp**
- Halaman detail `/listing/kos/:id` (`RoomListingDetail.jsx`):
  - Galeri foto responsif: tampilan foto besar dengan navigasi thumbnail dan dukungan touch swipe di perangkat HP.
  - Sticky price box di sebelah kanan pada desktop: nominal sewa per bulan dan tombol WhatsApp hijau (`buildListingWhatsAppUrl`) menuju nomor kontak pengelola (`contact_phone`) dengan template pesan ter-encode.
  - Floating bottom bar pada tampilan HP berisi ringkasan harga dan tombol hubungi WhatsApp.
  - Daftar fasilitas lengkap berikon, petunjuk lokasi, dan deskripsi kamar.
- Helper normalisasi nomor telepon (`normalizePhoneNumber`) dan pembangun tautan WhatsApp di `publicListingService.js`.
- Unit test: `RoomListingDetail.test.jsx`, `publicListingService.test.js`.

### 5. LIST-UI-1.5 — Commit ini
**feat(listing): LIST-UI-1.5 prefill form iklan dari kamar**
- Form Pasang Iklan (`PostListing.jsx`) untuk tenant Kos:
  - Membaca `?unitId=` dari URL: prefill otomatis judul (`<label kamar> – <nama kos>`), harga sewa dari `metadata.default_rent_price` (atau `rent_price` / `price`), fasilitas kamar (`metadata.facilities`) ditampilkan secara visual dalam kotak fasilitas dan disertakan ke dalam teks deskripsi, serta `unit_id` terisi.
  - Proteksi kamar terisi: kamar dengan status `occupied` atau `is_occupied === true` ditolak untuk diiklankan, memunculkan alert peringatan `data-testid="occupied-unit-alert"`, dan menonaktifkan submit iklan.
  - Pilihan tipe konsisten dengan katalog: opsi dropdown kategori kos adalah **Campur**, **Putra**, dan **Putri** yang disimpan ke field `category`.
  - Prefill hanya mengisi nilai awal: pengguna bebas mengubah judul, harga, kategori, dan deskripsi tanpa ter-reset saat komponen me-re-render.
  - Isolasi tenant: jika `unitId` pada URL tidak ditemukan pada unit milik tenant aktif, sistem menampilkan notifikasi error dan mengosongkan pilihan unit.
  - Alur pembayaran iklan (`pending_payment` dan invoice DOKU QRIS SNAP) dipertahankan utuh tanpa perubahan.
- Unit test: `PostListing.test.jsx` (6 skenario uji).

---

## Catatan Arsitektur: Fasilitas Katalog Publik & Rekomendasi Migration

> [!NOTE]
> **Temuan RLS Publik vs Data Kamar:**
> Pengunjung publik (anon / unauthenticated) saat ini kemungkinan tidak dapat membaca tabel `tenant_units` secara langsung karena aturan RLS database yang mengisolasi unit hanya untuk anggota tenant yang bersangkutan.
> Akibatnya, pada katalog publik (`RoomListingDirectory`) dan detail publik (`RoomListingDetail`), fasilitas listing yang unitnya berada di tabel tertutup akan jatuh ke resolusi tebakan teks dari `description`.
> 
> **Rekomendasi / Solusi Jangka Panjang:**
> Menambahkan kolom `facilities text[]` (atau `jsonb`) langsung pada tabel `public_listings`, sehingga saat pemilik kos membuat/mempublikasikan iklan melalui `PostListing.jsx`, fasilitas kamar langsung disimpan ke baris `public_listings`. Ini membutuhkan migration SQL database baru dan berada di luar lingkup frontend batch LIST-UI-1.

---

## Verifikasi & Output Asli

### 1. `npm run lint`
```bash
$ npm run lint
> ruangwarga@1.0.1 lint
> eslint src
(exit code: 0 - bersih tanpa error/warning)
```

### 2. `npm run build`
```bash
$ npm run build
> ruangwarga@1.0.1 build
> vite build

vite v5.4.21 building for production...
✓ 896 modules transformed.
dist/assets/PostListing-uN7u-Acq.js         21.24 kB │ gzip:   6.48 kB
dist/assets/RoomListingDirectory-Dt-uIjB_.js 23.69 kB │ gzip:   6.42 kB
dist/assets/RoomListingDetail-CAnm1Z7j.js   14.63 kB │ gzip:   4.29 kB
dist/assets/MyListings-BxqkGADo.js          18.18 kB │ gzip:   5.13 kB
dist/assets/Houses-kNdsfIVg.js              30.87 kB │ gzip:   8.51 kB
✓ built in 14.69s

PWA v1.3.0
mode      generateSW
precache  115 entries (6723.76 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
(exit code: 0)
```

### 3. `vitest` (TZ=UTC & TZ=Asia/Jakarta, VITE_DEMO_MODE=false)
```bash
$ cd client && TZ=UTC VITE_DEMO_MODE=false npx vitest run src/pages/tenant/PostListing.test.jsx src/pages/tenant/MyListings.test.jsx src/services/publicListingService.test.js src/pages/public/RoomListingDirectory.test.jsx src/pages/public/RoomListingDetail.test.jsx src/pages/Houses.kos.test.jsx

 Test Files  6 passed (6)
      Tests  121 passed (121)
   Duration  8.03s

$ cd client && TZ=Asia/Jakarta VITE_DEMO_MODE=false npx vitest run src/pages/tenant/PostListing.test.jsx src/pages/tenant/MyListings.test.jsx src/services/publicListingService.test.js src/pages/public/RoomListingDirectory.test.jsx src/pages/public/RoomListingDetail.test.jsx src/pages/Houses.kos.test.jsx

 Test Files  6 passed (6)
      Tests  121 passed (121)
   Duration  8.01s
(exit code: 0)
```
Semua 121 tes listing lolos 100% di kedua zona waktu.
