-- Test Suite: Tenant Data Isolation & Platform Foundation RLS Matrix
-- Task: T1.9 (Ref: requirement.md NFR-1, specification.md §6, task.md Phase 1 DoD)
-- Date: 2026-09-13
--
-- File ini memvalidasi:
-- 1. Trigger handle_new_tenant() auto-provisioning (trial 15 hari, 1 block 10 unit, owner as approved admin).
-- 2. Isolasi SELECT lintas-tenant (User Tenant A tidak bisa melihat data Tenant B).
-- 3. Isolasi INSERT / UPDATE / DELETE lintas-tenant (User Tenant A ditolak RLS saat memanipulasi Tenant B).
-- 4. Role-based authorization internal tenant (Anggota biasa tidak bisa memanipulasi unit/pengaturan tenant).
-- 5. Hak istimewa Platform Admin (Dapat melihat data lintas tenant & mengelola pricing).
-- 6. Pencegahan mutasi pricing oleh user non-platform-admin.
-- 7. Isolasi pengguna tanpa keanggotaan tenant (Outsider).

BEGIN;

DO $$
DECLARE
  -- User IDs
  v_owner_a UUID := gen_random_uuid();
  v_member_a UUID := gen_random_uuid();
  v_owner_b UUID := gen_random_uuid();
  v_member_b UUID := gen_random_uuid();
  v_platform_admin UUID := gen_random_uuid();
  v_outsider UUID := gen_random_uuid();

  -- Tenant IDs
  v_tenant_a UUID;
  v_tenant_b UUID;

  -- Subscription & Block IDs
  v_sub_a RECORD;
  v_sub_b RECORD;
  v_block_a RECORD;
  v_member_rec RECORD;

  -- Unit IDs (BIGINT Identity)
  v_unit_a BIGINT;
  v_unit_b BIGINT;

  -- Counters & Flags
  v_count INT;
  v_caught_error BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: ISOLASI TENANT & RLS MATRIX (T1.9)';
  RAISE NOTICE '============================================================';

  -- ------------------------------------------------------------
  -- SETUP: Buat Auth Users & Daftarkan Platform Admin
  -- ------------------------------------------------------------
  INSERT INTO auth.users (id, email) VALUES
    (v_owner_a, 'owner_a@tenant-a.invalid'),
    (v_member_a, 'member_a@tenant-a.invalid'),
    (v_owner_b, 'owner_b@tenant-b.invalid'),
    (v_member_b, 'member_b@tenant-b.invalid'),
    (v_platform_admin, 'admin@platform.invalid'),
    (v_outsider, 'outsider@other.invalid');

  INSERT INTO public.platform_admins (user_id) VALUES (v_platform_admin);

  -- ============================================================
  -- SKENARIO 1: AUTO-PROVISIONING TRIGGER handle_new_tenant()
  -- ============================================================
  RAISE NOTICE '[TEST 1] Menguji auto-provisioning trigger handle_new_tenant()...';

  -- Buat Tenant A (RT/RW) oleh v_owner_a
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Perumahan Indah RT 01', 'rt_rw', v_owner_a)
  RETURNING id INTO v_tenant_a;

  -- Buat Tenant B (Kos) oleh v_owner_b
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kos Sejahtera 02', 'kos', v_owner_b)
  RETURNING id INTO v_tenant_b;

  -- 1.1 Verifikasi tenant_subscriptions untuk Tenant A
  SELECT * INTO v_sub_a FROM public.tenant_subscriptions WHERE tenant_id = v_tenant_a;
  IF v_sub_a.id IS NULL THEN
    RAISE EXCEPTION 'TEST 1.1 GAGAL: tenant_subscriptions tidak dibuat otomatis untuk Tenant A';
  END IF;
  IF v_sub_a.status <> 'trial' THEN
    RAISE EXCEPTION 'TEST 1.1 GAGAL: Status subscription Tenant A adalah %, seharusnya trial', v_sub_a.status;
  END IF;
  IF v_sub_a.trial_ends_at < (now() + interval '14 days') OR v_sub_a.trial_ends_at > (now() + interval '16 days') THEN
    RAISE EXCEPTION 'TEST 1.1 GAGAL: trial_ends_at tidak valid (~15 hari): %', v_sub_a.trial_ends_at;
  END IF;

  -- 1.2 Verifikasi tenant_subscription_blocks untuk Tenant A
  SELECT * INTO v_block_a FROM public.tenant_subscription_blocks WHERE subscription_id = v_sub_a.id;
  IF v_block_a.id IS NULL THEN
    RAISE EXCEPTION 'TEST 1.2 GAGAL: tenant_subscription_blocks tidak dibuat otomatis untuk Tenant A';
  END IF;
  IF v_block_a.block_size <> 10 OR v_block_a.quantity <> 1 OR v_block_a.price_snapshot <> 0.00 THEN
    RAISE EXCEPTION 'TEST 1.2 GAGAL: block subscription awal tidak sesuai spek (10 unit, qty 1, gratis)';
  END IF;

  -- 1.3 Verifikasi tenant_members owner sebagai admin approved
  SELECT * INTO v_member_rec FROM public.tenant_members WHERE tenant_id = v_tenant_a AND user_id = v_owner_a;
  IF v_member_rec.id IS NULL OR v_member_rec.is_owner IS NOT TRUE OR v_member_rec.status <> 'approved' THEN
    RAISE EXCEPTION 'TEST 1.3 GAGAL: Owner Tenant A tidak terdaftar sebagai owner approved';
  END IF;

  RAISE NOTICE '>> PASSED: Test 1 (Auto-provisioning trigger) Sukses!';

  -- ------------------------------------------------------------
  -- SETUP DATA ANGGOTA & UNIT UNTUK PENGUJIAN ISOLASI
  -- ------------------------------------------------------------
  -- Daftarkan anggota biasa di masing-masing tenant
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status)
  VALUES
    (v_tenant_a, v_member_a, 'Warga A', 'approved'),
    (v_tenant_b, v_member_b, 'Penyewa B', 'approved');

  -- Buat unit di Tenant A & Tenant B
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_a, 'Rumah Blok A1', 'occupied')
  RETURNING id INTO v_unit_a;

  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_b, 'Kamar 101', 'occupied')
  RETURNING id INTO v_unit_b;

  -- ============================================================
  -- SKENARIO 2: ISOLASI SELECT LINTAS TENANT
  -- ============================================================
  RAISE NOTICE '[TEST 2] Menguji isolasi SELECT lintas tenant...';

  -- 2.1 Simulasi Owner Tenant A
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  -- Melihat tenants: hanya Tenant A (count = 1)
  SELECT count(*) INTO v_count FROM public.tenants;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 2.1 GAGAL: Owner A melihat % tenant, seharusnya hanya 1', v_count;
  END IF;

  -- Mencoba query langsung ke Tenant B: harus 0 baris
  SELECT count(*) INTO v_count FROM public.tenants WHERE id = v_tenant_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2.1 GAGAL: Owner A dapat melihat Tenant B!';
  END IF;

  -- Melihat units: hanya unit Tenant A (count = 1)
  SELECT count(*) INTO v_count FROM public.tenant_units;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 2.1 GAGAL: Owner A melihat % unit, seharusnya 1', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.tenant_units WHERE id = v_unit_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2.1 GAGAL: Owner A dapat melihat Unit Tenant B!';
  END IF;

  -- Melihat members: hanya anggota Tenant A
  SELECT count(*) INTO v_count FROM public.tenant_members WHERE tenant_id = v_tenant_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2.1 GAGAL: Owner A dapat melihat anggota Tenant B!';
  END IF;

  -- 2.2 Simulasi Anggota Biasa Tenant A
  PERFORM set_config('request.jwt.claim.sub', v_member_a::text, true);

  SELECT count(*) INTO v_count FROM public.tenants;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 2.2 GAGAL: Anggota A melihat % tenant, seharusnya 1', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.tenant_units WHERE tenant_id = v_tenant_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2.2 GAGAL: Anggota A dapat melihat unit Tenant B!';
  END IF;

  -- 2.3 Simulasi Outsider (User tanpa tenant)
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);

  SELECT count(*) INTO v_count FROM public.tenants;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2.3 GAGAL: Outsider dapat melihat % tenant, seharusnya 0', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.tenant_units;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2.3 GAGAL: Outsider dapat melihat % units, seharusnya 0', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Test 2 (Isolasi SELECT lintas-tenant) Sukses!';

  -- ============================================================
  -- SKENARIO 3: ISOLASI INSERT / UPDATE / DELETE LINTAS TENANT
  -- ============================================================
  RAISE NOTICE '[TEST 3] Menguji pencegahan manipulasi data lintas tenant...';

  -- 3.1 Owner A mencoba UPDATE Tenant B
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  UPDATE public.tenants SET name = 'Perumahan Dibajak' WHERE id = v_tenant_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3.1 GAGAL: Owner A berhasil mengubah data Tenant B!';
  END IF;

  -- 3.2 Owner A mencoba INSERT unit ke Tenant B (harus dicegah RLS)
  v_caught_error := false;
  BEGIN
    INSERT INTO public.tenant_units (tenant_id, label, status)
    VALUES (v_tenant_b, 'Unit Ilegal', 'vacant');
  EXCEPTION WHEN others THEN
    v_caught_error := true;
  END;
  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 3.2 GAGAL: Owner A berhasil INSERT unit ke Tenant B!';
  END IF;

  -- 3.3 Owner A mencoba DELETE unit Tenant B
  DELETE FROM public.tenant_units WHERE id = v_unit_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3.3 GAGAL: Owner A berhasil menghapus unit Tenant B!';
  END IF;

  RAISE NOTICE '>> PASSED: Test 3 (Pencegahan manipulasi lintas-tenant) Sukses!';

  -- ============================================================
  -- SKENARIO 4: ROLE-BASED AUTHORIZATION INTERNAL TENANT
  -- ============================================================
  RAISE NOTICE '[TEST 4] Menguji RBAC internal tenant (Admin vs Anggota)...';

  -- 4.1 Anggota biasa A mencoba mengubah nama Tenant A (harus ditolak RLS)
  PERFORM set_config('request.jwt.claim.sub', v_member_a::text, true);
  UPDATE public.tenants SET name = 'Nama Diubah Anggota' WHERE id = v_tenant_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 4.1 GAGAL: Anggota biasa berhasil mengubah profil tenant!';
  END IF;

  -- 4.2 Anggota biasa A mencoba menambah unit baru di Tenant A (harus dicegah)
  v_caught_error := false;
  BEGIN
    INSERT INTO public.tenant_units (tenant_id, label, status)
    VALUES (v_tenant_a, 'Unit Dari Anggota', 'vacant');
  EXCEPTION WHEN others THEN
    v_caught_error := true;
  END;
  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 4.2 GAGAL: Anggota biasa berhasil membuat unit di Tenant A!';
  END IF;

  -- 4.3 Admin Tenant A berhasil membuat unit di Tenant A
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_a, 'Rumah Blok A2', 'vacant');

  SELECT count(*) INTO v_count FROM public.tenant_units WHERE tenant_id = v_tenant_a;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'TEST 4.3 GAGAL: Admin gagal membuat unit di Tenant A (total unit = %)', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Test 4 (RBAC internal tenant) Sukses!';

  -- ============================================================
  -- SKENARIO 5: HAK ISTIMEWA PLATFORM ADMIN
  -- ============================================================
  RAISE NOTICE '[TEST 5] Menguji hak akses lintas-tenant Platform Admin...';

  PERFORM set_config('request.jwt.claim.sub', v_platform_admin::text, true);

  -- Platform Admin melihat SELURUH tenant
  SELECT count(*) INTO v_count FROM public.tenants;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'TEST 5.1 GAGAL: Platform Admin hanya melihat % tenant, seharusnya minimal 2', v_count;
  END IF;

  -- Platform Admin melihat SELURUH units lintas-tenant
  SELECT count(*) INTO v_count FROM public.tenant_units;
  IF v_count < 3 THEN
    RAISE EXCEPTION 'TEST 5.2 GAGAL: Platform Admin hanya melihat % units', v_count;
  END IF;

  -- Platform Admin mengelola block_pricing
  UPDATE public.block_pricing
  SET price_per_block = 13000.00
  WHERE tenant_type = 'rt_rw' AND block_size = 10;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5.3 GAGAL: Platform Admin gagal mengupdate block_pricing';
  END IF;

  RAISE NOTICE '>> PASSED: Test 5 (Platform Admin privileges) Sukses!';

  -- ============================================================
  -- SKENARIO 6: REGULAR USER DILARANG MUTASI PRICING & PERIODS
  -- ============================================================
  RAISE NOTICE '[TEST 6] Menguji pencegahan mutasi harga oleh user non-platform-admin...';

  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  -- Mencoba mengubah block_pricing
  UPDATE public.block_pricing
  SET price_per_block = 1.00
  WHERE tenant_type = 'rt_rw' AND block_size = 10;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 6.1 GAGAL: Regular user berhasil mengubah block_pricing!';
  END IF;

  -- Mencoba mengubah subscription_periods
  UPDATE public.subscription_periods
  SET discount_percent = 99.00
  WHERE duration_months = 12;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 6.2 GAGAL: Regular user berhasil mengubah subscription_periods!';
  END IF;

  RAISE NOTICE '>> PASSED: Test 6 (Pencegahan manipulasi harga) Sukses!';

  -- ============================================================
  -- SKENARIO 7: PUBLIC READ BLOCK PRICING
  -- ============================================================
  RAISE NOTICE '[TEST 7] Menguji akses public read pada tabel pricing...';

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT count(*) INTO v_count FROM public.block_pricing;
  IF v_count < 8 THEN
    RAISE EXCEPTION 'TEST 7.1 GAGAL: Anon user tidak bisa membaca block_pricing (count = %)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.subscription_periods;
  IF v_count < 3 THEN
    RAISE EXCEPTION 'TEST 7.2 GAGAL: Anon user tidak bisa membaca subscription_periods (count = %)', v_count;
  END IF;

  -- Anon user tidak boleh bisa membaca tenant data
  SELECT count(*) INTO v_count FROM public.tenants;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7.3 GAGAL: Anon user dapat membaca % tenants, seharusnya 0!', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Test 7 (Public read pricing & isolasi anon) Sukses!';

  -- ------------------------------------------------------------
  -- CLEANUP
  -- ------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE postgres';

  DELETE FROM public.tenants WHERE id IN (v_tenant_a, v_tenant_b);
  DELETE FROM public.platform_admins WHERE user_id = v_platform_admin;
  DELETE FROM auth.users WHERE id IN (
    v_owner_a, v_member_a, v_owner_b, v_member_b, v_platform_admin, v_outsider
  );

  -- Kembalikan harga semula
  UPDATE public.block_pricing
  SET price_per_block = 12500.00
  WHERE tenant_type = 'rt_rw' AND block_size = 10;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST ISOLASI TENANT & RLS MATRIX BERHASIL LULUS 100%%!';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;
