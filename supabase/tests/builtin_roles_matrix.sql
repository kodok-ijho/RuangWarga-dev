-- Test Suite: Builtin Roles & Permissions Protection Matrix
-- Task: SEC-4.2 (Ref: docs/handoff/SEC-4.md, DEBT-1-review.md N3)
--
-- Kasus:
-- T1: manager UPDATE name pada role Admin -> 0 baris (ROW_COUNT)
-- T2: manager INSERT tenant_role_permissions (role Warga/Anggota, manage_billing_cash) -> error 42501
-- T3: manager UPDATE permission_key pada baris milik role Admin -> 0 baris
-- T4: manager INSERT tenant_roles dengan is_base_role = true, lalu is_owner_role = true -> error 42501 (keduanya)
-- T5: manager UPDATE is_owner_role = true pada role Pengelola -> error 42501 (hak kolom)
-- T6: manager buat role kustom baru -> tambah izin view_reports -> ganti nama -> berhasil
-- T7: owner ulangi T1 dan T2 -> 0 baris / 42501
-- T8: warga has_permission(tenant, 'manage_billing_cash') -> false
-- T9: user baru insert tenant baru -> trigger provisioning menghasilkan 2 role bawaan & 10 izin Admin
--
-- Seluruh pengujian dibungkus blok DO dan diakhiri dengan RAISE EXCEPTION 'SEC-4 PASSED'
-- agar semua data uji di-rollback secara otomatis.

DO $$
DECLARE
  v_owner_id UUID := gen_random_uuid();
  v_manager_id UUID := gen_random_uuid();
  v_warga_id UUID := gen_random_uuid();
  v_new_user_id UUID := gen_random_uuid();

  v_tenant_id UUID := gen_random_uuid();
  v_new_tenant_id UUID := gen_random_uuid();

  v_admin_role_id UUID;
  v_base_role_id UUID;
  v_manager_role_id UUID := gen_random_uuid();
  v_custom_role_id UUID;

  v_row_count INTEGER;
  v_err_code TEXT;
  v_has_perm BOOLEAN;
  v_count INTEGER;
