-- Test Suite: Program Access & Pricing Matrix (PANITIA-HARGA.1)
-- Date: 2026-10-22
-- Ref: docs/handoff/PANITIA-HARGA.md § HARGA.1
--
-- Test coverage:
-- H1. Tenant panitia baru langsung tenant_subscriptions.status = 'active'. Tenant rt_rw baru tetap 'trial'.
-- H2. Acara pertama: is_free_trial = true, access_until ±1 bulan dari sekarang.
--     Acara kedua yang dikirim dengan access_until 5 tahun dan is_free_trial = true tetap tersimpan access_until = NULL, is_free_trial = false.
-- H3. Pengelola tidak bisa mengubah access_until (insufficient_privilege), tetapi bisa mengubah nama.
-- H4.
--     - pengeluaran acara 1 diterima;
--     - pengeluaran dan pemasukan acara 2 ditolak;
--     - pos RAB acara 2 diterima;
--     - pengeluaran tanpa acara diterima.
-- H5. Iuran acara 2 ditolak. Iuran acara 1 diterima, dan anggota bisa mengajukan transfer.
-- H6. Setelah access_until acara 1 dimundurkan ke kemarin (sebagai postgres):
--     - mengubah pengeluaran acara 1 ditolak;
--     - mengubah nominal iuran ditolak;
--     - pembayaran tunai baru ditolak;
--     - verifikasi pembayaran yang sudah diajukan (update payments + billing_items.status = 'paid') berhasil.
-- H7. extend_program_access oleh authenticated ditolak. Oleh service_role berhasil, dengan masa aktif ±12 bulan dari sekarang, lalu program_is_writable = true.
-- H8. Acara ketiga tidak mendapat jatah gratis.
-- H9. Acara milik tenant rt_rw tetap program_is_writable = true.
-- H10 (backfill). Ketentuan backfill: acara tertua tiap tenant panitia yang sudah ada sebelum migration mendapat is_free_trial dan access_until = created_at + 1 bulan.
--     (Dicatat dalam komentar pengujian; backfill dijalankan di migration 202610220003_program_access.sql).

BEGIN;

