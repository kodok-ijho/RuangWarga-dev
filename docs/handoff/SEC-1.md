# SEC-1 — Security Hardening (batch aktif)

Baca dulu: `docs/handoff/README.md`, `AGENT.md` §6, §9, §10.
Urutan kerja: SEC-1.0 → 1.1 → 1.2 → 1.3 → 1.4 → 1.5. Satu task = satu commit.

## Latar belakang (sudah terverifikasi oleh Claude di Supabase dev `jqbegedjsylhrqpknwor`)

- Fungsi `SECURITY DEFINER` berikut bisa di-EXECUTE oleh role `anon` **dan** `authenticated`
  (default Postgres memberi EXECUTE ke PUBLIC; `GRANT ... TO service_role` tidak mencabutnya):
  `activate_tenant_subscription`, `activate_listing_payment`, `draw_arisan_winner`,
  `generate_arisan_round_bills`, `check_arisan_round_readiness`, `start_new_arisan_cycle`,
  `check_subscription_expirations`, `check_listing_expirations`, `auto_generate_kos_billing`,
  `checkout_kos_room` (2 overload), `migrate_legacy_portal_warga`, `handle_new_tenant`,
  `handle_superadmin_user_created`, `trg_check_arisan_billing_status`, `get_tenant_opening_balance`.
- Akibat: langganan & iklan bisa diaktifkan tanpa bayar; arisan bisa dikocok oleh user tenant lain / anon.
- `client/src/pages/account/SubscriptionCheckout.jsx` memanggil `supabase.rpc('activate_tenant_subscription')` langsung dari browser (tombol "simulasi" tampil di production).
- Webhook Mayar (`supabase/functions/verify-*-payment`) menerima semua request bila `MAYAR_WEBHOOK_SECRET` kosong, dan tidak memeriksa status event / nominal.
- Permission key yang ada di tabel `public.permissions`:
  `generate_billing, manage_billing_cash, manage_billing_transfer, manage_expenses, manage_members, manage_settings, manage_tenant_users, post_listing, run_special_action, view_reports`.
- RPC yang dipanggil dari klien (`client/src`): `activate_listing_payment`, `activate_tenant_subscription`, `auto_generate_kos_billing`, `check_listing_expirations`, `checkout_kos_room`, `draw_arisan_winner`, `generate_arisan_round_bills`, `get_invite_details`, `get_tenant_opening_balance`, `start_new_arisan_cycle`.

---

## SEC-1.0 — Sinkronkan AGENT.md & GEMINI.md

Dokumen rencana lama sudah dihapus (commit `fdd6205`).
- `AGENT.md`: hapus kewajiban membaca `requirement.md`, `specification.md`, `task.md`, `docs/audit-notes.md`; ganti dengan "sumber tugas = `docs/handoff/` (batch aktif terbaru)". Hapus/ringkas tabel Phase 0–11 dan referensi `task.md` lainnya. Pertahankan aturan RLS (§6), routing (§7), keamanan (§9), testing (§10), batasan (§11).
- Tambahkan bagian singkat "Peran": Claude = orchestrator, Antigravity = executor (rujuk `docs/handoff/README.md`).
- `GEMINI.md`: lakukan penyesuaian yang sama (bagian "Dokumen Perencanaan").
- `AGENTS.md` adalah symlink ke `AGENT.md` — jangan diubah.

Acceptance: `grep -nE "requirement\.md|specification\.md|task\.md|audit-notes" AGENT.md GEMINI.md` kosong.

---

## SEC-1.1 — Migration: cabut EXECUTE + guard otorisasi  ⚠️ sensitif

File baru: `supabase/migrations/202610080001_harden_definer_function_grants.sql`
(ikuti gaya migration lama: header komentar, `BEGIN; … COMMIT;`, blok `-- ROLLBACK:` berisi GRANT kebalikan).

**A. Hanya backend (service_role):**
```sql
REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO service_role;
```
untuk: `activate_tenant_subscription(uuid,text)`, `activate_listing_payment(uuid,text)`,
`check_subscription_expirations()`, `migrate_legacy_portal_warga(text,text,text)`,
`handle_new_tenant()`, `handle_superadmin_user_created()`, `trg_check_arisan_billing_status()`.
(Fungsi trigger tetap jalan sebagai trigger walau EXECUTE dicabut.)

