# VERT-2 Report

Executor: Antigravity (agy). Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`.

| Task | Commit | Status | Catatan |
|---|---|---|---|
| VERT-2.1 | aad745b | done | Migration `supabase/migrations/202610210001_drop_checkout_kos_room_int.sql` menghapus overload `checkout_kos_room(..., integer, ...)` dan menegaskan hak akses overload `bigint`. Test di `supabase/tests/checkout_kos_room_overload.sql`. |
| VERT-2.2 | f29f747 | done | Migration `supabase/migrations/202610210002_arisan_auto_enroll.sql` memasang trigger `sync_arisan_participant` pada `tenant_members` (status `approved` + `unit_id IS NOT NULL` di tenant bertipe `arisan`), hak akses trigger dibatasi (`REVOKE ALL`), dan query backfill satu kali untuk data eksisting. Test di `supabase/tests/arisan_auto_enroll_matrix.sql`. |
| VERT-2.3 | eea748b | done | Migration `supabase/migrations/202610210003_arisan_operator_from_auth.sql` memperbarui `draw_arisan_winner` dan `start_new_arisan_cycle` agar menetapkan `drawn_by` dan `last_cycle_reset_by` dari `v_operator` (`auth.uid()`), mengabaikan `p_operator_member_id` dari klien. Test di `supabase/tests/arisan_operator_matrix.sql`. |

## Daftar File yang Dibuat

### Migrations
1. `supabase/migrations/202610210001_drop_checkout_kos_room_int.sql` (Task VERT-2.1)
2. `supabase/migrations/202610210002_arisan_auto_enroll.sql` (Task VERT-2.2)
3. `supabase/migrations/202610210003_arisan_operator_from_auth.sql` (Task VERT-2.3)

### SQL Tests
1. `supabase/tests/checkout_kos_room_overload.sql` (Task VERT-2.1)
2. `supabase/tests/arisan_auto_enroll_matrix.sql` (Task VERT-2.2)
3. `supabase/tests/arisan_operator_matrix.sql` (Task VERT-2.3)

## Output verifikasi & Batasan Eksekusi

- **Aturan Eksekusi Migration & Database SQL:**
  - Sesuai instruksi eksplisit batch VERT-2: executor **hanya menulis file migration dan file test SQL di repo**, dan **tidak menjalankan migration ke Supabase mana pun** serta **tidak memakai Supabase CLI/MCP**.
  - Oleh karena itu, pengujian runtime SQL (`psql`/Supabase dev) belum dieksekusi di perangkat lokal ini dan diserahkan kepada Orchestrator (Claude) untuk tahap dry-run dan penerapan pada database Supabase dev.
- **Integritas Repository & Lingkup Kode:**
  - Tidak ada perubahan di luar `supabase/migrations/` (file baru), `supabase/tests/` (file baru), dan laporan ini.
  - Direktori `client/`, `api/`, `legacy-backend/`, file `.env*`, dan file-file migration lama sama sekali tidak diubah.

## Perubahan sensitif (perlu review ekstra oleh Orchestrator/Claude)

1. `supabase/migrations/202610210001_drop_checkout_kos_room_int.sql`:
   - Menghapus signature overload integer dari `checkout_kos_room` untuk mencegah ketaksaan PostgREST (PGRST204). Memastikan hanya satu fungsi `checkout_kos_room` dengan tipe `bigint` yang aktif.
2. `supabase/migrations/202610210002_arisan_auto_enroll.sql`:
   - Trigger `AFTER INSERT OR UPDATE OF status, unit_id ON public.tenant_members` mengeksekusi `sync_arisan_participant()` (`SECURITY DEFINER`, `SET search_path = public`).
   - Melakukan pendaftaran/pembaruan otomatis ke `public.arisan_participants` hanya jika `tenants.type = 'arisan'`, `status = 'approved'`, dan `unit_id IS NOT NULL`.
   - Menggunakan klausa `ON CONFLICT (tenant_id, member_id) DO UPDATE SET unit_slot_id = EXCLUDED.unit_slot_id, updated_at = now()` sehingga `has_won` peserta yang sudah menang tetap aman dan tidak ter-reset.
   - Melakukan query backfill untuk mendaftarkan anggota yang memenuhi syarat sebelum migrasi diaplikasikan.
3. `supabase/migrations/202610210003_arisan_operator_from_auth.sql`:
   - `draw_arisan_winner` dan `start_new_arisan_cycle` kini mencari `id` anggota pelaksana di `tenant_members` menggunakan `user_id = auth.uid()`.
   - Parameter `p_operator_member_id` tetap dipertahankan pada tanda tangan fungsi demi kompatibilitas klien, namun nilainya tidak dipakai untuk mengeset `drawn_by` atau `last_cycle_reset_by`.

## Asumsi yang diambil

- Pada `arisan_operator_matrix.sql`, simulasi claim JWT autentikasi dijalankan dengan `set_config('request.jwt.claims', ...)` dan `SET LOCAL ROLE authenticated`, di mana identitas owner tenant divalidasi memiliki relasi `tenant_members.user_id = auth.uid()`.
- Pada `sync_arisan_participant`, anggota yang dipindahkan slotnya (`unit_id` berubah) memperbarui kolom `unit_slot_id` di `arisan_participants` tanpa menghapus riwayat kemenangan (`has_won`).