DO $$
DECLARE
  -- Auth User IDs
  v_user_owner_panitia UUID := gen_random_uuid();
  v_user_pengelola     UUID := gen_random_uuid();
  v_user_anggota       UUID := gen_random_uuid();
  v_user_owner_rtrw    UUID := gen_random_uuid();

  -- Tenant IDs
  v_tenant_panitia     UUID;
  v_tenant_rtrw        UUID;

  -- Role ID
  v_role_pengelola     UUID := gen_random_uuid();

  -- Member IDs
  v_member_pengelola   UUID := gen_random_uuid();
  v_member_anggota     UUID := gen_random_uuid();

  -- Program IDs
  v_prog_1             UUID := gen_random_uuid();
  v_prog_2             UUID := gen_random_uuid();
  v_prog_3             UUID := gen_random_uuid();
  v_prog_rtrw          UUID := gen_random_uuid();

  -- Entity IDs
  v_exp_1              UUID := gen_random_uuid();
  v_exp_no_prog        UUID := gen_random_uuid();
  v_rab_item           UUID := gen_random_uuid();
  v_due_1              UUID := gen_random_uuid();
  v_pay_transfer       UUID := gen_random_uuid();

  -- Helper variables
  v_sub_status         TEXT;
  v_is_trial           BOOLEAN;
  v_until              TIMESTAMPTZ;
  v_writable           BOOLEAN;
  v_count              INT;
  v_caught             BOOLEAN;
  v_err_msg            TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: PROGRAM ACCESS & PRICING (HARGA.1)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan auth users, tenants, roles, dan memberships...';

  -- 1. Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_user_owner_panitia, 'owner_panitia@test.invalid', 'authenticated', 'authenticated'),
    (v_user_pengelola,     'pengelola_panitia@test.invalid', 'authenticated', 'authenticated'),
    (v_user_anggota,       'anggota_panitia@test.invalid', 'authenticated', 'authenticated'),
    (v_user_owner_rtrw,    'owner_rtrw@test.invalid', 'authenticated', 'authenticated');

  -- 2. Tenants (Panitia & RT/RW)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Panitia Dies Natalis 2026', 'panitia', v_user_owner_panitia)
  RETURNING id INTO v_tenant_panitia;

  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('RT 05 RW 01 Perum Indah', 'rt_rw', v_user_owner_rtrw)
  RETURNING id INTO v_tenant_rtrw;

  -- ==============================================================================
  -- TEST H1: Tenant panitia langsung 'active', tenant rt_rw tetap 'trial'
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H1] Status langganan tenant baru panitia vs rt_rw...';

  SELECT status INTO v_sub_status
  FROM public.tenant_subscriptions
  WHERE tenant_id = v_tenant_panitia;
  ASSERT v_sub_status = 'active', 'H1.1 GAGAL: Tenant panitia baru tidak berstatus active (didapat: ' || COALESCE(v_sub_status, 'NULL') || ')';

  SELECT status INTO v_sub_status
  FROM public.tenant_subscriptions
  WHERE tenant_id = v_tenant_rtrw;
  ASSERT v_sub_status = 'trial', 'H1.2 GAGAL: Tenant rt_rw baru tidak berstatus trial (didapat: ' || COALESCE(v_sub_status, 'NULL') || ')';

  RAISE NOTICE '[TEST H1] LULUS: Tenant panitia berstatus active tanpa batas waktu, RT/RW trial.';

  -- Setup Roles & Members
  -- Role pengelola dengan izin lengkap transaksi & kepanitiaan
  INSERT INTO public.roles (id, tenant_id, name, permissions)
  VALUES (
    v_role_pengelola,
    v_tenant_panitia,
    'Ketua & Bendahara Acara',
    jsonb_build_array(
      'manage_programs',
      'manage_budget',
      'manage_expenses',
      'record_income',
      'generate_billing',
      'manage_billing_transfer',
      'record_cash_payment',
      'verify_payments',
      'view_reports'
    )
  );

  INSERT INTO public.tenant_members (id, tenant_id, user_id, role_id, status, full_name)
  VALUES
    (v_member_pengelola, v_tenant_panitia, v_user_pengelola, v_role_pengelola, 'approved', 'Budi Pengelola'),
    (v_member_anggota,   v_tenant_panitia, v_user_anggota,   NULL,             'approved', 'Siti Anggota');

  -- ==============================================================================
  -- TEST H2: Acara pertama gratis 1 bulan, acara kedua tidak gratis
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H2] Masa aktif acara pertama vs acara kedua...';

  -- Buat Acara 1 oleh Pengelola
  PERFORM set_config('request.jwt.claim.sub', v_user_pengelola::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.tenant_programs (id, tenant_id, name, status, starts_on)
  VALUES (v_prog_1, v_tenant_panitia, 'Pentas Seni Tahunan', 'planning', '2026-11-20');

  SELECT is_free_trial, access_until INTO v_is_trial, v_until
  FROM public.tenant_programs
  WHERE id = v_prog_1;

  ASSERT v_is_trial = true, 'H2.1 GAGAL: Acara pertama is_free_trial bukan true.';
  ASSERT v_until IS NOT NULL, 'H2.2 GAGAL: Acara pertama access_until NULL.';
  ASSERT v_until > now() + interval '25 days' AND v_until < now() + interval '35 days',
    'H2.3 GAGAL: Acara pertama access_until tidak berjarak ±1 bulan (didapat: ' || v_until::text || ')';

  -- Buat Acara 2 dengan nilai manipulasi dari klien (access_until 5 tahun, is_free_trial = true)
  INSERT INTO public.tenant_programs (id, tenant_id, name, status, starts_on, access_until, is_free_trial)
  VALUES (v_prog_2, v_tenant_panitia, 'Turnamen Futsal Panitia', 'planning', '2026-12-01', now() + interval '5 years', true);

  SELECT is_free_trial, access_until INTO v_is_trial, v_until
  FROM public.tenant_programs
  WHERE id = v_prog_2;

  ASSERT v_is_trial = false, 'H2.4 GAGAL: Acara kedua is_free_trial tidak dipaksa false oleh trigger.';
  ASSERT v_until IS NULL, 'H2.5 GAGAL: Acara kedua access_until tidak dipaksa NULL oleh trigger.';

  RAISE NOTICE '[TEST H2] LULUS: Acara 1 mendapat gratis 1 bulan; Acara 2 tidak gratis dan manipulasi klien diabaikan.';

  -- ==============================================================================
  -- TEST H3: Pengelola tidak bisa mengubah access_until, tetapi bisa ubah nama
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H3] Guard kolom access_until saat UPDATE...';

  -- Coba ubah access_until sebagai pengelola
  v_caught := false;
  BEGIN
    UPDATE public.tenant_programs
    SET access_until = now() + interval '1 year'
    WHERE id = v_prog_1;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H3.1 GAGAL: Pengelola berhasil mengubah access_until tanpa hak privilege.';

  -- Ubah nama acara berhasil
  UPDATE public.tenant_programs
  SET name = 'Pentas Seni Tahunan 2026 (Updated)'
  WHERE id = v_prog_1;

  SELECT name INTO v_err_msg FROM public.tenant_programs WHERE id = v_prog_1;
  ASSERT v_err_msg = 'Pentas Seni Tahunan 2026 (Updated)', 'H3.2 GAGAL: Pengelola gagal mengubah nama acara.';

  RAISE NOTICE '[TEST H3] LULUS: Pengelola ditolak ubah masa aktif tapi boleh ubah metadata acara.';

  -- ==============================================================================
  -- TEST H4: Transaksi acara 1 diterima, transaksi acara 2 ditolak
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H4] Penjaga transaksi acara (expenses & incomes)...';

  -- Pengeluaran acara 1 diterima
  INSERT INTO public.expenses (id, tenant_id, program_id, amount, recipient, description, date)
  VALUES (v_exp_1, v_tenant_panitia, v_prog_1, 500000, 'Toko Panggung', 'Sewa panggung termin 1', '2026-11-01');

  SELECT count(*) INTO v_count FROM public.expenses WHERE id = v_exp_1;
  ASSERT v_count = 1, 'H4.1 GAGAL: Pengeluaran acara 1 gagal dicatat.';

  -- Pengeluaran acara 2 ditolak
  v_caught := false;
  BEGIN
    INSERT INTO public.expenses (tenant_id, program_id, amount, recipient, description, date)
    VALUES (v_tenant_panitia, v_prog_2, 300000, 'Wasit Futsal', 'DP Wasit', '2026-11-02');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H4.2 GAGAL: Pengeluaran acara 2 yang belum aktif tidak ditolak.';

  -- Pemasukan acara 2 ditolak
  v_caught := false;
  BEGIN
    INSERT INTO public.non_ipl_incomes (tenant_id, program_id, amount, source_name, description, income_date)
    VALUES (v_tenant_panitia, v_prog_2, 1000000, 'Sponsor Minuman', 'Sponsor Futsal', '2026-11-02');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H4.3 GAGAL: Pemasukan acara 2 yang belum aktif tidak ditolak.';

  -- Pos RAB acara 2 diterima (perencanaan budget tetap boleh)
  INSERT INTO public.program_budget_items (id, tenant_id, program_id, kind, section, item, quantity, unit_price, amount)
  VALUES (v_rab_item, v_tenant_panitia, v_prog_2, 'expense', 'Lapangan', 'Sewa Lapangan 4 Jam', 4, 150000, 600000);

  SELECT count(*) INTO v_count FROM public.program_budget_items WHERE id = v_rab_item;
  ASSERT v_count = 1, 'H4.4 GAGAL: Pos RAB acara 2 gagal disimpan.';

  -- Pengeluaran tanpa acara diterima
  INSERT INTO public.expenses (id, tenant_id, program_id, amount, recipient, description, date)
  VALUES (v_exp_no_prog, v_tenant_panitia, NULL, 100000, 'Fotokopi Berkas', 'Fotokopi form anggota', '2026-11-03');

  SELECT count(*) INTO v_count FROM public.expenses WHERE id = v_exp_no_prog;
  ASSERT v_count = 1, 'H4.5 GAGAL: Pengeluaran tanpa program_id gagal disimpan.';

  RAISE NOTICE '[TEST H4] LULUS: Transaksi acara 1 diterima, transaksi acara 2 ditolak, RAB acara 2 dan pengeluaran umum boleh.';

  -- ==============================================================================
  -- TEST H5: Iuran acara 2 ditolak, Iuran acara 1 diterima & transfer boleh
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H5] Penjaga iuran acara (billing_items & payments)...';

  -- Iuran acara 2 ditolak
  v_caught := false;
  BEGIN
    INSERT INTO public.billing_items (tenant_id, program_id, member_id, amount, type, status)
    VALUES (v_tenant_panitia, v_prog_2, v_member_anggota, 75000, 'program_dues', 'unpaid');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H5.1 GAGAL: Penerbitan iuran acara 2 yang belum aktif tidak ditolak.';

  -- Iuran acara 1 diterima
  INSERT INTO public.billing_items (id, tenant_id, program_id, member_id, amount, type, status, due_date)
  VALUES (v_due_1, v_tenant_panitia, v_prog_1, v_member_anggota, 50000, 'program_dues', 'unpaid', '2026-11-15');

  SELECT count(*) INTO v_count FROM public.billing_items WHERE id = v_due_1;
  ASSERT v_count = 1, 'H5.2 GAGAL: Penerbitan iuran acara 1 gagal.';

  -- Anggota mengajukan pembayaran transfer untuk iuran acara 1
  PERFORM set_config('request.jwt.claim.sub', v_user_anggota::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.payments (
    id, tenant_id, billing_item_id, amount, payment_method, status, proof_file_path, metadata
  ) VALUES (
    v_pay_transfer,
    v_tenant_panitia,
    v_due_1,
    50000,
    'transfer_manual',
    'pending_verification',
    'tenants/' || v_tenant_panitia::text || '/payment-proofs/bukti.jpg',
    jsonb_build_object('bill_type', 'program_dues', 'program_id', v_prog_1)
  );

  UPDATE public.billing_items
  SET status = 'pending_verification'
  WHERE id = v_due_1;

  SELECT count(*) INTO v_count FROM public.payments WHERE id = v_pay_transfer;
  ASSERT v_count = 1, 'H5.3 GAGAL: Anggota gagal mengajukan bukti transfer iuran acara 1.';

  RAISE NOTICE '[TEST H5] LULUS: Penerbitan iuran acara 2 ditolak, acara 1 diterima dan transfer anggota berhasil diajukan.';

  -- ==============================================================================
  -- TEST H6: Acara 1 expired (access_until dimundurkan ke masa lalu)
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H6] Acara 1 lewat masa aktif (expired)...';

  -- Mundurkan access_until acara 1 sebagai postgres (superuser bypass)
  RESET role;
  UPDATE public.tenant_programs
  SET access_until = now() - interval '1 day'
  WHERE id = v_prog_1;

  -- Kembali sebagai pengelola
  PERFORM set_config('request.jwt.claim.sub', v_user_pengelola::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Mengubah pengeluaran acara 1 ditolak
  v_caught := false;
  BEGIN
    UPDATE public.expenses
    SET amount = 550000
    WHERE id = v_exp_1;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H6.1 GAGAL: Pengubahan pengeluaran acara expired tidak ditolak.';

  -- Mengubah nominal iuran acara 1 ditolak
  v_caught := false;
  BEGIN
    UPDATE public.billing_items
    SET amount = 60000
    WHERE id = v_due_1;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H6.2 GAGAL: Pengubahan nominal iuran acara expired tidak ditolak.';

  -- Pembayaran tunai baru ditolak
  v_caught := false;
  BEGIN
    INSERT INTO public.payments (
      tenant_id, billing_item_id, amount, payment_method, status
    ) VALUES (
      v_tenant_panitia, v_due_1, 50000, 'cash', 'completed'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H6.3 GAGAL: Pembayaran tunai baru untuk acara expired tidak ditolak.';

  -- Verifikasi pembayaran yang sudah diajukan BERHASIL (update payments + billing_items.status = 'paid')
  UPDATE public.payments
  SET status = 'completed',
      verified_at = now(),
      verified_by = v_user_pengelola
  WHERE id = v_pay_transfer;

  UPDATE public.billing_items
  SET status = 'paid'
  WHERE id = v_due_1;

  SELECT status INTO v_err_msg FROM public.billing_items WHERE id = v_due_1;
  ASSERT v_err_msg = 'paid', 'H6.4 GAGAL: Verifikasi pembayaran lama pada acara expired gagal.';

  RAISE NOTICE '[TEST H6] LULUS: Acara expired menolak transaksi baru/ubah nominal, tetapi verifikasi pembayaran lama berhasil.';

  -- ==============================================================================
  -- TEST H7: extend_program_access (authenticated ditolak, service_role berhasil)
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H7] extend_program_access permissions & renewal...';

  -- Dipanggil oleh authenticated ditolak
  v_caught := false;
  BEGIN
    PERFORM public.extend_program_access(v_prog_1, 12);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_caught := true;
  END;
  ASSERT v_caught = true, 'H7.1 GAGAL: extend_program_access oleh authenticated tidak ditolak.';

  -- Dipanggil oleh service_role BERHASIL
  RESET role;
  PERFORM set_config('role', 'service_role', true);

  v_until := public.extend_program_access(v_prog_1, 12);
  ASSERT v_until IS NOT NULL, 'H7.2 GAGAL: extend_program_access service_role mengembalikan NULL.';
  ASSERT v_until > now() + interval '11 months' AND v_until < now() + interval '13 months',
    'H7.3 GAGAL: Masa aktif baru tidak bertambah ±12 bulan (didapat: ' || v_until::text || ')';

  v_writable := public.program_is_writable(v_prog_1);
  ASSERT v_writable = true, 'H7.4 GAGAL: program_is_writable bukan true setelah diperpanjang.';

  RAISE NOTICE '[TEST H7] LULUS: extend_program_access aman khusus service_role dan memperpanjang masa aktif 12 bulan.';

  -- ==============================================================================
  -- TEST H8: Acara ketiga tidak mendapat jatah gratis
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H8] Acara ketiga tidak mendapat jatah gratis...';

  PERFORM set_config('request.jwt.claim.sub', v_user_pengelola::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.tenant_programs (id, tenant_id, name, status, starts_on)
  VALUES (v_prog_3, v_tenant_panitia, 'Bazaar Buku Panitia', 'planning', '2027-01-10');

  SELECT is_free_trial, access_until INTO v_is_trial, v_until
  FROM public.tenant_programs
  WHERE id = v_prog_3;

  ASSERT v_is_trial = false, 'H8.1 GAGAL: Acara ketiga mendapat is_free_trial true.';
  ASSERT v_until IS NULL, 'H8.2 GAGAL: Acara ketiga mendapat access_until non-null.';

  RAISE NOTICE '[TEST H8] LULUS: Acara ketiga tetap inactive tanpa jatah gratis.';

  -- ==============================================================================
  -- TEST H9: Acara milik tenant rt_rw selalu writable
  -- ==============================================================================
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '[TEST H9] Acara tenant rt_rw selalu writable...';

  -- Buat acara di tenant rt_rw
  RESET role;
  INSERT INTO public.tenant_programs (id, tenant_id, name, status, starts_on)
  VALUES (v_prog_rtrw, v_tenant_rtrw, 'Peringatan HUT RI RT 05', 'planning', '2026-08-17');

  v_writable := public.program_is_writable(v_prog_rtrw);
  ASSERT v_writable = true, 'H9.1 GAGAL: Acara milik tenant rt_rw tidak writable.';

  RAISE NOTICE '[TEST H9] LULUS: Acara tenant rt_rw selalu writable tanpa kunci per-acara.';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST SUITE PROGRAM ACCESS & PRICING (HARGA.1) LULUS!';
  RAISE NOTICE '============================================================';

END $$;

ROLLBACK;
