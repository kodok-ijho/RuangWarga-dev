-- Test Suite: Membership, Tenant, and Payment Integrity Protection Matrix
-- Task: SEC-5.6 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S1-S7)
--
-- Skenario:
-- T1: outsider insert langsung tenant_members -> error 42501
-- T2: outsider request_join_tenant -> pending role dasar; panggilan ke-2 -> 23505; kode salah -> P0002
-- T3: warga UPDATE miliknya (role Admin, is_owner, status, role Bendahara) -> 42501; update full_name -> berhasil (1 baris)
-- T4: warga buat tenant sendiri lalu pasang role Admin miliknya di tenant uji -> error 42501 (S3)
-- T5: pengurus setujui calon T2 -> berhasil (1 baris); pasang role Bendahara -> error 42501
-- T6: owner pasang role Bendahara lalu kembalikan ke dasar -> berhasil; pasang role Admin -> berhasil
-- T7: sekre ubah owner_id / type -> error 42501; ubah settings dengan legacy_qris_enabled -> flag dibersihkan
-- T8: warga insert payments completed / cash / amount 1 -> 42501 / 42501 / 22023
-- T9: warga insert payments bank_transfer pending_verification 150000 -> berhasil; tagihan pending_verification; insert ke-2 -> 23505
-- T10: bendahara insert cash completed tagihan unit lain -> berhasil; tagihan paid
-- T11: warga insert storage.objects bucket payment-proofs tenant uji -> berhasil; tenant lain -> 42501; SELECT objek milik orang lain -> 0 baris
-- T12: owner insert 2 tagihan IPL (tenant, unit, period) sama -> yang ke-2 error 23505
-- T13: user baru buat tenant baru -> member owner is_owner=true tetap terbentuk (definer provisioning utuh)
--
-- Seluruh pengujian dibungkus blok DO dan diakhiri dengan RAISE EXCEPTION 'SEC-5 PASSED'
-- agar semua data uji di-rollback secara otomatis.

DO $$
DECLARE
  v_owner_id UUID := gen_random_uuid();
  v_bendahara_id UUID := gen_random_uuid();
  v_sekre_id UUID := gen_random_uuid();
  v_pengurus_id UUID := gen_random_uuid();
  v_warga_id UUID := gen_random_uuid();
  v_outsider_id UUID := gen_random_uuid();
  v_new_user_id UUID := gen_random_uuid();

  v_tenant_id UUID := gen_random_uuid();
  v_new_tenant_id UUID := gen_random_uuid();
  v_other_tenant_id UUID := gen_random_uuid();
  v_warga_own_tenant_id UUID := gen_random_uuid();

  v_admin_role_id UUID;
  v_base_role_id UUID;
  v_bendahara_role_id UUID := gen_random_uuid();
  v_sekre_role_id UUID := gen_random_uuid();
  v_pengurus_role_id UUID := gen_random_uuid();
  v_warga_own_admin_role_id UUID;

  v_unit_1_id BIGINT := 90001;
  v_unit_2_id BIGINT := 90002;
  v_warga_member_id UUID;
  v_bill_1_id UUID := gen_random_uuid();
  v_bill_2_id UUID := gen_random_uuid();

  v_join_res JSONB;
  v_row_count INTEGER;
  v_err_code TEXT;
  v_bill_status public.billing_status;
  v_settings JSONB;
  v_stored_count INTEGER;
  v_obj_id UUID;
