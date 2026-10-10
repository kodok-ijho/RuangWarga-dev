# PAY-1F — Perbaikan hasil review PAY-1

**Wajib sebelum Edge Function pembayaran di-deploy.** Baca `docs/handoff/PAY-1-review.md` dulu.
Branch: `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. 🚫 n8n & `api/n8n.js` tetap tidak boleh disentuh.

**Aturan baru untuk SQL & Edge Function:** sebelum menulis nama kolom/nilai status, cocokkan dengan skema aktual
(file migration `CREATE TABLE`/`ALTER TABLE` terakhir untuk tabel itu). Jangan menebak dari kode lain.
Skema dev terverifikasi Claude (2026-10-10):
- `subscription_payments`: `id, subscription_id, amount, qris_ref, payment_url, status, paid_at, metadata, created_at, updated_at`; CHECK status `('pending','paid','failed','expired')`.
- `tenant_subscription_blocks`: `id, subscription_id, block_size, quantity, price_snapshot, created_at`.
- `tenant_members`: **tidak ada** kolom `role`/`email`; ada `tenant_role_id`, `is_owner`, `status`.
- `public_listings.expires_at`: NOT NULL.
- `listing_payments`: `..., qris_ref, status (text), metadata, ...`.

---

## PAY-1F.1 — Migration: selaraskan skema langganan & listing  ⚠️ sensitif
1. **Edit** `supabase/migrations/202610100002_listing_pay_first.sql` (belum pernah diterapkan, aman diedit): tambahkan di bagian 1
   `ALTER TABLE public.public_listings ALTER COLUMN expires_at DROP NOT NULL;` (G7).
2. File baru `supabase/migrations/202610100003_align_subscription_payments.sql`:
   - `ALTER TABLE public.subscription_payments`
     `ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.subscription_periods(id)`,
     `ADD COLUMN IF NOT EXISTS payment_gateway_ref text`,
     `ADD COLUMN IF NOT EXISTS payment_method text`.
   - Ganti CHECK status agar mengizinkan `'settled'`: cari nama constraint lama dengan
     `SELECT conname FROM pg_constraint WHERE conrelid='public.subscription_payments'::regclass AND contype='c'`
     di dalam blok `DO $$ ... $$` lalu `ALTER TABLE ... DROP CONSTRAINT <nama>`; tambah constraint baru
     `CHECK (status IN ('pending','settled','paid','failed','expired'))`.
   - Index: `CREATE INDEX IF NOT EXISTS idx_sub_payments_gateway_ref ON public.subscription_payments(payment_gateway_ref);`
     dan `CREATE INDEX IF NOT EXISTS idx_listing_payments_qris_ref ON public.listing_payments(qris_ref);`
   - `CREATE OR REPLACE FUNCTION public.activate_tenant_subscription(p_payment_id uuid, p_gateway_ref text DEFAULT NULL)`:
     pertahankan isi & guard yang sekarang (status `settled` idempotent, tolak non-`pending`), **ditambah** (G3):
     setelah update payment, ganti blok langganan dari `v_payment.metadata`:
     `DELETE FROM tenant_subscription_blocks WHERE subscription_id = v_payment.subscription_id;` lalu insert
     `(subscription_id, block_size, quantity, price_snapshot)` untuk `blocks10` (size 10) dan `blocks5` (size 5) yang > 0,
     `price_snapshot` dari `metadata.price10` / `metadata.price5`. Tolak (`success:false`) bila `period_id` NULL.
     Akhiri dengan `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;` (pola SEC-1).
   - Blok `-- ROLLBACK:` seperti migration lain.

## PAY-1F.2 — `create-subscription-payment`  ⚠️ sensitif
- **Hak akses (G2):** owner tenant atau platform admin. Pakai RPC dengan **client pengguna** (JWT pemanggil):
  `userClient.rpc('is_tenant_owner', { p_tenant_id: tenantId })` dan `userClient.rpc('is_platform_admin')`.
  Hapus semua pembacaan `memberRow.role`.
- **Jangan sentuh `tenant_subscription_blocks`** di fungsi ini (G3). Simpan pesanan blok di `metadata`:
  `blocks10, blocks5, price10, price5, total_capacity, duration_months, discount_percent, base_amount, qris_fee, qris_fee_amount, qris_total_amount`.
- Insert `period_id`, `payment_method: 'doku_qris'` (kolom ada setelah PAY-1F.1).
- Simpan referensi ke `payment_gateway_ref` (dan `qris_ref` boleh diisi nilai sama).
- Update kedua setelah DOKU sukses: **gabungkan** metadata lama (`{ ...metadataAwal, doku_reference_no }`), jangan menimpa (G4).

## PAY-1F.3 — `create-listing-payment`  ⚠️ sensitif
- **Hak akses (G2):** pemasang listing (`tenant_members.id = listing.posted_by` untuk user ini — select `id` saja),
  owner tenant, `has_permission(tenant_id,'post_listing')`, atau platform admin — via `userClient.rpc(...)`. Hapus `memberRow.role`.
- Update metadata digabung, bukan ditimpa (G4).

## PAY-1F.4 — Kedua webhook (`verify-*-payment`)  ⚠️ sensitif (uang platform)
- **Auth (G5):** token dari query string URL notifikasi: `new URL(req.url).searchParams.get('token')`, dibandingkan
  `timingSafeEqual` dengan `DOKU_PLATFORM_WEBHOOK_SECRET`. Hapus pembacaan header `x-signature`/`authorization`/dll.
  Catat di komentar: URL notifikasi yang didaftarkan di dashboard DOKU = `https://<project>.supabase.co/functions/v1/verify-...-payment?token=<secret>`.
