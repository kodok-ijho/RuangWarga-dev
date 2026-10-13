# BRAND-1F Report — Perbaikan Hasil Review BRAND-1

| Task | Commit | Status | Catatan |
|---|---|---|---|
| BRAND-1F.1 | add0f7a | done | Helper `isSafeLogoUrl(url)` dibuat di `client/src/utils/brand.js` (hanya lolos untuk path relatif internal `/` tanpa `//`, dan `https://`; menolak `http://`, `javascript:`, `data:`, `//host`, empty/non-string). Di `Header.jsx`: gunakan `isSafeLogoUrl` dan hilangkan duplikasi blok teks judul di desktop maupun drawer mobile. Di `TenantShell.jsx`: tampilkan elemen `<img>` logo tenant jika aman, fallback ke `template.icon`. Di `AccountLayout.jsx`: ganti kotak teks "RW" dengan `<BrandLogo size="md" />` dengan subjudul "Platform Akun" tetap. Di `PlatformLayout.jsx`: ganti emoji 🛡️ dengan `<BrandLogo variant="dark" size="md" />` dengan badge "Platform Owner" tetap. Unit test di `brand.test.js` (6 tests), `TenantShell.test.jsx` (3 tests), dan `Header.test.jsx` (4 tests). (K1, K4, K5-Header) |
| BRAND-1F.2 | 49cbb00 | done | Di `services/mockData.js`: ekstrak `downloadDigitalReceipt` menjadi fungsi murni `buildDigitalReceiptHtml({ bill, unit, owner, occupant, tenantName })` dan helper sanitasi `escapeHtml`. Judul kuitansi menggunakan `tenantName` (fallback `RuangWarga`, tanpa emoji/hardcode Palm Village). Semua teks disanitasi terhadap XSS (`& < > " '`). Pemanggil di `PaymentMatrix.jsx` (baris 2944) mengirim `tenantName: activeTenant?.name` dan `PaymentDetailModal` menggunakan `useTenant()`. Di `PaymentVerification.jsx`: perbaiki bug `currentTenant` menjadi `activeTenant` di context binding, activeTenantId fallback chain, dan template type; kirim `tenantName: activeTenant?.name` saat unduh kuitansi (baris 920). Unit test di `services/receipt.test.js` (3 tests). (K2, bug currentTenant) |
| BRAND-1F.3 | 69d0511 | done | Di `services/tenantOperationalService.js`: fungsi murni `pickBankAccountForForm(settings)` ditambahkan (mengutamakan `settings.bank_account`, fallback `settings.bank_info`, atau `null`). Dipakai di `pages/onboarding/KelasSetupWizard.jsx` pada inisialisasi state awal dan pemuatan data async, sehingga tidak ada lagi teks `bank_info` di file wizard. Unit test `KelasSetupWizard.test.js` diperbarui memanggil fungsi asli (3 tests: prioritas, fallback, null/invalid). Nit K5: komentar ganda `/**` di `tenantOperationalService.js` dihapus; `Login.jsx` ditambahkan heading semantik `<h1 className="sr-only">Masuk ke RuangWarga</h1>`. (K3, K5-nit) |

## Output Verifikasi
- **vitest:** 41 test files lulus, **672 tests passed** (0 failed).
- **build:** OK (`npm run build` di `client/` selesai membuat bundle produksi `dist/`, Service Worker PWA generated).
- **lint:** OK (`npm run lint` di `client/` selesai dengan 0 error dan 0 warning).
- **grep checks:**
  - `grep -rniE "palm ?village" client/src/services/mockData.js | grep -iv "palmvillage\.id\|palmvillage\.local"`:
    - Tidak ada lagi teks Palm Village di kuitansi HTML; satu-satunya sisa di file tersebut hanyalah data demo tenant Palm Village (`location_hint: 'Blok A3 No. 12, Palm Village RT 05'`).
  - `grep -n "bank_info" client/src/pages/onboarding/KelasSetupWizard.jsx`:
    - **Kosong** (0 match).
- **Batasan Terjaga:**
  - Tanpa migration baru.
  - File `api/`, `supabase/`, `legacy-backend/`, dan `client/src/services/dataService.js` sama sekali tidak diubah.
