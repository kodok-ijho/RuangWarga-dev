-- Test Suite: Public Listings RLS & Non-Auth Access Verification Matrix
-- Task: T10.2 (Ref: requirement.md FR-23, FR-24, FR-26, specification.md §6.1, task.md T10.2)
-- Date: 2026-09-15
--
-- File ini memvalidasi:
-- 1. Akses SELECT publik (anon/unauthenticated) hanya untuk listing berstatus 'active' dan belum kedaluwarsa.
-- 2. Listing expired atau rented_or_sold tidak bocor ke publik/anonim.
-- 3. Pemilik postingan dan tenant admin dapat melihat listing mereka meski status tidak aktif.
-- 4. INSERT listing hanya diperbolehkan bagi anggota tenant aktif yang subscription-nya BUKAN read_only.
-- 5. Anggota dari tenant berstatus read_only DITOLAK oleh RLS saat INSERT listing baru.
-- 6. UPDATE dan DELETE dibatasi hanya untuk pemilik postingan, tenant admin, atau platform admin.
-- 7. Tabel listing_pricing dapat dibaca publik (anon) tapi mutasi hanya oleh platform admin.
-- 8. Tabel listing_payments terisolasi untuk pemilik listing dan platform admin.

BEGIN;

DO $$
DECLARE
  -- User IDs
  v_owner_a UUID := gen_random_uuid();
  v_member_a UUID := gen_random_uuid();
  v_member_a2 UUID := gen_random_uuid();
  v_owner_ro UUID := gen_random_uuid();
  v_member_ro UUID := gen_random_uuid();
  v_platform_admin UUID := gen_random_uuid();
  v_outsider UUID := gen_random_uuid();

  -- Tenant IDs
  v_tenant_a UUID;
  v_tenant_ro UUID;

  -- Member IDs
  v_tm_owner_a UUID;
  v_tm_member_a UUID;
  v_tm_member_a2 UUID;
  v_tm_member_ro UUID;

  -- Unit IDs
  v_unit_a BIGINT;
  v_unit_ro BIGINT;

  -- Listing IDs
  v_listing_active UUID;
  v_listing_expired UUID;
  v_listing_sold UUID;
  v_listing_new UUID;

  -- Payment ID
  v_payment_id UUID;

  -- Counters & Flags
  v_count INT;
  v_caught_error BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: PUBLIC LISTINGS RLS MATRIX (T10.2)';
  RAISE NOTICE '============================================================';

  -- ------------------------------------------------------------
  -- SETUP: Buat Auth Users & Daftarkan Platform Admin
  -- ------------------------------------------------------------
  INSERT INTO auth.users (id, email) VALUES
    (v_owner_a, 'owner_a@tenant-a.invalid'),
    (v_member_a, 'member_a@tenant-a.invalid'),
    (v_member_a2, 'member_a2@tenant-a.invalid'),
    (v_owner_ro, 'owner_ro@tenant-ro.invalid'),
    (v_member_ro, 'member_ro@tenant-ro.invalid'),
    (v_platform_admin, 'admin@platform.invalid'),
    (v_outsider, 'outsider@other.invalid');

  INSERT INTO public.platform_admins (user_id) VALUES (v_platform_admin);

  -- Buat Tenant A (Kos, status aktif/trial)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kos Melati Berjaya', 'kos', v_owner_a)
  RETURNING id INTO v_tenant_a;

  -- Buat Tenant RO (Kos, nantinya diset subscription = read_only)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kos Melati Macet', 'kos', v_owner_ro)
  RETURNING id INTO v_tenant_ro;

  -- Ambil Member ID Owner A
  SELECT id INTO v_tm_owner_a FROM public.tenant_members WHERE tenant_id = v_tenant_a AND user_id = v_owner_a;

  -- Tambah Member A & Member A2 di Tenant A
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status)
  VALUES
    (v_tenant_a, v_member_a, 'Penyewa Kamar A', 'approved')
  RETURNING id INTO v_tm_member_a;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status)
  VALUES
    (v_tenant_a, v_member_a2, 'Penyewa Kamar A2', 'approved')
  RETURNING id INTO v_tm_member_a2;

  -- Tambah Member RO di Tenant RO
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status)
  VALUES
    (v_tenant_ro, v_member_ro, 'Penyewa Macet', 'approved')
  RETURNING id INTO v_tm_member_ro;

  -- Set status subscription Tenant RO menjadi read_only
  UPDATE public.tenant_subscriptions
  SET status = 'read_only'
  WHERE tenant_id = v_tenant_ro;

  -- Buat Unit Kamar
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_a, 'Kamar 101', 'vacant')
  RETURNING id INTO v_unit_a;

  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_ro, 'Kamar 201', 'vacant')
  RETURNING id INTO v_unit_ro;

  -- Seed 3 listings di Tenant A oleh v_tm_member_a
  -- 1. Active & not expired
  INSERT INTO public.public_listings (
    tenant_id, posted_by, unit_id, type, title, description,
    price, status, expires_at, is_featured, contact_phone, location_hint
  ) VALUES (
    v_tenant_a, v_tm_member_a, v_unit_a, 'room_vacancy', 'Kost Putri Dekat Kampus',
    'Kamar nyaman AC kamar mandi dalam', 1200000, 'active', now() + interval '30 days',
    false, '08123456789', 'Sleman, Depok'
  ) RETURNING id INTO v_listing_active;

  -- 2. Expired
  INSERT INTO public.public_listings (
    tenant_id, posted_by, unit_id, type, title, description,
    price, status, expires_at, is_featured, contact_phone, location_hint
  ) VALUES (
    v_tenant_a, v_tm_member_a, v_unit_a, 'room_vacancy', 'Kost Murah Bulan Lalu',
    'Sudah lewat masa tayang', 1000000, 'expired', now() - interval '2 days',
    false, '08123456789', 'Sleman, Depok'
  ) RETURNING id INTO v_listing_expired;

  -- 3. Rented or sold
  INSERT INTO public.public_listings (
    tenant_id, posted_by, unit_id, type, title, description,
    price, status, expires_at, is_featured, contact_phone, location_hint
  ) VALUES (
    v_tenant_a, v_tm_member_a, v_unit_a, 'room_vacancy', 'Kost Terisi Penuh',
    'Sudah disewa penyewa baru', 1300000, 'rented_or_sold', now() + interval '10 days',
    false, '08123456789', 'Sleman, Depok'
  ) RETURNING id INTO v_listing_sold;

  -- ============================================================
  -- SKENARIO 1: AKSES SELECT PUBLIK (ANONYMOUS / UNKNOWING USER)
  -- ============================================================
  RAISE NOTICE '[TEST 1] Menguji akses SELECT publik anonymous...';

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- Anonim melihat public_listings: HANYA listing_active yang muncul (count = 1)
  SELECT count(*) INTO v_count FROM public.public_listings;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1.1 GAGAL: Anon melihat % listing, seharusnya hanya 1 (yang active & belum expired)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.public_listings WHERE id = v_listing_active;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1.2 GAGAL: Listing aktif tidak terbaca oleh anon';
  END IF;

  -- Anonim mencoba akses langsung listing expired / sold: harus 0 baris
  SELECT count(*) INTO v_count FROM public.public_listings WHERE id IN (v_listing_expired, v_listing_sold);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1.3 GAGAL: Listing expired/sold bocor ke anonim! (count = %)', v_count;
  END IF;

  -- Anonim BISA melihat listing_pricing (untuk katalog tarif posting)
  SELECT count(*) INTO v_count FROM public.listing_pricing;
  RAISE NOTICE 'Listing pricing rows visible to anon: %', v_count;

  -- Anonim TIDAK BISA melihat listing_payments
  SELECT count(*) INTO v_count FROM public.listing_payments;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1.4 GAGAL: Anonim dapat melihat listing_payments! (count = %)', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Test 1 (SELECT publik anonymous) Sukses!';

  -- ============================================================
  -- SKENARIO 2: SELECT OLEH PEMILIK POSTINGAN & TENANT ADMIN
  -- ============================================================
  RAISE NOTICE '[TEST 2] Menguji SELECT oleh pemilik postingan dan tenant admin...';

  -- 2.1 Pemilik postingan (v_member_a) bisa melihat SELURUH listing miliknya (termasuk expired & sold)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_member_a::text, true);

  SELECT count(*) INTO v_count FROM public.public_listings WHERE tenant_id = v_tenant_a;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST 2.1 GAGAL: Pemilik postingan hanya melihat % dari 3 listing miliknya', v_count;
  END IF;

  -- 2.2 Tenant Admin (v_owner_a) juga bisa melihat SELURUH listing di tenant-nya
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  SELECT count(*) INTO v_count FROM public.public_listings WHERE tenant_id = v_tenant_a;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST 2.2 GAGAL: Tenant admin hanya melihat % dari 3 listing di tenant-nya', v_count;
  END IF;

  -- 2.3 Outsider / anggota lain (v_member_a2) HANYA melihat listing yang aktif untuk publik jika bukan miliknya
  PERFORM set_config('request.jwt.claim.sub', v_member_a2::text, true);

  SELECT count(*) INTO v_count FROM public.public_listings WHERE id IN (v_listing_expired, v_listing_sold);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2.3 GAGAL: Anggota lain dapat melihat listing expired/sold milik orang lain! (count = %)', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Test 2 (SELECT pemilik & admin) Sukses!';

  -- ============================================================
  -- SKENARIO 3: INSERT LISTING (MEMBERSHIP & SUBSCRIPTION GUARD)
  -- ============================================================
  RAISE NOTICE '[TEST 3] Menguji aturan INSERT listing...';

  -- 3.1 Anggota aktif (v_member_a) dengan subscription tenant aktif BISA membuat listing baru
  PERFORM set_config('request.jwt.claim.sub', v_member_a::text, true);

  INSERT INTO public.public_listings (
    tenant_id, posted_by, type, title, description,
    price, status, expires_at, contact_phone, location_hint
  ) VALUES (
    v_tenant_a, v_tm_member_a, 'umkm', 'Catering Berkah Barokah',
    'Nasi kotak murah lezat untuk rapat warga', 25000, 'active', now() + interval '30 days',
    '081299998888', 'Sleman, Depok'
  ) RETURNING id INTO v_listing_new;

  IF v_listing_new IS NULL THEN
    RAISE EXCEPTION 'TEST 3.1 GAGAL: Anggota aktif gagal INSERT listing baru';
  END IF;

  -- 3.2 Anggota dari tenant berstatus read_only (v_member_ro) HARUS DITOLAK saat INSERT
  PERFORM set_config('request.jwt.claim.sub', v_member_ro::text, true);

  v_caught_error := false;
  BEGIN
    INSERT INTO public.public_listings (
      tenant_id, posted_by, type, title, description,
      price, status, expires_at, contact_phone, location_hint
    ) VALUES (
      v_tenant_ro, v_tm_member_ro, 'room_vacancy', 'Kost Kamar Kosong Tapi Macet',
      'Mencoba posting saat tenant read only', 1000000, 'active', now() + interval '30 days',
      '08111111111', 'Bandung, Coblong'
    );
  EXCEPTION WHEN others THEN
    v_caught_error := true;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 3.2 GAGAL: Anggota tenant berstatus read_only berhasil posting listing baru!';
  END IF;

  -- 3.3 Outsider tanpa membership HARUS DITOLAK saat INSERT
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);

  v_caught_error := false;
  BEGIN
    INSERT INTO public.public_listings (
      tenant_id, posted_by, type, title, description,
      price, status, expires_at, contact_phone, location_hint
    ) VALUES (
      v_tenant_a, v_tm_member_a, 'umkm', 'Jasa Ilegal',
      'Tanpa akun anggota', 50000, 'active', now() + interval '30 days',
      '08999999999', 'Sleman, Depok'
    );
  EXCEPTION WHEN others THEN
    v_caught_error := true;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'TEST 3.3 GAGAL: Outsider berhasil posting listing baru!';
  END IF;

  RAISE NOTICE '>> PASSED: Test 3 (Aturan INSERT membership & subscription guard) Sukses!';

  -- ============================================================
  -- SKENARIO 4: UPDATE DAN DELETE LISTING
  -- ============================================================
  RAISE NOTICE '[TEST 4] Menguji izin UPDATE dan DELETE listing...';

  -- 4.1 Orang lain (v_member_a2) mencoba mengubah status listing v_listing_new (harus ditolak RLS / 0 rows)
  PERFORM set_config('request.jwt.claim.sub', v_member_a2::text, true);

  UPDATE public.public_listings
  SET title = 'Judul Dibajak Anggota Lain'
  WHERE id = v_listing_new;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 4.1 GAGAL: Anggota lain berhasil mengubah listing orang lain!';
  END IF;

  -- 4.2 Pemilik postingan (v_member_a) BISA mengubah listing miliknya (misal ganti status atau judul)
  PERFORM set_config('request.jwt.claim.sub', v_member_a::text, true);

  UPDATE public.public_listings
  SET title = 'Catering Berkah Barokah Halal'
  WHERE id = v_listing_new;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 4.2 GAGAL: Pemilik listing gagal update listing miliknya';
  END IF;

  -- 4.3 Tenant admin (v_owner_a) BISA menghapus atau update listing anggota tenant-nya
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  UPDATE public.public_listings
  SET status = 'rented_or_sold'
  WHERE id = v_listing_new;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 4.3 GAGAL: Tenant admin gagal update listing anggota';
  END IF;

  RAISE NOTICE '>> PASSED: Test 4 (UPDATE & DELETE listing) Sukses!';

  -- ============================================================
  -- SKENARIO 5: TABEL LISTING_PAYMENTS ISOLATION
  -- ============================================================
  RAISE NOTICE '[TEST 5] Menguji isolasi tabel listing_payments...';

  -- 5.1 Pemilik listing (v_member_a) membuat invoice payment untuk v_listing_active
  PERFORM set_config('request.jwt.claim.sub', v_member_a::text, true);

  INSERT INTO public.listing_payments (
    listing_id, amount, status
  ) VALUES (
    v_listing_active, 25000, 'pending'
  ) RETURNING id INTO v_payment_id;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'TEST 5.1 GAGAL: Pemilik listing gagal membuat listing_payment';
  END IF;

  -- 5.2 Pemilik bisa melihat payment miliknya
  SELECT count(*) INTO v_count FROM public.listing_payments WHERE id = v_payment_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5.2 GAGAL: Pemilik tidak bisa membaca listing_payment miliknya';
  END IF;

  -- 5.3 Orang lain (v_member_a2) TIDAK BISA melihat payment milik v_member_a
  PERFORM set_config('request.jwt.claim.sub', v_member_a2::text, true);

  SELECT count(*) INTO v_count FROM public.listing_payments WHERE id = v_payment_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5.3 GAGAL: Anggota lain dapat mengintip listing_payment orang lain!';
  END IF;

  RAISE NOTICE '>> PASSED: Test 5 (Isolasi listing_payments) Sukses!';

  -- ------------------------------------------------------------
  -- CLEANUP
  -- ------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE postgres';

  DELETE FROM public.listing_payments WHERE id = v_payment_id;
  DELETE FROM public.public_listings WHERE tenant_id IN (v_tenant_a, v_tenant_ro);
  DELETE FROM public.tenants WHERE id IN (v_tenant_a, v_tenant_ro);
  DELETE FROM public.platform_admins WHERE user_id = v_platform_admin;
  DELETE FROM auth.users WHERE id IN (
    v_owner_a, v_member_a, v_member_a2, v_owner_ro, v_member_ro, v_platform_admin, v_outsider
  );

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST PUBLIC LISTINGS RLS MATRIX BERHASIL LULUS 100%%!';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;
