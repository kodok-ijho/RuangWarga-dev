-- Test Suite: Tenant Invites & Settings Audit Matrix
-- Task: SEC-3.5 (Ref: docs/handoff/SEC-3.md, SEC-3.1, SEC-3.2, SEC-3.3)
-- Skenario:
-- T1: Owner bisa SELECT tenant_invites miliknya.
-- T2: Warga biasa (anggota approved, bukan owner) mendapat 0 baris saat SELECT tenant_invites.
-- T3: Anon mendapat 0 baris saat SELECT tenant_invites.
-- T4: RPC get_invite_details('<kode>') sebagai anon mengembalikan found = true.
-- T5: Update tenants.settings dengan 'invite_code' -> kunci otomatis dihapus dari settings dan kode disimpan di tenant_invites.
-- T6: Update settings.bank_account membuat baris log di tenant_settings_audit.
-- T7: Warga biasa mendapat 0 baris saat SELECT tenant_settings_audit.
-- T8: Owner tenant bisa SELECT riwayat di tenant_settings_audit.
--
-- Semua data uji di-ROLLBACK di akhir transaksi.
-- Hasil lulus: NOTICE 'SEC3_MATRIX_ALL_PASSED [T1 T2 T3 T4 T5 T6 T7 T8]'.

BEGIN;

DO $$
DECLARE
  v_owner_user_id UUID := gen_random_uuid();
  v_regular_user_id UUID := gen_random_uuid();
  v_tenant_id UUID := gen_random_uuid();
  v_member_owner_id UUID;
  v_member_role_id UUID;
  v_count INTEGER;
  v_rpc_res JSONB;
  v_has_key BOOLEAN;
  v_code TEXT;
  v_results TEXT := '';
