-- Test Suite: Storage R2 Database Access Functions Matrix
-- Task: STOR-1.1 (Ref: docs/handoff/STOR-1.md, STOR-1-requirement.md, STOR-1-plan.md)
-- Date: 2026-10-14
--
-- File ini memvalidasi:
-- 1. Hak privilege has_function_privilege() untuk anon, authenticated, service_role.
-- 2. Izin upload bukti bayar (payment_proof): anggota aktif vs lintas-tenant vs read_only.
-- 3. Izin lihat bukti bayar (payment_proof): owner, bendahara, warga, user lain, admin, & validasi canonical path.
-- 4. Izin upload nota (expense_receipt): staf manage_expenses vs warga vs read_only vs admin.
-- 5. Izin lihat nota (expense_receipt): staf manage_expenses vs warga vs user lain vs admin.
-- 6. Penanganan input NULL, string kosong, dan kind tidak dikenal (selalu boolean false, bukan NULL).

BEGIN;

DO $$
DECLARE
  -- Identitas User
  v_owner_a        UUID := gen_random_uuid();
  v_bendahara_a    UUID := gen_random_uuid();
  v_warga_a        UUID := gen_random_uuid();
  v_user_b         UUID := gen_random_uuid();
  v_platform_admin UUID := gen_random_uuid();

  -- Tenant
  v_tenant_a       UUID;
  v_tenant_b       UUID;

  -- RBAC Roles
  v_bendahara_role_id UUID := gen_random_uuid();
  v_base_role_id      UUID;

  -- Test helper data
  v_bill_id UUID := gen_random_uuid();

  -- Path canon & non-canonical
  v_canonical_proof_a          TEXT;
  v_non_canonical_proof_traversal TEXT;
  v_non_canonical_proof_no_pay TEXT;
  v_non_canonical_proof_bad_bill TEXT;
  v_canonical_receipt_a        TEXT;
  v_non_canonical_receipt_year TEXT;

  -- Variable pengujian
  v_res BOOLEAN;
  v_caught_error BOOLEAN;
  v_sqlstate TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: STORAGE R2 ACCESS MATRIX (STOR-1.1)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- 1. ASSERT FUNCTION PRIVILEGES (STATIC MATRIX CHECK)
  -- ==============================================================================
  RAISE NOTICE '[TEST 1] Memeriksa static privilege has_function_privilege()...';

  -- 1.1 can_upload_tenant_file(text, uuid)
  IF has_function_privilege('anon', 'public.can_upload_tenant_file(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1.1 GAGAL: anon memiliki privilege EXECUTE pada can_upload_tenant_file';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.can_upload_tenant_file(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1.1 GAGAL: authenticated tidak memiliki privilege EXECUTE pada can_upload_tenant_file';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.can_upload_tenant_file(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1.1 GAGAL: service_role tidak memiliki privilege EXECUTE pada can_upload_tenant_file';
  END IF;

  -- 1.2 can_read_tenant_file(text, text)
  IF has_function_privilege('anon', 'public.can_read_tenant_file(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1.2 GAGAL: anon memiliki privilege EXECUTE pada can_read_tenant_file';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.can_read_tenant_file(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1.2 GAGAL: authenticated tidak memiliki privilege EXECUTE pada can_read_tenant_file';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.can_read_tenant_file(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1.2 GAGAL: service_role tidak memiliki privilege EXECUTE pada can_read_tenant_file';
  END IF;

  RAISE NOTICE '>> PASSED: Test 1 (Static privilege checks) Berhasil!';

  -- ==============================================================================
  -- 2. SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan user, tenant, role RBAC v2, dan subscription...';

  -- 2.1 Auth Users
  INSERT INTO auth.users (id, email) VALUES
    (v_owner_a,        'owner_a_stor1@test.invalid'),
    (v_bendahara_a,    'bendahara_a_stor1@test.invalid'),
    (v_warga_a,        'warga_a_stor1@test.invalid'),
    (v_user_b,         'user_b_stor1@test.invalid'),
    (v_platform_admin, 'admin_stor1@test.invalid');

  -- 2.2 Platform Admin
  INSERT INTO public.platform_admins (user_id) VALUES (v_platform_admin);

  -- 2.3 Tenant A (Kompleks Uji A)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks Uji Stor A', 'rt_rw', v_owner_a)
  RETURNING id INTO v_tenant_a;

  -- Pastikan subscription aktif
  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_a;

  -- Ambil base role bawaan (Warga/Anggota)
  SELECT id INTO v_base_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_a AND is_base_role = true;

  IF v_base_role_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: base role untuk Tenant A tidak ditemukan';
  END IF;

  -- Buat role Bendahara dengan izin keuangan
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_bendahara_role_id, v_tenant_a, 'Bendahara Stor Uji', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key) VALUES
    (v_bendahara_role_id, 'manage_billing_cash'),
    (v_bendahara_role_id, 'manage_billing_transfer'),
    (v_bendahara_role_id, 'manage_expenses');

  -- Tambahkan anggota Tenant A
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id) VALUES
    (v_tenant_a, v_bendahara_a, 'Bendahara A', 'approved', false, v_bendahara_role_id),
    (v_tenant_a, v_warga_a,     'Warga A',     'approved', false, v_base_role_id);

  -- 2.4 Tenant B (Kompleks Uji B)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks Uji Stor B', 'rt_rw', v_user_b)
  RETURNING id INTO v_tenant_b;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_b;

  -- 2.5 Path Uji
  v_canonical_proof_a             := v_tenant_a::text || '/payments/' || v_bill_id::text || '/proof_01.jpg';
  v_non_canonical_proof_traversal := v_tenant_a::text || '/../x';
  v_non_canonical_proof_no_pay    := v_tenant_a::text || '/uploads/' || v_bill_id::text || '/proof_01.jpg';
  v_non_canonical_proof_bad_bill  := v_tenant_a::text || '/payments/not-a-uuid/proof_01.jpg';

  v_canonical_receipt_a           := v_tenant_a::text || '/expenses/2026/receipt_01.pdf';
  v_non_canonical_receipt_year    := v_tenant_a::text || '/expenses/invalid_year/receipt.pdf';

  RAISE NOTICE '>> SETUP Berhasil!';

  -- ==============================================================================
  -- 3. TEST RUNTIME PRIVILEGE: anon DITOLAK
  -- ==============================================================================
  RAISE NOTICE '[TEST 3] Menguji penolakan eksekusi saat role anon...';

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('role', 'anon', true);

  -- 3.1 anon panggil can_upload_tenant_file -> error 42501
  v_caught_error := false;
  BEGIN
    PERFORM public.can_upload_tenant_file('payment_proof', v_tenant_a);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  END;

  IF NOT v_caught_error THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 3.1 GAGAL: role anon bisa mengeksekusi can_upload_tenant_file';
  END IF;

  -- 3.2 anon panggil can_read_tenant_file -> error 42501
  v_caught_error := false;
  BEGIN
    PERFORM public.can_read_tenant_file('payment_proof', v_canonical_proof_a);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  END;

  PERFORM set_config('role', 'postgres', true);

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 3.2 GAGAL: role anon bisa mengeksekusi can_read_tenant_file';
  END IF;

  RAISE NOTICE '>> PASSED: Test 3 (anon runtime rejection) Berhasil!';

  -- ==============================================================================
  -- 4. TEST can_upload_tenant_file('payment_proof', ...)
  -- ==============================================================================
  RAISE NOTICE '[TEST 4] Menguji upload payment_proof...';

  -- 4.1 Anggota aktif Tenant A (Warga A) -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('payment_proof', v_tenant_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 4.1 GAGAL: Anggota Tenant A (Warga) seharusnya bisa upload payment_proof (got %)', v_res;
  END IF;

  -- 4.2 Owner Tenant A -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('payment_proof', v_tenant_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 4.2 GAGAL: Owner Tenant A seharusnya bisa upload payment_proof (got %)', v_res;
  END IF;

  -- 4.3 User Tenant B ke Tenant A -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('payment_proof', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 4.3 GAGAL: User Tenant B seharusnya DITOLAK upload ke Tenant A (got %)', v_res;
  END IF;

  -- 4.4 Tenant A berstatus read_only -> FALSE untuk anggota Tenant A
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenant_subscriptions SET status = 'read_only' WHERE tenant_id = v_tenant_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('payment_proof', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 4.4 GAGAL: Upload payment_proof pada tenant read_only harus FALSE (got %)', v_res;
  END IF;

  -- Kembalikan status Tenant A ke active
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenant_subscriptions SET status = 'active' WHERE tenant_id = v_tenant_a;

  RAISE NOTICE '>> PASSED: Test 4 (can_upload_tenant_file payment_proof) Berhasil!';

  -- ==============================================================================
  -- 5. TEST can_read_tenant_file('payment_proof', ...)
  -- ==============================================================================
  RAISE NOTICE '[TEST 5] Menguji baca payment_proof...';

  -- 5.1 Owner A membaca path canonical Tenant A -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('payment_proof', v_canonical_proof_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.1 GAGAL: Owner A seharusnya bisa membaca bukti transfer (got %)', v_res;
  END IF;

  -- 5.2 Bendahara A (memiliki manage_billing_cash & manage_billing_transfer) -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('payment_proof', v_canonical_proof_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.2 GAGAL: Bendahara A seharusnya bisa membaca bukti transfer (got %)', v_res;
  END IF;

  -- 5.3 Warga biasa A (tanpa hak kelola transfer/cash) -> FALSE
  -- Catatan: Jika pengunggah bukti adalah Warga A sendiri, hak akses ditangani di Edge Function lewat metadata R2
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('payment_proof', v_canonical_proof_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.3 GAGAL: Warga biasa tanpa izin billing di database harus FALSE (got %)', v_res;
  END IF;

  -- 5.4 User Tenant B membaca bukti bayar Tenant A -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('payment_proof', v_canonical_proof_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.4 GAGAL: User Tenant B seharusnya DITOLAK membaca bukti Tenant A (got %)', v_res;
  END IF;

  -- 5.5 Platform Admin membaca bukti bayar Tenant A -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_platform_admin::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_platform_admin::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('payment_proof', v_canonical_proof_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.5 GAGAL: Platform Admin seharusnya bisa membaca bukti Tenant A (got %)', v_res;
  END IF;

  -- 5.6 Path non-canonical traversal ('A/../x') -> FALSE (bahkan untuk Owner dan Platform Admin)
  v_res := public.can_read_tenant_file('payment_proof', v_non_canonical_proof_traversal);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.6 GAGAL: Path traversal harus ditolak untuk Platform Admin (got %)', v_res;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('payment_proof', v_non_canonical_proof_traversal);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.6 GAGAL: Path traversal harus ditolak untuk Owner A (got %)', v_res;
  END IF;

  -- 5.7 Path tanpa segment '/payments/' -> FALSE
  v_res := public.can_read_tenant_file('payment_proof', v_non_canonical_proof_no_pay);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.7 GAGAL: Path tanpa /payments/ harus FALSE (got %)', v_res;
  END IF;

  -- 5.8 Path dengan format bill_id bukan UUID -> FALSE
  v_res := public.can_read_tenant_file('payment_proof', v_non_canonical_proof_bad_bill);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 5.8 GAGAL: Path dengan bill_id non-UUID harus FALSE (got %)', v_res;
  END IF;

  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE '>> PASSED: Test 5 (can_read_tenant_file payment_proof) Berhasil!';

  -- ==============================================================================
  -- 6. TEST can_upload_tenant_file('expense_receipt', ...)
  -- ==============================================================================
  RAISE NOTICE '[TEST 6] Menguji upload expense_receipt...';

  -- 6.1 Staf Tenant A dengan izin manage_expenses (Bendahara A) -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('expense_receipt', v_tenant_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 6.1 GAGAL: Bendahara A dengan manage_expenses harus bisa upload nota (got %)', v_res;
  END IF;

  -- 6.2 Warga biasa Tenant A (tanpa manage_expenses) -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('expense_receipt', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 6.2 GAGAL: Warga biasa A seharusnya DITOLAK upload nota (got %)', v_res;
  END IF;

  -- 6.3 User Tenant B ke Tenant A -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('expense_receipt', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 6.3 GAGAL: User Tenant B seharusnya DITOLAK upload nota Tenant A (got %)', v_res;
  END IF;

  -- 6.4 Tenant A read_only -> Staf A DITOLAK (FALSE)
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenant_subscriptions SET status = 'read_only' WHERE tenant_id = v_tenant_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('expense_receipt', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 6.4 GAGAL: Upload nota saat tenant read_only harus FALSE untuk staf (got %)', v_res;
  END IF;

  -- 6.5 Platform Admin -> TRUE (bahkan saat tenant read_only)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_platform_admin::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_platform_admin::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('expense_receipt', v_tenant_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 6.5 GAGAL: Platform Admin harus bisa upload nota (got %)', v_res;
  END IF;

  -- Kembalikan status Tenant A ke active
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenant_subscriptions SET status = 'active' WHERE tenant_id = v_tenant_a;

  RAISE NOTICE '>> PASSED: Test 6 (can_upload_tenant_file expense_receipt) Berhasil!';

  -- ==============================================================================
  -- 7. TEST can_read_tenant_file('expense_receipt', ...)
  -- ==============================================================================
  RAISE NOTICE '[TEST 7] Menguji baca expense_receipt...';

  -- 7.1 Staf Tenant A dengan manage_expenses (Bendahara A) -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('expense_receipt', v_canonical_receipt_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 7.1 GAGAL: Staf dengan manage_expenses harus bisa membaca nota (got %)', v_res;
  END IF;

  -- 7.2 Warga biasa Tenant A -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('expense_receipt', v_canonical_receipt_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 7.2 GAGAL: Warga biasa tanpa manage_expenses harus FALSE baca nota (got %)', v_res;
  END IF;

  -- 7.3 User Tenant B -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('expense_receipt', v_canonical_receipt_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 7.3 GAGAL: User Tenant B harus FALSE membaca nota Tenant A (got %)', v_res;
  END IF;

  -- 7.4 Platform Admin -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_platform_admin::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_platform_admin::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('expense_receipt', v_canonical_receipt_a);
  IF v_res IS NOT TRUE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 7.4 GAGAL: Platform Admin harus TRUE membaca nota (got %)', v_res;
  END IF;

  -- 7.5 Path non-canonical untuk staf (tahun tidak valid) -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.can_read_tenant_file('expense_receipt', v_non_canonical_receipt_year);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 7.5 GAGAL: Staf dengan path nota non-canonical harus FALSE (got %)', v_res;
  END IF;

  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE '>> PASSED: Test 7 (can_read_tenant_file expense_receipt) Berhasil!';

  -- ==============================================================================
  -- 8. TEST INPUT TIDAK DIKENAL & NULL INPUTS (HARUS BOOLEAN FALSE, BUKAN NULL)
  -- ==============================================================================
  RAISE NOTICE '[TEST 8] Menguji kind tidak dikenal dan perlakuan input NULL / kosong...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 8.1 p_kind tidak dikenal
  v_res := public.can_upload_tenant_file('unknown_kind', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.1 GAGAL: can_upload_tenant_file dengan kind tidak dikenal harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_read_tenant_file('unknown_kind', v_canonical_proof_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.1 GAGAL: can_read_tenant_file dengan kind tidak dikenal harus FALSE (got %)', v_res;
  END IF;

  -- 8.2 NULL inputs pada can_upload_tenant_file
  v_res := public.can_upload_tenant_file(NULL, v_tenant_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.2a GAGAL: can_upload_tenant_file(NULL, tenant) harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_upload_tenant_file('payment_proof', NULL);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.2b GAGAL: can_upload_tenant_file(payment_proof, NULL) harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_upload_tenant_file('expense_receipt', NULL);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.2c GAGAL: can_upload_tenant_file(expense_receipt, NULL) harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_upload_tenant_file(NULL, NULL);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.2d GAGAL: can_upload_tenant_file(NULL, NULL) harus FALSE (got %)', v_res;
  END IF;

  -- 8.3 NULL / kosong inputs pada can_read_tenant_file
  v_res := public.can_read_tenant_file(NULL, v_canonical_proof_a);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.3a GAGAL: can_read_tenant_file(NULL, path) harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_read_tenant_file('payment_proof', NULL);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.3b GAGAL: can_read_tenant_file(payment_proof, NULL) harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_read_tenant_file('payment_proof', '');
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.3c GAGAL: can_read_tenant_file(payment_proof, '''') harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_read_tenant_file('payment_proof', '   ');
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.3d GAGAL: can_read_tenant_file(payment_proof, ''   '') harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_read_tenant_file('expense_receipt', NULL);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.3e GAGAL: can_read_tenant_file(expense_receipt, NULL) harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_read_tenant_file('expense_receipt', '');
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.3f GAGAL: can_read_tenant_file(expense_receipt, '''') harus FALSE (got %)', v_res;
  END IF;

  v_res := public.can_read_tenant_file(NULL, NULL);
  IF v_res IS NOT FALSE THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 8.3g GAGAL: can_read_tenant_file(NULL, NULL) harus FALSE (got %)', v_res;
  END IF;

  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE '>> PASSED: Test 8 (Unknown kind & NULL inputs) Berhasil!';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST STORAGE R2 ACCESS MATRIX (STOR-1.1) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