**B. Dipanggil user login → `REVOKE ... FROM PUBLIC, anon;` + `GRANT EXECUTE ... TO authenticated, service_role;`
dan tambahkan guard di awal body (`CREATE OR REPLACE`, salin body asli dari migration terakhir yang mendefinisikannya, **jangan ubah logika lain**):**

| Fungsi | Guard |
|---|---|
| `draw_arisan_winner(uuid,uuid,uuid)` | `has_permission(p_tenant_id, 'run_special_action')` |
| `start_new_arisan_cycle(uuid,uuid,boolean)` | `has_permission(p_tenant_id, 'run_special_action')` |
| `generate_arisan_round_bills(uuid,uuid,date)` | `has_permission(p_tenant_id, 'generate_billing')` |
| `auto_generate_kos_billing(text,uuid)` | jika `p_tenant_id` NULL → hanya `is_platform_admin()`; selain itu `has_permission(p_tenant_id, 'generate_billing')` |
| `checkout_kos_room(...)` ×2 overload | `has_permission(p_tenant_id, 'manage_members')` |
| `check_arisan_round_readiness(uuid)` | ambil `tenant_id` dari `arisan_rounds` where id = `p_round_id`; wajib `tenant_id = ANY(current_tenant_ids()) OR is_platform_admin()` |
| `get_tenant_opening_balance(uuid,date)` | cek dulu apakah body sudah punya guard; jika belum: `p_tenant_id = ANY(current_tenant_ids()) OR is_platform_admin()` |
| `check_listing_expirations()` | `is_platform_admin()` (dipanggil di `publicListingService.js:740`) |

Pola guard:
```sql
IF NOT public.has_permission(p_tenant_id, 'run_special_action') THEN
  RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
END IF;
```
Sesuaikan bentuk `current_tenant_ids()` dengan definisinya yang aktual (SETOF vs array) — cek `202609130005_create_rls_helpers_and_triggers.sql`.
Catatan: fungsi yang dipanggil dari Edge Function / cron dengan service_role — `auth.uid()` NULL → guard `has_permission` akan menolak. Jika ada pemanggilan service_role (cek `supabase/functions/auto-generate-kos-bills`), tambahkan bypass `OR auth.role() = 'service_role'`.

**C. Jangan diubah:** helper RLS `has_permission`, `is_platform_admin`, `is_tenant_owner`, `current_tenant_ids`, `tenant_subscription_status` (dipakai policy), dan `get_invite_details` (halaman join publik, anon memang perlu).

**D. `SET search_path = public`** (via `ALTER FUNCTION ... SET search_path = public;`) untuk:
`touch_updated_at`, `is_valid_calendar_date`, `storage_extract_tenant_id`, `is_valid_expense_receipt_path` (cek signature aktual di migration).

**E. Integritas aktivasi** — di `activate_tenant_subscription` & `activate_listing_payment`: setelah cek idempotency (sudah settled/paid → return success), tolak jika status bukan `pending`:
`RETURN jsonb_build_object('success', false, 'error', 'Payment status tidak valid: ' || v_payment.status);`

Acceptance: SQL valid; setiap fungsi di daftar "RPC dipanggil dari klien" masih bisa dipanggil `authenticated` kecuali `activate_tenant_subscription` & `activate_listing_payment` (akan dihapus dari klien di SEC-1.3).

---

## SEC-1.2 — Test matrix grant

File baru: `supabase/tests/function_grants_matrix.sql` (ikuti gaya `supabase/tests/tenant_isolation_matrix.sql`).
- Assert via `has_function_privilege(role, 'public.fn(args)', 'EXECUTE')` untuk anon/authenticated/service_role sesuai SEC-1.1 (RAISE EXCEPTION bila tidak sesuai).
- Skenario: `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', '{"sub":"<user tenant lain>","role":"authenticated"}', true)` → panggil `draw_arisan_winner` untuk tenant lain → harus gagal dengan 42501. Gunakan data fixture yang dibuat & dihapus di dalam transaksi (`BEGIN … ROLLBACK`).

---

## SEC-1.3 — Frontend: hapus aktivasi dari browser

