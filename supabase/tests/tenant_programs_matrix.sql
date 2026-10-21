-- Test Suite: Tenant Programs & Budget Matrix (PANITIA-1.2)
-- Date: 2026-10-21
-- Ref: docs/handoff/PANITIA-1.md § PANITIA-1.2
--
-- File ini memvalidasi:
-- P. Privilege checks: anon tidak punya SELECT di tenant_programs / program_budget_items dan tidak punya EXECUTE can_manage_programs.
-- C1. S membuat acara P (ketua = M) dan Q. M melihat 2 acara dan semua pos RAB. X melihat 0 acara milik T.
-- C2. Pos RAB 50 × Rp15.000 -> amount = 750000 (kolom otomatis).
-- C3. M menulis pos RAB, dan ditolak. B menambah pos RAB, dan berhasil.
-- C4. M membuat acara, dan ditolak.
-- C5. B mencatat pengeluaran (P + pos konsumsi) dan pemasukan (P + pos sponsor). Keduanya berhasil.
-- C6. Pengeluaran dengan program_id = P2 (tenant lain) ditolak foreign_key_violation.
-- C7. Pengeluaran di P dengan pos milik acara Q ditolak foreign_key_violation.
-- C8. Pemasukan dengan budget_item_id tanpa program_id ditolak check_violation.
-- C9. Acara dengan ketua dari tenant lain ditolak.
-- C10. Owner T menghapus acara P (sudah ada transaksi) ditolak foreign_key_violation. Owner menghapus acara Q: berhasil & pos RAB Q ikut terhapus.
-- C11. Owner menghapus pos konsumsi: pengeluaran C5 tetap ada, program_id tetap P, budget_item_id menjadi NULL.

BEGIN;

