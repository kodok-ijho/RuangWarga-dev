-- Test Suite: Checkout Kos Room Overload Check
-- Task: VERT-2.1 (Ref: docs/handoff/VERT-2.md § VERT-2.1)
-- Date: 2026-10-21
--
-- File ini memvalidasi:
-- 1. Hanya ada 1 fungsi public.checkout_kos_room di pg_proc.
-- 2. Fungsi tersebut memiliki argumen p_unit_id bertipe bigint (bukan integer).
-- 3. Hak akses execute: anon DITOLAK (false), authenticated & service_role DIIZINKAN (true).

BEGIN;

DO $$
DECLARE
  v_func_count INT;
  v_args TEXT;
  v_has_anon BOOLEAN;
  v_has_auth BOOLEAN;
  v_has_service BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST: CHECKOUT_KOS_ROOM OVERLOAD VERIFICATION (VERT-2.1)';
  RAISE NOTICE '============================================================';

  -- 1. Periksa jumlah overload checkout_kos_room di schema public
  SELECT count(*)
  INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'checkout_kos_room';

  IF v_func_count != 1 THEN
    RAISE EXCEPTION 'TEST GAGAL: Ditemukan % fungsi public.checkout_kos_room (ekspektasi: tepat 1 fungsi)', v_func_count;
  END IF;

  -- 2. Periksa argumen fungsi yang tersisa (harus bigint)
  SELECT pg_get_function_identity_arguments(p.oid)
  INTO v_args
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'checkout_kos_room';

  RAISE NOTICE 'Argumen fungsi ditemukan: %', v_args;

  IF v_args NOT LIKE '%bigint%' THEN
    RAISE EXCEPTION 'TEST GAGAL: Argumen fungsi tidak mengandung bigint: %', v_args;
  END IF;

  IF v_args LIKE '%integer%' THEN
    RAISE EXCEPTION 'TEST GAGAL: Overload integer masih terdeteksi pada argumen: %', v_args;
  END IF;

  -- 3. Periksa hak akses privilege fungsi bigint
  v_has_anon := has_function_privilege('anon', 'public.checkout_kos_room(uuid, bigint, date, text, boolean)', 'EXECUTE');
  v_has_auth := has_function_privilege('authenticated', 'public.checkout_kos_room(uuid, bigint, date, text, boolean)', 'EXECUTE');
  v_has_service := has_function_privilege('service_role', 'public.checkout_kos_room(uuid, bigint, date, text, boolean)', 'EXECUTE');

  IF v_has_anon THEN
    RAISE EXCEPTION 'TEST GAGAL: anon memiliki privilege EXECUTE pada checkout_kos_room(uuid, bigint, date, text, boolean)';
  END IF;

  IF NOT v_has_auth THEN
    RAISE EXCEPTION 'TEST GAGAL: authenticated TIDAK memiliki privilege EXECUTE pada checkout_kos_room(uuid, bigint, date, text, boolean)';
  END IF;

  IF NOT v_has_service THEN
    RAISE EXCEPTION 'TEST GAGAL: service_role TIDAK memiliki privilege EXECUTE pada checkout_kos_room(uuid, bigint, date, text, boolean)';
  END IF;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TEST SUKSES: Overload checkout_kos_room valid (1 fungsi bigint)';
  RAISE NOTICE '============================================================';
END;
$$;

ROLLBACK;
