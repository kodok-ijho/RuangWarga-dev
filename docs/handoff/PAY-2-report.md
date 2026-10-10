# PAY-2 Report

| Task | Commit | Status | Catatan |
|---|---|---|---|
| PAY-2.1 | a473024 | done | Tambah helper `getTenantBankAccount` (aman dari data parsial/kosong) dan fungsi `saveTenantBankAccount` dengan validasi ketat (nama bank 2-50 chars, nomor rekening 6-20 digits murni auto-strip spasi/dash dan tolak non-angka, nama pemilik 2-100 chars) di `client/src/services/tenantOperationalService.js`. |
| PAY-2.2 | d7f90f6 | done | Tambah kartu "Rekening Penerima Pembayaran" di `client/src/pages/Settings.jsx` dengan 3 field input, badge status rekening aktif/belum diisi, peringatan jika kosong, tombol simpan mandiri, dan permission guard `canEdit` (`manage_settings`). |
| PAY-2.3 | 8f7f979 | done | Tampilkan rekening tenant dinamis dan tombol salin nomor rekening di `PaymentFlowModal.jsx` (blok `bank_transfer`). Jika rekening belum diisi, form unggah bukti tidak dirender dan muncul peringatan jelas. Hapus nomor rekening hardcode kas Palm Village di `NonIplIncomes.jsx:508-510`. Teruskan `tenant={activeTenant}` dari `PaymentMatrix.jsx`. |
| PAY-2.4 | 6f686cc | done | Audit RLS `tenants.settings` pada migration `202609170006_refactor_rls_to_has_permission.sql`: seluruh anggota tenant dengan status approved (`current_tenant_ids()`) dapat melakukan SELECT baris tenant sehingga `invite_code` ikut terbaca. Catat temuan dan opsi solusi di `docs/handoff/questions.md`. |
| PAY-2.5 | e4ab9b9 | done | Tambah unit test validasi rekening bank di `tenantOperationalService.test.js` (karakter non-angka ditolak, strip/spasi dibersihkan, whitespace kosong ditolak, panjang karakter divalidasi). Tambah test render di `payment.test.jsx` (rekening terisi vs tanpa rekening). |
| PAY-2.6 | e553e52 | done | Perbaikan F8 di `SubscriptionStatus.jsx`: tanggal "Masa Aktif Berakhir" kini menggunakan `status === 'trial' ? trial_ends_at : current_period_end` (fallback '-' jika kosong) melalui helper `resolveSubscriptionExpiryDate()`. Tambah unit test untuk status trial, status active dengan riwayat trial lama, dan kasus data kosong di `accountAndTenantShell.test.jsx`. |

## Output Verifikasi
- **vitest:** 34 test files lulus, **597 tests passed** (0 failed).
- **build:** OK (`npm --prefix client run build` sukses membuat bundle produksi `dist/`).
- **lint:** OK (`npm --prefix client run lint` exit code 0 tanpa error).
- **Hardcode Check:** Bersih. Tidak ada nomor rekening hardcode tersisa di `client/src`.

## Perubahan Sensitif (Perlu Review Ekstra)
1. **Validasi & Penyimpanan Data Rekening Tenant:**
   - `client/src/services/tenantOperationalService.js`: validasi sanitasi nomor rekening dan pencegahan overwrite field `settings` lainnya.
2. **Alur Pembayaran Warga:**
   - `client/src/components/payment/PaymentFlowModal.jsx`: logika kondisional penonaktifan upload bukti transfer bila rekening bank belum disediakan oleh pengurus/tenant.
3. **Audit Keamanan RLS:**
   - `docs/handoff/questions.md`: temuan kebocoran `invite_code` akibat kolom `tenants.settings` dapat di-SELECT oleh semua warga berstatus `approved`.

## Asumsi yang Diambil
1. **Tombol Simpan Mandiri di Kartu Rekening:** Pada halaman `Settings.jsx`, kartu "Rekening Penerima Pembayaran" memiliki tombol aksi mandiri (`Simpan Rekening`) yang memanggil `saveTenantBankAccount` langsung ke Supabase tanpa perlu memicu submit form pengaturan IPL legacy ke proxy n8n.
2. **Timezone Test Resolusi Tanggal:** Test untuk `resolveSubscriptionExpiryDate` menggunakan jam siang (`T12:00:00Z`) agar aman dari perbedaan tanggal kalender saat dikonversi ke timezone lokal sistem (WIB/UTC+7).
