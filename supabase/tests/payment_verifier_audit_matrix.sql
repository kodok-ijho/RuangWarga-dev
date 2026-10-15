-- Test Suite: Payment Verifier Audit Matrix
-- Task: AUDIT-VERIFY-1
-- Date: 2026-10-15
--
-- File ini memvalidasi integritas audit pemverifikasi pembayaran:
-- 1. Static privilege check: stamp_payment_verifier() tidak dapat dieksekusi anon/authenticated.
-- 2. Kasus 1: Warga INSERT pembayaran bank_transfer pending_verification -> verified_by NULL, verified_at NULL.
-- 3. Kasus 2: Bendahara UPDATE status -> 'completed' -> verified_by = id tenant_members bendahara, verified_at NOT NULL, metadata->>'verified_by_user_id' = uid bendahara.
-- 4. Kasus 3: Setelah completed, bendahara mencoba UPDATE verified_by ke id warga (tanpa transisi status) -> tetap id bendahara; verified_at tidak berubah; metadata tidak bisa diubah/dihapus.
-- 5. Kasus 4: Owner UPDATE pembayaran lain -> 'completed' -> verified_by = id member owner.
-- 6. Kasus 5: Platform admin (bukan anggota) UPDATE -> 'completed' -> verified_by NULL, metadata verified_by_user_id = uid admin.
-- 7. Kasus 6: Bendahara INSERT pembayaran cash status 'completed' -> verified_by = id bendahara, verified_at NOT NULL, metadata->>'verified_by_user_id' = uid bendahara.
-- 8. Kasus 7: Tanpa auth.uid() (role postgres, claims kosong) UPDATE -> nilai tidak diubah trigger.

BEGIN;

