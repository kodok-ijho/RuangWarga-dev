# VERT-2 Review (Claude, 2026-10-21)

Hasil: **diterima dan terpasang di dev.** Migration diterima sejak review pertama; test SQL diperbaiki lewat VERT-2F.

## Migration — diterima
- **2.1** `202610210001_drop_checkout_kos_room_int.sql`: drop overload `integer`, lalu `REVOKE`/`GRANT` ulang versi `bigint`. Sesuai rencana. Komentar menyebut `PGRST204`; kode yang benar `PGRST203` (hanya komentar).
- **2.2** `202610210002_arisan_auto_enroll.sql`:
  - trigger `AFTER INSERT OR UPDATE OF status, unit_id` dengan fungsi `SECURITY DEFINER` dan `search_path` tetap;
  - upsert hanya mengubah `unit_slot_id`, jadi `has_won` aman;
  - `REVOKE` dari `PUBLIC, anon, authenticated`;
  - backfill `ON CONFLICT DO NOTHING`. Sesuai aturan peserta yang dikonfirmasi user.
- **2.3** `202610210003_arisan_operator_from_auth.sql`: dibandingkan baris per baris dengan definisi B.1/B.2 di `202610080001_harden_definer_function_grants.sql` (definisi terakhir di repo). Bedanya **hanya**:
  - variabel `v_operator` (dari `auth.uid()`);
  - `drawn_by = v_operator`;
  - `'last_cycle_reset_by', v_operator`;
  - `BEGIN;`/`COMMIT;`.
  Tanda tangan fungsi dan hak akses tetap.

## Test SQL — perlu diperbaiki (VERT-2F)
Ketiganya ditulis tanpa dijalankan (tidak ada akses database dari HP).
- `checkout_kos_room_overload.sql`: benar.
- `arisan_auto_enroll_matrix.sql`:
  - tidak membuat user di `auth.users`, padahal `tenants.owner_id` dan `tenant_members.user_id` FK ke sana;
  - `SELECT ... INTO v_participant.unit_slot_id` memakai field dari RECORD yang belum terisi.
- `arisan_operator_matrix.sql`:
  - tidak membuat user di `auth.users`;
  - insert owner manual bentrok dengan baris owner yang dibuat otomatis oleh trigger tenant;
  - memakai kolom `billing_items.title` yang tidak ada;
  - insert tagihan tanpa konteks auth ditolak oleh trigger kesiapan arisan (`check_arisan_round_readiness`).

## Verifikasi Claude
- Uji lewat konektor Supabase dibatalkan sebelum berjalan, karena konfirmasinya tidak muncul di aplikasi. Kondisi dev sebelum dan sesudahnya sama: 2 overload `checkout_kos_room`, tanpa trigger/fungsi VERT-2.
- Dry-run untuk SQL Editor: artifact "Dry-run VERT-2". Isinya ketiga migration ditambah uji Claude, dalam satu transaksi yang di-`ROLLBACK`. Yang diuji:
  - K1;
  - A1, termasuk owner tanpa slot dan tenant rt_rw;
  - alur owner: terbitkan iuran → setoran tunai (`cash`/`completed`, sama dengan VERT-1.2) → tagihan `paid` → putaran `ready_to_draw`;
  - A2: `drawn_by` dan `last_cycle_reset_by` = member owner walaupun klien mengirim ID palsu;
  - `has_won` tetap setelah slot pemenang diganti.
- Hasil dry-run: **lulus** ("Success" di SQL Editor, dijalankan user 2026-10-21). Penerapan: artifact "Terapkan VERT-2".

## Penerapan dan verifikasi akhir (2026-10-21)
- Diterapkan user lewat artifact "Terapkan VERT-2" di SQL Editor. Riwayat migration dev: `20261021023117 drop_checkout_kos_room_int`, `20261021023118 arisan_auto_enroll`, `20261021023119 arisan_operator_from_auth`.
- Dicek Claude lewat query baca:
  - `checkout_kos_room` tinggal 1 (bigint);
  - trigger `trg_sync_arisan_participant` ada;
  - `draw_arisan_winner` dan `start_new_arisan_cycle` memakai `v_operator`.
- VERT-2F (agy, `29035ed`, `78cbd4f`) sesuai `VERT-2F.md`. Ketiga test SQL dijalankan Claude di dev lewat konektor. Isinya sama dengan file; hanya komentar dan `RAISE NOTICE` dibuang, dan di akhir ditambah `RAISE EXCEPTION 'LULUS (rollback)'` supaya data uji pasti batal. Hasil:
  - `checkout_kos_room_overload`: lulus;
  - `arisan_auto_enroll_matrix`: lulus (6 kasus);
  - `arisan_operator_matrix`: lulus.
  Setelahnya tidak ada sisa data uji (0 user `@test.invalid`, tenant tetap 1).
- Advisor keamanan: tidak ada temuan baru. `sync_arisan_participant` tidak bisa dipanggil lewat API. Temuan lain sudah ada sebelum VERT-2.

## Belum diuji
- Uji manual di aplikasi (ruangwarga-dev) setelah branch digabung ke `main`:
  - Kocok dan Tandai Lunas Arisan;
  - Checkout Kamar Kos;
  - wizard dijalankan ulang.
