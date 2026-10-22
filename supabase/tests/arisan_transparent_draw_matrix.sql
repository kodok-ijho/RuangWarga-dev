-- Test Suite: Arisan Transparent Draw Matrix (Task ARISAN-1.1)
-- Date: 2026-10-22
-- Ref: docs/handoff/ARISAN-1.md § ARISAN-1.1
--
-- Pengujian komprehensif untuk Kocokan Transparan Arisan:
-- A1. Owner menyisipkan putaran berstatus drawn dengan pemenang -> ditolak 42501 (insufficient_privilege)
-- A2. Owner membuat putaran, generate 3 tagihan, 2 lunas -> draw_arisan_winner berhasil:
--     eligible_count=2, excluded_count=1, total_pool_amount=jumlah tagihan lunas,
--     eligible_snapshot & excluded_snapshot tersimpan permanen.
-- A3. Owner mengubah status/winner putaran yang sudah dikocok -> ditolak. Mengubah notes -> berhasil.
-- A4. Kocok ulang putaran yang sama -> ditolak.
-- A5. Putaran baru tanpa setoran lunas -> ditolak ("belum ada peserta yang setorannya lunas").
-- A6. Putaran lain dengan label periode sama -> check_arisan_round_readiness menghitung 0 tagihan.

BEGIN;

