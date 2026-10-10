# PAY-1F Report — Perbaikan Hasil Review PAY-1

| Task | Commit | Status | Catatan |
|---|---|---|---|
| PAY-1F.1 | 5ee8da2 | done | `202610100002_listing_pay_first.sql`: `expires_at DROP NOT NULL` (G7). Migration baru `202610100003_align_subscription_payments.sql`: tambah `period_id`, `payment_gateway_ref`, `payment_method` pada `subscription_payments`; perbarui CHECK status agar mengizinkan `'settled'`; indeks `payment_gateway_ref` & `qris_ref`; fungsi `activate_tenant_subscription` diperbarui untuk menerapkan pesanan blok dari `metadata` (`blocks10`, `blocks5`) dan tolak jika `period_id` NULL (G3). |
| PAY-1F.2 | 5e53b6f | done | `create-subscription-payment`: Hak akses diperbaiki menggunakan RPC token pemanggil (`userClient.rpc('is_tenant_owner')` dan `is_platform_admin()`), hapus seluruh pembacaan `memberRow.role` (G2). Jangan sentuh `tenant_subscription_blocks` sebelum bayar; simpan pesanan blok lengkap di `metadata` (G3). Update kedua setelah DOKU sukses menggabungkan metadata awal (`...initialMetadata`), tidak menimpa (G4). |
| PAY-1F.3 | 3147458 | done | `create-listing-payment`: Hak akses diperbaiki (pemasang listing cek `tenant_members.id = listing.posted_by` untuk user aktif, `is_tenant_owner`, `has_permission('post_listing')`, atau platform admin) via RPC/query userClient, hapus `memberRow.role` (G2). Update metadata setelah DOKU sukses digabung, bukan ditimpa (G4). |
| PAY-1F.4 | 27d49d0 | done | Webhook `verify-subscription-payment` & `verify-listing-payment`: Autentikasi via token query string URL notifikasi (`?token=...`) dibandingkan `timingSafeEqual` dengan `DOKU_PLATFORM_WEBHOOK_SECRET`, hapus pengecekan header statis/signature (G5). Status lunas divalidasi via helper murni `isQrisPaid` (`responseCode` diawali `200` dan `latestTransactionStatus === '00'`), hapus `SUCCESS_DOKU_STATUSES` (G6). Validasi nominal wajib ada dari respons query gateway DOKU (`raw.amount.value`) dan dicocokkan dengan `amount + metadata.qris_fee` (G4). Pencarian langganan lewat `payment_gateway_ref` (idempotensi `'settled'`), listing lewat `qris_ref` (idempotensi `'paid'`). |
| PAY-1F.5 | 41b9d86 | done | Bersih-bersih (G8): `_shared/doku.ts` mewajibkan `DOKU_PLATFORM_BASE_URL` (masuk daftar missing, tanpa default production). Hapus fungsi `checkListingExpirations` dari `publicListingService.js` serta test terkait di `publicListingService.test.js` dan `listingRegression.test.js` karena tidak dipakai komponen UI (guard DB dipertahankan). |
| PAY-1F.6 | d7030a9 | done | Unit test & skenario SQL: `client/src/services/dokuProtocol.js` + `dokuProtocol.test.js` menambahkan unit test untuk `isQrisPaid` (4 kasus uji) dan `expectedQrisTotal` (2 kasus uji), seluruh 18 test lulus. `supabase/tests/billing_columns_matrix.sql` menambahkan skenario T10 aktivasi langganan via `activate_tenant_subscription` (payment `pending` + metadata blok → status `settled`, subscription `active`, blok terpasang di database, pemanggilan ulang idempotent). |

## Output Verifikasi
- **vitest:** 36 test files lulus, **626 tests passed** (0 failed).
- **build:** OK (`npm --prefix client run build` sukses membuat bundle produksi `dist/` dalam 32.10s, Service Worker & PWA manifest generated).
- **lint:** OK (`npm --prefix client run lint` exit code 0).
- **grep checks:**
  - `grep -rn "memberRow.role\|\.role ===" supabase/functions` → **kosong** (0 match).
  - `grep -rn "tenant_subscription_blocks" supabase/functions` → **kosong** (0 match).

## Konfigurasi URL Notifikasi DOKU (Untuk Orchestrator)
URL notifikasi yang didaftarkan pada Merchant Dashboard DOKU:
- **Langganan Tenant:**
  `https://<project-ref>.supabase.co/functions/v1/verify-subscription-payment?token=<DOKU_PLATFORM_WEBHOOK_SECRET>`
- **Iklan Listing Publik:**
  `https://<project-ref>.supabase.co/functions/v1/verify-listing-payment?token=<DOKU_PLATFORM_WEBHOOK_SECRET>`

## Status Migrasi & Deployment
- Akun DOKU Platform masih dalam proses pengajuan merchant; sesuai batasan, tidak memanggil DOKU sungguhan dan tidak men-deploy Edge Function.
- Migrasi SQL `202610100002_listing_pay_first.sql` dan `202610100003_align_subscription_payments.sql` siap diterapkan ke database Supabase dev oleh Orchestrator (Claude).
- Pengujian database via `supabase/tests/billing_columns_matrix.sql` (skenario T1..T10) siap dieksekusi oleh Orchestrator setelah migration diterapkan.
