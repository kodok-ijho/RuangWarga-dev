-- Test Suite: Owner Push Events Trigger (Task KOS-5F Server)
-- Date: 2026-10-28
-- Ref: docs/handoff/KOS-5F.md
--
-- File ini memvalidasi fungsionalitas trigger notify_payment_submitted_push:
-- 1. Insert auth.users terlebih dahulu untuk owner dan member
-- 2. Setup tenant kos + member serta tenant rt_rw + member
-- 3. Insert payment kos pending_verification -> sukses (trigger tidak error walau vault secret ada/tidak)
-- 4. Update status payment: rejected -> pending_verification -> sukses
-- 5. Insert payment pada tenant rt_rw -> tidak memicu transmisi push kos (cek tidak error)
-- 6. Kembalikan role ke postgres di akhir

BEGIN;

DO $$
DECLARE
  v_owner_kos      UUID := gen_random_uuid();
  v_member_kos     UUID := gen_random_uuid();
  v_owner_rtrw     UUID := gen_random_uuid();
  v_member_rtrw    UUID := gen_random_uuid();

  v_tenant_kos     UUID := gen_random_uuid();
  v_tenant_rtrw    UUID := gen_random_uuid();

  v_unit_kos       BIGINT;
  v_unit_rtrw      BIGINT;

  v_member_kos_id  UUID := gen_random_uuid();
  v_member_rtrw_id UUID := gen_random_uuid();

  v_bill_kos       UUID := gen_random_uuid();
  v_bill_rtrw      UUID := gen_random_uuid();

  v_payment_kos    UUID := gen_random_uuid();
  v_payment_rtrw   UUID := gen_random_uuid();

  v_payment_row    RECORD;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: OWNER PUSH EVENTS (KOS-5F SERVER)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  -- 1. Insert auth.users terlebih dahulu
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos,   'owner_kos_test@test.invalid',   'authenticated', 'authenticated'),
    (v_member_kos,  'member_kos_test@test.invalid',  'authenticated', 'authenticated'),
    (v_owner_rtrw,  'owner_rtrw_test@test.invalid',  'authenticated', 'authenticated'),
    (v_member_rtrw, 'member_rtrw_test@test.invalid', 'authenticated', 'authenticated');

  -- 2. Setup tenant tipe 'kos' + member
  INSERT INTO public.tenants (id, name, type, owner_id)
  VALUES (v_tenant_kos, 'Kos Mawar Uji', 'kos', v_owner_kos);

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_kos;

  INSERT INTO public.tenant_units (tenant_id, label)
  VALUES (v_tenant_kos, 'Kamar 101')
  RETURNING id INTO v_unit_kos;

  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status)
  VALUES (v_member_kos_id, v_tenant_kos, v_member_kos, v_unit_kos, 'Penyewa Uji Kos', 'approved');

  INSERT INTO public.billing_items (id, tenant_id, unit_id, member_id, period, amount, status)
  VALUES (v_bill_kos, v_tenant_kos, v_unit_kos, v_member_kos_id, '2026-10', 1500000, 'unpaid');

  -- 3. Setup tenant tipe 'rt_rw' + member
  INSERT INTO public.tenants (id, name, type, owner_id)
  VALUES (v_tenant_rtrw, 'RT 05 Uji', 'rt_rw', v_owner_rtrw);

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_rtrw;

  INSERT INTO public.tenant_units (tenant_id, label)
  VALUES (v_tenant_rtrw, 'Rumah B-12')
  RETURNING id INTO v_unit_rtrw;

  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status)
  VALUES (v_member_rtrw_id, v_tenant_rtrw, v_member_rtrw, v_unit_rtrw, 'Warga Uji RTRW', 'approved');

  INSERT INTO public.billing_items (id, tenant_id, unit_id, member_id, period, amount, status)
  VALUES (v_bill_rtrw, v_tenant_rtrw, v_unit_rtrw, v_member_rtrw_id, '2026-10', 100000, 'unpaid');

  -- ----------------------------------------------------------------------------
  -- UJI 1: Insert payments pending_verification pada tenant kos -> sukses
  -- (Trigger notify_payment_submitted_push tidak error walau vault secret ada/tidak)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Insert payment status pending_verification pada tenant kos...';

  INSERT INTO public.payments (
    id, tenant_id, billing_item_id, member_id, amount, method, status, proof_url
  ) VALUES (
    v_payment_kos, v_tenant_kos, v_bill_kos, v_member_kos_id, 1500000, 'bank_transfer', 'pending_verification', 'https://example.com/proof1.jpg'
  );

  SELECT * INTO v_payment_row FROM public.payments WHERE id = v_payment_kos;
  IF v_payment_row.id IS NULL OR v_payment_row.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: Payment kos pending_verification tidak tersimpan';
  END IF;

  RAISE NOTICE '-> OK: Insert payment kos pending_verification sukses tanpa error.';

  -- ----------------------------------------------------------------------------
  -- UJI 2: Update rejected -> pending_verification -> sukses
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Update payment status rejected -> pending_verification pada tenant kos...';

  UPDATE public.payments
  SET status = 'rejected'
  WHERE id = v_payment_kos;

  SELECT * INTO v_payment_row FROM public.payments WHERE id = v_payment_kos;
  IF v_payment_row.status <> 'rejected' THEN
    RAISE EXCEPTION 'Uji 2.1 GAGAL: Status payment tidak berhasil diubah ke rejected';
  END IF;

  -- Transisi status kembali ke pending_verification memicu trigger pengiriman push
  UPDATE public.payments
  SET status = 'pending_verification', proof_url = 'https://example.com/proof_revisi.jpg'
  WHERE id = v_payment_kos;

  SELECT * INTO v_payment_row FROM public.payments WHERE id = v_payment_kos;
  IF v_payment_row.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'Uji 2.2 GAGAL: Payment kos tidak berstatus pending_verification setelah revisi';
  END IF;

  RAISE NOTICE '-> OK: Update rejected -> pending_verification sukses tanpa error.';

  -- ----------------------------------------------------------------------------
  -- UJI 3: Payments tenant rt_rw -> tidak memicu transmisi kos (cek tidak error)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Insert payment pada tenant rt_rw (bukan tipe kos)...';

  INSERT INTO public.payments (
    id, tenant_id, billing_item_id, member_id, amount, method, status, proof_url
  ) VALUES (
    v_payment_rtrw, v_tenant_rtrw, v_bill_rtrw, v_member_rtrw_id, 100000, 'bank_transfer', 'pending_verification', 'https://example.com/proof_rtrw.jpg'
  );

  SELECT * INTO v_payment_row FROM public.payments WHERE id = v_payment_rtrw;
  IF v_payment_row.id IS NULL OR v_payment_row.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: Payment tenant rt_rw tidak tersimpan';
  END IF;

  RAISE NOTICE '-> OK: Payment tenant rt_rw tersimpan dan tidak error.';

  -- ----------------------------------------------------------------------------
  -- KEMBALIKAN ROLE KE POSTGRES DI AKHIR
  -- ----------------------------------------------------------------------------
  BEGIN
    EXECUTE 'SET LOCAL ROLE postgres';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA PENGUJIAN OWNER PUSH EVENTS BERHASIL!';
  RAISE NOTICE '============================================================';
END;
$$;

ROLLBACK;