BEGIN
  -- ==============================================================================
  -- 0. SETUP AWAL (SEBAGAI POSTGRES)
  -- ==============================================================================

  -- Buat user auth
  INSERT INTO auth.users (id, email, aud, role)
  VALUES
    (v_owner_id, 'owner-sec5-' || v_owner_id || '@example.test', 'authenticated', 'authenticated'),
    (v_bendahara_id, 'bendahara-sec5-' || v_bendahara_id || '@example.test', 'authenticated', 'authenticated'),
    (v_sekre_id, 'sekre-sec5-' || v_sekre_id || '@example.test', 'authenticated', 'authenticated'),
    (v_pengurus_id, 'pengurus-sec5-' || v_pengurus_id || '@example.test', 'authenticated', 'authenticated'),
    (v_warga_id, 'warga-sec5-' || v_warga_id || '@example.test', 'authenticated', 'authenticated'),
    (v_outsider_id, 'outsider-sec5-' || v_outsider_id || '@example.test', 'authenticated', 'authenticated'),
    (v_new_user_id, 'newuser-sec5-' || v_new_user_id || '@example.test', 'authenticated', 'authenticated');

  -- Buat tenant uji (trigger handle_new_tenant membuat 2 role bawaan & member owner)
  INSERT INTO public.tenants (id, name, type, owner_id, address)
  VALUES (v_tenant_id, 'Kompleks RT-RW Uji SEC-5', 'rt_rw', v_owner_id, 'Jl. Mawar Indah No. 5');

  -- Buat tenant lain pembanding
  INSERT INTO public.tenants (id, name, type, owner_id, address)
  VALUES (v_other_tenant_id, 'Kompleks Lain SEC-5', 'rt_rw', v_owner_id, 'Jl. Melati No. 1');

  -- Ambil role bawaan tenant uji
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

  -- Buat role kustom: Bendahara, Sekretaris, Pengurus
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES
    (v_bendahara_role_id, v_tenant_id, 'Bendahara', false, false),
    (v_sekre_role_id, v_tenant_id, 'Sekretaris', false, false),
    (v_pengurus_role_id, v_tenant_id, 'Pengurus', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES
    (v_bendahara_role_id, 'manage_billing_cash'),
    (v_bendahara_role_id, 'manage_billing_transfer'),
    (v_sekre_role_id, 'manage_settings'),
    (v_pengurus_role_id, 'manage_members');

  -- Buat unit A1 dan A2
  INSERT INTO public.tenant_units (id, tenant_id, label, is_active)
  VALUES
    (v_unit_1_id, v_tenant_id, 'A1', true),
    (v_unit_2_id, v_tenant_id, 'A2', true);

  -- Daftarkan member approved: bendahara, sekre, pengurus
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES
    (v_tenant_id, v_bendahara_id, 'Bendahara Uji', 'approved', false, v_bendahara_role_id),
    (v_tenant_id, v_sekre_id, 'Sekretaris Uji', 'approved', false, v_sekre_role_id),
    (v_tenant_id, v_pengurus_id, 'Pengurus Uji', 'approved', false, v_pengurus_role_id);

  -- Daftarkan warga approved dengan role dasar di unit A1
  INSERT INTO public.tenant_members (tenant_id, user_id, unit_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_id, v_warga_id, v_unit_1_id, 'Warga Uji', 'approved', false, v_base_role_id)
  RETURNING id INTO v_warga_member_id;

  -- Buat kode undangan aktif RW-TEST-SEC5
  INSERT INTO public.tenant_invites (tenant_id, code, max_uses, uses_count, expires_at, created_by)
  VALUES (v_tenant_id, 'RW-TEST-SEC5', 100, 0, now() + interval '7 days', v_owner_id);

  -- Buat 1 tagihan IPL unpaid untuk warga (unit A1)
  INSERT INTO public.billing_items (id, tenant_id, unit_id, member_id, period, amount, late_fee, status, metadata)
  VALUES (v_bill_1_id, v_tenant_id, v_unit_1_id, v_warga_member_id, '2026-10', 150000, 0, 'unpaid', jsonb_build_object('bill_type', 'ipl'));

  -- Buat 1 tagihan IPL unpaid untuk unit A2
  INSERT INTO public.billing_items (id, tenant_id, unit_id, member_id, period, amount, late_fee, status, metadata)
  VALUES (v_bill_2_id, v_tenant_id, v_unit_2_id, NULL, '2026-10', 200000, 0, 'unpaid', jsonb_build_object('bill_type', 'ipl'));


  -- ==============================================================================
  -- T1: Outsider INSERT langsung tenant_members (status='approved') -> error 42501
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_outsider_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_err_code := '';
  BEGIN
    INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
    VALUES (v_tenant_id, v_outsider_id, 'Hacker Infiltrator', 'approved', false, v_base_role_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T1 GAGAL: Outsider insert langsung tenant_members harus error 42501, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T2: Outsider request_join_tenant -> pending role dasar; ke-2 -> 23505; salah -> P0002
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_outsider_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Panggilan kode salah -> P0002
  v_err_code := '';
  BEGIN
    PERFORM public.request_join_tenant('KODE-SALAH-123', NULL, 'Calon Warga', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> 'P0002' THEN
    RAISE EXCEPTION 'TEST T2a GAGAL: request_join_tenant kode salah harus error P0002, didapat: %', v_err_code;
  END IF;

  -- Panggilan valid pertama -> berhasil, pending role dasar
  v_join_res := public.request_join_tenant('rw-test-sec5', NULL, 'Calon Warga', NULL, NULL);
  IF (v_join_res->>'status') <> 'pending' THEN
    RAISE EXCEPTION 'TEST T2b GAGAL: hasil request_join_tenant status bukan pending: %', v_join_res;
  END IF;

  -- Panggilan ke-2 -> 23505 (duplikat pendaftaran)
  v_err_code := '';
  BEGIN
    PERFORM public.request_join_tenant('rw-test-sec5', NULL, 'Calon Warga', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '23505' THEN
    RAISE EXCEPTION 'TEST T2c GAGAL: panggilan ke-2 request_join_tenant harus error 23505, didapat: %', v_err_code;
  END IF;

  PERFORM set_config('role', 'postgres', true);


  -- ==============================================================================
  -- T3: Warga UPDATE miliknya: Admin/is_owner/status/Bendahara -> 42501; full_name -> berhasil
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Coba pasang role Admin ke diri sendiri -> 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenant_members SET tenant_role_id = v_admin_role_id
    WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T3a GAGAL: Warga ubah role jadi Admin harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Coba ubah is_owner = true -> 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenant_members SET is_owner = true
    WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T3b GAGAL: Warga ubah is_owner jadi true harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Coba ubah status -> 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenant_members SET status = 'rejected'
    WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T3c GAGAL: Warga ubah status harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Coba pasang role Bendahara ke diri sendiri -> 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenant_members SET tenant_role_id = v_bendahara_role_id
    WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T3d GAGAL: Warga ubah role jadi Bendahara harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Update full_name milik sendiri -> Berhasil (1 baris)
  UPDATE public.tenant_members SET full_name = 'Warga Terverifikasi'
  WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST T3e GAGAL: Warga update full_name harus berhasil (row_count = %)', v_row_count;
  END IF;

  PERFORM set_config('role', 'postgres', true);


  -- ==============================================================================
  -- T4: Warga buat tenant sendiri, pasang role Admin miliknya di tenant uji -> error 42501 (S3)
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Warga buat tenant sendiri
  INSERT INTO public.tenants (id, name, type, owner_id)
  VALUES (v_warga_own_tenant_id, 'Kompleks Warga Mandiri', 'rt_rw', v_warga_id);

  -- Ambil role admin dari tenant milik warga
  SELECT id INTO v_warga_own_admin_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_warga_own_tenant_id AND is_owner_role = true
  LIMIT 1;

  -- Coba pasang role admin luar tersebut di tenant uji -> error 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenant_members
    SET tenant_role_id = v_warga_own_admin_role_id
    WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T4 GAGAL: Pasang foreign tenant role harus error 42501, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T5: Pengurus (manage_members) setujui calon T2 -> 1 baris; pasang Bendahara -> 42501
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_pengurus_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Setujui calon dari T2
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE tenant_id = v_tenant_id AND user_id = v_outsider_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST T5a GAGAL: Pengurus setujui calon harus 1 baris (didapat: %)', v_row_count;
  END IF;

  -- Coba pasang role Bendahara (bukan role dasar) -> 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenant_members
    SET tenant_role_id = v_bendahara_role_id
    WHERE tenant_id = v_tenant_id AND user_id = v_outsider_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T5b GAGAL: Pengurus pasang role Bendahara harus error 42501, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T6: Owner pasang role Bendahara lalu kembalikan ke dasar; pasang role Admin -> berhasil
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Pasang Bendahara ke warga
  UPDATE public.tenant_members
  SET tenant_role_id = v_bendahara_role_id
  WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST T6a GAGAL: Owner pasang role Bendahara harus 1 baris (didapat: %)', v_row_count;
  END IF;

  -- Kembalikan ke role dasar
  UPDATE public.tenant_members
  SET tenant_role_id = v_base_role_id
  WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST T6b GAGAL: Owner kembalikan role dasar harus 1 baris (didapat: %)', v_row_count;
  END IF;

  -- Pasang role Admin ke warga
  UPDATE public.tenant_members
  SET tenant_role_id = v_admin_role_id
  WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST T6c GAGAL: Owner pasang role Admin harus 1 baris (didapat: %)', v_row_count;
  END IF;

  -- Kembalikan lagi warga ke role dasar agar siap untuk pengujian T8-T9
  UPDATE public.tenant_members
  SET tenant_role_id = v_base_role_id
  WHERE tenant_id = v_tenant_id AND user_id = v_warga_id;

  PERFORM set_config('role', 'postgres', true);


  -- ==============================================================================
  -- T7: Sekretaris (manage_settings) ubah owner_id/type -> 42501; ubah legacy_qris -> flag disaring
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_sekre_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Coba ubah owner_id -> error 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenants SET owner_id = v_sekre_id WHERE id = v_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T7a GAGAL: Ubah owner_id harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Coba ubah type -> error 42501
  v_err_code := '';
  BEGIN
    UPDATE public.tenants SET type = 'kos' WHERE id = v_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T7b GAGAL: Ubah type tenant harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Ubah settings menyertakan legacy_qris_enabled: true dan logo_url
  UPDATE public.tenants
  SET settings = jsonb_build_object('legacy_qris_enabled', true, 'logo_url', 'https://example.com/logo.png')
  WHERE id = v_tenant_id;

  PERFORM set_config('role', 'postgres', true);

  SELECT settings INTO v_settings FROM public.tenants WHERE id = v_tenant_id;
  IF (v_settings->>'logo_url') <> 'https://example.com/logo.png' THEN
    RAISE EXCEPTION 'TEST T7c GAGAL: logo_url tidak tersimpan di settings: %', v_settings;
  END IF;
  IF v_settings ? 'legacy_qris_enabled' THEN
    RAISE EXCEPTION 'TEST T7d GAGAL: flag legacy_qris_enabled seharusnya disaring dan tidak ada di settings: %', v_settings;
  END IF;


  -- ==============================================================================
  -- T8: Warga insert payments: completed / cash / amount 1 -> 42501 / 42501 / 22023
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Warga coba insert status completed -> error 42501
  v_err_code := '';
  BEGIN
    INSERT INTO public.payments (tenant_id, billing_item_id, member_id, amount, method, status)
    VALUES (v_tenant_id, v_bill_1_id, v_warga_member_id, 150000, 'bank_transfer', 'completed');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T8a GAGAL: Warga insert payment completed harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Warga coba insert method cash -> error 42501
  v_err_code := '';
  BEGIN
    INSERT INTO public.payments (tenant_id, billing_item_id, member_id, amount, method, status)
    VALUES (v_tenant_id, v_bill_1_id, v_warga_member_id, 150000, 'cash', 'pending_verification');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T8b GAGAL: Warga insert payment cash harus error 42501, didapat: %', v_err_code;
  END IF;

  -- Warga coba insert nominal amount 1 -> error 22023
  v_err_code := '';
  BEGIN
    INSERT INTO public.payments (tenant_id, billing_item_id, member_id, amount, method, status)
    VALUES (v_tenant_id, v_bill_1_id, v_warga_member_id, 1, 'bank_transfer', 'pending_verification');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '22023' THEN
    RAISE EXCEPTION 'TEST T8c GAGAL: Warga insert nominal tidak sesuai tagihan harus error 22023, didapat: %', v_err_code;
  END IF;

  PERFORM set_config('role', 'postgres', true);


  -- ==============================================================================
  -- T9: Warga insert payments bank_transfer pending_verification 150000 -> berhasil; tagihan pending; insert ke-2 -> 23505
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Insert pembayaran sah pertama
  INSERT INTO public.payments (tenant_id, billing_item_id, member_id, amount, method, status)
  VALUES (v_tenant_id, v_bill_1_id, v_warga_member_id, 150000, 'bank_transfer', 'pending_verification');

  PERFORM set_config('role', 'postgres', true);

  -- Cek status tagihan otomatis sinkron ke pending_verification via trigger
  SELECT status INTO v_bill_status FROM public.billing_items WHERE id = v_bill_1_id;
  IF v_bill_status <> 'pending_verification' THEN
    RAISE EXCEPTION 'TEST T9a GAGAL: Status tagihan harus sinkron pending_verification, didapat: %', v_bill_status;
  END IF;

  -- Coba insert pembayaran ke-2 pada tagihan yang sama -> error 23505
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_err_code := '';
  BEGIN
    INSERT INTO public.payments (tenant_id, billing_item_id, member_id, amount, method, status)
    VALUES (v_tenant_id, v_bill_1_id, v_warga_member_id, 150000, 'bank_transfer', 'pending_verification');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '23505' THEN
    RAISE EXCEPTION 'TEST T9b GAGAL: Insert pembayaran ke-2 harus error 23505, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T10: Bendahara insert cash, completed untuk tagihan unit lain -> berhasil; tagihan paid
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.payments (tenant_id, billing_item_id, member_id, amount, method, status)
  VALUES (v_tenant_id, v_bill_2_id, NULL, 200000, 'cash', 'completed');

  PERFORM set_config('role', 'postgres', true);

  SELECT status INTO v_bill_status FROM public.billing_items WHERE id = v_bill_2_id;
  IF v_bill_status <> 'paid' THEN
    RAISE EXCEPTION 'TEST T10 GAGAL: Status tagihan tunai bendahara harus sinkron paid, didapat: %', v_bill_status;
  END IF;


  -- ==============================================================================
  -- T11: Warga insert storage.objects bucket payment-proofs tenant uji -> berhasil; tenant lain -> 42501; SELECT orang lain -> 0
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Upload bukti di tenant sendiri
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('payment-proofs', v_tenant_id || '/payments/' || v_bill_1_id || '/warga_proof.jpg', v_warga_id)
  RETURNING id INTO v_obj_id;

  -- Coba upload bukti dengan path tenant lain -> error 42501
  v_err_code := '';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('payment-proofs', v_other_tenant_id || '/payments/' || v_bill_1_id || '/evil.jpg', v_warga_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;
  IF v_err_code <> '42501' THEN
    RAISE EXCEPTION 'TEST T11a GAGAL: Upload bukti tenant lain harus error 42501, didapat: %', v_err_code;
  END IF;

  PERFORM set_config('role', 'postgres', true);

  -- Postgres tambahkan objek milik bendahara
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('payment-proofs', v_tenant_id || '/payments/' || v_bill_2_id || '/bendahara_note.jpg', v_bendahara_id);

  -- Warga SELECT objek milik orang lain -> 0 baris
  PERFORM set_config('request.jwt.claim.sub', v_warga_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_stored_count
  FROM storage.objects
  WHERE bucket_id = 'payment-proofs'
    AND name = v_tenant_id || '/payments/' || v_bill_2_id || '/bendahara_note.jpg';

  PERFORM set_config('role', 'postgres', true);
  IF v_stored_count <> 0 THEN
    RAISE EXCEPTION 'TEST T11b GAGAL: Warga tidak boleh melihat bukti pembayaran user lain (count = %)', v_stored_count;
  END IF;


  -- ==============================================================================
  -- T12: Owner insert 2 tagihan IPL (tenant, unit, period) sama -> yang ke-2 error 23505
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Tagihan IPL periode November 2026 ke-1 -> berhasil
  INSERT INTO public.billing_items (tenant_id, unit_id, period, amount, status, metadata)
  VALUES (v_tenant_id, v_unit_1_id, '2026-11', 150000, 'unpaid', jsonb_build_object('bill_type', 'ipl'));

  -- Tagihan IPL periode November 2026 ke-2 pada unit yang sama -> error 23505
  v_err_code := '';
  BEGIN
    INSERT INTO public.billing_items (tenant_id, unit_id, period, amount, status, metadata)
    VALUES (v_tenant_id, v_unit_1_id, '2026-11', 150000, 'unpaid', jsonb_build_object('bill_type', 'ipl'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF v_err_code <> '23505' THEN
    RAISE EXCEPTION 'TEST T12 GAGAL: Insert 2 tagihan IPL identik harus error 23505, didapat: %', v_err_code;
  END IF;


  -- ==============================================================================
  -- T13: User baru buat tenant baru -> member owner is_owner=true tetap terbentuk (definer utuh)
  -- ==============================================================================
  PERFORM set_config('request.jwt.claim.sub', v_new_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.tenants (id, name, type, owner_id)
  VALUES (v_new_tenant_id, 'Kompleks Mandiri Baru', 'rt_rw', v_new_user_id);

  PERFORM set_config('role', 'postgres', true);

  SELECT count(*) INTO v_stored_count
  FROM public.tenant_members
  WHERE tenant_id = v_new_tenant_id
    AND user_id = v_new_user_id
    AND is_owner = true
    AND status = 'approved';

  IF v_stored_count <> 1 THEN
    RAISE EXCEPTION 'TEST T13 GAGAL: Member owner is_owner=true tidak terbuat otomatis oleh trigger definer (count = %)', v_stored_count;
  END IF;


  -- ==============================================================================
  -- AKHIR: SEMUA SKENARIO LULUS -> TRIGGER ROLLBACK OTOMATIS
  -- ==============================================================================
  RAISE EXCEPTION 'SEC-5 PASSED';

END $$;
