-- Test Suite: Arisan Operator Matrix (Task VERT-2.3 / VERT-2F.2)
-- Date: 2026-10-21
-- Ref: docs/handoff/VERT-2.md § VERT-2.3 & docs/handoff/VERT-2F.md § VERT-2F.2
--
-- File ini memvalidasi penetapan identitas operator pengocokan arisan dan siklus baru:
-- 1. draw_arisan_winner menetapkan drawn_by dari auth.uid() (tenant_members.id),
--    mengabaikan parameter p_operator_member_id acak dari klien.
-- 2. start_new_arisan_cycle menetapkan last_cycle_reset_by dari auth.uid() (tenant_members.id),
--    mengabaikan parameter p_operator_member_id acak dari klien.

BEGIN;

DO $$
DECLARE
  -- Identitas Pengguna Auth
  v_owner_user_id       UUID := gen_random_uuid();
  v_owner_member_id     UUID;
  v_peserta_user_id     UUID := gen_random_uuid();
  v_peserta_member_id   UUID := gen_random_uuid();

  -- Identitas Palsu (Dummy parameter dari klien)
  v_dummy_operator_id   UUID := gen_random_uuid();

  -- Entitas Arisan
  v_tenant_id           UUID;
  v_slot_id             BIGINT;
  v_round_id            UUID := gen_random_uuid();

  -- Variabel Pengujian
  v_res                 JSONB;
  v_drawn_by            UUID;
  v_status              TEXT;
  v_reset_by            UUID;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: ARISAN OPERATOR MATRIX (VERT-2.3 / VERT-2F.2)';
  RAISE NOTICE '============================================================';

  -- 0. Set konteks service_role untuk bypass trigger check_arisan_round_readiness saat setup fixture
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- 0.1 Setup Auth Users (FK constraint ke auth.users)
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_user_id,   'owner_arisan_op@test.invalid',   'authenticated', 'authenticated'),
    (v_peserta_user_id, 'peserta_arisan_op@test.invalid', 'authenticated', 'authenticated');

  -- 1. Setup Tenant Arisan dengan owner
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Arisan Operator Test', 'arisan', v_owner_user_id, '{"current_cycle": 1}'::jsonb)
  RETURNING id INTO v_tenant_id;

  -- 2. Dapatkan ID owner tenant_members yang dibuat otomatis oleh trigger tenant
  SELECT id INTO v_owner_member_id
  FROM public.tenant_members
  WHERE tenant_id = v_tenant_id AND user_id = v_owner_user_id;

  -- 3. Setup Slot dan Peserta
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_id, 'Slot-A', 'active')
  RETURNING id INTO v_slot_id;

  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status, is_owner)
  VALUES (v_peserta_member_id, v_tenant_id, v_peserta_user_id, v_slot_id, 'Peserta Arisan', 'approved', false);

  -- Pastikan peserta tercatat di arisan_participants dengan has_won = false
  INSERT INTO public.arisan_participants (tenant_id, member_id, unit_slot_id, has_won)
  VALUES (v_tenant_id, v_peserta_member_id, v_slot_id, false)
  ON CONFLICT (tenant_id, member_id) DO UPDATE SET has_won = false;

  -- 4. Setup Putaran Arisan
  INSERT INTO public.arisan_rounds (id, tenant_id, round_number, period, total_pool_amount, status)
  VALUES (v_round_id, v_tenant_id, 1, '2026-10', 250000, 'ready_to_draw');

  -- 5. Setup Tagihan Lunas (paid) yang ditautkan ke putaran (tanpa kolom title)
  INSERT INTO public.billing_items (tenant_id, unit_id, member_id, amount, status, period, metadata)
  VALUES (
    v_tenant_id,
    v_slot_id,
    v_peserta_member_id,
    250000,
    'paid',
    '2026-10',
    jsonb_build_object('round_id', v_round_id::text)
  );

  -- ==============================================================================
  -- TEST 1: draw_arisan_winner dipanggil sebagai Owner dengan dummy operator ID
  -- ==============================================================================
  RAISE NOTICE '[TEST 1] Menguji draw_arisan_winner mengabaikan p_operator_member_id dan mengambil auth.uid()...';

  -- Set auth context sebagai Owner
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_user_id::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Panggil draw_arisan_winner dengan parameter dummy operator
  v_res := public.draw_arisan_winner(v_tenant_id, v_round_id, v_dummy_operator_id);

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST 1 GAGAL: draw_arisan_winner tidak mengembalikan success=true: %', v_res;
  END IF;

  -- Periksa drawn_by di database
  SELECT drawn_by, status INTO v_drawn_by, v_status
  FROM public.arisan_rounds
  WHERE id = v_round_id;

  IF v_status != 'drawn' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST 1 GAGAL: status putaran bukan drawn: %', v_status;
  END IF;

  IF v_drawn_by = v_dummy_operator_id THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST 1 GAGAL: drawn_by masih memakai p_operator_member_id dari klien yang rentan dipalsukan!';
  END IF;

  IF v_drawn_by != v_owner_member_id THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST 1 GAGAL: drawn_by (%) tidak sama dengan member_id milik owner (auth.uid()) (%)', v_drawn_by, v_owner_member_id;
  END IF;

  -- ==============================================================================
  -- TEST 2: start_new_arisan_cycle dipanggil sebagai Owner dengan dummy operator ID
  -- ==============================================================================
  RAISE NOTICE '[TEST 2] Menguji start_new_arisan_cycle mengabaikan p_operator_member_id dan mengambil auth.uid()...';

  v_res := public.start_new_arisan_cycle(v_tenant_id, v_dummy_operator_id, true);

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST 2 GAGAL: start_new_arisan_cycle tidak mengembalikan success=true: %', v_res;
  END IF;

  SELECT (settings->>'last_cycle_reset_by')::UUID INTO v_reset_by
  FROM public.tenants
  WHERE id = v_tenant_id;

  IF v_reset_by = v_dummy_operator_id THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST 2 GAGAL: last_cycle_reset_by masih memakai p_operator_member_id dari klien yang rentan dipalsukan!';
  END IF;

  IF v_reset_by != v_owner_member_id THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST 2 GAGAL: last_cycle_reset_by (%) tidak sama dengan member_id milik owner (auth.uid()) (%)', v_reset_by, v_owner_member_id;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TEST SUKSES: Operator arisan berhasil diisolasi dari auth.uid()';
  RAISE NOTICE '============================================================';
END;
$$;

ROLLBACK;
