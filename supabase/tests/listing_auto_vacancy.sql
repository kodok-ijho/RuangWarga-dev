-- Test Suite: Listing Auto Vacancy & Pause-Resume Flow (Task LIST-AUTO-1.1)
-- Date: 2026-10-26
-- Ref: docs/handoff/LIST-AUTO-1.md
--
-- File ini memvalidasi aturan iklan otomatis saat kamar kosong:
-- 1. Sakelar mati: checkout kamar -> tidak ada draf baru
-- 2. Sakelar nyala + nomor: checkout kamar -> satu draf pending_payment, auto_created=true, judul/harga/fasilitas benar
-- 3. Checkout berulang tidak membuat draf ganda
-- 4. Kamar terisi -> draf otomatis tanpa pembayaran terhapus
-- 5. Iklan active lalu kontrak baru -> rented_or_sold dengan sisa tersimpan; checkout sakelar nyala -> active kembali
-- 6. Kamar dikecualikan (auto_listing_disabled = true) -> tidak ada draf
-- 7. Gagal membuat draf (mis. nomor kosong) tidak menggagalkan checkout: lewati dengan aman
-- 8. resume_listing_remaining: otorisasi ditolak untuk warga biasa (42501)
-- 9. resume_listing_remaining: oleh owner saat kamar terisi -> ditolak
-- 10. resume_listing_remaining: oleh owner saat kamar kosong -> sukses
-- 11. Draf baru mewarisi foto dari iklan terakhir kamar itu jika pernah ada
-- 12. Penguncian kolom auto_created dan paused_remaining_seconds dari klien:
--     UPDATE paused_remaining_seconds -> 42501, INSERT auto_created=true & paused_remaining_seconds=1000 -> dipaksa false & NULL

BEGIN;

