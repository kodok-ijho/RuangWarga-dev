# LIST-UI-1 — Akses iklan kamar & tampilan katalog kos ala marketplace

Status: ✅ **Disetujui user 2026-10-25** (termasuk tombol WhatsApp ke `contact_phone`). Frontend saja: tidak ada perubahan schema, pembayaran iklan (PAY-1.7), atau status listing.

Dasar: pertanyaan user 2026-10-23 "di mana link untuk mengiklankan kamar kosong?" dan permintaan tampilan seperti mamikos.com.

## Temuan
- Link iklan saat ini hanya ada di dua tempat yang mudah terlewat:
  - kartu **"Iklan Kamar"** di Quick Actions dashboard (`components/dashboard/QuickActionsGrid.jsx` → `/t/:id/listings/post`);
  - tombol **"Iklankan Kamar Ini ke Publik"** di detail kamar kosong (`pages/Houses.jsx`).
- Tidak ada menu iklan di navbar tenant Kos (`components/tenant/TenantShell.jsx`).
- Katalog publik `/listing/kos` (`pages/public/RoomListingDirectory.jsx`) dan detail `/listing/kos/:id` (`RoomListingDetail.jsx`) masih berupa daftar sederhana; saat diuji, 0 iklan tayang. Ingat: iklan wajib dibayar dulu (`pending_payment`, PAY-1.7) sebelum tayang.

## Arah desain
Meniru **pola UX** marketplace kos (Mamikos), **bukan** brand, logo, warna, atau teksnya. Tetap palet forest/gold dan kelas `pv-*` RuangWarga.

## Task
| Task | Isi | Kriteria selesai |
|---|---|---|
| LIST-UI-1.1 | Navbar tenant Kos (`TenantShell.jsx`): tambah menu **"Iklan"** (pemegang izin `post_listing`/owner saja) → `/t/:id/listings` (Iklan Saya) dengan tombol utama "Pasang Iklan Kamar". Di halaman Kamar (`Houses.jsx`) tiap kartu kamar **kosong** dapat badge/tombol kecil "Iklankan". | Test: menu tampil untuk owner kos, tidak tampil untuk penyewa biasa dan tenant RT/RW. |
| LIST-UI-1.2 | Katalog `/listing/kos`: grid kartu responsif (1 kolom HP, 2 tablet, 3–4 desktop). Kartu: foto utama rasio 4:3 (fallback ilustrasi), badge **Putra/Putri/Campur** (dari `category`), nama kos + kamar, lokasi (`location_hint`), maks. 4 ikon fasilitas + "+N", harga besar **Rp X / bulan**, badge "Unggulan" bila `is_featured`. Skeleton saat memuat. Empty state yang mengajak pemilik kos "Pasang iklan di RuangWarga". | Test render kartu dengan & tanpa foto; build lulus. |
| LIST-UI-1.3 | Filter di katalog: chip **Tipe** (Putra/Putri/Campur), **Rentang harga** (preset: < 1 jt, 1–2 jt, > 2 jt), **Fasilitas** (dari `config/kosFacilities.js`, multi-pilih), urutkan (Termurah / Termahal / Terbaru). Filter tersimpan di query string URL. Filter dilakukan di `services/publicListingService.js`, bukan di komponen. | Test service untuk tiap filter. |
| LIST-UI-1.4 | Detail `/listing/kos/:id`: galeri foto (gambar besar + thumbnail, swipe di HP), judul, badge tipe, lokasi, daftar fasilitas lengkap berikon, deskripsi, info pengelola (nama kos). Desktop: **kotak harga menempel** di kanan (harga/bulan + tombol "Hubungi via WhatsApp" ke `contact_phone` dengan pesan otomatis berisi judul iklan). HP: bar bawah tetap berisi harga + tombol WhatsApp. | Test render detail + link WhatsApp benar. |
| LIST-UI-1.5 | Form Pasang Iklan (`pages/tenant/PostListing.jsx`) untuk Kos: prefill dari kamar (`?unitId=`) — judul, harga (`default_rent_price`), fasilitas kamar; pilihan tipe Putra/Putri/Campur disimpan ke `category`. Jangan ubah alur pembayaran iklan. | Test prefill dari unit. |

Urutan: 1.1 → 1.2 → 1.3 → 1.4 → 1.5.

Catatan: fasilitas per iklan — bila tidak ada kolomnya, baca dari `tenant_units.metadata` kamar terkait (`unit_id`) lewat service. **Jangan menambah kolom/migration**; jika ternyata perlu, tulis di `questions.md`.

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** Satu task = satu commit (sebut ID task). **Jangan push** (Claude yang push setelah review dan izin user).
- Ikuti `docs/handoff/README.md` dan `AGENT.md`. Path relatif ke `client/src/` kecuali disebut lain.
- Setelah tiap task: `cd client && npm run lint && npm run build && VITE_DEMO_MODE=false npx vitest run` (lolos di `TZ=UTC` dan `TZ=Asia/Jakarta`).
- Dukung mode demo (mockData) dan Supabase. Ikuti konvensi `pv-*`, palet forest/gold, React Query, RBAC, isolasi per tenant. Lapisan `/listing` tetap netral "RuangWarga" (tanpa branding tenant).
- 🚫 Jangan mengubah `services/dataService.js`, `services/apiClient.js`, `api/`, `legacy-backend/`, `.env*`, n8n, Edge Function pembayaran, atau migration. Jangan menjalankan SQL ke Supabase. Jangan install package baru.
- Keputusan tidak jelas → tulis di `questions.md`, lewati, lanjut task lain.
- Tulis `docs/handoff/LIST-UI-1-report.md` di akhir.
