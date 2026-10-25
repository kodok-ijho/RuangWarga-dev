# KOS-2F — Laporan

Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`. Tidak ada SQL yang dijalankan ke Supabase.

## 2F.1 — `86301f5` (migration `202610240002`, test `kos_contract_billing.sql`)
- K1: `generate_kos_contract_bills` dicabut dari `PUBLIC, anon, authenticated`; hanya `service_role`.
- K2: `auto_generate_kos_billing` memvalidasi format `p_period` dan memulihkan cek izin (NULL tenant hanya platform admin; selain itu platform admin / owner / `generate_billing`, atau 42501).
- K4: blok kos `run_auto_billing` hanya menulis `billing_auto_runs` bila `v_created > 0` atau ada error.
- K7: `checkout_kos_room` memakai `GREATEST(start_date, LEAST(...))`.
- K9: `create_kos_contract` menolak `start_date` lebih dari 12 bulan ke belakang atau 3 bulan ke depan (WIB).
- Test baru: Uji 10–15.

## 2F.2 — `3c8579c` (migration `202610240001`, test `kos_contracts.sql`)
- K3: langkah 7.1b menautkan tagihan sewa lama (bukan cancelled, bukan non-sewa, satu per periode via `DISTINCT ON`) ke kontrak hasil backfill; rumus `service_start/service_end` sama dengan `generate_kos_contract_bills`. Kolom kontrak sudah ada di Bagian 2 migration yang sama.
- K6: guard menjadi `BEFORE INSERT OR UPDATE OF status`; INSERT kamar kos `occupied` ditolak; `OLD` hanya dibaca saat UPDATE.
- Test baru: Uji 9 (insert occupied ditolak), Uji 10 (skenario INDI KOS, tanpa tagihan ganda), Uji 11 (cancelled / non-sewa tidak ditautkan).

## 2F.3 — frontend
- K5: `countOccupiedUnits` (kos) dan `PaymentMatrix.jsx` (filter dan badge "Terisi") membaca `status === 'occupied'` ATAU kontrak aktif; kontrak hanya menambah info (badge Bulanan / s.d.). `Houses.jsx`, `TenantUnits.jsx`, dan `utils/joinForm.js` sudah memakai aturan yang sama, tidak diubah.
- K8: `assignRoomContract` menjadi pembungkus tipis `createKosContract` di kedua mode, tanpa tulis langsung ke `tenant_units`/`billing_items`. Test disesuaikan.
- Test baru: kontrak `[]` + kamar `occupied` → terisi; `vacant` tanpa kontrak → kosong (finance + PaymentMatrix).

## Verifikasi
- `npm run lint`: bersih. `npm run build`: sukses.
- `VITE_DEMO_MODE=false npx vitest run`: 97 file, 1267/1267 lolos di `TZ=UTC` dan `TZ=Asia/Jakarta`.
- Test SQL belum dijalankan; menunggu dry-run Claude di dev (BEGIN … ROLLBACK).

## Review Claude dan dry-run dev (2026-10-25)
Diterima. Dry-run kedua migration + kedua file test di dev (BEGIN … ROLLBACK) berakhir `DRYRUN_OK` setelah 4 perbaikan kecil oleh Claude. Semuanya cacat bawaan KOS-2 yang baru terlihat karena SQL belum pernah dijalankan:
- `202610240002` `checkout_kos_room`: blok `BEGIN … EXCEPTION` ditutup `END IF;` (syntax error) → `END;`.
- `tests/kos_contracts.sql` Uji 6: `user_id` acak melanggar FK `auth.users` → fixture user ditambahkan.
- `tests/kos_contract_billing.sql`: enum `past_due` tidak ada → `read_only`; Uji 1 menangkap `insufficient_privilege` (42501); Uji 5 menghitung baris setelah run pertama.

Simulasi pada data dev (ROLLBACK): unit 73 INDI KOS mendapat kontrak aktif 2026-10-01 s.d. 2026-10-30, tagihan `2026-10` tertaut, generator 0 terbit / 1 dilewati, 0 periode ganda. Migration belum diterapkan; menunggu persetujuan user.