DO $$
DECLARE
  -- Identitas User (auth.users)
  v_owner_a        UUID := gen_random_uuid();
  v_bendahara_a    UUID := gen_random_uuid();
  v_warga_a        UUID := gen_random_uuid();
  v_platform_admin UUID := gen_random_uuid();

  -- Tenant & Roles
  v_tenant_a            UUID;
  v_base_role_id        UUID;
  v_bendahara_role_id   UUID := gen_random_uuid();

  -- Tenant Members ID
  v_owner_member_id     UUID;
  v_bendahara_member_id UUID := gen_random_uuid();
  v_warga_member_id     UUID := gen_random_uuid();

  -- Unit & Tagihan (Billing Items)
  v_unit_a   BIGINT;
  v_bill_1   UUID := gen_random_uuid();
  v_bill_2   UUID := gen_random_uuid();
  v_bill_3   UUID := gen_random_uuid();
  v_bill_4   UUID := gen_random_uuid();
  v_bill_5   UUID := gen_random_uuid();

  -- Pembayaran (Payments)
  v_pay_1    UUID;
  v_pay_2    UUID;
  v_pay_3    UUID;
  v_pay_4    UUID;
  v_pay_5    UUID;

  -- Variabel pengujian
  v_rec               RECORD;
  v_saved_verified_at TIMESTAMPTZ;
  v_manual_time       TIMESTAMPTZ;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: PAYMENT VERIFIER AUDIT MATRIX (AUDIT-VERIFY-1)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- 1. ASSERT FUNCTION PRIVILEGES (STATIC MATRIX CHECK)
  -- ==============================================================================
  RAISE NOTICE '[TEST 1] Memeriksa static privilege has_function_privilege()...';

  IF has_function_privilege('anon', 'public.stamp_payment_verifier()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: anon memiliki privilege EXECUTE pada stamp_payment_verifier';
  END IF;

  IF has_function_privilege('authenticated', 'public.stamp_payment_verifier()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: authenticated memiliki privilege EXECUTE pada stamp_payment_verifier';
  END IF;

  RAISE NOTICE '>> PASSED: Test 1 (Static privilege checks) Berhasil!';

  -- ==============================================================================
  -- 2. SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan user, platform admin, tenant, RBAC, unit, dan tagihan...';

  -- 2.1 Auth Users
  INSERT INTO auth.users (id, email) VALUES
    (v_owner_a,        'owner_a_audit@test.invalid'),
    (v_bendahara_a,    'bendahara_a_audit@test.invalid'),
    (v_warga_a,        'warga_a_audit@test.invalid'),
    (v_platform_admin, 'admin_audit@test.invalid');

  -- 2.2 Platform Admin (bukan anggota Tenant A)
  INSERT INTO public.platform_admins (user_id) VALUES (v_platform_admin);

  -- 2.3 Tenant A (Kompleks Uji Audit A)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks Uji Audit A', 'rt_rw', v_owner_a)
  RETURNING id INTO v_tenant_a;

  -- Pastikan subscription berstatus aktif
  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_a;

  -- Dapatkan ID member owner (otomatis dibuat oleh handle_new_tenant)
  SELECT id INTO v_owner_member_id
  FROM public.tenant_members
  WHERE tenant_id = v_tenant_a AND user_id = v_owner_a;

  IF v_owner_member_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: member record owner untuk Tenant A tidak ditemukan';
  END IF;

  -- Ambil base role bawaan (Warga/Anggota)
  SELECT id INTO v_base_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_a AND is_base_role = true;

  IF v_base_role_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: base role untuk Tenant A tidak ditemukan';
  END IF;

  -- Buat role Bendahara dengan izin keuangan transfer & cash
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_bendahara_role_id, v_tenant_a, 'Bendahara Audit Uji', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key) VALUES
    (v_bendahara_role_id, 'manage_billing_cash'),
    (v_bendahara_role_id, 'manage_billing_transfer');

  -- Buat Unit A
  INSERT INTO public.tenant_units (tenant_id, label)
  VALUES (v_tenant_a, 'A-01')
  RETURNING id INTO v_unit_a;

  -- Daftarkan Anggota Tenant A: Bendahara dan Warga
  INSERT INTO public.tenant_members (id, tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_bendahara_member_id, v_tenant_a, v_bendahara_a, 'Bendahara A', 'approved', false, v_bendahara_role_id);

  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_warga_member_id, v_tenant_a, v_warga_a, v_unit_a, 'Warga A', 'approved', false, v_base_role_id);

  -- Siapkan 5 Tagihan (Billing Items) untuk keperluan pengujian masing-masing kasus
  INSERT INTO public.billing_items (id, tenant_id, unit_id, member_id, period, amount, status) VALUES
    (v_bill_1, v_tenant_a, v_unit_a, v_warga_member_id, '2026-10', 150000, 'unpaid'),
    (v_bill_2, v_tenant_a, v_unit_a, v_warga_member_id, '2026-11', 150000, 'unpaid'),
    (v_bill_3, v_tenant_a, v_unit_a, v_warga_member_id, '2026-12', 150000, 'unpaid'),
    (v_bill_4, v_tenant_a, v_unit_a, v_warga_member_id, '2027-01', 150000, 'unpaid'),
    (v_bill_5, v_tenant_a, v_unit_a, v_warga_member_id, '2027-02', 150000, 'unpaid');

  RAISE NOTICE '>> SETUP Berhasil!';

  -- ==============================================================================
  -- 3. KASUS 1: Warga INSERT pembayaran bank_transfer pending_verification
  -- Hasil: verified_by NULL, verified_at NULL, metadata tanpa verified_by_user_id
  -- ==============================================================================
  RAISE NOTICE '[KASUS 1] Menguji INSERT oleh warga (bank_transfer pending_verification)...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.payments (
    tenant_id,
    billing_item_id,
    member_id,
    amount,
    method,
    status
  ) VALUES (
    v_tenant_a,
    v_bill_1,
    v_warga_member_id,
    150000,
    'bank_transfer',
    'pending_verification'
  ) RETURNING id INTO v_pay_1;

  SELECT verified_by, verified_at, metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_1;

  IF v_rec.verified_by IS NOT NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 1 GAGAL: verified_by harus NULL saat insert oleh warga (got %)', v_rec.verified_by;
  END IF;

  IF v_rec.verified_at IS NOT NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 1 GAGAL: verified_at harus NULL saat insert oleh warga (got %)', v_rec.verified_at;
  END IF;

  IF (v_rec.metadata->>'verified_by_user_id') IS NOT NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 1 GAGAL: metadata.verified_by_user_id harus NULL saat insert oleh warga (got %)', v_rec.metadata->>'verified_by_user_id';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 1 Berhasil!';

  -- ==============================================================================
  -- 4. KASUS 2: Bendahara UPDATE status -> 'completed'
  -- Hasil: verified_by = id bendahara, verified_at NOT NULL, metadata->>'verified_by_user_id' = uid bendahara
  -- ==============================================================================
  RAISE NOTICE '[KASUS 2] Menguji UPDATE status -> completed oleh bendahara...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.payments
  SET status = 'completed'
  WHERE id = v_pay_1;

  SELECT verified_by, verified_at, metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_1;

  IF v_rec.verified_by IS DISTINCT FROM v_bendahara_member_id THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 2 GAGAL: verified_by harus = ID member bendahara % (got %)', v_bendahara_member_id, v_rec.verified_by;
  END IF;

  IF v_rec.verified_at IS NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 2 GAGAL: verified_at tidak boleh NULL setelah verifikasi oleh bendahara';
  END IF;

  IF (v_rec.metadata->>'verified_by_user_id') IS DISTINCT FROM v_bendahara_a::text THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 2 GAGAL: metadata verified_by_user_id harus = % (got %)', v_bendahara_a::text, v_rec.metadata->>'verified_by_user_id';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 2 Berhasil!';

  -- ==============================================================================
  -- 5. KASUS 3: Setelah completed, coba UPDATE verified_by/metadata (tanpa transisi status)
  -- Hasil: verified_by tetap id bendahara, verified_at tidak berubah, metadata verified_by_user_id terkunci
  -- ==============================================================================
  RAISE NOTICE '[KASUS 3] Menguji penguncian kolom audit saat UPDATE tanpa perubahan status completed...';

  v_saved_verified_at := v_rec.verified_at;

  -- 3a. Coba ubah verified_by ke id warga, verified_at ke masa depan, dan manipulasi verified_by_user_id
  UPDATE public.payments
  SET verified_by = v_warga_member_id,
      verified_at = now() + INTERVAL '1 day',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('verified_by_user_id', v_warga_a::text)
  WHERE id = v_pay_1;

  SELECT verified_by, verified_at, metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_1;

  IF v_rec.verified_by IS DISTINCT FROM v_bendahara_member_id THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 3a GAGAL: verified_by harus terkunci ke ID member bendahara % (got %)', v_bendahara_member_id, v_rec.verified_by;
  END IF;

  IF v_rec.verified_at IS DISTINCT FROM v_saved_verified_at THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 3a GAGAL: verified_at harus tidak berubah (got %, expected %)', v_rec.verified_at, v_saved_verified_at;
  END IF;

  IF (v_rec.metadata->>'verified_by_user_id') IS DISTINCT FROM v_bendahara_a::text THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 3a GAGAL: metadata verified_by_user_id harus tetap % (got %)', v_bendahara_a::text, v_rec.metadata->>'verified_by_user_id';
  END IF;

  -- 3b. Coba hapus key verified_by_user_id dari metadata
  UPDATE public.payments
  SET metadata = metadata - 'verified_by_user_id'
  WHERE id = v_pay_1;

  SELECT metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_1;

  IF (v_rec.metadata->>'verified_by_user_id') IS DISTINCT FROM v_bendahara_a::text THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 3b GAGAL: verified_by_user_id tidak boleh terhapus dari metadata';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 3 Berhasil!';

  -- ==============================================================================
  -- 6. KASUS 4: Owner UPDATE pembayaran lain -> 'completed'
  -- Hasil: verified_by = id member owner, verified_at NOT NULL, metadata verified_by_user_id = uid owner
  -- ==============================================================================
  RAISE NOTICE '[KASUS 4] Menguji verifikasi pembayaran oleh Owner Tenant...';

  -- Buat pembayaran untuk bill 2 sebagai warga
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.payments (
    tenant_id, billing_item_id, member_id, amount, method, status
  ) VALUES (
    v_tenant_a, v_bill_2, v_warga_member_id, 150000, 'bank_transfer', 'pending_verification'
  ) RETURNING id INTO v_pay_2;

  -- Owner melakukan verifikasi
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.payments
  SET status = 'completed'
  WHERE id = v_pay_2;

  SELECT verified_by, verified_at, metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_2;

  IF v_rec.verified_by IS DISTINCT FROM v_owner_member_id THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 4 GAGAL: verified_by harus = ID member owner % (got %)', v_owner_member_id, v_rec.verified_by;
  END IF;

  IF v_rec.verified_at IS NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 4 GAGAL: verified_at tidak boleh NULL setelah verifikasi owner';
  END IF;

  IF (v_rec.metadata->>'verified_by_user_id') IS DISTINCT FROM v_owner_a::text THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 4 GAGAL: metadata verified_by_user_id harus % (got %)', v_owner_a::text, v_rec.metadata->>'verified_by_user_id';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 4 Berhasil!';

  -- ==============================================================================
  -- 7. KASUS 5: Platform admin (bukan anggota) UPDATE -> 'completed'
  -- Hasil: verified_by NULL (karena bukan member), metadata verified_by_user_id = uid admin
  -- ==============================================================================
  RAISE NOTICE '[KASUS 5] Menguji verifikasi oleh platform admin non-anggota...';

  -- Buat pembayaran untuk bill 3 sebagai warga
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.payments (
    tenant_id, billing_item_id, member_id, amount, method, status
  ) VALUES (
    v_tenant_a, v_bill_3, v_warga_member_id, 150000, 'bank_transfer', 'pending_verification'
  ) RETURNING id INTO v_pay_3;

  -- Platform Admin memverifikasi
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_platform_admin::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_platform_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.payments
  SET status = 'completed'
  WHERE id = v_pay_3;

  SELECT verified_by, verified_at, metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_3;

  IF v_rec.verified_by IS NOT NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 5 GAGAL: verified_by harus NULL untuk platform admin non-anggota (got %)', v_rec.verified_by;
  END IF;

  IF v_rec.verified_at IS NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 5 GAGAL: verified_at tidak boleh NULL setelah verifikasi platform admin';
  END IF;

  IF (v_rec.metadata->>'verified_by_user_id') IS DISTINCT FROM v_platform_admin::text THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 5 GAGAL: metadata verified_by_user_id harus % (got %)', v_platform_admin::text, v_rec.metadata->>'verified_by_user_id';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 5 Berhasil!';

  -- ==============================================================================
  -- 8. KASUS 6: Bendahara INSERT pembayaran cash status 'completed'
  -- Hasil: verified_by = id bendahara, verified_at NOT NULL, metadata verified_by_user_id = uid bendahara
  -- ==============================================================================
  RAISE NOTICE '[KASUS 6] Menguji INSERT cash completed oleh bendahara...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendahara_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_bendahara_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.payments (
    tenant_id,
    billing_item_id,
    member_id,
    amount,
    method,
    status
  ) VALUES (
    v_tenant_a,
    v_bill_4,
    v_warga_member_id,
    150000,
    'cash',
    'completed'
  ) RETURNING id INTO v_pay_4;

  SELECT verified_by, verified_at, metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_4;

  IF v_rec.verified_by IS DISTINCT FROM v_bendahara_member_id THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 6 GAGAL: verified_by harus = ID member bendahara % (got %)', v_bendahara_member_id, v_rec.verified_by;
  END IF;

  IF v_rec.verified_at IS NULL THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 6 GAGAL: verified_at tidak boleh NULL pada insert cash completed';
  END IF;

  IF (v_rec.metadata->>'verified_by_user_id') IS DISTINCT FROM v_bendahara_a::text THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'KASUS 6 GAGAL: metadata verified_by_user_id harus % (got %)', v_bendahara_a::text, v_rec.metadata->>'verified_by_user_id';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 6 Berhasil!';

  -- ==============================================================================
  -- 9. KASUS 7: Tanpa auth.uid() (role postgres, claims kosong) UPDATE
  -- Hasil: trigger tidak mengubah nilai (bypass sistem / migrasi)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 7] Menguji UPDATE tanpa auth.uid() (role postgres, klaim kosong)...';

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  INSERT INTO public.payments (
    tenant_id,
    billing_item_id,
    member_id,
    amount,
    method,
    status
  ) VALUES (
    v_tenant_a,
    v_bill_5,
    v_warga_member_id,
    150000,
    'bank_transfer',
    'pending_verification'
  ) RETURNING id INTO v_pay_5;

  v_manual_time := '2026-01-01 12:00:00+00'::timestamptz;

  UPDATE public.payments
  SET status = 'completed',
      verified_by = v_warga_member_id,
      verified_at = v_manual_time,
      metadata = jsonb_build_object('system_job', true)
  WHERE id = v_pay_5;

  SELECT verified_by, verified_at, metadata INTO v_rec
  FROM public.payments
  WHERE id = v_pay_5;

  IF v_rec.verified_by IS DISTINCT FROM v_warga_member_id THEN
    RAISE EXCEPTION 'KASUS 7 GAGAL: verified_by tidak boleh diubah trigger saat auth.uid() IS NULL (got %, expected %)', v_rec.verified_by, v_warga_member_id;
  END IF;

  IF v_rec.verified_at IS DISTINCT FROM v_manual_time THEN
    RAISE EXCEPTION 'KASUS 7 GAGAL: verified_at tidak boleh diubah trigger saat auth.uid() IS NULL (got %, expected %)', v_rec.verified_at, v_manual_time;
  END IF;

  IF (v_rec.metadata->>'verified_by_user_id') IS NOT NULL THEN
    RAISE EXCEPTION 'KASUS 7 GAGAL: metadata.verified_by_user_id tidak boleh disisipkan trigger saat auth.uid() IS NULL';
  END IF;

  IF (v_rec.metadata->>'system_job') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'KASUS 7 GAGAL: metadata kustom (system_job) harus tetap ada';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 7 Berhasil!';

  -- Kembalikan role ke postgres
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST PAYMENT VERIFIER AUDIT MATRIX (AUDIT-VERIFY-1) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