DO $$
DECLARE
  -- Auth User IDs
  v_user_owner_t   UUID := gen_random_uuid();
  v_user_s         UUID := gen_random_uuid();
  v_user_b         UUID := gen_random_uuid();
  v_user_m         UUID := gen_random_uuid();
  v_user_owner_t2  UUID := gen_random_uuid();
  v_user_x         UUID := gen_random_uuid();

  -- Tenant IDs
  v_tenant_t       UUID;
  v_tenant_t2      UUID;

  -- Roles
  v_base_role_t    UUID;
  v_base_role_t2   UUID;
  v_role_s_id      UUID := gen_random_uuid();
  v_role_b_id      UUID := gen_random_uuid();

  -- Member IDs
  v_member_m       UUID := gen_random_uuid();
  v_member_b       UUID := gen_random_uuid();
  v_member_s       UUID := gen_random_uuid();
  v_member_x       UUID := gen_random_uuid();

  -- Program & Budget IDs
  v_program_p      UUID := gen_random_uuid();
  v_program_q      UUID := gen_random_uuid();
  v_program_p2     UUID := gen_random_uuid();
  v_budget_c2_id   UUID;
  v_budget_konsumsi_id UUID;
  v_budget_sponsor_id  UUID;
  v_budget_item_q_id   UUID;

  -- Transaction IDs
  v_expense_c5_id  UUID;
  v_income_c5_id   UUID;

  -- Assertion helpers
  v_count          INT;
  v_amount_c2      NUMERIC(16,2);
  v_check_program_id UUID;
  v_check_budget_item_id UUID;
  v_caught         BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: TENANT PROGRAMS MATRIX (PANITIA-1.2)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- P. PRIVILEGE CHECKS (STATIC CHECKS)
  -- ==============================================================================
  RAISE NOTICE '[TEST P] Memeriksa hak akses anon dan authenticated...';

  IF has_table_privilege('anon', 'public.tenant_programs', 'SELECT') THEN
    RAISE EXCEPTION 'TEST P GAGAL: anon memiliki privilege SELECT pada tenant_programs';
  END IF;

  IF has_table_privilege('anon', 'public.program_budget_items', 'SELECT') THEN
    RAISE EXCEPTION 'TEST P GAGAL: anon memiliki privilege SELECT pada program_budget_items';
  END IF;

  IF has_function_privilege('anon', 'public.can_manage_programs(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST P GAGAL: anon memiliki privilege EXECUTE pada can_manage_programs(uuid)';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.tenant_programs', 'SELECT') THEN
    RAISE EXCEPTION 'TEST P GAGAL: authenticated tidak memiliki privilege SELECT pada tenant_programs';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.program_budget_items', 'SELECT') THEN
    RAISE EXCEPTION 'TEST P GAGAL: authenticated tidak memiliki privilege SELECT pada program_budget_items';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.can_manage_programs(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST P GAGAL: authenticated tidak memiliki privilege EXECUTE pada can_manage_programs(uuid)';
  END IF;

  RAISE NOTICE '>> PASSED: Test P (Privilege checks) Berhasil!';

  -- ==============================================================================
  -- SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan auth users, tenants, roles, dan memberships...';

  -- 1. Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_user_owner_t,  'owner_t@test.invalid',  'authenticated', 'authenticated'),
    (v_user_s,        'sekretaris@test.invalid', 'authenticated', 'authenticated'),
    (v_user_b,        'bendahara@test.invalid',  'authenticated', 'authenticated'),
    (v_user_m,        'anggota_m@test.invalid',  'authenticated', 'authenticated'),
    (v_user_owner_t2, 'owner_t2@test.invalid', 'authenticated', 'authenticated'),
    (v_user_x,        'anggota_x@test.invalid',  'authenticated', 'authenticated');

  -- 2. Tenants (Pakai jenis rt_rw sesuai arahan)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Komunitas Panitia T', 'rt_rw', v_user_owner_t)
  RETURNING id INTO v_tenant_t;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_t;

  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Komunitas Tetangga T2', 'rt_rw', v_user_owner_t2)
  RETURNING id INTO v_tenant_t2;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_t2;

  -- 3. Base roles bawaan
  SELECT id INTO v_base_role_t
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_t AND is_base_role = true
  LIMIT 1;

  SELECT id INTO v_base_role_t2
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_t2 AND is_base_role = true
  LIMIT 1;

  -- 4. Custom Roles di Tenant T
  -- Role Sekretaris: punya izin 'manage_programs'
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_role_s_id, v_tenant_t, 'Sekretaris Acara', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES (v_role_s_id, 'manage_programs');

  -- Role Bendahara: punya izin 'manage_expenses'
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_role_b_id, v_tenant_t, 'Bendahara Keuangan', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES (v_role_b_id, 'manage_expenses');

  -- 5. Memberships
  -- S: Sekretaris di T
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_s, v_tenant_t, v_user_s, 'Siti Sekretaris', 'approved', false, v_role_s_id);

  -- B: Bendahara di T
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_b, v_tenant_t, v_user_b, 'Budi Bendahara', 'approved', false, v_role_b_id);

  -- M: Anggota biasa di T
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_m, v_tenant_t, v_user_m, 'Maya Anggota', 'approved', false, v_base_role_t);

  -- X: Anggota di T2
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_member_x, v_tenant_t2, v_user_x, 'Xavier Luar', 'approved', false, v_base_role_t2);

  -- 6. Program P2 di T2 (disiapkan langsung untuk uji cross-tenant)
  INSERT INTO public.tenant_programs (id, tenant_id, name, status)
  VALUES (v_program_p2, v_tenant_t2, 'Acara T2 Xavier', 'planning');

  RAISE NOTICE '>> SETUP Berhasil! Fixtures siap.';

  -- ==============================================================================
  -- C1. S membuat acara P (ketua = M) dan Q. M melihat 2 acara dan pos RAB. X melihat 0.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C1] S membuat acara P dan Q...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_s::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_s::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.tenant_programs (id, tenant_id, name, status, lead_member_id)
  VALUES (v_program_p, v_tenant_t, 'Pentas Seni Warga', 'planning', v_member_m);

  INSERT INTO public.tenant_programs (id, tenant_id, name, status)
  VALUES (v_program_q, v_tenant_t, 'Lomba 17 Agustus', 'planning');

  -- Cek visibilitas M (anggota T)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_m::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT COUNT(*) INTO v_count FROM public.tenant_programs WHERE tenant_id = v_tenant_t;
  IF v_count <> 2 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C1 GAGAL: M tidak melihat 2 acara milik T (aktual = %)', v_count;
  END IF;

  -- Cek visibilitas X (anggota T2)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_x::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_x::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT COUNT(*) INTO v_count FROM public.tenant_programs WHERE tenant_id = v_tenant_t;
  IF v_count <> 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C1 GAGAL: X (tenant lain) bisa melihat acara milik T (aktual = %)', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C1 Berhasil!';

  -- ==============================================================================
  -- C2. Pos RAB 50 × Rp15.000 -> amount = 750000 (kolom otomatis).
  -- ==============================================================================
  RAISE NOTICE '[KASUS C2] Verifikasi amount otomatis pada pos RAB...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_s::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_s::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.program_budget_items (tenant_id, program_id, kind, item, quantity, unit_price)
  VALUES (v_tenant_t, v_program_p, 'expense', 'Souvenir Peserta', 50, 15000)
  RETURNING id, amount INTO v_budget_c2_id, v_amount_c2;

  IF v_amount_c2 <> 750000 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C2 GAGAL: amount otomatis bukan 750000 (aktual = %)', v_amount_c2;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C2 Berhasil!';

  -- ==============================================================================
  -- C3. M menulis pos RAB, dan ditolak. B menambah pos RAB, dan berhasil.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C3] M mencoba menulis pos RAB (ditolak), B menambah pos RAB (berhasil)...';

  -- Uji M (ditolak)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_m::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_caught := false;
  BEGIN
    INSERT INTO public.program_budget_items (tenant_id, program_id, kind, item, quantity, unit_price)
    VALUES (v_tenant_t, v_program_p, 'expense', 'Tenda Ilegal', 1, 500000);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C3 GAGAL: M berhasil menulis pos RAB tanpa izin!';
  END IF;

  -- Uji B (berhasil: izin manage_expenses diizinkan mengelola RAB)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.program_budget_items (tenant_id, program_id, kind, item, quantity, unit_price)
  VALUES (v_tenant_t, v_program_p, 'expense', 'Konsumsi Snack', 100, 20000)
  RETURNING id INTO v_budget_konsumsi_id;

  INSERT INTO public.program_budget_items (tenant_id, program_id, kind, item, quantity, unit_price)
  VALUES (v_tenant_t, v_program_p, 'income', 'Sponsorship Brand A', 1, 2000000)
  RETURNING id INTO v_budget_sponsor_id;

  INSERT INTO public.program_budget_items (tenant_id, program_id, kind, item, quantity, unit_price)
  VALUES (v_tenant_t, v_program_q, 'expense', 'Hadiah Juara 1', 1, 500000)
  RETURNING id INTO v_budget_item_q_id;

  RAISE NOTICE '>> PASSED: Kasus C3 Berhasil!';

  -- ==============================================================================
  -- C4. M membuat acara, dan ditolak.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C4] M mencoba membuat acara tanpa izin (harus ditolak)...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_m::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_m::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_programs (tenant_id, name, status)
    VALUES (v_tenant_t, 'Acara Ilegal Maya', 'planning');
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C4 GAGAL: M berhasil membuat acara tanpa izin manage_programs!';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C4 Berhasil!';

  -- ==============================================================================
  -- C5. B mencatat pengeluaran (P + pos konsumsi) dan pemasukan (P + pos sponsor).
  -- ==============================================================================
  RAISE NOTICE '[KASUS C5] B mencatat pengeluaran dan pemasukan tertaut acara dan pos RAB...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.expenses (tenant_id, category, amount, description, expense_date, program_id, budget_item_id, recorded_by)
  VALUES (v_tenant_t, 'Konsumsi', 2000000, 'Beli snack panitia', CURRENT_DATE, v_program_p, v_budget_konsumsi_id, v_member_b)
  RETURNING id INTO v_expense_c5_id;

  INSERT INTO public.non_ipl_incomes (tenant_id, income_date, amount, category, source_name, description, program_id, budget_item_id, recorded_by)
  VALUES (v_tenant_t, CURRENT_DATE, 2000000, 'Sponsor', 'Brand A', 'Dana sponsorship', v_program_p, v_budget_sponsor_id, v_member_b)
  RETURNING id INTO v_income_c5_id;

  IF v_expense_c5_id IS NULL OR v_income_c5_id IS NULL THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C5 GAGAL: Gagal menyimpan pengeluaran atau pemasukan tertaut acara!';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C5 Berhasil!';

  -- ==============================================================================
  -- C6. Pengeluaran dengan program_id = P2 (tenant lain) ditolak foreign_key_violation.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C6] Pengeluaran dengan program_id tenant lain harus ditolak FK...';

  v_caught := false;
  BEGIN
    INSERT INTO public.expenses (tenant_id, category, amount, description, expense_date, program_id)
    VALUES (v_tenant_t, 'Konsumsi', 100000, 'Cross tenant expense', CURRENT_DATE, v_program_p2);
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C6 GAGAL: Pengeluaran dengan program_id tenant lain tidak ditolak foreign_key_violation!';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C6 Berhasil!';

  -- ==============================================================================
  -- C7. Pengeluaran di P dengan pos milik acara Q ditolak foreign_key_violation.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C7] Pengeluaran di acara P dengan pos RAB milik acara Q harus ditolak FK...';

  v_caught := false;
  BEGIN
    INSERT INTO public.expenses (tenant_id, category, amount, description, expense_date, program_id, budget_item_id)
    VALUES (v_tenant_t, 'Konsumsi', 100000, 'Mismatch program budget', CURRENT_DATE, v_program_p, v_budget_item_q_id);
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C7 GAGAL: Pengeluaran di acara P dengan pos milik Q tidak ditolak foreign_key_violation!';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C7 Berhasil!';

  -- ==============================================================================
  -- C8. Pemasukan dengan budget_item_id tanpa program_id ditolak check_violation.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C8] Pemasukan dengan pos RAB tanpa program_id harus ditolak check constraint...';

  v_caught := false;
  BEGIN
    INSERT INTO public.non_ipl_incomes (tenant_id, income_date, amount, category, source_name, budget_item_id)
    VALUES (v_tenant_t, CURRENT_DATE, 500000, 'Sponsor', 'Brand B', v_budget_sponsor_id);
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C8 GAGAL: Pemasukan dengan budget_item_id tanpa program_id tidak ditolak check_violation!';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C8 Berhasil!';

  -- ==============================================================================
  -- C9. Acara dengan ketua dari tenant lain ditolak.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C9] Acara dengan lead_member_id dari tenant lain harus ditolak RLS...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_s::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_s::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_programs (tenant_id, name, status, lead_member_id)
    VALUES (v_tenant_t, 'Acara Ketua Luar', 'planning', v_member_x);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C9 GAGAL: Acara dengan ketua dari tenant lain tidak ditolak!';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C9 Berhasil!';

  -- ==============================================================================
  -- C10. Owner T menghapus acara P (ada transaksi -> ditolak FK). Hapus Q (tanpa transaksi -> berhasil, CASCADE RAB).
  -- ==============================================================================
  RAISE NOTICE '[KASUS C10] Owner T menghapus acara P (ditolak FK) dan Q (berhasil CASCADE)...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_owner_t::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_owner_t::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Uji hapus P (ada transaksi di expenses/non_ipl_incomes -> ON DELETE RESTRICT)
  v_caught := false;
  BEGIN
    DELETE FROM public.tenant_programs WHERE id = v_program_p;
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C10 GAGAL: Hapus acara P yang memiliki transaksi tidak ditolak foreign_key_violation!';
  END IF;

  -- Hapus acara Q (tanpa transaksi -> berhasil)
  DELETE FROM public.tenant_programs WHERE id = v_program_q;

  -- Verifikasi pos RAB Q ikut terhapus otomatis (ON DELETE CASCADE)
  SELECT COUNT(*) INTO v_count FROM public.program_budget_items WHERE program_id = v_program_q;
  IF v_count <> 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C10 GAGAL: Pos RAB milik acara Q tidak terhapus otomatis (aktual = %)!', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C10 Berhasil!';

  -- ==============================================================================
  -- C11. Owner menghapus pos konsumsi: pengeluaran C5 tetap ada, program_id tetap P, budget_item_id menjadi NULL.
  -- ==============================================================================
  RAISE NOTICE '[KASUS C11] Owner menghapus pos konsumsi -> transaksi tetap ada dan budget_item_id menjadi NULL...';

  DELETE FROM public.program_budget_items WHERE id = v_budget_konsumsi_id;

  SELECT program_id, budget_item_id INTO v_check_program_id, v_check_budget_item_id
  FROM public.expenses WHERE id = v_expense_c5_id;

  IF v_check_program_id IS NULL OR v_check_program_id <> v_program_p THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C11 GAGAL: program_id pada pengeluaran hilang atau berubah (aktual = %)!', v_check_program_id;
  END IF;

  IF v_check_budget_item_id IS NOT NULL THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS C11 GAGAL: budget_item_id pada pengeluaran tidak menjadi NULL (aktual = %)!', v_check_budget_item_id;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus C11 Berhasil!';

  -- Selesai
  EXECUTE 'SET LOCAL ROLE postgres';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST SUITE TENANT PROGRAMS MATRIX (PANITIA-1.2) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
