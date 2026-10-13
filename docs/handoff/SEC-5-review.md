# SEC-5 Review (Claude, 2026-10-11)

Commit yang direview: `08c50c3..0fdaa13` (6 commit task + 1 laporan). Hash di laporan cocok ✅.

| Cek | Hasil |
|---|---|
| `npx vitest run` | **698 test lulus** (44 file) |
| `npm run build` / `npm run lint` | ok / exit 0 |
| Batasan file | Tidak ada perubahan di `api/`, `legacy-backend/`, `supabase/functions/`, `dataService.js`, `apiClient.js` ✅ |
| Kata `DROP`/`DELETE` | Tidak ada di 5 migration maupun file test ✅ |
| 5.1 keanggotaan | RPC `request_join_tenant` sesuai spesifikasi (kode undangan, unit milik tenant, role dasar, `ON CONFLICT` → 23505); self-insert dicabut dari policy; trigger `guard_tenant_member_write` memvalidasi role satu tenant, role Admin hanya oleh owner, kolom `tenant_id`/`user_id`/`is_owner` terkunci ✅ |
| 5.2 tenants | `owner_id`/`type`/`id`/`created_at` terkunci; `legacy_qris_enabled` dibuang saat INSERT dan dipertahankan saat UPDATE ✅ |
| 5.3 pembayaran | Warga hanya boleh `bank_transfer` + `pending_verification`, nominal persis, tagihan miliknya & `unpaid`; trigger definer menyinkronkan status tagihan; unique index anti-dobel. Frontend: update tagihan dari klien dihapus ✅ |
| 5.4 bukti transfer | Bucket privat `payment-proofs`, path `{tenant}/payments/{bill}/{file}`, policy INSERT anggota & SELECT pemilik/staf; frontend menyimpan path dan menampilkan via signed URL 300 detik; `getPublicUrl` dihapus ✅ |
| 5.5 IPL dobel | Unique index parsial + error query tidak lagi ditelan ✅ |

## Temuan
- **Q1 — File test SQL ditulis dengan skema yang salah (diperbaiki Claude).** Padahal fakta skema sudah tercantum di SEC-5.md. Kesalahannya: tipe `public.billing_status` (tidak ada; kolomnya `text`), kolom `tenant_units.is_active`, dan kolom `tenant_invites.max_uses/uses_count/expires_at/created_by` (tidak ada). Diperbaiki di repo (commit terpisah). Logika ke-13 skenario tidak diubah.
- Catatan kecil, tidak perlu diperbaiki sekarang:
  - di trigger anggota, `OLD.user_id <> auth.uid()` bernilai NULL untuk baris tanpa akun, tetapi RLS UPDATE sudah menutup jalur itu;
  - file bukti yang terunggah sebelum insert pembayaran gagal akan tertinggal (yatim). Dibersihkan nanti bersama fitur pembatalan oleh warga.

## Penerapan ke Supabase dev (Claude)
1. Kelima migration diterapkan: `guard_tenant_members`, `guard_tenant_columns`, `payments_integrity`, `payment_proofs_bucket`, `unique_ipl_bills`. Isinya identik dengan file repo, tanpa `BEGIN/COMMIT`.
2. `membership_payment_matrix.sql` (setelah perbaikan Q1) → **`SEC-5 PASSED`**, ke-13 skenario lulus:
   - S1, S2, S3 (role tenant lain), S4, dan S5 kini ditolak;
   - jalur sah tetap jalan: join via kode, persetujuan oleh pengurus, owner memasang role, pembayaran transfer warga → tagihan `pending_verification`, tunai bendahara → `paid`, upload bukti di tenant sendiri, provisioning tenant baru.
3. Sebelum migration, eksploit E1–E7 sudah dibuktikan nyata (lihat `AUDIT-RTRW.md`).
4. Advisor keamanan: satu-satunya entri baru adalah `request_join_tenant`, yang memang sengaja bisa dipanggil `authenticated`. Trigger definer `sync_bill_status_after_payment` tidak bisa dipanggil klien. Tidak ada temuan baru lain.

## Hasil
SEC-5 **diterima dan aktif di dev**. Celah keamanan kritis dari audit RT/RW tertutup.
Lanjut **RTRW-1** (`RTRW-1.md`, sudah terbit).