- **Status lunas (G6):** tambah helper di `_shared/doku.ts`: `isQrisPaid(raw)` → `true` hanya bila
  `String(raw.responseCode).startsWith('200') && raw.latestTransactionStatus === '00'`. Hapus `SUCCESS_DOKU_STATUSES`.
- **Nominal (G4):** ambil dari **respons query DOKU** (`raw.amount.value`), wajib ada; bandingkan dengan
  `Number(payment.amount) + Number(payment.metadata.qris_fee)` (select `metadata`). Tidak ada / beda → 409, jangan aktivasi.
- Langganan: cari lewat `payment_gateway_ref` (setelah PAY-1F.1 kolomnya ada), idempotensi `'settled'`.
  Listing: cari lewat `qris_ref`, idempotensi `'paid'`.

## PAY-1F.5 — Bersih-bersih kecil (G8)
- `_shared/doku.ts`: `DOKU_PLATFORM_BASE_URL` wajib (masuk daftar `missing`), tanpa default production.
- Hapus `checkListingExpirations()` dari `publicListingService.js` beserta test-nya (tidak dipakai UI; guard DB dipertahankan).

## PAY-1F.6 — Test
- Vitest (`client/src/services/dokuProtocol.js` + test-nya, cermin logika Deno): `isQrisPaid` (`'00'`+`2005100` → true;
  `'03'` → false; responseCode non-200 → false) dan fungsi `expectedQrisTotal(amount, metadata)`.
- `supabase/tests/billing_columns_matrix.sql`: tambah skenario aktivasi langganan via `activate_tenant_subscription`
  (dijalankan sebagai postgres): payment `pending` + metadata blok → status `settled`, `tenant_subscriptions.status='active'`,
  blok terpasang sesuai metadata; panggil ulang → idempotent.
- Jangan memanggil DOKU sungguhan.

---

## Definition of Done
- `PAY-1F-report.md` dengan hash commit **yang benar-benar ada di branch** (`git log --oneline`).
- vitest, build, lint hijau.
- `grep -rn "memberRow.role\|\.role ===" supabase/functions` → kosong.
- `grep -rn "tenant_subscription_blocks" supabase/functions` → kosong.
- Edge Function **belum** di-deploy. Claude menerapkan migration ke dev & menjalankan test SQL setelah review.
