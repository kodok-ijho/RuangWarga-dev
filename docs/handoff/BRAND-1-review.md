# BRAND-1 Review (Claude, 2026-10-10)

Commit yang direview: `869b498..3d0ede5` (8 commit task + 1 laporan). Hash di laporan cocok ✅.

| Cek | Hasil |
|---|---|
| `npx vitest run` | **659 test lulus** (38 file) |
| `npm run build` / `npm run lint` | ok / exit 0 |
| Manifest build | `"name":"RuangWarga","short_name":"RuangWarga"` ✅ |
| Batasan file | Tidak ada perubahan di `api/`, `supabase/`, `legacy-backend/`. `dataService.js` hanya 1 baris di dalam `if (IS_DEMO)` ✅ |
| 1.1 Aset | 7 PNG di `client/public/` identik (sha1) dengan `assets/brand/png/`; 3 SVG di `client/public/brand/` identik; aset Palm Village pindah ke `public/tenants/palm-village/` (git mv); favicon SVG di `index.html` ✅ |
| 1.2 `BrandLogo` | Simbol SVG + wordmark HTML, varian light/dark, 3 ukuran, `aria-label` ✅. Dicek visual (Playwright) di `/` dan `/login`, desktop & 390 px: tampil benar. |
| 1.3 Header | Logika 3 cabang benar dan teruji ✅ — **tapi lihat K1** |
| 1.4 / 1.5 Teks & mock | Sisa grep hanya email demo, komentar, data tenant demo Palm Village, daftar tenant di dashboard platform (Palm Village memang tenant), dan deskripsi default jalur n8n (dilarang disentuh) ✅ — **kecuali K2** |
| 1.6 QR demo | `DEMO-QRIS-TIDAK-UNTUK-PEMBAYARAN-…` hanya di blok `IS_DEMO` ✅. QR demo lain (`publicListingService.js`, `SubscriptionCheckout.jsx`) tidak memuat data merchant sungguhan → aman. |
| 1.8 Rekening wizard | `normalizeBankAccount` murni, dipakai `saveTenantBankAccount` + 4 wizard, validasi sebelum kode undangan disimpan; Kelas menulis `bank_account`, fallback baca `bank_info` ✅ — **test lemah, lihat K3** |

## Temuan

- **K1 — Logo tenant tidak tampil di workspace `/t/:tenantId` (SEDANG, celah di spesifikasi Claude).**
  BRAND-1.3 menyuruh mengubah `Header.jsx`, padahal `Header` hanya dipakai `ProtectedLayout` (rute lama `/residents`, `/houses`, …). Workspace tenant `/t/:tenantId` memakai `components/tenant/TenantShell.jsx`, yang masih menampilkan emoji `template.icon`.
  Selain itu `/account` (`AccountLayout.jsx`: kotak teks "RW") dan `/platform` (`PlatformLayout.jsx`: emoji 🛡️) belum memakai `BrandLogo`.
  Executor mengerjakan persis sesuai dokumen, jadi ini kesalahan dokumen BRAND-1.
- **K2 — Kuitansi semua tenant berjudul "🌴 PALM VILLAGE" (SEDANG).**
  `downloadDigitalReceipt` di `services/mockData.js` dipanggil juga di jalur non-demo, yaitu `PaymentMatrix.jsx` ±2944, yang juga dirender di bawah `/t/:tenantId`. Warga tenant mana pun yang mengunduh kuitansi melihat nama Palm Village.
  Laporan menulis kuitansi sudah "RuangWarga", padahal hanya subjudul dan footer yang berubah.
  Nilai lain di HTML kuitansi (nama warga, blok, metode) disisipkan tanpa escape. Risikonya kecil karena file diunduh sebagai `.html`, bukan dibuka di origin aplikasi, tetapi perlu dirapikan sekalian.
- **K3 — Test BRAND-1.8 untuk wizard Kelas tautologis (RENDAH).**
  Tiga test di `KelasSetupWizard.test.js` menulis ulang logika `bank_account || bank_info` di dalam test sendiri, bukan memanggil kode aplikasi. Test akan tetap hijau walau wizard rusak.
- **K4 — Keamanan `settings.logo_url` (RENDAH).** Admin tenant bisa mengisi URL apa saja.
  - `javascript:` tidak jalan di `<img>`.
  - URL eksternal bisa dipakai melacak IP seluruh anggota tenant.
  - Perbaikan: batasi ke path relatif `/…` atau `https://`.
- **K5 — Nit:**
  - `/**` ganda di `tenantOperationalService.js` ±244.
  - `Header.jsx` menduplikasi blok judul (±30 baris) di dua cabang logo.
  - `Login.jsx` kehilangan `<h1>`, sehingga halaman login tidak punya heading utama.

## Bug lama yang ditemukan saat review (bukan dari BRAND-1)
- `PaymentVerification.jsx` ±151 mengambil `currentTenant` dari `useTenant()`, padahal context tidak menyediakan nilai itu (yang ada `activeTenant`).
  - Di rute tanpa `:tenantId`, halaman jatuh ke `userTenants[0]`, bukan tenant aktif.
  - Pengguna dengan ≥2 tenant bisa melihat verifikasi pembayaran tenant yang salah. RLS tetap membatasi ke tenant miliknya sendiri, jadi tidak ada kebocoran lintas tenant.
  - Diperbaiki di BRAND-1F.2 karena nama tenant di kuitansi bergantung padanya.

## Dicatat untuk DEBT-1 (tidak mendesak)
- `downloadDigitalReceipt` / fungsi kirim kuitansi adalah fungsi produksi tapi tinggal di `mockData.js` dan memakai skema IPL mock (`getIPLSchemaById`). Pindahkan ke service sungguhan dan ambil data tenant asli.
- Demo `SubscriptionCheckout.jsx` menghitung biaya QRIS `0.007`, padahal keputusan user `0.0075` (hanya tampilan demo).
- Domain email placeholder `@warga.palmvillage.local` dipakai untuk akun warga semua tenant (`Residents.jsx`, `UserApproval.jsx`). Tidak tampil ke pengguna. Kalau mau diganti, deteksi domain lama harus tetap jalan.
- `PaymentMatrix.jsx` ±1093 (demo) memanggil `downloadDigitalReceipt(item?.payment || item)`, objek yang tidak berbentuk `{ bill, unit }`, sehingga field kuitansi kosong.

## Catatan DB (Claude)
Saat tenant Palm Village dimigrasikan ke DB: isi `settings.logo_url = '/tenants/palm-village/logo.png'` (selain `legacy_qris_enabled = true`). Sudah dicatat di BACKLOG.

## Hasil
BRAND-1 **diterima**. K1–K5 + bug `currentTenant` dikerjakan di **BRAND-1F** (kecil, tanpa migration), lalu DEBT-1.
