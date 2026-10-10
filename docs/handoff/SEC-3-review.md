# SEC-3 Review (Claude, 2026-10-10)

Commit yang direview: `b4cd33f..5b2d36c`. Hash di laporan cocok ✅.

## Verifikasi ulang
| Cek | Hasil |
|---|---|
| `npx vitest run` | **634 test lulus** |
| `npm run build` / `npm run lint` | ok / exit 0 |
| `api/n8n.js`, `dataService.js`, `supabase/functions/*` | tidak berubah ✅ |
| Migration 0003/0004 vs fungsi sebelumnya | identik, satu-satunya perubahan `FOR UPDATE` ✅ |

## Apply ke Supabase dev
| Migration | Status |
|---|---|
| `202610110001_tenant_invites` | ✅ diterapkan Claude |
| `202610110002_tenant_settings_audit` | ✅ diterapkan Claude |
| `202610110003_lock_payment_activation` | ✅ diterapkan Claude |
| `202610110004_lock_subscription_activation` | ⏳ menunggu user (SQL Editor) — konektor memblokir `DELETE` |

## Test database (`tenant_invites_matrix.sql`) di dev — semua lulus, data ter-rollback
T1 owner melihat kode · T2 warga biasa 0 baris · **T2B** warga tidak lagi melihat kode lewat `tenants.settings` · T3 anon 0 baris ·
T4 `get_invite_details` anon (juga huruf kecil + spasi) · T5 trigger memindahkan `invite_code` dari settings · T6 audit tercatat dengan `changed_by` = owner ·
T7 warga tidak bisa baca audit · **T7B** warga tidak bisa menyisipkan audit palsu · T8 owner bisa baca audit ·
**Jalur INSERT** (pola migrasi Palm Village: tenant baru dengan `invite_code` di settings) → kode pindah, settings lain utuh.
(Tebal = cek tambahan Claude.) `get_advisors(security)`: tidak ada temuan baru.

Bug test diperbaiki Claude: role dasar dicari dengan nama `'Warga','Anggota','Penghuni'`, padahal `handle_new_tenant` membuat `'Warga/Anggota'` → warga uji tidak punya role. Diganti `is_base_role = true`.

## Temuan (tidak memblokir) → `SEC-3F.md`
- **H1 — Kode undangan mudah ditebak (SEDANG).** `generateInviteCode` = `RW-<4 huruf nama>-<4 karakter base36>` dari `Math.random()` → ±1,7 juta kombinasi per tenant, dan `get_invite_details` bisa dipanggil anon tanpa batas. Tebakan yang benar membocorkan nama, alamat, telepon, dan daftar unit tenant (bergabung tetap butuh persetujuan).
- **H2 — Urutan simpan di wizard (RENDAH).** Kode disimpan **setelah** `onboarding_completed = true`. Bila kode bentrok (unique index), wizard error tetapi tenant sudah ditandai selesai tanpa kode undangan.

## Hasil
SEC-3 **diterima**. Perbaikan kecil di `SEC-3F.md`.