DO $$
DECLARE
  v_owner_user_id       UUID := gen_random_uuid();
  v_owner_member_id     UUID;
  v_user_1_id           UUID := gen_random_uuid();
  v_tm_1_id             UUID := gen_random_uuid();
  v_user_2_id           UUID := gen_random_uuid();
  v_tm_2_id             UUID := gen_random_uuid();
  v_user_3_id           UUID := gen_random_uuid();
  v_tm_3_id             UUID := gen_random_uuid();

  v_tenant_id           UUID;
  v_slot_1_id           BIGINT;
  v_slot_2_id           BIGINT;
  v_slot_3_id           BIGINT;

  v_round_1_id          UUID := gen_random_uuid();
  v_round_2_id          UUID := gen_random_uuid();
  v_round_3_id          UUID := gen_random_uuid();

  v_res                 JSONB;
  v_round_rec           RECORD;
  v_count               INT;
  v_pool_amount         NUMERIC;
  v_err_caught          BOOLEAN := false;
  v_sqlstate            TEXT;
  v_errmsg              TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: ARISAN TRANSPARENT DRAW MATRIX (ARISAN-1.1)';
  RAISE NOTICE '============================================================';

  -- Set service_role saat setup fixture
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- 1. Setup Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_user_id, 'owner_arisan_draw@test.invalid', 'authenticated', 'authenticated'),
    (v_user_1_id,     'user1_arisan_draw@test.invalid', 'authenticated', 'authenticated'),
    (v_user_2_id,     'user2_arisan_draw@test.invalid', 'authenticated', 'authenticated'),
    (v_user_3_id,     'user3_arisan_draw@test.invalid', 'authenticated', 'authenticated');

  -- 2. Setup Tenant Arisan
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Arisan Sentosa Test', 'arisan', v_owner_user_id, '{"contribution_amount": 100000, "current_cycle": 1}'::jsonb)
  RETURNING id INTO v_tenant_id;

  SELECT id INTO v_owner_member_id
  FROM public.tenant_members
  WHERE tenant_id = v_tenant_id AND user_id = v_owner_user_id;

  -- Pastikan subscription aktif agar tidak terhalang gate read_only
  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_id;

  -- 3. Setup 3 Slot Unit
  INSERT INTO public.tenant_units (tenant_id, label, status) VALUES (v_tenant_id, 'Slot-01', 'active') RETURNING id INTO v_slot_1_id;
  INSERT INTO public.tenant_units (tenant_id, label, status) VALUES (v_tenant_id, 'Slot-02', 'active') RETURNING id INTO v_slot_2_id;
  INSERT INTO public.tenant_units (tenant_id, label, status) VALUES (v_tenant_id, 'Slot-03', 'active') RETURNING id INTO v_slot_3_id;

  -- 4. Setup 3 Anggota approved (otomatis terdaftar ke arisan_participants via trigger sync_arisan_participant)
  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, phone, status, is_owner) VALUES
    (v_tm_1_id, v_tenant_id, v_user_1_id, v_slot_1_id, 'Peserta 1', '0811111111', 'approved', false),
    (v_tm_2_id, v_tenant_id, v_user_2_id, v_slot_2_id, 'Peserta 2', '0822222222', 'approved', false),
    (v_tm_3_id, v_tenant_id, v_user_3_id, v_slot_3_id, 'Peserta 3', '0833333333', 'approved', false);

  -- Verifikasi 3 peserta terdaftar di arisan_participants
  SELECT COUNT(*) INTO v_count
  FROM public.arisan_participants
  WHERE tenant_id = v_tenant_id AND has_won = false;

  IF v_count != 3 THEN
    RAISE EXCEPTION 'SETUP GAGAL: jumlah peserta arisan bukan 3 (ditemukan %)', v_count;
  END IF;

  -- ==============================================================================
  -- TEST A1: Owner menyisipkan putaran berstatus drawn dengan pemenang -> ditolak 42501
  -- ==============================================================================
  RAISE NOTICE '[TEST A1] Menguji insert arisan_rounds berstatus drawn langsung dari klien ditolak...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_user_id::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_err_caught := false;
  BEGIN
    INSERT INTO public.arisan_rounds (
      id, tenant_id, round_number, period, total_pool_amount, status, winner_member_id
    ) VALUES (
      gen_random_uuid(), v_tenant_id, 1, '2026-11', 300000, 'drawn', v_tm_1_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  IF NOT v_err_caught OR v_sqlstate != '42501' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A1 GAGAL: insert status=drawn langsung seharusnya ditolak 42501, didapat err_caught=%, sqlstate=%, msg=%',
      v_err_caught, v_sqlstate, v_errmsg;
  END IF;

  -- ==============================================================================
  -- TEST A2: Kocokan transparan dengan 2 peserta lunas dan 1 belum lunas
  -- ==============================================================================
  RAISE NOTICE '[TEST A2] Menguji kocokan transparan: 2 lunas ikut kocok, 1 belum lunas diexclude...';

  -- Owner membuat putaran 1 berstatus default ('collecting')
  INSERT INTO public.arisan_rounds (
    id, tenant_id, round_number, period, total_pool_amount, status
  ) VALUES (
    v_round_1_id, v_tenant_id, 1, '2026-11', 0, 'collecting'
  );

  -- Owner membuat tagihan untuk putaran 1
  v_res := public.generate_arisan_round_bills(v_tenant_id, v_round_1_id);
  IF (v_res->>'generated_count')::int != 3 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A2 GAGAL: generate_arisan_round_bills tidak menghasilkan 3 tagihan: %', v_res;
  END IF;

  -- Beralih ke peran postgres/service_role untuk melunasi 2 tagihan (Peserta 1 dan Peserta 2)
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.billing_items
  SET status = 'paid'
  WHERE tenant_id = v_tenant_id
    AND (metadata->>'round_id') = v_round_1_id::text
    AND member_id IN (v_tm_1_id, v_tm_2_id);

  -- Kembalikan ke authenticated owner untuk melakukan draw_arisan_winner
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_user_id::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.draw_arisan_winner(v_tenant_id, v_round_1_id);

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A2 GAGAL: draw_arisan_winner gagal: %', v_res;
  END IF;

  IF (v_res->>'eligible_count')::int != 2 OR (v_res->>'excluded_count')::int != 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A2 GAGAL: eligible_count (%) != 2 atau excluded_count (%) != 1',
      v_res->>'eligible_count', v_res->>'excluded_count';
  END IF;

  IF (v_res->>'winner_member_id')::uuid NOT IN (v_tm_1_id, v_tm_2_id) THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A2 GAGAL: pemenang (%) bukan salah satu peserta lunas (tm1/tm2)',
      v_res->>'winner_member_id';
  END IF;

  -- Periksa record di arisan_rounds
  SELECT * INTO v_round_rec
  FROM public.arisan_rounds
  WHERE id = v_round_1_id;

  IF v_round_rec.status != 'drawn' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A2 GAGAL: status arisan_rounds bukan drawn: %', v_round_rec.status;
  END IF;

  IF v_round_rec.total_pool_amount != 200000 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A2 GAGAL: total_pool_amount (%) != 200000', v_round_rec.total_pool_amount;
  END IF;

  IF jsonb_array_length(v_round_rec.eligible_snapshot) != 2 OR jsonb_array_length(v_round_rec.excluded_snapshot) != 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A2 GAGAL: snapshot tidak cocok: eligible=%, excluded=%',
      v_round_rec.eligible_snapshot, v_round_rec.excluded_snapshot;
  END IF;

  -- ==============================================================================
  -- TEST A3: Owner mengubah status/winner putaran yang sudah dikocok -> ditolak. Mengubah notes -> berhasil
  -- ==============================================================================
  RAISE NOTICE '[TEST A3] Menguji putaran yang sudah dikocok bersifat final (hanya notes yang boleh diubah)...';

  -- Mencoba mengubah status kembali ke collecting
  v_err_caught := false;
  BEGIN
    UPDATE public.arisan_rounds
    SET status = 'collecting'
    WHERE id = v_round_1_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  IF NOT v_err_caught OR v_sqlstate != '42501' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A3 GAGAL: update status putaran drawn seharusnya ditolak 42501, didapat err_caught=%, sqlstate=%',
      v_err_caught, v_sqlstate;
  END IF;

  -- Mencoba mengubah winner_member_id
  v_err_caught := false;
  BEGIN
    UPDATE public.arisan_rounds
    SET winner_member_id = v_tm_3_id
    WHERE id = v_round_1_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  IF NOT v_err_caught OR v_sqlstate != '42501' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A3 GAGAL: update winner_member_id putaran drawn seharusnya ditolak 42501, didapat err_caught=%, sqlstate=%',
      v_err_caught, v_sqlstate;
  END IF;

  -- Mengubah notes harus berhasil
  UPDATE public.arisan_rounds
  SET notes = 'Catatan putaran 1 berhasil dikocok'
  WHERE id = v_round_1_id;

  SELECT notes INTO v_errmsg FROM public.arisan_rounds WHERE id = v_round_1_id;
  IF v_errmsg != 'Catatan putaran 1 berhasil dikocok' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A3 GAGAL: update notes gagal tersimpan: %', v_errmsg;
  END IF;

  -- ==============================================================================
  -- TEST A4: Kocok ulang putaran yang sama ditolak
  -- ==============================================================================
  RAISE NOTICE '[TEST A4] Menguji kocok ulang putaran yang sudah drawn ditolak...';

  v_err_caught := false;
  BEGIN
    PERFORM public.draw_arisan_winner(v_tenant_id, v_round_1_id);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  IF NOT v_err_caught OR v_errmsg NOT LIKE '%sudah pernah dikocok%' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A4 GAGAL: draw ulang seharusnya ditolak dengan pesan sudah pernah dikocok: %', v_errmsg;
  END IF;

  -- ==============================================================================
  -- TEST A5: Putaran baru tanpa setoran lunas ditolak
  -- ==============================================================================
  RAISE NOTICE '[TEST A5] Menguji putaran tanpa setoran lunas ditolak kocok...';

  -- Buat putaran 2
  INSERT INTO public.arisan_rounds (
    id, tenant_id, round_number, period, total_pool_amount, status
  ) VALUES (
    v_round_2_id, v_tenant_id, 2, '2026-12', 0, 'collecting'
  );

  -- Generate tagihan putaran 2 (semua berstatus unpaid)
  PERFORM public.generate_arisan_round_bills(v_tenant_id, v_round_2_id);

  v_err_caught := false;
  BEGIN
    PERFORM public.draw_arisan_winner(v_tenant_id, v_round_2_id);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  IF NOT v_err_caught OR v_errmsg NOT LIKE '%belum ada peserta yang setorannya lunas%' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A5 GAGAL: kocok tanpa setoran lunas seharusnya ditolak dengan pesan sesuai: %', v_errmsg;
  END IF;

  -- ==============================================================================
  -- TEST A6: Putaran lain dengan label periode sama -> check_arisan_round_readiness mencocokkan round_id saja
  -- ==============================================================================
  RAISE NOTICE '[TEST A6] Menguji check_arisan_round_readiness hanya mencocokkan metadata round_id (A7)...';

  -- Buat putaran 3 dengan periode yang sama ('2026-12') tetapi belum di-generate tagihannya
  INSERT INTO public.arisan_rounds (
    id, tenant_id, round_number, period, total_pool_amount, status
  ) VALUES (
    v_round_3_id, v_tenant_id, 3, '2026-12', 0, 'collecting'
  );

  v_res := public.check_arisan_round_readiness(v_round_3_id);

  IF (v_res->>'total_bills')::int != 0 OR (v_res->>'paid_bills')::int != 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'TEST A6 GAGAL: check_arisan_round_readiness salah menghitung tagihan dari periode (ditemukan total=%, paid=%): %',
      v_res->>'total_bills', v_res->>'paid_bills', v_res;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TEST SUKSES: Seluruh pengujian ARISAN-1.1 (A1 - A6) LULUS!';
  RAISE NOTICE '============================================================';
END;
$$;

ROLLBACK;
