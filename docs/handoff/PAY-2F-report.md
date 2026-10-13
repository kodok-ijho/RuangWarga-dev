# PAY-2F Report

| Task | Commit | Status | Catatan |
|---|---|---|---|
| PAY-2F.1 | f34cb2d | done | Simpan rekening tidak menghapus settings lain (F10): `saveTenantBankAccount` selalu memuat `fetchTenantDetails(tenantId)` tepat sebelum update. Jika fetch gagal atau `settings` tidak ada/null, lempar error `"Gagal memuat pengaturan tenant, rekening tidak disimpan."` dan jangan panggil `.update()`. Parameter `currentSettings` dihapus. Di `Settings.jsx`, berhenti kirim `tenantSettings`, tombol "Simpan Rekening" ter-disable bila data tenant belum termuat (`!isTenantDetailsLoaded`). Tambah unit test Vitest mocking Supabase (fetch gagal dan pelestarian settings lama). |
| PAY-2F.2 | 977ae63 | done | QRIS legacy hanya untuk tenant berizin (F11): Tambah helper `isLegacyQrisEnabled(tenant)` (default `false`) di `tenantOperationalService.js`. Ganti `canUseQris = true` di `PaymentMatrix.jsx` dengan `isLegacyQrisEnabled(activeTenant)`. Hapus default `canUseQris = true` di `PaymentFlowModal.jsx`. Gating opsi dan blok QRIS serta validasi submit di `NonIplIncomes.jsx`. Pasang `legacy_qris_enabled: true` pada mock demo RT/RW Palm Village. Tambah unit test helper dan render test modal. |
| PAY-2F.3 | 7dcfbab | done | `NonIplIncomes.jsx` konsisten dengan modal (F13): Saat rekening pengelola `null` dan metode `bank_transfer`, sembunyikan input file upload bukti transfer dan disable tombol submit dengan teks `"Rekening Belum Tersedia"`. Metode `cash` (staf) tetap aktif dan dapat disubmit. Tambah test render komprehensif di `NonIplIncomes.test.jsx`. |

## Output Verifikasi
- **vitest:** 35 test files lulus, **611 tests passed** (0 failed).
- **build:** OK (`npm --prefix client run build` sukses, Vite production bundle siap di `dist/`).
- **lint:** OK (`npm --prefix client run lint` exit code 0, 0 warning, 0 error).
- **Check canUseQris:** Bersih (`grep -n "canUseQris = true" client/src` kosong).
- **Integrasi n8n:** Tidak tersentuh (`git diff origin/claude/eloquent-tesla-f0ddcr -- api/n8n.js client/src/services/dataService.js` kosong).

## Perubahan Sensitif (Perlu Review Ekstra)
1. **Pencegahan Overwrite Settings (`tenantOperationalService.js`):**
   - Mengambil data fresh sebelum commit ke database agar settings multi-tenant lain (`invite_code`, skema ipl, denda, periode) tidak hilang saat simpan rekening bank.
2. **Pemisahan Jalur QRIS Legacy:**
   - Menjamin hanya tenant dengan `settings.legacy_qris_enabled === true` yang dapat menampilkan alur QRIS n8n/DOKU Palm Village. Tenant umum lainnya langsung diarahkan ke rekening bank resmi pengelola masing-masing.