1. `client/src/pages/account/SubscriptionCheckout.jsx`
   - `handleSimulatePaymentSuccess` + tombolnya: hanya ada saat `isDemo`.
   - Non-demo: tampilkan instruksi bayar (QR/link dari `paymentData`) dan **polling** status `subscription_payments` by `paymentData.paymentId` (pakai `@tanstack/react-query` `refetchInterval` ~5 dtk, berhenti saat `settled`/`failed`/`expired`). Saat `settled` → `setIsSuccess(true)` + `refreshTenant()`.
   - Tidak ada lagi `supabase.rpc('activate_tenant_subscription')` di file ini.
2. `client/src/services/publicListingService.js` → `verifyListingPayment`: hapus fallback `supabase.rpc('activate_listing_payment')`. Non-demo: baca status `listing_payments` by id; kembalikan `{ success: status === 'paid', status }`. Jangan memanggil Edge Function webhook dari klien.
3. `client/src/components/QrisCheckoutModal.jsx` (±baris 31): hapus fallback string QR palsu (`ID.CO.PALMVILLAGE…`). Jika tidak ada `qr_content`/`qrContent`, tampilkan pesan error (pakai komponen yang ada di `components/ui/`) dan jangan render QR.
4. Test: perbarui test yang terdampak (`publicListingService.test.js`, `listingRegression.test.js`, dll.) dan tambah test: mode non-demo tidak memanggil `supabase.rpc('activate_listing_payment')`.

Acceptance: `grep -rn "rpc('activate_" client/src --include=*.js --include=*.jsx | grep -v test` kosong; vitest & build hijau.

---

## SEC-1.4 — Edge Functions Mayar  ⚠️ sensitif (kode uang)

File: `supabase/functions/verify-subscription-payment/index.ts`, `verify-listing-payment/index.ts`, `create-subscription-payment/index.ts`, `create-listing-payment/index.ts`.

Webhook (`verify-*`):
- `MAYAR_WEBHOOK_SECRET` kosong → respon 500 `{"error":"Webhook secret not configured"}` (fail-closed).
- Bandingkan token dengan perbandingan constant-time (helper kecil: panjang sama + XOR semua byte).
- Hapus header CORS `*` (endpoint server-to-server); tolak method selain POST.
- Hanya aktivasi bila event/status menandakan sukses (mis. `payment.received`, `status` = `paid`/`SUCCESS`/`settled`). Jika format event Mayar tidak pasti → tulis di `questions.md`, implementasikan allowlist yang mudah diubah (konstanta di atas file).
- Ambil record payment, bandingkan `amount` dari payload dengan `amount` record → beda → 409, tanpa aktivasi.
- Jangan bocorkan pesan error internal (`err.message`) ke response; log saja.

Create (`create-*`):
- Jika `MAYAR_API_KEY` ada dan panggilan Mayar gagal / tanpa `data` → update payment `status = 'failed'`, respon 502. Jangan lanjut dengan referensi simulasi.
- Mode simulasi hanya bila `MAYAR_API_KEY` tidak ada **dan** env `ALLOW_SIMULATED_PAYMENTS === 'true'`; selain itu 500 "Payment gateway not configured".
- `create-subscription-payment`: hapus fallback harga `?? 12500` / `?? 8750` — bila baris `block_pricing` yang dibutuhkan tidak ada → 500 dengan pesan jelas.
- Nomor HP fallback `"081234567890"` → kirim hanya bila user punya nomor; jangan kirim nomor palsu.

Acceptance: `deno check` bila tersedia (tulis di report jika tidak tersedia); tidak ada secret di kode; jelaskan perilaku baru di badan commit.

---

## SEC-1.5 — ESLint

- Tambah ESLint flat config minimal untuk React (`eslint`, `@eslint/js`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `globals`) di `client/` — alasan: AGENT.md §10 mewajibkan `npm run lint` lolos.
- Script `"lint": "eslint src"` di `client/package.json`.
- Aturan: mulai dari `recommended`; matikan aturan yang menghasilkan ratusan error gaya (catat di report) — tujuan batch ini lint **jalan dan lolos**, bukan refactor besar. Jangan ubah logika kode untuk memuaskan lint kecuali bug nyata (unused var boleh dibersihkan).

Acceptance: `npm run lint` exit 0.

---

## Definition of Done SEC-1
- Semua task done/partial tercatat di `SEC-1-report.md` dengan hash commit.
- vitest, build, lint hijau.
- Pertanyaan terbuka (jika ada) di `questions.md`.
- Setelah itu user minta Claude: **"Review SEC-1"** (Claude akan apply migration ke Supabase dev & verifikasi grant/advisor).
