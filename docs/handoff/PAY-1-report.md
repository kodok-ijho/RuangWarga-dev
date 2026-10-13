# PAY-1 Report — Migrasi Payment Gateway Platform ke SNAP DOKU

| Task | Commit | Status | Catatan |
|---|---|---|---|
| PAY-1.1 | 4551d3a | done | `supabase/functions/_shared/doku.ts`: Modul SNAP DOKU bersama untuk Edge Functions runtime Deno. Web Crypto API murni (`crypto.subtle`), penandatanganan B2B RSA-SHA256 (PKCS#8), MPM QRIS & Webhook HMAC-SHA512, SHA-256 lowercase hex, caching B2B token in-memory, perhitungan MDR QRIS 0,7% (`Math.ceil`), fungsi constant-time string equality. |
| PAY-1.2 | ff5d4e4 | done | Migrasi `create-subscription-payment` & `create-listing-payment` ke DOKU: hitung biaya QRIS MDR 0,7% transparan, buat invoice DOKU QRIS MPM via helper bersama, simpan ID pesanan unik `SUB-*` / `LST-*` ke database, kembalikan `qrContent`, `amount`, `qrisFee`. Hapus seluruh fallback mock palsu; kegagalan DOKU menghasilkan error 502 fail-closed. |
| PAY-1.3 | 9a75caa | done | Migrasi `verify-subscription-payment` & `verify-listing-payment` ke webhook DOKU murni: server-to-server POST only, validasi `DOKU_PLATFORM_WEBHOOK_SECRET` dengan `timingSafeEqual`, query ulang status ke gateway via `queryQrisStatus` (anti-spoofing), verifikasi nominal lunas, aktivasi via RPC `activate_subscription_payment` / `activate_listing_payment`. |
| PAY-1.4 | dc41f7e | done | Frontend: `SubscriptionCheckout.jsx` merender QRIS dari `qrContent` string DOKU dengan rincian biaya transparan (pokok + fee MDR 0,7% + total) dan unduh QRIS. `publicListingService.js`: hapus fallback palsu `MYR-DIR-...`, `ID.CO.MAYAR...`, dan tarif hardcoded (F7). Bersihkan teks Mayar di `Home.jsx`, `ChoosePlan.jsx`, `SubscriptionStatus.jsx`, `PlatformRevenue.jsx`. |
| PAY-1.5 | 38e039d | done | Bersihkan sisa Mayar & Midtrans: `PaymentVerification.jsx`, `Settings.jsx`, `dataHelpers.js`, `mockData.js`, `dataService.js` (provider default DOKU tanpa mengganggu route n8n live). Update `.env.server.example` dengan daftar `DOKU_PLATFORM_*`. Update panduan `AGENT.md` dan `GEMINI.md`. |
| PAY-1.6 | 5fb5ed3 | done | Unit test protokol helper murni DOKU: `client/src/services/dokuProtocol.js` & `client/src/services/__tests__/dokuProtocol.test.js` (12 test passed) mencakup perhitungan MDR 0,7% pembulatan ke atas, timestamp ISO format, pembentukan string to sign B2B & MPM, hash SHA-256 dan HMAC-SHA512 test vectors, dan timingSafeEqual. |
| PAY-1.7 | 3c73481 | done | Iklan wajib bayar dulu (F6) & pemulihan RLS SELECT (F9): Migration A (`202610100001_listing_status_pending_payment.sql`) menambah nilai enum `pending_payment`; Migration B (`202610100002_listing_pay_first.sql`) set default status `pending_payment`, trigger `guard_listing_billing_columns()` tolak modifikasi status/type liar, RPC `activate_listing_payment()` aktifkan masa tayang saat lunas, pulihkan RLS SELECT `public_listings_select` (anon hanya bisa lihat yang active & belum expired). Frontend `PostListing.jsx` dan `MyListings.jsx` terintegrasi QRIS DOKU modal. |
| PAY-1 (Fee Adj) | 314b067 | done | Penyesuaian tarif MDR QRIS menjadi 0,75% (keputusan user 2026-10-10): harga dasar tetap di kolom `amount`, rincian fee & total disimpan di `metadata` (`qris_fee_amount`, `qris_total_amount`), nominal ke DOKU dan verifikasi pelunasan menggunakan total tersebut. |

## Output Verifikasi
- **vitest:** 36 test files lulus, **623 tests passed** (0 failed).
- **build:** OK (`npm --prefix client run build` sukses membuat bundle produksi `dist/`).
- **lint:** OK (`npm --prefix client run lint` exit code 0).

## Konfigurasi Kredensial Environment (Untuk Orchestrator)
Edge Functions memerlukan environment variables dengan prefix `DOKU_PLATFORM_*` di Supabase dashboard / secrets:
```bash
DOKU_PLATFORM_BASE_URL=https://api-sandbox.doku.com # atau https://api.doku.com untuk production
DOKU_PLATFORM_CLIENT_ID=
DOKU_PLATFORM_CLIENT_SECRET=
DOKU_PLATFORM_MERCHANT_ID=
DOKU_PLATFORM_TERMINAL_ID=
DOKU_PLATFORM_POSTAL_CODE=
DOKU_PLATFORM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
DOKU_PLATFORM_CHANNEL_ID=H2H
DOKU_PLATFORM_WEBHOOK_SECRET=
```
> [!NOTE]
> Format `DOKU_PLATFORM_PRIVATE_KEY` **wajib** menggunakan format **PKCS#8** (`-----BEGIN PRIVATE KEY-----`). Jika kunci DOKU yang dimiliki adalah PKCS#1 (`BEGIN RSA PRIVATE KEY`), konversikan dengan perintah:
> `openssl pkcs8 -topk8 -nocrypt -in private.pem -out private_pkcs8.pem`

## Perubahan Sensitif (Perlu Review Ekstra)
1. **Edge Functions Pembayaran:**
   - `supabase/functions/_shared/doku.ts`
   - `supabase/functions/create-subscription-payment/index.ts`
   - `supabase/functions/verify-subscription-payment/index.ts`
   - `supabase/functions/create-listing-payment/index.ts`
   - `supabase/functions/verify-listing-payment/index.ts`
2. **Migrations Database (F6 & F9):**
   - `supabase/migrations/202610100001_listing_status_pending_payment.sql`
   - `supabase/migrations/202610100002_listing_pay_first.sql`
3. **SQL Test Matrix:**
   - `supabase/tests/billing_columns_matrix.sql` (uji 9 skenario RLS & trigger billing).

## Asumsi & Keputusan Arsitektur
1. **Biaya QRIS 0,75%:** Dibebankan ke pembayar (transparan di UI dan modal checkout: nilai pokok + MDR 0,75% = total). Kolom `amount` pada tabel database tetap menyimpan harga dasar agar mematuhi constraint trigger database, sementara `qris_fee_amount` dan `qris_total_amount` disimpan di kolom `metadata`.
2. **Isolasi Alur n8n:** Alur legacy n8n dan path webhook Palm Village `/payments/qris/doku/*` dipertahankan sepenuhnya tanpa diubah, menjaga kompabilitas sistem warga yang masih live.
3. **Deployment Edge Functions:** Sesuai Definition of Done, Edge Functions belum di-deploy ke Supabase live; deployment dilakukan oleh Orchestrator (Claude) setelah memasukkan rahasia `DOKU_PLATFORM_*`.
