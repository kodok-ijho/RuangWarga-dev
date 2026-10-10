# BRAND-1 Report — Branding Global RuangWarga & Netralisasi Tenant

| Task | Commit | Status | Catatan |
|---|---|---|---|
| BRAND-1.1 | c8d0b4e | done | Salin 7 PNG ikon baru RuangWarga ke `client/public/`. Salin SVG mark (`rw-mark.svg`, `rw-mark-on-dark.svg`, `rw-mark-simple.svg`) ke `client/public/brand/`. Isolasi aset Palm Village ke `client/public/tenants/palm-village/` (`git mv`). Perbarui path denah & site plan di `Houses.jsx`. Update favicon di `index.html` ke `/brand/rw-mark-simple.svg`. Update PWA manifest di `vite.config.js` (`name: 'RuangWarga'`, `short_name: 'RuangWarga'`). |
| BRAND-1.2 | 049baa6 | done | Buat komponen `BrandLogo.jsx` (varian light/dark, ukuran sm/md/lg, showWordmark toggle, simbol SVG + wordmark HTML "Ruang"+"Warga"). Ganti seluruh referensi `/logo.png` di lapisan global (`Footer.jsx`, `Home.jsx`, `Login.jsx`). |
| BRAND-1.3 | f6e747e | done | Di `Header.jsx`: jika berada di konteks tenant dan memiliki `settings.logo_url` tampilkan logo tenant + nama tenant; bila tanpa `logo_url` tampilkan `BrandLogo` mark + nama tenant; di luar konteks tenant tampilkan `BrandLogo` penuh. Tambahkan `settings.logo_url: '/tenants/palm-village/logo.png'` pada mock data demo Palm Village di `TenantContext.jsx` dan `tenantOperationalService.js`. Update `Houses.jsx` fallback path ke `/tenants/palm-village/...`. |
| BRAND-1.4 | 2d22955 | done | Ubah teks hardcoded Palm Village dan Portal Warga menjadi netral atau `activeTenant?.name` di: `QrisCheckoutModal.jsx`, `IncomeDetailDrawer.jsx`, `Header.jsx`, `PlatformRevenue.jsx`, `UmkmListingDirectory.jsx`, `Settings.jsx`, `Residents.jsx`, `Login.jsx`, `SetupWizard.jsx`, `ChooseTenantType.jsx`, `TourContext.jsx`, dan `finance.test.jsx`. Email demo (`admin.viewer@palmvillage.id`, dll) dipertahankan. |
| BRAND-1.5 | f5604f7 | done | Ubah data contoh non-tenant menjadi nama generik ("Perumahan Griya Asri", "Kos Melati", "Koordinator Lingkungan", "Lapangan Kompleks", kuitansi HTML "RuangWarga") di `mockData.js` dan `eventMockData.js`. Data demo tenant Palm Village tetap. |
| BRAND-1.6 | 6f1d156 | done | Di `dataService.js` HANYA di dalam blok `if (IS_DEMO)` pada `createNonIplQrisPayment`: ganti string QRIS DOKU sungguhan menjadi `DEMO-QRIS-TIDAK-UNTUK-PEMBAYARAN-${Date.now()}` agar tidak ada QR live terpindai di mode demo. Jalur live n8n dan kode di luar `IS_DEMO` tidak disentuh. |
| BRAND-1.7 | 45099bc | done | Tambahkan unit test `BrandLogo.test.jsx` (4 tests) dan `Header.test.jsx` (3 tests) untuk memverifikasi brand identity rendering. Verifikasi grep: tidak ada `/logo.png` tersisa di luar `/tenants/palm-village/logo.png`. |
| BRAND-1.8 | ff51653 | done | Ekstrak validasi rekening bank menjadi fungsi murni `normalizeBankAccount({ bank_name, account_number, account_holder })` di `tenantOperationalService.js` (membersihkan spasi/strip, validasi digit 6-20, panjang teks, bahasa Indonesia). `saveTenantBankAccount` memakai fungsi ini. Keempat wizard onboarding memanggil `normalizeBankAccount` sebelum menyimpan settings. `KelasSetupWizard.jsx` membaca `bank_account` dengan fallback `bank_info`, dan hanya menyimpan ke `bank_account: normalizedBank` (tidak lagi menulis `bank_info`). Unit test di `tenantOperationalService.test.js` (10 tests) dan `KelasSetupWizard.test.js` (3 tests). |

## Catatan untuk Orchestrator / Claude (Database Migration)
> [!IMPORTANT]
> Saat data tenant Palm Village dimigrasikan ke database Supabase dev/prod, kolom `settings.logo_url` pada baris tenant Palm Village perlu diisi dengan path `/tenants/palm-village/logo.png`.

## Output Verifikasi
- **vitest:** 38 test files lulus, **659 tests passed** (0 failed).
- **build:** OK (`npm run build` di `client/` selesai menghasilkan bundle `dist/`, Service Worker PWA generated, manifest `dist/manifest.webmanifest` memuat `"name":"RuangWarga"`).
- **lint:** OK (`npm run lint` di `client/` selesai dengan exit code 0).
- **grep checks:**
  - `grep -rn "/logo.png" client/src client/index.html`:
    - Hanya tersisa path scoped `/tenants/palm-village/logo.png` pada `Header.test.jsx`, `TenantContext.jsx`, dan `tenantOperationalService.js`.
  - `grep -rniE "palm ?village|portal warga" client/src client/index.html client/vite.config.js --include=*.jsx --include=*.js --include=*.html | grep -v "\.test\."`:
    - Hanya tersisa email akun demo (`@palmvillage.id` / `@warga.palmvillage.local`), komentar arsitektur, dan mock tenant demo Palm Village.
- **Batasan Terjaga:**
  - Tanpa migration SQL baru.
  - File `api/n8n.js` dan direktori `supabase/` sama sekali tidak diubah.
  - File `client/src/services/dataService.js` hanya disentuh di dalam blok `if (IS_DEMO)` untuk mengamankan string QR dummy demo.
