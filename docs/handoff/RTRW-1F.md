# RTRW-1F — Perbaikan hasil review RTRW-1

Baca `docs/handoff/README.md`, AGENT.md, dan `RTRW-1-review.md` (T1–T3) dulu.
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. Tanpa migration.
🚫 Jangan ubah `dataService.js`, `apiClient.js`, `api/`, `supabase/`, `legacy-backend/`.

## RTRW-1F.1 — Infrastruktur test komponen (T2)
- Tambah devDependencies **`jsdom`** dan **`@testing-library/react`**.
  - Alasan, tulis di pesan commit: komponen yang memuat data di `useEffect` tidak bisa diuji dengan `renderToString` di environment `node`.
  - Jangan ubah environment global. Pakai komentar per file `// @vitest-environment jsdom` di test yang membutuhkannya.
- Tulis ulang `pages/rtrw14.tenant.test.jsx` memakai `render` + `waitFor` dari Testing Library. Untuk PaymentVerification, Reports, dan Expenses dengan tenant aktif, buktikan:
  - service tenant/Supabase **dipanggil** (mis. `fetchPayments` dengan `tenantId`, `fetchMonthlyFinance` dengan `tenantId`, `fetchExpenses` dengan `tenantId`);
  - `fetchSettings`, `fetchNonIplIncomes`, `fetchEvents`, dan `fetchMyEventAccess` **tidak dipanggil**.
- Tulis ulang 3 test di `pages/PaymentMatrix.tenant.test.jsx` yang sekarang memanggil spy secara langsung. Pilih salah satu:
  - render `PaymentMatrix` dan picu aksinya (catat tunai, verifikasi, batal) lewat klik; atau
  - ekstrak penyusun argumen menjadi fungsi murni yang **dipakai oleh komponen** (mis. `buildStaffPaymentArgs`, `buildDetailActionArgs` di file yang sama atau di `services/`), lalu uji fungsi itu.
  
  Test harus membuktikan `tenantId`, `memberId`, dan `verifiedBy` benar-benar dikirim oleh kode halaman.
- **Bukti wajib di laporan:** jalankan test baru terhadap kode sebelum RTRW-1, lalu kembalikan. Hasilnya harus **gagal**. Cara mengecek:
  ```bash
  git stash
  git checkout 3d66052 -- client/src/pages/PaymentVerification.jsx client/src/pages/Reports.jsx client/src/pages/Expenses.jsx
  npx vitest run src/pages/rtrw14.tenant.test.jsx
  git checkout HEAD -- client/src/pages
  git stash pop
  ```
  Tempel ringkasan gagal/lulusnya.

## RTRW-1F.2 — "Perbaiki transaksi" jujur di mode tenant (T1)
`pages/PaymentMatrix.jsx` (`PaymentDetailModal`, ±2672-2700), saat `activeTenantId` ada:
- Setelah `updatePayment({ tenantId, ... })` berhasil, bila `editForm.markCompleted` dicentang **dan** status pembayaran saat ini `pending_verification` → panggil `approveManualPayment(token, { tenantId: activeTenantId, payment_id, verifiedBy })`.
  - Toast "LUNAS" hanya muncul bila verifikasi berhasil.
  - Bila verifikasi gagal → toast error yang jelas; jangan menampilkan pesan sukses.
- Field upload `file` di form edit **disembunyikan** di mode tenant, karena unggah ulang bukti belum didukung jalur Supabase (`updateTenantPayment` mengabaikannya). Mode legacy tidak berubah.
- Test (memakai infrastruktur 1F.1):
  - dengan `markCompleted` → `approveManualPayment` dipanggil dengan `tenantId`;
  - tanpa centang → tidak dipanggil;
  - verifikasi gagal → tidak ada toast sukses.

## RTRW-1F.3 — Guard menunggu tenant di URL (T3)
`App.jsx` `TenantAccessGuard` dan `TenantPermissionGuard`: bila `tenantId` (URL) ada dan `activeTenantId !== tenantId` → tampilkan `<PageLoader />`, jangan menilai izin dulu.

Test dengan Testing Library, dua kasus:
- URL `/t/B/...`, tenant aktif A → loader, tidak redirect;
- setelah aktif = B → konten / redirect sesuai izin B.

---

## Definition of Done
- `RTRW-1F-report.md`: hash commit benar dan bukti "test baru gagal pada kode lama" (1F.1).
- `npx vitest run`, `npm run build`, dan `npm run lint` hijau.
- `package.json`: hanya `jsdom` dan `@testing-library/react` yang bertambah (devDependencies), dengan alasan di commit.
