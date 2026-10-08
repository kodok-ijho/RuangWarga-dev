-- Test Suite: Function Grants & Security Definer Authorization Matrix
-- Task: SEC-1.2 (Ref: docs/handoff/SEC-1.md)
-- Date: 2026-10-08
--
-- File ini memvalidasi:
-- 1. Hak eksekusi has_function_privilege untuk anon, authenticated, service_role sesuai SEC-1.1.
-- 2. Skenario otorisasi runtime: Pemanggilan RPC lintas-tenant ditolak dengan SQLSTATE 42501.

BEGIN;

DO $$
DECLARE
  -- Test identities
  v_user_a UUID := gen_random_uuid();
  v_user_b UUID := gen_random_uuid();
  v_tenant_a UUID;
  v_tenant_b UUID;
  v_round_a UUID;

  -- Test helpers
  v_caught_error BOOLEAN;
  v_sqlstate TEXT;
  v_errmsg TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: FUNCTION GRANTS MATRIX (SEC-1.2)';
  RAISE NOTICE '============================================================';

  -- ============================================================
  -- 1. ASSERT FUNCTION PRIVILEGES (STATIC MATRIX CHECK)
  -- ============================================================
  RAISE NOTICE '[TEST 1] Memeriksa matrix has_function_privilege()...';

  -- 1A. PART A: Service Role Only (anon = FALSE, authenticated = FALSE, service_role = TRUE)
  -- -----------------------------------------------------------------------------------------
  -- activate_tenant_subscription(uuid, text)
  IF has_function_privilege('anon', 'public.activate_tenant_subscription(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: anon memiliki privilege EXECUTE pada activate_tenant_subscription';
  END IF;
  IF has_function_privilege('authenticated', 'public.activate_tenant_subscription(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: authenticated memiliki privilege EXECUTE pada activate_tenant_subscription';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.activate_tenant_subscription(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: service_role tidak memiliki privilege EXECUTE pada activate_tenant_subscription';
  END IF;

  -- activate_listing_payment(uuid, text)
  IF has_function_privilege('anon', 'public.activate_listing_payment(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: anon memiliki privilege EXECUTE pada activate_listing_payment';
  END IF;
  IF has_function_privilege('authenticated', 'public.activate_listing_payment(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: authenticated memiliki privilege EXECUTE pada activate_listing_payment';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.activate_listing_payment(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: service_role tidak memiliki privilege EXECUTE pada activate_listing_payment';
  END IF;

  -- check_subscription_expirations()
  IF has_function_privilege('anon', 'public.check_subscription_expirations()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: anon memiliki privilege EXECUTE pada check_subscription_expirations';
  END IF;
  IF has_function_privilege('authenticated', 'public.check_subscription_expirations()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: authenticated memiliki privilege EXECUTE pada check_subscription_expirations';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.check_subscription_expirations()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: service_role tidak memiliki privilege EXECUTE pada check_subscription_expirations';
  END IF;

  -- migrate_legacy_portal_warga(text, text, text)
  IF has_function_privilege('anon', 'public.migrate_legacy_portal_warga(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: anon memiliki privilege EXECUTE pada migrate_legacy_portal_warga';
  END IF;
  IF has_function_privilege('authenticated', 'public.migrate_legacy_portal_warga(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: authenticated memiliki privilege EXECUTE pada migrate_legacy_portal_warga';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.migrate_legacy_portal_warga(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: service_role tidak memiliki privilege EXECUTE pada migrate_legacy_portal_warga';
  END IF;

  -- handle_new_tenant()
  IF has_function_privilege('anon', 'public.handle_new_tenant()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: anon memiliki privilege EXECUTE pada handle_new_tenant';
  END IF;
  IF has_function_privilege('authenticated', 'public.handle_new_tenant()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: authenticated memiliki privilege EXECUTE pada handle_new_tenant';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.handle_new_tenant()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: service_role tidak memiliki privilege EXECUTE pada handle_new_tenant';
  END IF;

  -- handle_superadmin_user_created()
  IF has_function_privilege('anon', 'public.handle_superadmin_user_created()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: anon memiliki privilege EXECUTE pada handle_superadmin_user_created';
  END IF;
  IF has_function_privilege('authenticated', 'public.handle_superadmin_user_created()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: authenticated memiliki privilege EXECUTE pada handle_superadmin_user_created';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.handle_superadmin_user_created()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: service_role tidak memiliki privilege EXECUTE pada handle_superadmin_user_created';
  END IF;

  -- trg_check_arisan_billing_status()
  IF has_function_privilege('anon', 'public.trg_check_arisan_billing_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: anon memiliki privilege EXECUTE pada trg_check_arisan_billing_status';
  END IF;
  IF has_function_privilege('authenticated', 'public.trg_check_arisan_billing_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: authenticated memiliki privilege EXECUTE pada trg_check_arisan_billing_status';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.trg_check_arisan_billing_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1A GAGAL: service_role tidak memiliki privilege EXECUTE pada trg_check_arisan_billing_status';
  END IF;

  RAISE NOTICE '>> PASSED: Test 1A (Part A Service Role Only privilege checks) Berhasil!';

  -- 1B. PART B: Authenticated & Service Role (anon = FALSE, authenticated = TRUE, service_role = TRUE)
  -- -------------------------------------------------------------------------------------------------
  -- draw_arisan_winner(uuid, uuid, uuid)
  IF has_function_privilege('anon', 'public.draw_arisan_winner(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada draw_arisan_winner';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.draw_arisan_winner(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada draw_arisan_winner';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.draw_arisan_winner(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada draw_arisan_winner';
  END IF;

  -- start_new_arisan_cycle(uuid, uuid, boolean)
  IF has_function_privilege('anon', 'public.start_new_arisan_cycle(uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada start_new_arisan_cycle';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.start_new_arisan_cycle(uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada start_new_arisan_cycle';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.start_new_arisan_cycle(uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada start_new_arisan_cycle';
  END IF;

  -- generate_arisan_round_bills(uuid, uuid, date)
  IF has_function_privilege('anon', 'public.generate_arisan_round_bills(uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada generate_arisan_round_bills';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.generate_arisan_round_bills(uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada generate_arisan_round_bills';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.generate_arisan_round_bills(uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada generate_arisan_round_bills';
  END IF;

  -- auto_generate_kos_billing(text, uuid)
  IF has_function_privilege('anon', 'public.auto_generate_kos_billing(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada auto_generate_kos_billing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.auto_generate_kos_billing(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada auto_generate_kos_billing';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.auto_generate_kos_billing(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada auto_generate_kos_billing';
  END IF;

  -- checkout_kos_room(uuid, int, date, text, boolean)
  IF has_function_privilege('anon', 'public.checkout_kos_room(uuid, int, date, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada checkout_kos_room(int)';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.checkout_kos_room(uuid, int, date, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada checkout_kos_room(int)';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.checkout_kos_room(uuid, int, date, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada checkout_kos_room(int)';
  END IF;

  -- check_arisan_round_readiness(uuid)
  IF has_function_privilege('anon', 'public.check_arisan_round_readiness(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada check_arisan_round_readiness';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.check_arisan_round_readiness(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada check_arisan_round_readiness';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.check_arisan_round_readiness(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada check_arisan_round_readiness';
  END IF;

  -- get_tenant_opening_balance(uuid, date)
  IF has_function_privilege('anon', 'public.get_tenant_opening_balance(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada get_tenant_opening_balance';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_tenant_opening_balance(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada get_tenant_opening_balance';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_tenant_opening_balance(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada get_tenant_opening_balance';
  END IF;

  -- check_listing_expirations()
  IF has_function_privilege('anon', 'public.check_listing_expirations()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: anon memiliki privilege EXECUTE pada check_listing_expirations';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.check_listing_expirations()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: authenticated tidak memiliki privilege EXECUTE pada check_listing_expirations';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.check_listing_expirations()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1B GAGAL: service_role tidak memiliki privilege EXECUTE pada check_listing_expirations';
  END IF;

  RAISE NOTICE '>> PASSED: Test 1B (Part B Authenticated/Service Role privilege checks) Berhasil!';

  -- ============================================================
  -- 2. RUNTIME AUTHORIZATION GUARD MATRIX (CROSS-TENANT ISOLATION)
  -- ============================================================
  RAISE NOTICE '[TEST 2] Menguji authorization guard lintas-tenant saat dipanggil authenticated role...';

  -- Fixture: User A dan User B
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'user_a_sec12@tenant.invalid'),
    (v_user_b, 'user_b_sec12@tenant.invalid');

  -- Fixture: Tenant A dan Tenant B (tipe arisan)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Arisan Melati A', 'arisan', v_user_a)
  RETURNING id INTO v_tenant_a;

  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Arisan Mawar B', 'arisan', v_user_b)
  RETURNING id INTO v_tenant_b;

  -- Fixture: Arisan Round untuk Tenant A
  INSERT INTO public.arisan_rounds (
    tenant_id,
    round_number,
    period,
    total_pool_amount,
    status
  ) VALUES (
    v_tenant_a,
    1,
    '2026-10',
    1000000,
    'collecting'
  ) RETURNING id INTO v_round_a;

  -- Simulasikan konteks authenticated user B (tenant lain)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 2.1 Panggil draw_arisan_winner untuk Tenant A oleh User B -> harus gagal 42501
  v_caught_error := FALSE;
  BEGIN
    PERFORM public.draw_arisan_winner(v_tenant_a, v_round_a);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate = '42501' THEN
      v_caught_error := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 2.1 GAGAL: draw_arisan_winner menghasilkan SQLSTATE %, bukan 42501 (%s)', v_sqlstate, v_errmsg;
    END IF;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 2.1 GAGAL: draw_arisan_winner tidak ditolak untuk pemanggil lintas tenant';
  END IF;

  -- 2.2 Panggil start_new_arisan_cycle untuk Tenant A oleh User B -> harus gagal 42501
  v_caught_error := FALSE;
  BEGIN
    PERFORM public.start_new_arisan_cycle(v_tenant_a);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate = '42501' THEN
      v_caught_error := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 2.2 GAGAL: start_new_arisan_cycle menghasilkan SQLSTATE %, bukan 42501 (%s)', v_sqlstate, v_errmsg;
    END IF;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 2.2 GAGAL: start_new_arisan_cycle tidak ditolak untuk pemanggil lintas tenant';
  END IF;

  -- 2.3 Panggil generate_arisan_round_bills untuk Tenant A oleh User B -> harus gagal 42501
  v_caught_error := FALSE;
  BEGIN
    PERFORM public.generate_arisan_round_bills(v_tenant_a, v_round_a);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate = '42501' THEN
      v_caught_error := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 2.3 GAGAL: generate_arisan_round_bills menghasilkan SQLSTATE %, bukan 42501 (%s)', v_sqlstate, v_errmsg;
    END IF;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 2.3 GAGAL: generate_arisan_round_bills tidak ditolak untuk pemanggil lintas tenant';
  END IF;

  RAISE NOTICE '>> PASSED: Test 2 (Cross-tenant authorization guard) Berhasil!';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST FUNCTION GRANTS MATRIX (SEC-1.2) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
