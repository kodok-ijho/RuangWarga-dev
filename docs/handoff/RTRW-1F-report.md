# RTRW-1F Report

Executor: Antigravity (agy). Review, QA, dan commit: Claude (sesi lokal). Branch `claude/eloquent-tesla-f0ddcr`.

| Task | Commit | Status | Catatan |
|---|---|---|---|
| RTRW-1F.1 | d4897a9 | done | `jsdom` ^25.0.1 dan `@testing-library/react` ^16.3.3 (devDependencies). `rtrw14.tenant.test.jsx` memakai `render` + `waitFor`. PaymentMatrix memakai pendekatan (b): `buildStaffCashPaymentArgs` dan `buildDetailActionArgs` dipakai komponen dan diuji. |
| RTRW-1F.2 | b3a7c3e | done | Mode tenant: centang "tandai lunas" + status `pending_verification` → `approveManualPayment` dengan `tenantId`. Toast LUNAS hanya bila verifikasi berhasil. Field ganti bukti disembunyikan. Test di `PaymentDetailModal.tenant.test.jsx` (6). |
| RTRW-1F.3 | 6926a89 | done | Guard menampilkan `PageLoader` selama `tenantId` di URL ≠ `activeTenantId`. Kedua guard dipindah ke `components/tenant/TenantGuards.jsx`. Test di `TenantGuards.test.jsx` (12). |

## Output verifikasi
- vitest: 49 files / 734 tests passed. Baseline sebelum batch: 47 / 716.
- build: ok
- lint: ok (exit 0)

Catatan environment lokal: `client/.env` di mesin lokal berisi `VITE_DEMO_MODE=true`, sehingga 34 test service gagal jika tidak di-override. Semua angka di atas memakai `VITE_DEMO_MODE=false npx vitest run`, sama dengan kondisi tanpa `.env` di cloud.

## Bukti test baru gagal pada kode lama

**1F.1 (wajib).** File `PaymentVerification.jsx`, `Reports.jsx`, dan `Expenses.jsx` diambil dari `3d66052` (sebelum RTRW-1), lalu `rtrw14.tenant.test.jsx` dijalankan:
```
× PaymentVerification memanggil fetchPayments dengan tenantId dan tidak memanggil dataService.fetchSettings ...
× Reports memanggil fetchMonthlyFinance dengan tenantId dan tidak memanggil dataService.fetchNonIplIncomes maupun dataService.fetchEvents ...
× Expenses memanggil fetchExpenses dengan tenantId dan tidak memanggil dataService.fetchEvents maupun dataService.fetchMyEventAccess ...
AssertionError: expected "spy" to not be called at all, but actually been called 1 times   (x3)
Tests  3 failed (3)
```
Setelah dikembalikan ke HEAD: 3/3 lulus.

**1F.2.** Dicek dengan `PaymentMatrix.jsx` versi `d4897a9` (hanya ditambah `export` pada `PaymentDetailModal`):
- Gagal: test 1 (approve dipanggil), 3 (verifikasi gagal → tanpa toast sukses), dan 5 (input file tersembunyi).
- Lulus: test 2, 4, dan 6, yang menguji perilaku yang memang tidak berubah.
- Hasil: `Tests 3 failed | 3 passed (6)`.

**1F.3.** Dicek dengan blok `if (tenantId && activeTenantId !== tenantId)` dihapus dari kedua guard:
- Gagal: kasus a, b, dan c pada kedua guard.
- Hasil: `Tests 6 failed | 6 passed (12)`.

## Perubahan sensitif (perlu review ekstra)
- Tidak ada migration, RLS, grant, Edge Function, perubahan n8n, `dataService.js`, `apiClient.js`, `api/`, atau `supabase/`.
- `PaymentMatrix.jsx` `handleSaveEdit` (mode tenant) sekarang memanggil `approveManualPayment` → `verifyTenantPayment`. Ini jalur verifikasi yang sama dengan tombol "Verifikasi" yang sudah ada. Mode legacy dan QRIS tidak berubah.

## Asumsi yang diambil
- `jsdom` dipasang di ^25, bukan versi terbaru (30), demi kompatibilitas dengan vitest 2.1.9.
- `@testing-library/dom` adalah peer dependency dari `@testing-library/react` 16. Paket ini dipasang otomatis oleh npm dan hanya tercatat di lockfile, tidak di `package.json`.
- npm lokal (10.9) sempat menghapus metadata `"libc": ["glibc"]` pada `@rollup/rollup-linux-arm64-gnu` di lockfile. Metadata ini dikembalikan, jadi diff lockfile hanya berisi penambahan.
- Bila verifikasi gagal setelah perubahan tersimpan, muncul toast error ("Perubahan transaksi tersimpan, tetapi verifikasi gagal: … Pembayaran masih menunggu verifikasi."). Matriks di-refresh dan modal ditutup.
- Di mode tenant, bila "tandai lunas" dicentang tetapi status bukan `pending_verification`, verifikasi tidak dijalankan dan muncul toast netral "Detail transaksi berhasil diperbarui.". Checkbox masih tampil dan tercentang secara default. Menyembunyikannya untuk status selain `pending_verification` bisa dipertimbangkan di batch berikutnya.
- `TenantGuards.jsx` memiliki salinan `PageLoader` sendiri, sehingga `App.jsx` tetap memakai miliknya dan tidak bergantung pada modul guard.
