# SEC-1 Review (oleh Claude)

Commit yang direview: `b2630bb..385f9a3` (7 commit, PR kodok-ijho/RuangWarga-dev#37).

## Verifikasi
| Cek | Hasil |
|---|---|
| `npx vitest run` | ✅ 34 file / 588 test lulus |
| `npm run build` | ✅ |
| `npm run lint` | ✅ exit 0 (tapi lihat temuan F5) |
| `grep rpc('activate_` di client | ✅ kosong |
| Migration `202610080001` diterapkan ke Supabase **dev** (`jqbegedjsylhrqpknwor`) | ✅ sukses |
| Body fungsi di migration vs DB dev sebelum apply | ✅ logika identik (beda hanya komentar) |
| Grant setelah apply | ✅ `activate_*`, `check_subscription_expirations`, `migrate_legacy_portal_warga`, `handle_*` → hanya service_role; fungsi arisan/kos/laporan → authenticated (dengan guard), anon = false |
| Supabase security advisor | ✅ fungsi SECURITY DEFINER yang bisa dipanggil anon turun **21 → 6** (sisa: helper RLS + `get_invite_details`, disengaja) |

Kualitas kerja SEC-1 baik: semua task selesai, 1 task = 1 commit, laporan lengkap.

## Temuan (dikerjakan di SEC-2)

**F1 — KRITIS: langganan bisa diaktifkan tanpa bayar lewat UPDATE tabel langsung.**
Policy `tenant_subscriptions_update_owner` mengizinkan owner tenant `UPDATE tenant_subscriptions` (termasuk `status`, `current_period_end`). Owner bisa set `status='active'` & tanggal akhir 10 tahun lagi dari browser. Ini melewati semua hardening SEC-1.
Klien tidak pernah UPDATE tabel ini (hanya SELECT di `TenantContext.jsx:273`, `SubscriptionStatus.jsx:71`).

**F2 — KRITIS: iklan listing bisa aktif/featured gratis.**
Policy `public_listings_update_when_active` mengizinkan pemasang mengubah `status`, `expires_at`, `is_featured`, `featured_until` sendiri. `renewListing()` di `client/src/services/publicListingService.js` (±baris 398) bahkan melakukan update ini langsung dari browser.

**F3 — TINGGI: `listing_payments` bisa di-INSERT klien dengan status bebas.**
Policy `owner_can_create_listing_payment` tidak membatasi `status`/`amount`. Klien insert di `publicListingService.js:563`.

**F4 — SEDANG: webhook Mayar masih bisa salah aktivasi.**
`verify-*-payment`: (a) cukup event sukses ATAU status sukses — event `payment.received` dengan status `failed` tetap lolos; (b) cek nominal dilewati bila payload tanpa `amount`; (c) bila RPC mengembalikan `{success:false}` (mis. status payment bukan pending) respons tetap 200 "berhasil".

**F5 — SEDANG: aturan lint penting dimatikan.**
`react-hooks/rules-of-hooks` dan `no-undef` di-`off` di `client/eslint.config.js`. Keduanya menangkap bug nyata (hook bersyarat, variabel tak terdefinisi), bukan gaya.

**Diterima (tidak diperbaiki):** guard `auth.role() = 'service_role' OR …` bernilai NULL bila dipanggil tanpa JWT; ini hanya terjadi pada koneksi Postgres langsung (superuser, sudah tepercaya). PostgREST selalu mengirim role.

## Status deploy
- Migration SEC-1 sudah di DB dev. Edge Functions **belum** di-deploy; jangan deploy sebelum `MAYAR_WEBHOOK_SECRET` diset di Supabase secrets (fungsi webhook kini fail-closed).
