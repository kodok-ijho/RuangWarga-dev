# SEC-2 — Tutup jalur bypass pembayaran (batch aktif)

Baca dulu: `docs/handoff/README.md`, `docs/handoff/SEC-1-review.md` (temuan F1–F5).
Urutan: SEC-2.1 → 2.2 → 2.3 → 2.4 → 2.5. Satu task = satu commit. Branch: `claude/eloquent-tesla-f0ddcr`.

---

## SEC-2.1 — Migration: lindungi kolom billing  ⚠️ sensitif (F1, F2, F3)

File baru: `supabase/migrations/202610090001_protect_billing_columns.sql` (gaya sama dengan `202610080001`: header, `BEGIN/COMMIT`, blok `-- ROLLBACK:`).

Definisikan helper (SECURITY DEFINER tidak perlu; cukup SQL biasa):
```sql
-- true bila pemanggil boleh mengubah kolom billing
CREATE OR REPLACE FUNCTION public.is_billing_privileged() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR current_user IN ('postgres', 'supabase_admin')
      OR public.is_platform_admin();
$$;
```

**A. `tenant_subscriptions` (F1)**
- `DROP POLICY IF EXISTS "tenant_subscriptions_update_owner" ON public.tenant_subscriptions;`
- Buat policy UPDATE baru hanya untuk `is_platform_admin()` (USING & WITH CHECK).
- Verifikasi dulu: `grep -rn "tenant_subscriptions" client/src supabase/functions` — pastikan tidak ada UPDATE dari klien. Jika ternyata ada, STOP dan tulis di `questions.md`.

**B. `public_listings` (F2)** — trigger `BEFORE INSERT OR UPDATE`, fungsi `public.guard_listing_billing_columns()`:
- Jika `is_billing_privileged()` → `RETURN NEW` (tanpa pembatasan).
- INSERT oleh non-privileged: paksa `is_featured := false`, `featured_until := NULL`; `expires_at` tidak boleh lebih dari masa tayang default (cek nilai default kolom `expires_at` di `202609140012_create_public_listings_schema.sql`; jika default `now() + X`, paksa `expires_at := now() + X`).
- UPDATE oleh non-privileged:
  - `expires_at`, `is_featured`, `featured_until` harus sama dengan `OLD` → selain itu `RAISE EXCEPTION 'Kolom masa tayang hanya diubah lewat pembayaran' USING ERRCODE='42501'`.
  - `status` boleh berubah ke `rented_or_sold` atau `expired`; boleh ke `active` **hanya jika** `OLD.expires_at > now()` (masa tayang masih berlaku). Selain itu raise 42501.
- Jika keputusan "posting pertama gratis X hari atau harus bayar dulu" tidak jelas dari kode → tetap terapkan aturan di atas dan catat di `questions.md`.

**C. `listing_payments` (F3)** — trigger `BEFORE INSERT`, fungsi `public.guard_listing_payment_insert()`:
- Non-privileged: paksa `NEW.status := 'pending'`, `NEW.paid_at := NULL`, dan `NEW.amount` diambil dari tabel harga (`listing_pricing`, cocokkan kolom yang relevan — cek skema & bagaimana `supabase/functions/create-listing-payment/index.ts` menghitung harga; gunakan logika yang sama). Jika harga tidak bisa ditentukan → raise exception.
- Tambahkan policy/aturan agar non-privileged **tidak bisa UPDATE** `listing_payments` (saat ini UPDATE hanya platform admin — pastikan tetap begitu).

Semua fungsi trigger: `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (trigger tetap jalan).

Acceptance: migration valid; tidak mengubah logika lain.

## SEC-2.2 — Frontend: renew & status listing lewat jalur resmi (F2)

`client/src/services/publicListingService.js`:
- `renewListing()` (±baris 380–420): pada mode **non-demo** jangan update `expires_at/is_featured/status` langsung. Ganti dengan alur pembayaran yang sudah ada (`create-listing-payment` → bayar → webhook mengaktifkan). Kembalikan error jelas bila dipanggil langsung di non-demo, atau arahkan pemanggil (cek siapa yang memanggil `renewListing`) ke alur pembayaran.
- `updateListingStatus()` (±baris 345–380): di non-demo hanya izinkan `rented_or_sold` / `expired`; `active` hanya bila listing belum kedaluwarsa (cek `expires_at`), konsisten dengan trigger SEC-2.1.
- Insert `listing_payments` (±baris 563): jangan kirim `status`/`paid_at`; biarkan DB/trigger menentukan.
- Update/tambah test di `publicListingService.test.js`: non-demo `renewListing` tidak memanggil `.update()` kolom masa tayang.

Acceptance: vitest & build hijau.

## SEC-2.3 — DIBATALKAN (gateway pindah ke DOKU)

Keputusan user: **Mayar & Midtrans dibuang, pakai DOKU saja**. Jadi jangan sentuh
`verify-subscription-payment` / `verify-listing-payment` di batch ini — kedua file akan
ditulis ulang untuk DOKU di batch **PAY-1** (`docs/handoff/PAY-1.md`), termasuk semua
pengetatan yang tadinya direncanakan di sini (status wajib sukses, nominal wajib cocok,
hasil aktivasi `success:false` → 409, helper bersama).

Aman dilewati sekarang: keempat Edge Function **belum pernah di-deploy**, dan webhook
sudah fail-closed (tanpa secret semua request ditolak). Tidak ada risiko live.

Tulis di report: `SEC-2.3 | - | skipped | dibatalkan, dipindah ke PAY-1`.

## SEC-2.4 — Hidupkan lagi aturan lint penting (F5)

`client/eslint.config.js`:
- `react-hooks/rules-of-hooks: 'error'`.
- `no-undef: 'error'` dengan `globals` yang benar: `globals.browser` untuk `src/**`, tambah `globals.node` untuk file config, dan globals vitest (`describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll`) untuk `**/*.test.{js,jsx}`. Tambahkan juga `__APP_VERSION__` atau define Vite lain jika ada (cek `vite.config.js`).
- Perbaiki pelanggaran nyata yang muncul (hook bersyarat, variabel tidak terdefinisi). Jangan matikan aturan lagi; jika ada kasus yang benar-benar perlu, pakai `// eslint-disable-next-line <rule> -- <alasan>` per baris.

Acceptance: `npm run lint` exit 0 dengan kedua aturan aktif; vitest & build hijau.

## SEC-2.5 — Test SQL untuk SEC-2.1

File baru: `supabase/tests/billing_columns_matrix.sql` (gaya `function_grants_matrix.sql`, di dalam `BEGIN … ROLLBACK`):
- Owner tenant (`SET LOCAL ROLE authenticated` + claims) → `UPDATE tenant_subscriptions SET status='active'` → harus gagal/0 baris.
- Pemasang listing → `UPDATE public_listings SET expires_at = now() + interval '1 year'` → 42501.
- Pemasang listing → `UPDATE public_listings SET status='rented_or_sold'` → berhasil.
- Pemasang listing → `INSERT listing_payments (..., status='paid')` → tersimpan sebagai `pending`.

---

## Definition of Done SEC-2
- `SEC-2-report.md` (format README) dengan hash commit tiap task.
- vitest, build, lint hijau.
- Pertanyaan terbuka di `questions.md`.
- Lalu user minta Claude: **"Review SEC-2"** (Claude apply migration ke dev & jalankan test SQL).
