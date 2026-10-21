-- Test Suite: Arisan Auto Enroll Matrix (Task VERT-2.2 / VERT-2F.1)
-- Date: 2026-10-21
-- Ref: docs/handoff/VERT-2.md § VERT-2.2 & docs/handoff/VERT-2F.md § VERT-2F.1
--
-- File ini memvalidasi pendaftaran otomatis peserta arisan via trigger sync_arisan_participant:
-- 1. Kasus 1: Anggota pending dengan slot disetujui ('approved') -> 1 baris peserta dengan unit_slot_id = slot.
-- 2. Kasus 2: Anggota approved tanpa slot (unit_id IS NULL) -> tidak ada baris di arisan_participants.
-- 3. Kasus 3: Slot diganti -> unit_slot_id ikut terbarui, tetap tepat 1 baris.
-- 4. Kasus 4: Tenant tipe non-arisan (mis. 'rt_rw') dengan anggota approved + unit -> tidak ada baris dibuat.
-- 5. Kasus 5: Update kolom lain (mis. full_name) -> tidak membuat baris ganda.
-- 6. Kasus 6: has_won peserta yang sudah menang (true) tidak berubah saat slot diganti.

BEGIN;

DO $$
DECLARE
  -- Identitas Pengguna & Tenant
  v_owner_arisan    UUID := gen_random_uuid();
  v_member_1        UUID := gen_random_uuid();
  v_member_2        UUID := gen_random_uuid();
  v_member_rtrw     UUID := gen_random_uuid();

  v_tenant_arisan   UUID;
  v_tenant_rtrw     UUID;

  v_slot_1          BIGINT;
  v_slot_2          BIGINT;
  v_unit_rtrw       BIGINT;
  v_slot            BIGINT;

  v_tm_1_id         UUID := gen_random_uuid();
  v_tm_2_id         UUID := gen_random_uuid();
  v_tm_rtrw_id      UUID := gen_random_uuid();

  -- Assertion helpers
  v_count           INT;
  v_participant     RECORD;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: ARISAN AUTO ENROLL MATRIX (VERT-2.2 / VERT-2F.1)';
  RAISE NOTICE '============================================================';

  -- 0. Setup Auth Users (FK constraint ke auth.users)
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_arisan, 'owner_arisan_auto@test.invalid', 'authenticated', 'authenticated'),
    (v_member_1,     'member_1_auto@test.invalid',     'authenticated', 'authenticated'),
    (v_member_2,     'member_2_auto@test.invalid',     'authenticated', 'authenticated'),
    (v_member_rtrw,  'member_rtrw_auto@test.invalid',  'authenticated', 'authenticated');

  -- Setup Tenant Arisan
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Arisan Melati Test', 'arisan', v_owner_arisan)
  RETURNING id INTO v_tenant_arisan;

  -- Setup Tenant RT/RW
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('RT 01 Test', 'rt_rw', v_owner_arisan)
  RETURNING id INTO v_tenant_rtrw;

  -- Setup Slot Unit Arisan
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_arisan, 'Slot-01', 'active')
  RETURNING id INTO v_slot_1;

  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_arisan, 'Slot-02', 'active')
  RETURNING id INTO v_slot_2;

  -- Setup Unit RT/RW
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_rtrw, 'Rumah-A1', 'active')
  RETURNING id INTO v_unit_rtrw;

  -- ==============================================================================
  -- TEST 1: Anggota pending dengan slot -> belum masuk arisan_participants.
  --         Saat diubah ke 'approved' -> otomatis 1 baris dengan unit_slot_id = slot_1.
  -- ==============================================================================
  RAISE NOTICE '[TEST 1] Anggota pending dengan slot disetujui...';

  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status, is_owner)
  VALUES (v_tm_1_id, v_tenant_arisan, v_member_1, v_slot_1, 'Peserta 1', 'pending', false);

  SELECT count(*) INTO v_count
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  IF v_count != 0 THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: Anggota pending tidak boleh terdaftar di arisan_participants (ditemukan % baris)', v_count;
  END IF;

  -- Setujui anggota (status = 'approved')
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE id = v_tm_1_id;

  SELECT count(*) INTO v_count
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  IF v_count != 1 THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: Anggota disetujui harus memiliki tepat 1 baris di arisan_participants (ditemukan %)', v_count;
  END IF;

  SELECT unit_slot_id INTO v_slot
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  IF v_slot != v_slot_1 THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: unit_slot_id (%) tidak sesuai dengan slot_1 (%)', v_slot, v_slot_1;
  END IF;

  -- ==============================================================================
  -- TEST 2: Anggota approved tanpa slot (unit_id IS NULL) -> tidak ada baris peserta
  -- ==============================================================================
  RAISE NOTICE '[TEST 2] Anggota approved tanpa slot...';

  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status, is_owner)
  VALUES (v_tm_2_id, v_tenant_arisan, v_member_2, NULL, 'Peserta 2 Tanpa Slot', 'approved', false);

  SELECT count(*) INTO v_count
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_2_id;

  IF v_count != 0 THEN
    RAISE EXCEPTION 'TEST 2 GAGAL: Anggota approved tanpa slot tidak boleh didaftarkan (ditemukan % baris)', v_count;
  END IF;

  -- ==============================================================================
  -- TEST 3: Slot diganti -> unit_slot_id ikut berubah, tetap 1 baris
  -- ==============================================================================
  RAISE NOTICE '[TEST 3] Slot diganti ke slot_2...';

  UPDATE public.tenant_members
  SET unit_id = v_slot_2
  WHERE id = v_tm_1_id;

  SELECT count(*) INTO v_count
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  IF v_count != 1 THEN
    RAISE EXCEPTION 'TEST 3 GAGAL: Jumlah baris setelah ganti slot harus tetap 1 (ditemukan % baris)', v_count;
  END IF;

  SELECT unit_slot_id INTO v_slot
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  IF v_slot != v_slot_2 THEN
    RAISE EXCEPTION 'TEST 3 GAGAL: unit_slot_id (%) tidak terbarui ke slot_2 (%)', v_slot, v_slot_2;
  END IF;

  -- ==============================================================================
  -- TEST 4: Tenant bertipe rt_rw dengan anggota approved + unit -> tidak ada baris
  -- ==============================================================================
  RAISE NOTICE '[TEST 4] Tenant rt_rw anggota approved + unit...';

  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status, is_owner)
  VALUES (v_tm_rtrw_id, v_tenant_rtrw, v_member_rtrw, v_unit_rtrw, 'Warga RT', 'approved', false);

  SELECT count(*) INTO v_count
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_rtrw AND member_id = v_tm_rtrw_id;

  IF v_count != 0 THEN
    RAISE EXCEPTION 'TEST 4 GAGAL: Anggota tenant rt_rw tidak boleh masuk arisan_participants (ditemukan % baris)', v_count;
  END IF;

  -- ==============================================================================
  -- TEST 5: Update kolom lain (mis. full_name) -> tidak membuat baris ganda
  -- ==============================================================================
  RAISE NOTICE '[TEST 5] Update full_name tidak membuat duplikasi...';

  UPDATE public.tenant_members
  SET full_name = 'Peserta 1 Nama Baru'
  WHERE id = v_tm_1_id;

  SELECT count(*) INTO v_count
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  IF v_count != 1 THEN
    RAISE EXCEPTION 'TEST 5 GAGAL: Update full_name menyebabkan duplikasi (ditemukan % baris)', v_count;
  END IF;

  -- ==============================================================================
  -- TEST 6: has_won peserta yang sudah menang tidak berubah saat slot diganti
  -- ==============================================================================
  RAISE NOTICE '[TEST 6] has_won tidak berubah saat slot diganti...';

  -- Tandai peserta 1 telah menang (has_won = true)
  UPDATE public.arisan_participants
  SET has_won = true, won_at = now()
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  -- Ganti slot kembali ke slot_1
  UPDATE public.tenant_members
  SET unit_id = v_slot_1
  WHERE id = v_tm_1_id;

  SELECT unit_slot_id, has_won INTO v_participant
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_arisan AND member_id = v_tm_1_id;

  IF v_participant.unit_slot_id != v_slot_1 THEN
    RAISE EXCEPTION 'TEST 6 GAGAL: unit_slot_id tidak terbarui kembali ke slot_1';
  END IF;

  IF v_participant.has_won IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 6 GAGAL: Status has_won peserta ter-reset (seharusnya tetap TRUE)';
  END IF;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TEST SUKSES: Seluruh pengujian auto-enroll arisan berhasil';
  RAISE NOTICE '============================================================';
END;
$$;

ROLLBACK;