DO $$
DECLARE
  v_owner_user_id     UUID := gen_random_uuid();
  v_warga_user_id     UUID := gen_random_uuid();
  v_tenant_id         UUID;
  v_role_base_id      UUID;
  v_member_owner_id   UUID;
  v_member_warga_id   UUID;
  v_room_1_id         BIGINT;
  v_room_2_id         BIGINT;
  v_room_3_id         BIGINT;
  v_contract_res      JSONB;
  v_checkout_res      JSONB;
  v_listing_rec       RECORD;
  v_active_listing_id UUID;
  v_paused_listing_id UUID;
  v_new_draft_id      UUID;
  v_count             INT;
  v_today             DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_caught_error      BOOLEAN;
  v_sqlstate          TEXT;
  v_resume_res        JSONB;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: LISTING AUTO VACANCY (LIST-AUTO-1.1)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  -- 1. Insert auth.users (wajib sebelum tenant_members karena FK user_id)
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_user_id, 'owner_auto@test.invalid', 'authenticated', 'authenticated'),
    (v_warga_user_id, 'warga_auto@test.invalid', 'authenticated', 'authenticated');

  -- 2. Insert tenant kos dengan sakelar awal mati
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES (
    'Kos Melati Indah',
    'kos',
    v_owner_user_id,
    jsonb_build_object(
      'rent_grace_days', 10,
      'default_rent_price', 1200000,
      'auto_listing_on_vacant', false,
      'listing_contact_phone', '08123456789',
      'listing_default_category', 'Putri'
    )
  ) RETURNING id INTO v_tenant_id;

  -- 3. Dapatkan membership owner dari trigger provisioning handle_new_tenant
  SELECT id INTO v_member_owner_id
  FROM public.tenant_members
  WHERE tenant_id = v_tenant_id AND user_id = v_owner_user_id;

  UPDATE public.tenant_members
  SET is_owner = true,
      status = 'approved'
  WHERE id = v_member_owner_id;

  -- Tambah warga biasa dengan role base
  SELECT id INTO v_role_base_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_id AND is_base_role = true
  LIMIT 1;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_id, v_warga_user_id, 'Warga Biasa', 'approved', false, v_role_base_id)
  RETURNING id INTO v_member_warga_id;

  -- 4. Setup unit kamar kos
  -- Kamar 1: Kamar standar (harga dan fasilitas terdefinisi di metadata)
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (
    v_tenant_id,
    'Kamar 101',
    'vacant',
    jsonb_build_object(
      'rent_price', 1200000,
      'facilities', jsonb_build_array('AC', 'WiFi', 'Kamar Mandi Dalam')
    )
  ) RETURNING id INTO v_room_1_id;

  -- Kamar 2: Kamar yang dikecualikan dari iklan otomatis
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (
    v_tenant_id,
    'Kamar 102',
    'vacant',
    jsonb_build_object(
      'rent_price', 1500000,
      'facilities', jsonb_build_array('AC', 'TV'),
      'auto_listing_disabled', true
    )
  ) RETURNING id INTO v_room_2_id;

  -- Kamar 3: Kamar untuk pengujian siklus iklan aktif & jeda sisa masa tayang
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (
    v_tenant_id,
    'Kamar 103',
    'vacant',
    jsonb_build_object(
      'rent_price', 1300000,
      'facilities', jsonb_build_array('WiFi')
    )
  ) RETURNING id INTO v_room_3_id;

  -- ----------------------------------------------------------------------------
  -- UJI 1: Sakelar mati: checkout -> tidak ada draf
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menguji checkout saat sakelar mati...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Buat kontrak di Kamar 101 -> kamar menjadi occupied
  v_contract_res := public.create_kos_contract(v_tenant_id, v_room_1_id, NULL, 'Penyewa Kamar 101', 1200000, v_today);

  IF (SELECT status FROM public.tenant_units WHERE id = v_room_1_id) <> 'occupied' THEN
    RAISE EXCEPTION 'Uji 1 Gagal: kamar 101 tidak occupied setelah kontrak dibuat';
  END IF;

  -- Checkout Kamar 101 -> kamar menjadi vacant
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_1_id, v_today, 'Checkout Kamar 101 (sakelar mati)', true);

  IF (SELECT status FROM public.tenant_units WHERE id = v_room_1_id) <> 'vacant' THEN
    RAISE EXCEPTION 'Uji 1 Gagal: kamar 101 tidak vacant setelah checkout';
  END IF;

  SELECT count(*) INTO v_count FROM public.public_listings WHERE unit_id = v_room_1_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Uji 1 Gagal: draf terbuat padahal sakelar mati, count: %', v_count;
  END IF;
  RAISE NOTICE '-> OK: Tidak ada draf dibuat saat sakelar mati.';

  -- ----------------------------------------------------------------------------
  -- UJI 2: Sakelar nyala + nomor: checkout -> draf pending_payment, auto_created=true, data valid
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Menguji checkout saat sakelar menyala...';
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenants
  SET settings = settings || jsonb_build_object(
    'auto_listing_on_vacant', true,
    'listing_contact_phone', '08123456789',
    'listing_default_category', 'Putri'
  )
  WHERE id = v_tenant_id;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Buat kontrak baru di Kamar 101
  v_contract_res := public.create_kos_contract(v_tenant_id, v_room_1_id, NULL, 'Penyewa Kamar 101 B', 1200000, v_today);

  -- Lakukan checkout Kamar 101
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_1_id, v_today, 'Checkout Kamar 101 (sakelar nyala)', true);

  SELECT count(*) INTO v_count FROM public.public_listings WHERE unit_id = v_room_1_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Uji 2 Gagal: draf otomatis tidak terbentuk, count: %', v_count;
  END IF;

  SELECT * INTO v_listing_rec FROM public.public_listings WHERE unit_id = v_room_1_id;
  IF v_listing_rec.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Uji 2 Gagal: status draf bukan pending_payment, aktual: %', v_listing_rec.status;
  END IF;
  IF v_listing_rec.auto_created <> true THEN
    RAISE EXCEPTION 'Uji 2 Gagal: flag auto_created bukan true';
  END IF;
  IF v_listing_rec.title <> 'Kamar 101 – Kos Melati Indah' THEN
    RAISE EXCEPTION 'Uji 2 Gagal: judul draf salah, aktual: %', v_listing_rec.title;
  END IF;
  IF v_listing_rec.price <> 1200000 THEN
    RAISE EXCEPTION 'Uji 2 Gagal: harga draf salah, aktual: %', v_listing_rec.price;
  END IF;
  IF v_listing_rec.facilities <> jsonb_build_array('AC', 'WiFi', 'Kamar Mandi Dalam') THEN
    RAISE EXCEPTION 'Uji 2 Gagal: fasilitas draf salah, aktual: %', v_listing_rec.facilities;
  END IF;
  IF v_listing_rec.contact_phone <> '08123456789' THEN
    RAISE EXCEPTION 'Uji 2 Gagal: nomor kontak draf salah, aktual: %', v_listing_rec.contact_phone;
  END IF;
  IF v_listing_rec.category <> 'Putri' THEN
    RAISE EXCEPTION 'Uji 2 Gagal: kategori draf salah, aktual: %', v_listing_rec.category;
  END IF;
  IF v_listing_rec.type <> 'room_vacancy' THEN
    RAISE EXCEPTION 'Uji 2 Gagal: tipe listing salah, aktual: %', v_listing_rec.type;
  END IF;
  RAISE NOTICE '-> OK: Draf iklan otomatis pending_payment terbentuk dengan atribut valid.';

  -- ----------------------------------------------------------------------------
  -- UJI 3: Checkout berulang tidak membuat draf ganda
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Menguji idempotency checkout berulang...';
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_1_id, v_today, 'Checkout ulang kamar yang sudah kosong', true);

  SELECT count(*) INTO v_count FROM public.public_listings WHERE unit_id = v_room_1_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Uji 3 Gagal: checkout berulang menghasilkan draf ganda, aktual count: %', v_count;
  END IF;
  RAISE NOTICE '-> OK: Checkout berulang tidak menduplikasi draf.';

  -- ----------------------------------------------------------------------------
  -- UJI 4: Kamar terisi -> draf otomatis tanpa pembayaran terhapus
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Menguji penghapusan draf otomatis belum bayar saat kamar terisi...';
  -- Buat kontrak baru di Kamar 101 (kamar terisi kembali)
  v_contract_res := public.create_kos_contract(v_tenant_id, v_room_1_id, NULL, 'Penyewa Masuk 101', 1200000, v_today);

  IF (SELECT status FROM public.tenant_units WHERE id = v_room_1_id) <> 'occupied' THEN
    RAISE EXCEPTION 'Uji 4 Gagal: kamar 101 tidak occupied';
  END IF;

  SELECT count(*) INTO v_count FROM public.public_listings WHERE unit_id = v_room_1_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Uji 4 Gagal: draf otomatis yang belum dibayar tidak terhapus saat kamar terisi, aktual: %', v_count;
  END IF;
  RAISE NOTICE '-> OK: Draf otomatis yang belum dibayar berhasil terhapus saat kamar terisi.';

  -- ----------------------------------------------------------------------------
  -- UJI 5: Iklan active lalu kontrak baru dibuat -> rented_or_sold, sisa tersimpan;
  --        checkout dengan sakelar nyala -> iklan active lagi dengan expires_at ≈ now() + sisa
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Menguji jeda iklan aktif (pause) dan pemulihan otomatis (resume)...';
  -- Siapkan iklan aktif di Kamar 103 dengan masa tayang 20 hari ke depan sebagai privileged
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);

  INSERT INTO public.public_listings (
    tenant_id,
    unit_id,
    posted_by,
    type,
    title,
    category,
    price,
    photos,
    contact_phone,
    facilities,
    status,
    auto_created,
    expires_at,
    paused_remaining_seconds
  ) VALUES (
    v_tenant_id,
    v_room_3_id,
    v_member_owner_id,
    'room_vacancy',
    'Kamar 103 – Kos Melati Indah',
    'Putri',
    1300000,
    '["https://example.com/foto103.jpg"]'::jsonb,
    '08123456789',
    '["WiFi"]'::jsonb,
    'active',
    false,
    now() + interval '20 days',
    NULL
  ) RETURNING id INTO v_active_listing_id;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Kamar 103 terisi oleh kontrak baru
  v_contract_res := public.create_kos_contract(v_tenant_id, v_room_3_id, NULL, 'Penyewa Masuk 103', 1300000, v_today);

  -- Cek bahwa iklan menjadi rented_or_sold dan paused_remaining_seconds tersimpan
  SELECT * INTO v_listing_rec FROM public.public_listings WHERE id = v_active_listing_id;
  IF v_listing_rec.status <> 'rented_or_sold' THEN
    RAISE EXCEPTION 'Uji 5 Gagal: status iklan bukan rented_or_sold, aktual: %', v_listing_rec.status;
  END IF;
  IF v_listing_rec.paused_remaining_seconds IS NULL OR v_listing_rec.paused_remaining_seconds < 19 * 86400 THEN
    RAISE EXCEPTION 'Uji 5 Gagal: paused_remaining_seconds tidak valid (~20 hari), aktual: %', v_listing_rec.paused_remaining_seconds;
  END IF;

  -- Checkout Kamar 103 saat sakelar masih menyala
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_3_id, v_today, 'Checkout Kamar 103', true);

  -- Iklan harus otomatis aktif kembali dengan expires_at ≈ now() + sisa masa tayang
  SELECT * INTO v_listing_rec FROM public.public_listings WHERE id = v_active_listing_id;
  IF v_listing_rec.status <> 'active' THEN
    RAISE EXCEPTION 'Uji 5 Gagal: iklan tidak aktif kembali setelah checkout, aktual: %', v_listing_rec.status;
  END IF;
  IF v_listing_rec.paused_remaining_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'Uji 5 Gagal: paused_remaining_seconds tidak di-NULL-kan setelah aktif kembali';
  END IF;
  IF v_listing_rec.expires_at <= now() + interval '19 days' OR v_listing_rec.expires_at > now() + interval '21 days' THEN
    RAISE EXCEPTION 'Uji 5 Gagal: masa tayang expires_at tidak sesuai perkiraan sisa masa tayang, aktual: %', v_listing_rec.expires_at;
  END IF;

  -- Pastikan tidak ada draf baru tambahan untuk kamar 103
  SELECT count(*) INTO v_count FROM public.public_listings WHERE unit_id = v_room_3_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Uji 5 Gagal: draf baru dibuat padahal iklan lama telah diaktifkan kembali, count: %', v_count;
  END IF;
  RAISE NOTICE '-> OK: Iklan aktif dijeda dengan sisa masa dan otomatis tayang kembali saat kamar kosong.';

  -- ----------------------------------------------------------------------------
  -- UJI 6: Kamar dikecualikan (auto_listing_disabled = true) -> tidak ada draf
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menguji kamar yang dikecualikan (auto_listing_disabled)...';
  -- Buat kontrak di Kamar 102
  v_contract_res := public.create_kos_contract(v_tenant_id, v_room_2_id, NULL, 'Penyewa Kamar 102', 1500000, v_today);

  -- Checkout Kamar 102
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_2_id, v_today, 'Checkout Kamar 102', true);

  SELECT count(*) INTO v_count FROM public.public_listings WHERE unit_id = v_room_2_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Uji 6 Gagal: kamar yang dikecualikan tetap dibuatkan draf, count: %', v_count;
  END IF;
  RAISE NOTICE '-> OK: Kamar dengan auto_listing_disabled dilewati dari pembuatan draf.';

  -- ----------------------------------------------------------------------------
  -- UJI 7: Gagal membuat draf (mis. nomor kosong) tidak menggagalkan checkout: lewati dengan aman
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 7] Menguji ketahanan checkout saat nomor telepon kosong...';
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenants
  SET settings = settings || jsonb_build_object('listing_contact_phone', '')
  WHERE id = v_tenant_id;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Checkout Kamar 101 (saat ini occupied dari Uji 4)
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_1_id, v_today, 'Checkout saat nomor telepon kosong', true);

  IF (SELECT status FROM public.tenant_units WHERE id = v_room_1_id) <> 'vacant' THEN
    RAISE EXCEPTION 'Uji 7 Gagal: checkout gagal saat nomor telepon kosong!';
  END IF;

  SELECT count(*) INTO v_count FROM public.public_listings WHERE unit_id = v_room_1_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Uji 7 Gagal: draf terbuat saat nomor telepon kosong, count: %', v_count;
  END IF;

  -- Kembalikan nomor kontak valid di pengaturan
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenants
  SET settings = settings || jsonb_build_object('listing_contact_phone', '08123456789')
  WHERE id = v_tenant_id;
  RAISE NOTICE '-> OK: Gagal membuat draf tidak menggagalkan checkout.';

  -- ----------------------------------------------------------------------------
  -- UJI 8: resume_listing_remaining oleh warga biasa -> 42501
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 8] Menguji otorisasi resume_listing_remaining ditolak untuk warga biasa (42501)...';
  -- Buat listing berstatus rented_or_sold dengan paused_remaining_seconds untuk Kamar 101
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);

  INSERT INTO public.public_listings (
    tenant_id,
    unit_id,
    posted_by,
    type,
    title,
    category,
    price,
    photos,
    contact_phone,
    facilities,
    status,
    auto_created,
    expires_at,
    paused_remaining_seconds
  ) VALUES (
    v_tenant_id,
    v_room_1_id,
    v_member_owner_id,
    'room_vacancy',
    'Kamar 101 Paused Test',
    'Putri',
    1200000,
    '[]'::jsonb,
    '08123456789',
    '["WiFi"]'::jsonb,
    'rented_or_sold',
    false,
    NULL,
    86400 -- 1 hari sisa
  ) RETURNING id INTO v_paused_listing_id;

  -- Beralih ke identitas warga biasa
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_warga_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_caught_error := false;
  BEGIN
    PERFORM public.resume_listing_remaining(v_paused_listing_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_caught_error := true;
    END IF;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'Uji 8 Gagal: warga biasa diizinkan memanggil resume_listing_remaining!';
  END IF;
  RAISE NOTICE '-> OK: resume_listing_remaining ditolak untuk warga biasa dengan SQLSTATE 42501.';

  -- ----------------------------------------------------------------------------
  -- UJI 9: resume_listing_remaining oleh owner saat kamar terisi -> ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 9] Menguji resume_listing_remaining saat kamar terkait sedang terisi...';
  -- Beralih ke owner dan buat kontrak agar Kamar 101 menjadi occupied
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_contract_res := public.create_kos_contract(v_tenant_id, v_room_1_id, NULL, 'Penyewa Masuk Kamar 101 Uji 9', 1200000, v_today);

  IF (SELECT status FROM public.tenant_units WHERE id = v_room_1_id) <> 'occupied' THEN
    RAISE EXCEPTION 'Uji 9 Gagal: kamar 101 tidak occupied';
  END IF;

  v_caught_error := false;
  BEGIN
    PERFORM public.resume_listing_remaining(v_paused_listing_id);
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'Uji 9 Gagal: resume_listing_remaining diizinkan padahal kamar terkait terisi!';
  END IF;
  RAISE NOTICE '-> OK: resume_listing_remaining ditolak saat kamar terkait sedang terisi.';

  -- ----------------------------------------------------------------------------
  -- UJI 10: resume_listing_remaining oleh owner saat kamar kosong -> sukses
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 10] Menguji resume_listing_remaining secara manual saat kamar kosong...';
  -- Matikan sakelar otomatis sementara agar checkout tidak memicu resume otomatis pada listing
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenants
  SET settings = settings || jsonb_build_object('auto_listing_on_vacant', false)
  WHERE id = v_tenant_id;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Checkout Kamar 101 -> kamar menjadi vacant
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_1_id, v_today, 'Checkout Kamar 101 Uji 10', true);

  -- Panggil resume_listing_remaining oleh owner
  v_resume_res := public.resume_listing_remaining(v_paused_listing_id);

  IF COALESCE((v_resume_res->>'success')::boolean, false) <> true THEN
    RAISE EXCEPTION 'Uji 10 Gagal: response resume_listing_remaining tidak success';
  END IF;

  SELECT * INTO v_listing_rec FROM public.public_listings WHERE id = v_paused_listing_id;
  IF v_listing_rec.status <> 'active' THEN
    RAISE EXCEPTION 'Uji 10 Gagal: status listing bukan active setelah resume, aktual: %', v_listing_rec.status;
  END IF;
  IF v_listing_rec.paused_remaining_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'Uji 10 Gagal: paused_remaining_seconds bukan NULL setelah resume';
  END IF;
  IF v_listing_rec.expires_at <= now() + interval '23 hours' OR v_listing_rec.expires_at > now() + interval '25 hours' THEN
    RAISE EXCEPTION 'Uji 10 Gagal: expires_at tidak sesuai perkiraan sisa masa tayang 1 hari, aktual: %', v_listing_rec.expires_at;
  END IF;
  RAISE NOTICE '-> OK: resume_listing_remaining berhasil menayangkan kembali iklan saat kamar kosong.';

  -- ----------------------------------------------------------------------------
  -- UJI 11: Draf baru mewarisi foto dari iklan terakhir kamar itu jika pernah ada
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 11] Menguji pewarisan foto dari iklan terakhir saat draf baru dibuat...';
  -- Aktifkan kembali sakelar auto_listing_on_vacant
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.tenants
  SET settings = settings || jsonb_build_object('auto_listing_on_vacant', true)
  WHERE id = v_tenant_id;

  -- Di Kamar 103, sebelumnya ada iklan v_active_listing_id yang memiliki photos = '["https://example.com/foto103.jpg"]'
  -- Ubah status iklan Kamar 103 menjadi expired agar tidak terdeteksi sebagai paused listing
  UPDATE public.public_listings
  SET status = 'expired',
      paused_remaining_seconds = NULL
  WHERE id = v_active_listing_id;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Masukkan penyewa baru ke Kamar 103 lalu checkout agar draf baru terpicu
  v_contract_res := public.create_kos_contract(v_tenant_id, v_room_3_id, NULL, 'Penyewa Masuk 103 Uji 11', 1300000, v_today);
  v_checkout_res := public.checkout_kos_room(v_tenant_id, v_room_3_id, v_today, 'Checkout Kamar 103 Uji 11', true);

  -- Dapatkan draf baru yang dibuat untuk Kamar 103
  SELECT * INTO v_listing_rec
  FROM public.public_listings
  WHERE unit_id = v_room_3_id AND status = 'pending_payment' AND auto_created = true;

  IF v_listing_rec.id IS NULL THEN
    RAISE EXCEPTION 'Uji 11 Gagal: draf baru untuk kamar 103 tidak ditemukan';
  END IF;

  IF v_listing_rec.photos <> '["https://example.com/foto103.jpg"]'::jsonb THEN
    RAISE EXCEPTION 'Uji 11 Gagal: foto dari iklan terdahulu tidak diwarisi pada draf baru, aktual: %', v_listing_rec.photos;
  END IF;
  RAISE NOTICE '-> OK: Draf baru berhasil mewarisi foto dari iklan terdahulu kamar tersebut.';

  -- ----------------------------------------------------------------------------
  -- UJI 12: Penguncian kolom auto_created dan paused_remaining_seconds dari klien
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 12] Menguji penguncian kolom auto_created dan paused_remaining_seconds dari klien...';
  -- 12.1 UPDATE paused_remaining_seconds oleh owner pada iklan miliknya ditolak (42501)
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_caught_error := false;
  v_sqlstate := NULL;
  BEGIN
    UPDATE public.public_listings
    SET paused_remaining_seconds = 86400
    WHERE id = v_active_listing_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_caught_error := true;
    END IF;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'Uji 12.1 Gagal: UPDATE paused_remaining_seconds oleh owner tidak ditolak 42501, sqlstate: %', v_sqlstate;
  END IF;
  RAISE NOTICE '-> OK: UPDATE paused_remaining_seconds oleh owner ditolak dengan SQLSTATE 42501.';

  -- 12.2 UPDATE auto_created oleh owner pada iklan miliknya ditolak (42501)
  v_caught_error := false;
  v_sqlstate := NULL;
  BEGIN
    UPDATE public.public_listings
    SET auto_created = true
    WHERE id = v_active_listing_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_caught_error := true;
    END IF;
  END;

  IF NOT v_caught_error THEN
    RAISE EXCEPTION 'Uji 12.2 Gagal: UPDATE auto_created oleh owner tidak ditolak 42501, sqlstate: %', v_sqlstate;
  END IF;
  RAISE NOTICE '-> OK: UPDATE auto_created oleh owner ditolak dengan SQLSTATE 42501.';

  -- 12.3 INSERT iklan dengan auto_created = true dan paused_remaining_seconds = 1000 oleh owner
  --      harus tersimpan sebagai auto_created = false dan paused_remaining_seconds = NULL
  INSERT INTO public.public_listings (
    tenant_id,
    posted_by,
    type,
    title,
    contact_phone,
    auto_created,
    paused_remaining_seconds
  ) VALUES (
    v_tenant_id,
    v_member_owner_id,
    'room_vacancy',
    'Kamar Uji Guard Kolom Auto',
    '08123456789',
    true,
    1000
  ) RETURNING id INTO v_new_draft_id;

  SELECT * INTO v_listing_rec
  FROM public.public_listings
  WHERE id = v_new_draft_id;

  IF v_listing_rec.auto_created <> false THEN
    RAISE EXCEPTION 'Uji 12.3 Gagal: auto_created tidak tersimpan false, aktual: %', v_listing_rec.auto_created;
  END IF;
  IF v_listing_rec.paused_remaining_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'Uji 12.3 Gagal: paused_remaining_seconds tidak tersimpan NULL, aktual: %', v_listing_rec.paused_remaining_seconds;
  END IF;
  RAISE NOTICE '-> OK: INSERT iklan dengan auto_created=true dan paused_remaining_seconds=1000 tersimpan false dan NULL.';

  -- Pastikan di akhir DO block role dikembalikan ke postgres
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI LISTING AUTO VACANCY (LIST-AUTO-1.1) BERHASIL!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
