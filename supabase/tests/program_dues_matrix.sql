-- Test Suite: Program Dues Matrix (PANITIA-2.1)
-- Date: 2026-10-22
-- Ref: docs/handoff/PANITIA-2.md § PANITIA-2.1
--
-- File ini memvalidasi:
-- D1. Bendahara (generate_billing + manage_billing_transfer) menerbitkan iuran anggota M untuk acara P (unit_id NULL).
-- D2. Iuran kedua untuk M di P ditolak unique_violation.
-- D3. Iuran acara tanpa member_id ditolak check_violation.
-- D4. Iuran dengan acara tenant lain ditolak foreign_key_violation.
-- D5. M melihat tagihannya dan mengajukan pembayaran transfer (pending_verification + proof_url), sehingga tagihan menjadi pending_verification.
-- D6. Bendahara meng-update pembayaran menjadi completed, lalu tagihan menjadi paid. verified_by terisi id anggota bendahara.
-- D7. Setelah iuran berstatus cancelled, iuran baru untuk anggota yang sama boleh diterbitkan.

BEGIN;

DO $$
DECLARE
  -- Auth User IDs
  v_user_owner_t   UUID := gen_random_uuid();
  v_user_b         UUID := gen_random_uuid();
  v_user_m         UUID := gen_random_uuid();
  v_user_s         UUID := gen_random_uuid();
  v_user_owner_t2  UUID := gen_random_uuid();
  v_user_x         UUID := gen_random_uuid();

  -- Tenant IDs
  v_tenant_t       UUID;
  v_tenant_t2      UUID;

  -- Roles
  v_base_role_t    UUID;
  v_base_role_t2   UUID;
  v_role_b_id      UUID := gen_random_uuid();

  -- Member IDs
  v_member_b       UUID := gen_random_uuid();
  v_member_m       UUID := gen_random_uuid();
  v_member_s       UUID := gen_random_uuid();
  v_member_x       UUID := gen_random_uuid();

  -- Program IDs
  v_program_p      UUID := gen_random_uuid();
  v_program_p2     UUID := gen_random_uuid();

  -- Bill & Payment IDs
  v_bill_d1        UUID := gen_random_uuid();
  v_bill_d2        UUID := gen_random_uuid();
  v_bill_d3        UUID := gen_random_uuid();
  v_bill_d4        UUID := gen_random_uuid();
  v_bill_d7_1      UUID := gen_random_uuid();
  v_bill_d7_2      UUID := gen_random_uuid();
  v_payment_d5     UUID := gen_random_uuid();

  -- Assertion helpers
  v_count          INT;
  v_status         TEXT;
  v_verified_by    UUID;
  v_caught         BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: PROGRAM DUES MATRIX (PANITIA-2.1)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan auth users, tenants, roles, dan memberships...';

  -- 1. Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_user_owner_t,  'owner_t@test.invalid',     'authenticated', 'authenticated'),
    (v_user_b,        'bendahara_b@test.invalid', 'authenticated', 'authenticated'),
    (v_user_m,        'anggota_m@test.invalid',   'authenticated', 'authenticated'),
    (v_user_s,        'anggota_s@test.invalid',   'authenticated', 'authenticated'),
    (v_user_owner_t2, 'owner_t2@test.invalid',    'authenticated', 'authenticated'),
    (v_user_x,        'anggota_x@test.invalid',   'authenticated', 'authenticated');

  -- 2. Tenants (jenis panitia)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Panitia Konser Tahunan T', 'panitia', v_user_owner_t)
  RETURNING id INTO v_tenant_t;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_t;

  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Panitia Lomba T2', 'panitia', v_user_owner_t2)
  RETURNING id INTO v_tenant_t2;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_t2;

  -- 3. Base roles
  SELECT id INTO v_base_role_t
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_t AND is_base_role = true
  LIMIT 1;

  SELECT id INTO v_base_role_t2
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_t2 AND is_base_role = true
  LIMIT 1;

  -- 4. Role Bendahara: generate_billing + manage_billing_transfer + manage_billing_cash
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_role_b_id, v_tenant_t, 'Bendahara Panitia', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key) VALUES
    (v_role_b_id, 'generate_billing'),
    (v_role_b_id, 'manage_billing_transfer'),
    (v_role_b_id, 'manage_billing_cash');

  -- 5. Memberships
  -- B: Bendahara di T
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_b, v_tenant_t, v_user_b, 'Budi Bendahara', 'approved', false, v_role_b_id);

  -- M: Anggota biasa di T
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_m, v_tenant_t, v_user_m, 'Maya Anggota', 'approved', false, v_base_role_t);

  -- S: Anggota biasa di T (untuk test pembatalan D7)
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_s, v_tenant_t, v_user_s, 'Siti Anggota', 'approved', false, v_base_role_t);

  -- X: Anggota di T2
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_x, v_tenant_t2, v_user_x, 'Xavier Luar', 'approved', false, v_base_role_t2);

  -- 6. Programs
  INSERT INTO public.tenant_programs (id, tenant_id, name, status)
  VALUES (v_program_p, v_tenant_t, 'Konser Amal 2026', 'planning');

  INSERT INTO public.tenant_programs (id, tenant_id, name, status)
  VALUES (v_program_p2, v_tenant_t2, 'Acara T2 Xavier', 'planning');

  RAISE NOTICE '>> SETUP Berhasil! Fixtures siap.';

  -- ==============================================================================
  -- D1. Bendahara menerbitkan iuran anggota M untuk acara P (unit_id NULL)
  -- ==============================================================================
  RAISE NOTICE '[KASUS D1] Bendahara menerbitkan iuran untuk M di acara P...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.billing_items (
    id, tenant_id, program_id, member_id, unit_id, period, amount, due_date, status, metadata
  ) VALUES (
    v_bill_d1, v_tenant_t, v_program_p, v_member_m, NULL, '2026-11', 150000, '2026-11-15', 'unpaid',
    '{"bill_type":"program_dues","program_name":"Konser Amal 2026"}'::jsonb
  );

  SELECT count(*) INTO v_count
  FROM public.billing_items
  WHERE id = v_bill_d1 AND program_id = v_program_p AND member_id = v_member_m AND unit_id IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'KASUS D1 GAGAL: Tagihan iuran tidak ditemukan atau field tidak sesuai.';
  END IF;
  RAISE NOTICE '>> PASSED: Kasus D1 Berhasil!';

  -- ==============================================================================
  -- D2. Iuran kedua untuk M di P ditolak unique_violation
  -- ==============================================================================
  RAISE NOTICE '[KASUS D2] Iuran kedua untuk M di P harus ditolak unique_violation...';
  v_caught := false;

  BEGIN
    INSERT INTO public.billing_items (
      id, tenant_id, program_id, member_id, unit_id, period, amount, due_date, status, metadata
    ) VALUES (
      v_bill_d2, v_tenant_t, v_program_p, v_member_m, NULL, '2026-11', 200000, '2026-11-15', 'unpaid',
      '{"bill_type":"program_dues"}'::jsonb
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'KASUS D2 GAGAL: Iuran ganda untuk anggota di acara yang sama tidak ditolak unique_violation.';
  END IF;
  RAISE NOTICE '>> PASSED: Kasus D2 Berhasil!';

  -- ==============================================================================
  -- D3. Iuran acara tanpa member_id ditolak check_violation
  -- ==============================================================================
  RAISE NOTICE '[KASUS D3] Iuran acara tanpa member_id harus ditolak check_violation...';
  v_caught := false;

  BEGIN
    INSERT INTO public.billing_items (
      id, tenant_id, program_id, member_id, unit_id, period, amount, due_date, status, metadata
    ) VALUES (
      v_bill_d3, v_tenant_t, v_program_p, NULL, NULL, '2026-11', 100000, '2026-11-15', 'unpaid',
      '{"bill_type":"program_dues"}'::jsonb
    );
  EXCEPTION
    WHEN check_violation THEN
      v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'KASUS D3 GAGAL: Iuran acara tanpa member_id tidak ditolak check_violation.';
  END IF;
  RAISE NOTICE '>> PASSED: Kasus D3 Berhasil!';

  -- ==============================================================================
  -- D4. Iuran dengan acara tenant lain ditolak foreign_key_violation
  -- ==============================================================================
  RAISE NOTICE '[KASUS D4] Iuran dengan acara tenant lain harus ditolak foreign_key_violation...';
  v_caught := false;

  BEGIN
    INSERT INTO public.billing_items (
      id, tenant_id, program_id, member_id, unit_id, period, amount, due_date, status, metadata
    ) VALUES (
      v_bill_d4, v_tenant_t, v_program_p2, v_member_m, NULL, '2026-11', 100000, '2026-11-15', 'unpaid',
      '{"bill_type":"program_dues"}'::jsonb
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'KASUS D4 GAGAL: Iuran dengan acara tenant lain tidak ditolak foreign_key_violation.';
  END IF;
  RAISE NOTICE '>> PASSED: Kasus D4 Berhasil!';

  -- ==============================================================================
  -- D5. M melihat tagihannya dan mengajukan pembayaran transfer
  -- ==============================================================================
  RAISE NOTICE '[KASUS D5] M melihat tagihannya dan mengajukan pembayaran transfer...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_m::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count
  FROM public.billing_items
  WHERE id = v_bill_d1;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'KASUS D5 GAGAL: M tidak dapat melihat tagihan miliknya.';
  END IF;

  INSERT INTO public.payments (
    id, tenant_id, billing_item_id, member_id, amount, method, status, proof_url
  ) VALUES (
    v_payment_d5, v_tenant_t, v_bill_d1, v_member_m, 150000, 'bank_transfer', 'pending_verification',
    'https://storage.test.invalid/proofs/transfer_m.jpg'
  );

  SELECT status INTO v_status
  FROM public.billing_items
  WHERE id = v_bill_d1;

  IF v_status <> 'pending_verification' THEN
    RAISE EXCEPTION 'KASUS D5 GAGAL: Status tagihan tidak berubah menjadi pending_verification (aktual: %)', v_status;
  END IF;
  RAISE NOTICE '>> PASSED: Kasus D5 Berhasil!';

  -- ==============================================================================
  -- D6. Bendahara meng-update pembayaran menjadi completed, lalu tagihan menjadi paid
  -- ==============================================================================
  RAISE NOTICE '[KASUS D6] Bendahara memverifikasi pembayaran menjadi completed...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.payments
  SET status = 'completed', paid_at = now()
  WHERE id = v_payment_d5;

  UPDATE public.billing_items
  SET status = 'paid'
  WHERE id = v_bill_d1;

  SELECT status INTO v_status
  FROM public.billing_items
  WHERE id = v_bill_d1;

  IF v_status <> 'paid' THEN
    RAISE EXCEPTION 'KASUS D6 GAGAL: Status tagihan tidak berubah menjadi paid (aktual: %)', v_status;
  END IF;

  SELECT verified_by INTO v_verified_by
  FROM public.payments
  WHERE id = v_payment_d5;

  IF v_verified_by IS DISTINCT FROM v_member_b THEN
    RAISE EXCEPTION 'KASUS D6 GAGAL: verified_by tidak terstempel dengan ID anggota bendahara (aktual: %)', v_verified_by;
  END IF;
  RAISE NOTICE '>> PASSED: Kasus D6 Berhasil!';

  -- ==============================================================================
  -- D7. Setelah iuran berstatus cancelled, iuran baru boleh diterbitkan
  -- ==============================================================================
  RAISE NOTICE '[KASUS D7] Membatalkan iuran S lalu menerbitkan iuran baru...';

  INSERT INTO public.billing_items (
    id, tenant_id, program_id, member_id, unit_id, period, amount, due_date, status, metadata
  ) VALUES (
    v_bill_d7_1, v_tenant_t, v_program_p, v_member_s, NULL, '2026-11', 150000, '2026-11-15', 'unpaid',
    '{"bill_type":"program_dues"}'::jsonb
  );

  UPDATE public.billing_items
  SET status = 'cancelled'
  WHERE id = v_bill_d7_1;

  -- Terbitkan iuran baru untuk S di P
  INSERT INTO public.billing_items (
    id, tenant_id, program_id, member_id, unit_id, period, amount, due_date, status, metadata
  ) VALUES (
    v_bill_d7_2, v_tenant_t, v_program_p, v_member_s, NULL, '2026-11', 175000, '2026-11-20', 'unpaid',
    '{"bill_type":"program_dues"}'::jsonb
  );

  SELECT count(*) INTO v_count
  FROM public.billing_items
  WHERE program_id = v_program_p AND member_id = v_member_s AND status = 'unpaid';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'KASUS D7 GAGAL: Tagihan iuran baru setelah pembatalan tidak berhasil dibuat.';
  END IF;
  RAISE NOTICE '>> PASSED: Kasus D7 Berhasil!';

  RAISE NOTICE '============================================================';
  RAISE NOTICE '>> SEMUA TEST PROGRAM DUES MATRIX BERHASIL DILALUI!';
  RAISE NOTICE '============================================================';

END $$;

ROLLBACK;