BEGIN
  -- ==============================================================================
  -- 0. SETUP AWAL (SEBAGAI POSTGRES)
  -- ==============================================================================

  -- Buat user auth
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_owner_id, 'owner-sec4-' || v_owner_id || '@example.test', 'authenticated', 'authenticated');

  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_manager_id, 'manager-sec4-' || v_manager_id || '@example.test', 'authenticated', 'authenticated');

  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_warga_id, 'warga-sec4-' || v_warga_id || '@example.test', 'authenticated', 'authenticated');

  -- Insert tenant (trigger handle_new_tenant membuat 2 role bawaan & member owner)
  INSERT INTO public.tenants (id, name, type, owner_id, address)
  VALUES (v_tenant_id, 'Kompleks Uji SEC-4', 'kos', v_owner_id, 'Jl. Uji Keamanan No. 4');

  -- Ambil role bawaan
  SELECT id INTO v_admin_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_id AND is_owner_role = true
  LIMIT 1;

  SELECT id INTO v_base_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_id AND is_base_role = true
  LIMIT 1;

  IF v_admin_role_id IS NULL OR v_base_role_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: role bawaan tidak ditemukan';
  END IF;

  -- Buat role kustom 'Pengelola' dengan izin manage_tenant_users
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_manager_role_id, v_tenant_id, 'Pengelola', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES (v_manager_role_id, 'manage_tenant_users');

  -- Daftarkan manager sebagai member approved dengan role Pengelola
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_id, v_manager_id, 'Manager Uji', 'approved', false, v_manager_role_id);

  -- Daftarkan warga sebagai member approved dengan role Warga/Anggota
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_id, v_warga_id, 'Warga Uji', 'approved', false, v_base_role_id);


  -- ==============================================================================
  -- T1: Manager UPDATE nama pada role Admin -> 0 baris (USING filter)
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.tenant_roles
  SET name = 'Admin Dibajak'
  WHERE id = v_admin_role_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  PERFORM set_config('role', 'postgres', true);
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: Manager bisa mengubah nama role Admin (row_count = %)', v_row_count;
  END IF;


  -- ==============================================================================
  -- T2: Manager INSERT izin ke role Warga/Anggota -> error 42501 (WITH CHECK)
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_err_code := '';
  BEGIN
    INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
    VALUES (v_base_role_id, 'manage_billing_cash');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST 2 GAGAL: INSERT izin ke role Warga harus error 42501, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T3: Manager UPDATE baris izin milik role Admin -> 0 baris (USING filter)
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.tenant_role_permissions
  SET permission_key = 'view_reports'
  WHERE tenant_role_id = v_admin_role_id AND permission_key = 'manage_billing_cash';
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  PERFORM set_config('role', 'postgres', true);
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3 GAGAL: Manager bisa mengubah izin role Admin (row_count = %)', v_row_count;
  END IF;


  -- ==============================================================================
  -- T4: Manager INSERT role dengan flag bawaan -> error 42501
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- 4a: is_base_role = true
  v_err_code := '';
  BEGIN
    INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
    VALUES (v_tenant_id, 'Palsu Base', false, true);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  IF v_err_code <> '42501' THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 4a GAGAL: INSERT role dengan is_base_role=true harus error 42501, didapat: %', v_err_code;
  END IF;

  -- 4b: is_owner_role = true
  v_err_code := '';
  BEGIN
    INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
    VALUES (v_tenant_id, 'Palsu Owner', true, false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END IF;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST 4b GAGAL: INSERT role dengan is_owner_role=true harus error 42501, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T5: Manager UPDATE is_owner_role = true pada role Pengelola -> error 42501 (hak kolom)
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_err_code := '';
  BEGIN
    UPDATE public.tenant_roles
    SET is_owner_role = true
    WHERE id = v_manager_role_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST 5 GAGAL: UPDATE kolom is_owner_role harus ditolak izin kolom 42501, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T6: Manager buat role kustom baru -> tambah izin -> ganti nama -> berhasil
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_custom_role_id := gen_random_uuid();
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_custom_role_id, v_tenant_id, 'Role Uji Kustom', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES (v_custom_role_id, 'view_reports');

  UPDATE public.tenant_roles
  SET name = 'Role Uji Kustom Baru'
  WHERE id = v_custom_role_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  PERFORM set_config('role', 'postgres', true);
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST 6 GAGAL: Manager harus bisa rename role kustom (row_count = %)', v_row_count;
  END IF;


  -- ==============================================================================
  -- T7: Owner ulangi T1 dan T2 -> 0 baris / 42501 (owner juga dibatasi)
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- 7a: Owner update role Admin
  UPDATE public.tenant_roles
  SET name = 'Admin Diubah Owner'
  WHERE id = v_admin_role_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count <> 0 THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'TEST 7a GAGAL: Owner juga tidak boleh mengubah role Admin (row_count = %)', v_row_count;
  END IF;

  -- 7b: Owner insert izin ke role Warga/Anggota
  v_err_code := '';
  BEGIN
    INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
    VALUES (v_base_role_id, 'manage_billing_cash');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST 7b GAGAL: Owner INSERT izin ke role Warga harus error 42501, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T8: Warga has_permission(tenant, 'manage_billing_cash') -> false
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT public.has_permission(v_tenant_id, 'manage_billing_cash') INTO v_has_perm;

  PERFORM set_config('role', 'postgres', true);
  IF v_has_perm IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 8 GAGAL: Warga seharusnya tidak punya izin manage_billing_cash, got: %', v_has_perm;
  END IF;


  -- ==============================================================================
  -- T9: User baru (authenticated) insert tenant baru -> trigger provisioning aman
  -- ==============================================================================
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_new_user_id, 'newuser-sec4-' || v_new_user_id || '@example.test', 'authenticated', 'authenticated');

  PERFORM set_config('request.jwt.claim.sub', v_new_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.tenants (id, name, type, owner_id, address)
  VALUES (v_new_tenant_id, 'Tenant Baru Provisioning', 'rt_rw', v_new_user_id, 'Jl. Baru No. 1');

  PERFORM set_config('role', 'postgres', true);

  -- Pastikan 2 role bawaan terbuat
  SELECT count(*) INTO v_count
  FROM public.tenant_roles
  WHERE tenant_id = v_new_tenant_id;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'TEST 9 GAGAL: Tenant baru harus punya 2 role bawaan, got: %', v_count;
  END IF;

  -- Pastikan role Admin punya 10 izin lengkap
  SELECT count(*) INTO v_count
  FROM public.tenant_role_permissions trp
  JOIN public.tenant_roles tr ON tr.id = trp.tenant_role_id
  WHERE tr.tenant_id = v_new_tenant_id AND tr.is_owner_role = true;

  IF v_count <> 10 THEN
    RAISE EXCEPTION 'TEST 9 GAGAL: Role Admin harus punya 10 izin lengkap, got: %', v_count;
  END IF;

  -- Akhiri dengan exception agar seluruh transaksi di-rollback otomatis
  RAISE EXCEPTION 'SEC-4 PASSED';
END $$;
