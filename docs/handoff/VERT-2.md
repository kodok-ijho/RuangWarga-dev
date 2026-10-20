# VERT-2 — Perbaikan database Kos & Arisan (migration)

Status: ✅ **Disetujui user 2026-10-21** (menyentuh schema dan fungsi Supabase), termasuk aturan peserta arisan di VERT-2.2.

Dasar: `AUDIT-VERTIKAL.md` K1, A1, A2. Kerjakan **setelah VERT-1**.

Baca dulu: `docs/handoff/README.md`, `AGENT.md`, `AUDIT-VERTIKAL.md`, contoh migration + test SQL terbaru (`supabase/migrations/202610200002_tenant_events.sql`, `supabase/tests/tenant_events_matrix.sql`).

- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit, push setelah tiap commit.
- **Executor hanya menulis file.** Jangan menjalankan migration ke Supabase mana pun (dev maupun produksi), jangan memakai Supabase CLI/MCP. Claude yang menjalankan dry-run dan menerapkan ke dev setelah review.
- Setiap migration: idempoten bila memungkinkan, `SET search_path = public` untuk fungsi `SECURITY DEFINER`, `REVOKE ALL ... FROM PUBLIC, anon` lalu `GRANT EXECUTE` hanya yang perlu (pola di `supabase/migrations/202610080001_harden_definer_function_grants.sql`).
- Test SQL di `supabase/tests/` memakai pola `BEGIN; DO $$ ... $$; ROLLBACK;` seperti `tenant_events_matrix.sql`, dengan `RAISE EXCEPTION` bila hasil tidak sesuai.

🚫 Jangan mengubah `client/`, `api/`, `legacy-backend/`, `.env*`, atau migration lama. Semua perubahan lewat file migration **baru**.

---

## VERT-2.1 — Hapus overload `checkout_kos_room(..., integer, ...)` (K1)
- Migration `supabase/migrations/202610210001_drop_checkout_kos_room_int.sql`:
  - `DROP FUNCTION IF EXISTS public.checkout_kos_room(uuid, integer, date, text, boolean);`
  - Versi `bigint` tidak diubah. Ulangi `REVOKE`/`GRANT` untuk versi `bigint` (authenticated, service_role) supaya status hak aksesnya jelas.
- Test `supabase/tests/checkout_kos_room_overload.sql`: di `pg_proc` hanya ada **satu** `public.checkout_kos_room`, dengan argumen `p_unit_id bigint`.
- Commit: `fix(kos): VERT-2.1 hapus overload checkout_kos_room integer (PostgREST ambigu)`

## VERT-2.2 — Peserta arisan otomatis terdaftar (A1)
Aturan (dikonfirmasi user 2026-10-21): **peserta = anggota `approved` di tenant bertipe `arisan` yang memegang slot (`tenant_members.unit_id` tidak null).** Owner tanpa slot tidak otomatis ikut.
- Migration `supabase/migrations/202610210002_arisan_auto_enroll.sql`:
  - Fungsi trigger `public.sync_arisan_participant()` (`SECURITY DEFINER`, `SET search_path = public`), dipasang `AFTER INSERT OR UPDATE OF status, unit_id ON public.tenant_members FOR EACH ROW`.
  - Bila tenant bertipe `arisan`, `NEW.status = 'approved'`, dan `NEW.unit_id IS NOT NULL`:
    `INSERT INTO public.arisan_participants (tenant_id, member_id, unit_slot_id) VALUES (NEW.tenant_id, NEW.id, NEW.unit_id) ON CONFLICT (tenant_id, member_id) DO UPDATE SET unit_slot_id = EXCLUDED.unit_slot_id, updated_at = now();`
  - Kondisi lain: tidak melakukan apa pun (tidak menghapus peserta; kocok dan penerbitan iuran sudah menyaring `tenant_members.status = 'approved'`).
  - `REVOKE ALL ON FUNCTION public.sync_arisan_participant() FROM PUBLIC, anon, authenticated;`
  - Backfill sekali jalan: masukkan semua anggota `approved` dengan `unit_id` di tenant arisan, `ON CONFLICT (tenant_id, member_id) DO NOTHING`.
- Test `supabase/tests/arisan_auto_enroll_matrix.sql`:
  1. anggota pending dengan slot disetujui → 1 baris peserta dengan `unit_slot_id` = slot;
  2. anggota approved tanpa slot → tidak ada baris;
  3. slot diganti → `unit_slot_id` ikut berubah, tetap 1 baris;
  4. tenant `rt_rw` dengan anggota approved + unit → tidak ada baris;
  5. update lain (mis. `full_name`) tidak membuat baris ganda;
  6. `has_won` peserta yang sudah menang tidak berubah saat slot diganti.
- Commit: `feat(arisan): VERT-2.2 peserta otomatis terdaftar saat anggota disetujui dan memegang slot`

## VERT-2.3 — Operator kocok & siklus baru dari `auth.uid()` (A2)
- Migration `supabase/migrations/202610210003_arisan_operator_from_auth.sql`: `CREATE OR REPLACE` untuk `public.draw_arisan_winner(uuid, uuid, uuid)` dan `public.start_new_arisan_cycle(uuid, uuid, boolean)`.
  - **Salin definisi terakhir** dari `supabase/migrations/202610080001_harden_definer_function_grants.sql` (B.1 ±237-363 dan B.2 ±368-460). Jangan mengubah logika lain.
  - Tanda tangan fungsi **tetap sama** (klien lama tetap bisa memanggil). Parameter `p_operator_member_id` diabaikan.
  - Tambah variabel `v_operator uuid := (SELECT id FROM public.tenant_members WHERE tenant_id = p_tenant_id AND user_id = auth.uid() LIMIT 1);` (NULL bila dipanggil `service_role`).
  - `drawn_by = v_operator` di `draw_arisan_winner`; `'last_cycle_reset_by', v_operator` di `start_new_arisan_cycle`.
  - Ulangi `REVOKE`/`GRANT` seperti di migration asalnya.
- Test `supabase/tests/arisan_operator_matrix.sql`: set `request.jwt.claims` sebagai owner tenant uji, panggil `draw_arisan_winner` dengan `p_operator_member_id` = UUID acak → sukses, dan `drawn_by` = `tenant_members.id` milik owner. Siapkan data: putaran, peserta, dan tagihan `paid` dengan `metadata.round_id`.
- Commit: `fix(arisan): VERT-2.3 operator kocok dan siklus baru diambil dari auth.uid()`

---

## Definition of Done
- `docs/handoff/VERT-2-report.md` berisi hash commit dan daftar file migration/test.
- Tidak ada perubahan di luar `supabase/migrations/` (file baru), `supabase/tests/` (file baru), dan laporan.
- Claude: dry-run di dev → artifact dry-run → persetujuan user → terapkan di dev → jalankan ketiga test SQL → uji Kocok dan Checkout dari ruangwarga-dev.