BEGIN
  -- 1. Setup User & Tenant (sebagai postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_owner_user_id, 'owner-sec3-' || v_owner_user_id || '@example.test', 'authenticated', 'authenticated');

  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_regular_user_id, 'warga-sec3-' || v_regular_user_id || '@example.test', 'authenticated', 'authenticated');

  -- handle_new_tenant membuat subscription trial + 2 role + member owner
  INSERT INTO public.tenants (id, name, type, owner_id, address)
  VALUES (v_tenant_id, 'Kompleks Uji Keamanan SEC-3', 'kos', v_owner_user_id, 'Jl. Palm Uji No. 3');

  SELECT id INTO v_member_owner_id
  FROM public.tenant_members
  WHERE tenant_id = v_tenant_id AND user_id = v_owner_user_id;

  IF v_member_owner_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: member owner tidak ditemukan';
  END IF;

  UPDATE public.tenant_members SET status = 'approved' WHERE id = v_member_owner_id;

  -- Cari role dasar Warga/Anggota milik tenant ini
  SELECT id INTO v_member_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_id AND is_base_role = true
  LIMIT 1;

  IF v_member_role_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: role dasar (is_base_role) tidak ditemukan';
  END IF;

  -- Buat member biasa untuk warga
  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    full_name,
    status,
    is_owner,
    tenant_role_id
  ) VALUES (
    v_tenant_id,
    v_regular_user_id,
    'Warga Uji Coba',
    'approved',
    false,
    v_member_role_id
  );

  -- Set invite_code awal di tenant_invites
  INSERT INTO public.tenant_invites (tenant_id, code)
  VALUES (v_tenant_id, 'RW-KOS-7788')
  ON CONFLICT (tenant_id) DO UPDATE SET code = EXCLUDED.code;

  -- ==============================================================================
  -- T1: Owner bisa SELECT tenant_invites miliknya
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_count
  FROM public.tenant_invites
  WHERE tenant_id = v_tenant_id;

  PERFORM set_config('role', 'postgres', true);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: Owner gagal SELECT tenant_invites (count = %)', v_count;
  END IF;
  v_results := v_results || 'T1 ';

  -- ==============================================================================
  -- T2: Warga biasa mendapat 0 baris saat SELECT tenant_invites
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_regular_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_count
  FROM public.tenant_invites
  WHERE tenant_id = v_tenant_id;

  PERFORM set_config('role', 'postgres', true);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2 GAGAL: Warga biasa bisa melihat tenant_invites (count = %)', v_count;
  END IF;
  v_results := v_results || 'T2 ';

  -- ==============================================================================
  -- T3: Anon mendapat 0 baris saat SELECT tenant_invites
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('role', 'anon', true);

  SELECT count(*) INTO v_count
  FROM public.tenant_invites
  WHERE tenant_id = v_tenant_id;

  PERFORM set_config('role', 'postgres', true);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3 GAGAL: Anon bisa melihat tenant_invites (count = %)', v_count;
  END IF;
  v_results := v_results || 'T3 ';

  -- ==============================================================================
  -- T4: RPC get_invite_details('<kode>') sebagai anon mengembalikan found = true
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('role', 'anon', true);

  v_rpc_res := public.get_invite_details('RW-KOS-7788');

  PERFORM set_config('role', 'postgres', true);
  IF (v_rpc_res->>'found')::boolean IS NOT TRUE OR (v_rpc_res->>'tenant_id')::uuid <> v_tenant_id THEN
    RAISE EXCEPTION 'TEST 4 GAGAL: get_invite_details gagal untuk anon: %', v_rpc_res;
  END IF;
  v_results := v_results || 'T4 ';

  -- ==============================================================================
  -- T5: Update tenants.settings dengan 'invite_code' -> kunci otomatis dihapus dari settings dan kode ada di tenant_invites
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  UPDATE public.tenants
  SET settings = jsonb_build_object('invite_code', 'RW-SYNC-9999', 'note', 'uji jaring pengaman')
  WHERE id = v_tenant_id;

  SELECT (settings ? 'invite_code') INTO v_has_key
  FROM public.tenants
  WHERE id = v_tenant_id;

  SELECT code INTO v_code
  FROM public.tenant_invites
  WHERE tenant_id = v_tenant_id;

  IF v_has_key IS TRUE OR v_code <> 'RW-SYNC-9999' THEN
    RAISE EXCEPTION 'TEST 5 GAGAL: Trigger jaring pengaman gagal. has_key: %, code: %', v_has_key, v_code;
  END IF;
  v_results := v_results || 'T5 ';

  -- ==============================================================================
  -- T6: Update settings.bank_account membuat baris di tenant_settings_audit
  -- ==============================================================================
  UPDATE public.tenants
  SET settings = settings || jsonb_build_object(
    'bank_account', jsonb_build_object('bank_name', 'BCA', 'account_number', '8830123456', 'account_holder', 'Kas RT Uji')
  )
  WHERE id = v_tenant_id;

  SELECT count(*) INTO v_count
  FROM public.tenant_settings_audit
  WHERE tenant_id = v_tenant_id AND field = 'bank_account';

  IF v_count < 1 THEN
    RAISE EXCEPTION 'TEST 6 GAGAL: Log audit rekening tidak terbuat di tenant_settings_audit (count = %)', v_count;
  END IF;
  v_results := v_results || 'T6 ';

  -- ==============================================================================
  -- T7: Warga biasa mendapat 0 baris saat SELECT tenant_settings_audit
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_regular_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_count
  FROM public.tenant_settings_audit
  WHERE tenant_id = v_tenant_id;

  PERFORM set_config('role', 'postgres', true);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7 GAGAL: Warga biasa bisa melihat tenant_settings_audit (count = %)', v_count;
  END IF;
  v_results := v_results || 'T7 ';

  -- ==============================================================================
  -- T8: Owner tenant bisa SELECT riwayat di tenant_settings_audit
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_count
  FROM public.tenant_settings_audit
  WHERE tenant_id = v_tenant_id;

  PERFORM set_config('role', 'postgres', true);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'TEST 8 GAGAL: Owner gagal melihat riwayat tenant_settings_audit (count = %)', v_count;
  END IF;
  v_results := v_results || 'T8';

  RAISE NOTICE 'SEC3_MATRIX_ALL_PASSED [%]', v_results;
END $$;

ROLLBACK;
