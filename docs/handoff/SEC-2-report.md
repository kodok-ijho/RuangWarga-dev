# SEC-2 Report

| Task | Commit | Status | Catatan |
|---|---|---|---|
| SEC-2.1 | 7fab3d3 | done | Migration `supabase/migrations/202610090001_protect_billing_columns.sql`: helper `is_billing_privileged()`, cabut policy update owner pada `tenant_subscriptions` (hanya platform admin), trigger `BEFORE INSERT OR UPDATE` pada `public_listings` (`guard_listing_billing_columns`), trigger `BEFORE INSERT` pada `listing_payments` (`guard_listing_payment_insert`). |
| SEC-2.2 | 0cc501e | done | `client/src/services/publicListingService.js`: tolak pemanggilan langsung `renewListing()` di lingkungan non-demo (wajib via `createListingPayment`), perketat `updateListingStatus()` di non-demo agar status `active` hanya diizinkan bila masa tayang belum expired, hapus pengiriman `status`/`paid_at` saat insert `listing_payments`. Unit test diperbarui di `publicListingService.test.js`. |
| SEC-2.3 | - | skipped | Dibatalkan, dipindah ke PAY-1 (gateway pembayaran resmi dialihkan ke DOKU QRIS, membuang Mayar & Midtrans). |
| SEC-2.4 | f7bb7b9 | done | Aktifkan kembali `'react-hooks/rules-of-hooks': 'error'` dan `'no-undef': 'error'` di `client/eslint.config.js`. Perbaiki pelanggaran hook bersyarat dan variabel tak terdefinisi pada 7 file: `AuthContext.jsx`, `Logs.jsx`, `PaymentVerification.jsx`, `UserApproval.jsx`, `PaymentMatrix.jsx`, `Residents.jsx`, dan `SubscriptionStatus.jsx`. |
| SEC-2.5 | f0b507b | done | SQL test matrix `supabase/tests/billing_columns_matrix.sql`: memvalidasi 4 skenario keamanan database (owner tenant update subscription, poster update expires_at/is_featured ditolak 42501, poster update status rented_or_sold diizinkan, poster insert payment dipaksa status='pending' dan nominal catalog resmi). |

## Output Verifikasi
- **vitest:** 34 test files lulus, **589 tests passed** (0 failed).
- **build:** OK (`npm --prefix client run build` sukses membuat bundle produksi `dist/`).
- **lint:** OK (`npm --prefix client run lint` exit code 0 dengan aturan `rules-of-hooks` dan `no-undef` aktif).

## Perubahan Sensitif (Perlu Review Ekstra)
1. **Migration SQL:**
   - `supabase/migrations/202610090001_protect_billing_columns.sql` (helper `is_billing_privileged()`, trigger proteksi billing columns `public_listings` dan `listing_payments`, policy update `tenant_subscriptions`).
2. **SQL Test Matrix:**
   - `supabase/tests/billing_columns_matrix.sql` (verifikasi proteksi bypass pembayaran di level SQL).
3. **Frontend Payment & Listing Flow:**
   - `client/src/services/publicListingService.js` (pencegahan manipulasi langsung kolom masa tayang).

## Asumsi yang Diambil
1. **Task SEC-2.3 Skipped:** Sesuai instruksi `docs/handoff/SEC-2.md` dan keputusan arsitektur di `BACKLOG.md`, pengetatan webhook Mayar dilewati karena seluruh integrasi pembayaran langganan & iklan akan ditulis ulang untuk DOKU di batch **PAY-1**.
2. **Masa Tayang Default:** Trigger `guard_listing_billing_columns` pada saat INSERT non-privileged membatasi masa tayang maksimal 30 hari dari waktu pembuatan (`now() + interval '30 days'`).
3. **Globals Linter:** File test unit (`src/**/*.{test,spec}.{js,jsx}`) ditambahkan konfigurasi `globals.node` pada ESLint flat config agar variabel pengujian lingkungan Node seperti `__dirname` dan `process` dikenali dengan benar.
