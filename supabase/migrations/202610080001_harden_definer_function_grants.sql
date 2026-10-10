-- Migration: Harden SECURITY DEFINER Function Grants & Authorization Guards
-- Task: SEC-1.1 (Security Hardening Batch)
-- Date: 2026-10-08
-- Ref: docs/handoff/SEC-1.md

BEGIN;

-- ==============================================================================
-- PART A: HANYA BACKEND (SERVICE_ROLE)
-- Cabut akses dari PUBLIC, anon, authenticated untuk fungsi backend & trigger
-- ==============================================================================

-- 1. activate_tenant_subscription(uuid, text)
REVOKE ALL ON FUNCTION public.activate_tenant_subscription(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_tenant_subscription(UUID, TEXT) TO service_role;

-- 2. activate_listing_payment(uuid, text)
REVOKE ALL ON FUNCTION public.activate_listing_payment(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_listing_payment(UUID, TEXT) TO service_role;

-- 3. check_subscription_expirations()
REVOKE ALL ON FUNCTION public.check_subscription_expirations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_subscription_expirations() TO service_role;

-- 4. migrate_legacy_portal_warga(text, text, text)
REVOKE ALL ON FUNCTION public.migrate_legacy_portal_warga(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_legacy_portal_warga(TEXT, TEXT, TEXT) TO service_role;

-- 5. handle_new_tenant()
REVOKE ALL ON FUNCTION public.handle_new_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_tenant() TO service_role;

-- 6. handle_superadmin_user_created()
REVOKE ALL ON FUNCTION public.handle_superadmin_user_created() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_superadmin_user_created() TO service_role;

-- 7. trg_check_arisan_billing_status()
REVOKE ALL ON FUNCTION public.trg_check_arisan_billing_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_check_arisan_billing_status() TO service_role;


-- ==============================================================================
-- PART E: INTEGRITAS STATUS PEMBAYARAN PADA FUNGSI AKTIVASI
-- ==============================================================================

-- E.1 Update activate_tenant_subscription: tolak aktivasi jika status bukan 'pending'
CREATE OR REPLACE FUNCTION public.activate_tenant_subscription(
  p_payment_id UUID,
  p_gateway_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_subscription RECORD;
  v_period RECORD;
  v_new_end TIMESTAMPTZ;
BEGIN
  -- Ambil record pembayaran
  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record not found');
  END IF;

  -- Idempotency check: jika sudah settled, kembalikan success
  IF v_payment.status = 'settled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Payment already settled');
  END IF;

  -- Validasi status: hanya proses bila berstatus pending
  IF v_payment.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment status tidak valid: ' || v_payment.status);
  END IF;

  -- Ambil data periode langganan
  SELECT * INTO v_period
  FROM public.subscription_periods
  WHERE id = v_payment.period_id;

  -- Hitung masa berlaku baru
  SELECT * INTO v_subscription
  FROM public.tenant_subscriptions
  WHERE id = v_payment.subscription_id;

  IF v_subscription.status = 'active' AND v_subscription.current_period_end > now() THEN
    v_new_end := v_subscription.current_period_end + (v_period.duration_months || ' months')::interval;
  ELSE
    v_new_end := now() + (v_period.duration_months || ' months')::interval;
  END IF;

  -- 1. Update subscription_payments
  UPDATE public.subscription_payments
  SET status = 'settled',
      paid_at = now(),
      payment_gateway_ref = COALESCE(p_gateway_ref, payment_gateway_ref),
      updated_at = now()
  WHERE id = p_payment_id;

  -- 2. Update tenant_subscriptions
  UPDATE public.tenant_subscriptions
  SET status = 'active',
      period_id = v_payment.period_id,
      current_period_start = now(),
      current_period_end = v_new_end,
      updated_at = now()
  WHERE id = v_payment.subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_payment.subscription_id,
    'status', 'active',
    'current_period_end', v_new_end
  );
END;
$$;

-- E.2 Update activate_listing_payment: tolak aktivasi jika status bukan 'pending'
CREATE OR REPLACE FUNCTION public.activate_listing_payment(
  p_payment_id UUID,
  p_gateway_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_listing RECORD;
  v_new_expires TIMESTAMPTZ;
  v_new_featured_until TIMESTAMPTZ;
  v_duration INTEGER;
  v_is_featured BOOLEAN;
BEGIN
  -- 1. Ambil record pembayaran listing
  SELECT * INTO v_payment
  FROM public.listing_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record not found');
  END IF;

  -- 2. Idempotency: Jika sudah berstatus paid, return success
  IF v_payment.status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Payment already settled',
      'payment_id', v_payment.id,
      'listing_id', v_payment.listing_id
    );
  END IF;

  -- Validasi status: hanya proses bila berstatus pending
  IF v_payment.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment status tidak valid: ' || v_payment.status);
  END IF;

  -- 3. Ambil data listing
  SELECT * INTO v_listing
  FROM public.public_listings
  WHERE id = v_payment.listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Associated listing not found');
  END IF;

  -- 4. Hitung masa aktif dan status featured
  v_duration := COALESCE(v_payment.duration_days, 30);
  v_is_featured := COALESCE(v_payment.is_featured, false);

  IF v_listing.status = 'active' AND v_listing.expires_at > now() THEN
    v_new_expires := v_listing.expires_at + (v_duration || ' days')::interval;
  ELSE
    v_new_expires := now() + (v_duration || ' days')::interval;
  END IF;

  IF v_is_featured THEN
    IF v_listing.is_featured AND v_listing.featured_until IS NOT NULL AND v_listing.featured_until > now() THEN
      v_new_featured_until := v_listing.featured_until + (v_duration || ' days')::interval;
    ELSE
      v_new_featured_until := now() + (v_duration || ' days')::interval;
    END IF;
  ELSE
    IF v_listing.is_featured AND v_listing.featured_until IS NOT NULL AND v_listing.featured_until > now() THEN
      v_new_featured_until := v_listing.featured_until;
      v_is_featured := true;
    ELSE
      v_new_featured_until := NULL;
      v_is_featured := false;
    END IF;
  END IF;

  -- 5. Update record di listing_payments
  UPDATE public.listing_payments
  SET status = 'paid',
      paid_at = now(),
      qris_ref = COALESCE(p_gateway_ref, qris_ref),
      updated_at = now()
  WHERE id = p_payment_id;

  -- 6. Update record di public_listings
  UPDATE public.public_listings
  SET status = 'active',
      expires_at = v_new_expires,
      is_featured = v_is_featured,
      featured_until = v_new_featured_until,
      updated_at = now()
  WHERE id = v_listing.id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'listing_id', v_listing.id,
    'status', 'active',
    'is_featured', v_is_featured,
    'expires_at', v_new_expires,
    'featured_until', v_new_featured_until
  );
END;
$$;


-- ==============================================================================
-- PART B: FUNGSI YANG DIPANGGIL PENGGUNA TERAUTENTIKASI (AUTHENTICATED)
-- Tambahkan Guard Otorisasi & Perbarui Hak Akses
-- ==============================================================================

-- B.1 draw_arisan_winner(uuid, uuid, uuid)
-- Guard: has_permission(p_tenant_id, 'run_special_action')
CREATE OR REPLACE FUNCTION public.draw_arisan_winner(
  p_tenant_id uuid,
  p_round_id uuid,
  p_operator_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_unpaid_count integer := 0;
  v_total_bills integer := 0;
  v_candidate record;
  v_total_remaining_candidates integer := 0;
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'run_special_action')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 1. Validasi subscription status
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Layanan dalam status read-only. Perpanjang langganan untuk melakukan pengocokan.';
  END IF;

  -- 2. Kunci dan validasi putaran arisan
  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Putaran arisan dengan ID % tidak ditemukan pada tenant ini.', p_round_id;
  END IF;

  IF v_round.status = 'drawn' THEN
    RAISE EXCEPTION 'Putaran ini sudah pernah dikocok dan pemenang telah ditetapkan.';
  END IF;

  IF v_round.status = 'cancelled' THEN
    RAISE EXCEPTION 'Putaran ini berstatus dibatalkan dan tidak dapat dikocok.';
  END IF;

  -- 3. Validasi Pelunasan Iuran Peserta
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status != 'paid')
  INTO v_total_bills, v_unpaid_count
  FROM public.billing_items
  WHERE tenant_id = p_tenant_id
    AND (
      (metadata->>'round_id') = p_round_id::text
      OR period = v_round.period
    );

  IF v_total_bills = 0 THEN
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: Tagihan iuran untuk putaran ini belum diterbitkan.';
  END IF;

  IF v_unpaid_count > 0 THEN
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: Masih terdapat % peserta yang belum melunasi iuran pada putaran ini.', v_unpaid_count;
  END IF;

  -- 4. Pilih kandidat pemenang yang belum pernah menang (has_won = false)
  SELECT 
    ap.id AS participant_id,
    ap.member_id,
    tm.full_name AS member_name,
    tm.phone AS member_phone,
    tu.label AS slot_label
  INTO v_candidate
  FROM public.arisan_participants ap
  JOIN public.tenant_members tm ON tm.id = ap.member_id
  LEFT JOIN public.tenant_units tu ON tu.id = ap.unit_slot_id
  WHERE ap.tenant_id = p_tenant_id
    AND ap.has_won = false
    AND tm.status = 'approved'
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semua peserta arisan telah memenangkan undian pada siklus ini. Silakan lakukan aksi "Mulai Siklus Baru".';
  END IF;

  -- 5. Catat pemenang pada putaran arisan
  UPDATE public.arisan_rounds
  SET status = 'drawn',
      winner_member_id = v_candidate.member_id,
      drawn_at = now(),
      drawn_by = p_operator_member_id,
      updated_at = now()
  WHERE id = p_round_id;

  -- 6. Tandai peserta telah menang pada tabel arisan_participants
  UPDATE public.arisan_participants
  SET has_won = true,
      won_at_round_id = p_round_id,
      won_at = now(),
      updated_at = now()
  WHERE id = v_candidate.participant_id;

  -- Hitung sisa kandidat yang belum menang
  SELECT COUNT(*) INTO v_total_remaining_candidates
  FROM public.arisan_participants
  WHERE tenant_id = p_tenant_id AND has_won = false;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'round_number', v_round.round_number,
    'period', v_round.period,
    'winner_member_id', v_candidate.member_id,
    'winner_name', v_candidate.member_name,
    'winner_phone', v_candidate.member_phone,
    'slot_label', v_candidate.slot_label,
    'drawn_at', now(),
    'total_prize', v_round.total_pool_amount,
    'remaining_candidates', v_total_remaining_candidates,
    'is_cycle_completed', (v_total_remaining_candidates = 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.draw_arisan_winner(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draw_arisan_winner(UUID, UUID, UUID) TO authenticated, service_role;


-- B.2 start_new_arisan_cycle(uuid, uuid, boolean)
-- Guard: has_permission(p_tenant_id, 'run_special_action')
CREATE OR REPLACE FUNCTION public.start_new_arisan_cycle(
  p_tenant_id uuid,
  p_operator_member_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant record;
  v_remaining_candidates integer := 0;
  v_total_participants integer := 0;
  v_new_cycle integer := 1;
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'run_special_action')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 1. Validasi status subscription gate
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Layanan dalam status read-only. Perpanjang langganan untuk memulai siklus baru.';
  END IF;

  -- 2. Validasi keberadaan tenant dan tipe tenant
  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant dengan ID % tidak ditemukan.', p_tenant_id;
  END IF;

  IF v_tenant.type != 'arisan' THEN
    RAISE EXCEPTION 'Aksi Mulai Siklus Baru hanya valid untuk tenant dengan tipe arisan.';
  END IF;

  -- 3. Cek jumlah peserta yang belum menang
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE has_won = false)
  INTO v_total_participants, v_remaining_candidates
  FROM public.arisan_participants
  WHERE tenant_id = p_tenant_id;

  IF v_total_participants = 0 THEN
    RAISE EXCEPTION 'Belum ada data peserta arisan yang terdaftar pada tenant ini.';
  END IF;

  IF NOT p_force AND v_remaining_candidates > 0 THEN
    RAISE EXCEPTION 'Siklus putaran belum selesai. Masih terdapat % peserta yang belum memenangkan undian.', v_remaining_candidates;
  END IF;

  -- 4. Reset seluruh status kemenangan peserta di tabel arisan_participants
  UPDATE public.arisan_participants
  SET 
    has_won = false,
    won_at_round_id = NULL,
    won_at = NULL,
    updated_at = now()
  WHERE tenant_id = p_tenant_id;

  -- 5. Naikkan siklus pada settings tenant (current_cycle + 1)
  v_new_cycle := COALESCE((v_tenant.settings->>'current_cycle')::integer, 1) + 1;

  UPDATE public.tenants
  SET 
    settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{current_cycle}',
      to_jsonb(v_new_cycle)
    ) || jsonb_build_object(
      'last_cycle_reset_at', now(),
      'last_cycle_reset_by', p_operator_member_id
    ),
    updated_at = now()
  WHERE id = p_tenant_id;

  -- 6. Kembalikan info siklus baru
  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'new_cycle', v_new_cycle,
    'total_participants_reset', v_total_participants,
    'reset_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_new_arisan_cycle(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_new_arisan_cycle(UUID, UUID, BOOLEAN) TO authenticated, service_role;


-- B.3 generate_arisan_round_bills(uuid, uuid, date)
-- Guard: has_permission(p_tenant_id, 'generate_billing')
CREATE OR REPLACE FUNCTION public.generate_arisan_round_bills(
  p_tenant_id uuid,
  p_round_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_participant record;
  v_settings jsonb;
  v_contribution_amount numeric;
  v_total_generated integer := 0;
  v_total_skipped integer := 0;
  v_due_date date;
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'generate_billing')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 1. Verifikasi subscription status bukan read_only
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Tenant dalam status read_only. Perpanjang langganan terlebih dahulu.';
  END IF;

  -- 2. Ambil data putaran arisan
  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Putaran arisan dengan ID % tidak ditemukan pada tenant ini.', p_round_id;
  END IF;

  -- 3. Ambil setting iuran arisan
  SELECT settings INTO v_settings
  FROM public.tenants
  WHERE id = p_tenant_id;

  v_contribution_amount := COALESCE(
    (v_settings->>'contribution_amount')::numeric,
    CASE 
      WHEN (v_settings->>'slot_count')::int > 0 AND v_round.total_pool_amount > 0 
      THEN v_round.total_pool_amount / (v_settings->>'slot_count')::int
      ELSE 300000 
    END
  );

  v_due_date := COALESCE(p_due_date, CURRENT_DATE + interval '14 days');

  -- 4. Iterasi seluruh peserta arisan
  FOR v_participant IN 
    SELECT ap.member_id, ap.unit_slot_id
    FROM public.arisan_participants ap
    JOIN public.tenant_members tm ON tm.id = ap.member_id
    WHERE ap.tenant_id = p_tenant_id 
      AND tm.status = 'approved'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.billing_items
      WHERE tenant_id = p_tenant_id
        AND member_id = v_participant.member_id
        AND (
          (metadata->>'round_id') = p_round_id::text
          OR period = v_round.period
        )
    ) THEN
      v_total_skipped := v_total_skipped + 1;
    ELSE
      INSERT INTO public.billing_items (
        tenant_id,
        member_id,
        unit_id,
        period,
        amount,
        late_fee,
        due_date,
        status,
        metadata
      ) VALUES (
        p_tenant_id,
        v_participant.member_id,
        v_participant.unit_slot_id,
        v_round.period,
        v_contribution_amount,
        0,
        v_due_date,
        'unpaid',
        jsonb_build_object(
          'type', 'arisan_contribution',
          'round_id', p_round_id,
          'round_number', v_round.round_number,
          'period_label', v_round.period,
          'auto_generated_at', now()
        )
      );

      v_total_generated := v_total_generated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'period', v_round.period,
    'contribution_amount', v_contribution_amount,
    'total_generated', v_total_generated,
    'total_skipped', v_total_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_arisan_round_bills(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_arisan_round_bills(UUID, UUID, DATE) TO authenticated, service_role;


-- B.4 auto_generate_kos_billing(text, uuid)
-- Guard: jika p_tenant_id NULL → is_platform_admin(); selain itu has_permission(p_tenant_id, 'generate_billing')
CREATE OR REPLACE FUNCTION public.auto_generate_kos_billing(
  p_period TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant RECORD;
  v_unit RECORD;
  v_member_id UUID;
  v_amount NUMERIC(12,2);
  v_due_date DATE;
  v_due_day INT;
  v_period_year INT;
  v_period_month INT;
  v_contract_start DATE;
  v_contract_end DATE;
  v_generated_count INT := 0;
  v_skipped_count INT := 0;
  v_items JSONB := '[]'::jsonb;
  v_item_id UUID;
  v_days_in_month INT;
  v_clamped_due_day INT;
  v_is_readonly BOOLEAN := FALSE;
BEGIN
  -- Validasi format periode 'YYYY-MM'
  IF p_period IS NULL OR p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Format periode tidak valid. Gunakan format YYYY-MM';
  END IF;

  -- Guard otorisasi (SEC-1.1)
  IF auth.role() <> 'service_role' THEN
    IF p_tenant_id IS NULL THEN
      IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Operasi multi-tenant hanya untuk platform admin' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NOT public.has_permission(p_tenant_id, 'generate_billing') THEN
        RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  v_period_year := split_part(p_period, '-', 1)::INT;
  v_period_month := split_part(p_period, '-', 2)::INT;

  IF v_period_month < 1 OR v_period_month > 12 THEN
    RAISE EXCEPTION 'Bulan periode tidak valid: %', v_period_month;
  END IF;

  v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', make_date(v_period_year, v_period_month, 1)) + interval '1 month' - interval '1 day'))::INT;

  -- Iterasi tenant bertipe 'kos'
  FOR v_tenant IN
    SELECT t.id, t.name, t.settings
    FROM public.tenants t
    WHERE t.type = 'kos'
      AND (p_tenant_id IS NULL OR t.id = p_tenant_id)
  LOOP
    BEGIN
      v_is_readonly := (public.tenant_subscription_status(v_tenant.id) = 'read_only');
    EXCEPTION WHEN OTHERS THEN
      v_is_readonly := FALSE;
    END;

    IF v_is_readonly THEN
      CONTINUE;
    END IF;

    v_due_day := COALESCE(
      (v_tenant.settings->>'billing_due_day')::INT,
      (v_tenant.settings->>'due_day')::INT,
      5
    );
    v_clamped_due_day := LEAST(GREATEST(v_due_day, 1), v_days_in_month);
    v_due_date := make_date(v_period_year, v_period_month, v_clamped_due_day);

    FOR v_unit IN
      SELECT u.id, u.label, u.metadata
      FROM public.tenant_units u
      WHERE u.tenant_id = v_tenant.id
        AND u.status = 'occupied'
    LOOP
      IF (v_unit.metadata ? 'contract_start') AND (v_unit.metadata ? 'contract_end') THEN
        BEGIN
          v_contract_start := (v_unit.metadata->>'contract_start')::DATE;
          v_contract_end := (v_unit.metadata->>'contract_end')::DATE;
        EXCEPTION WHEN OTHERS THEN
          v_contract_start := NULL;
          v_contract_end := NULL;
        END;
      ELSE
        v_contract_start := NULL;
        v_contract_end := NULL;
      END IF;

      IF v_contract_start IS NOT NULL AND v_contract_end IS NOT NULL
         AND to_char(v_contract_start, 'YYYY-MM') <= p_period
         AND to_char(v_contract_end, 'YYYY-MM') >= p_period THEN

        IF EXISTS (
          SELECT 1 FROM public.billing_items b
          WHERE b.tenant_id = v_tenant.id
            AND b.unit_id = v_unit.id
            AND b.period = p_period
        ) THEN
          v_skipped_count := v_skipped_count + 1;
        ELSE
          v_amount := COALESCE(
            (v_unit.metadata->>'rent_price')::NUMERIC,
            (v_unit.metadata->>'default_rent_price')::NUMERIC,
            (v_tenant.settings->>'default_rent_price')::NUMERIC,
            0
          );

          v_member_id := NULL;
          IF (v_unit.metadata ? 'tenant_member_id') AND (v_unit.metadata->>'tenant_member_id') IS NOT NULL AND (v_unit.metadata->>'tenant_member_id') != '' THEN
            BEGIN
              v_member_id := (v_unit.metadata->>'tenant_member_id')::UUID;
            EXCEPTION WHEN OTHERS THEN
              v_member_id := NULL;
            END;
          END IF;

          IF v_member_id IS NULL THEN
            SELECT tm.id INTO v_member_id
            FROM public.tenant_members tm
            WHERE tm.tenant_id = v_tenant.id
              AND tm.unit_id = v_unit.id
              AND tm.status = 'approved'
            LIMIT 1;
          END IF;

          INSERT INTO public.billing_items (
            tenant_id,
            unit_id,
            member_id,
            period,
            amount,
            late_fee,
            due_date,
            status,
            contract_start,
            contract_end,
            metadata
          ) VALUES (
            v_tenant.id,
            v_unit.id,
            v_member_id,
            p_period,
            v_amount,
            0,
            v_due_date,
            'unpaid',
            v_contract_start,
            v_contract_end,
            jsonb_build_object(
              'billing_type', 'rent',
              'auto_generated', true,
              'room_label', v_unit.label,
              'generated_at', now()
            )
          )
          RETURNING id INTO v_item_id;

          v_generated_count := v_generated_count + 1;
          v_items := v_items || jsonb_build_object(
            'id', v_item_id,
            'tenant_id', v_tenant.id,
            'unit_id', v_unit.id,
            'unit_label', v_unit.label,
            'period', p_period,
            'amount', v_amount
          );
        END IF;
      ELSE
        v_skipped_count := v_skipped_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period', p_period,
    'generated_count', v_generated_count,
    'skipped_count', v_skipped_count,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_generate_kos_billing(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_generate_kos_billing(TEXT, UUID) TO authenticated, service_role;


-- B.5 checkout_kos_room (2 overload: INT dan BIGINT)
-- Guard: has_permission(p_tenant_id, 'manage_members')

-- Overload 1: INT
CREATE OR REPLACE FUNCTION public.checkout_kos_room(
  p_tenant_id UUID,
  p_unit_id INT,
  p_checkout_date DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT NULL,
  p_cancel_future_bills BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit RECORD;
  v_member_id UUID;
  v_cancelled_bills_count INT := 0;
  v_checkout_period TEXT;
  v_updated_metadata JSONB;
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'manage_members')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- Validasi keberadaan kamar dan kepemilikan tenant
  SELECT u.id, u.tenant_id, u.label, u.status, u.metadata
  INTO v_unit
  FROM public.tenant_units u
  WHERE u.id = p_unit_id AND u.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar/unit tidak ditemukan pada tenant ini';
  END IF;

  IF (v_unit.metadata ? 'tenant_member_id') AND (v_unit.metadata->>'tenant_member_id') IS NOT NULL AND (v_unit.metadata->>'tenant_member_id') != '' THEN
    BEGIN
      v_member_id := (v_unit.metadata->>'tenant_member_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_member_id := NULL;
    END;
  END IF;

  IF v_member_id IS NULL THEN
    SELECT tm.id INTO v_member_id
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.unit_id = p_unit_id
      AND tm.status = 'approved'
    LIMIT 1;
  END IF;

  v_checkout_period := to_char(p_checkout_date, 'YYYY-MM');

  v_updated_metadata := v_unit.metadata || jsonb_build_object(
    'last_checkout', jsonb_build_object(
      'checkout_date', p_checkout_date,
      'reason', COALESCE(p_reason, 'Checkout penyewa'),
      'checked_out_at', now(),
      'previous_member_id', v_member_id,
      'previous_contract_start', v_unit.metadata->>'contract_start',
      'previous_contract_end', v_unit.metadata->>'contract_end'
    )
  );

  v_updated_metadata := v_updated_metadata - 'contract_start' - 'contract_end' - 'tenant_member_id' - 'notes';

  UPDATE public.tenant_units
  SET status = 'vacant',
      metadata = v_updated_metadata,
      updated_at = now()
  WHERE id = p_unit_id;

  IF v_member_id IS NOT NULL THEN
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE id = v_member_id;
  ELSE
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND unit_id = p_unit_id;
  END IF;

  IF p_cancel_future_bills THEN
    WITH cancelled AS (
      UPDATE public.billing_items
      SET status = 'cancelled',
          metadata = metadata || jsonb_build_object(
            'cancelled_reason', 'Checkout kamar lebih awal',
            'cancelled_at', now()
          ),
          updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND unit_id = p_unit_id
        AND status = 'unpaid'
        AND period > v_checkout_period
      RETURNING id
    )
    SELECT count(*) INTO v_cancelled_bills_count FROM cancelled;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'unit_id', p_unit_id,
    'unit_label', v_unit.label,
    'status', 'vacant',
    'checkout_date', p_checkout_date,
    'cancelled_future_bills', v_cancelled_bills_count
  );
END;
$$;

-- Overload 2: BIGINT
CREATE OR REPLACE FUNCTION public.checkout_kos_room(
  p_tenant_id UUID,
  p_unit_id BIGINT,
  p_checkout_date DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT NULL,
  p_cancel_future_bills BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit RECORD;
  v_member_id UUID;
  v_cancelled_bills_count INT := 0;
  v_checkout_period TEXT;
  v_updated_metadata JSONB;
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'manage_members')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- Validasi keberadaan kamar dan kepemilikan tenant
  SELECT u.id, u.tenant_id, u.label, u.status, u.metadata
  INTO v_unit
  FROM public.tenant_units u
  WHERE u.id = p_unit_id AND u.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar/unit tidak ditemukan pada tenant ini';
  END IF;

  IF (v_unit.metadata ? 'tenant_member_id') AND (v_unit.metadata->>'tenant_member_id') IS NOT NULL AND (v_unit.metadata->>'tenant_member_id') != '' THEN
    BEGIN
      v_member_id := (v_unit.metadata->>'tenant_member_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_member_id := NULL;
    END;
  END IF;

  IF v_member_id IS NULL THEN
    SELECT tm.id INTO v_member_id
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.unit_id = p_unit_id
      AND tm.status = 'approved'
    LIMIT 1;
  END IF;

  v_checkout_period := to_char(p_checkout_date, 'YYYY-MM');

  v_updated_metadata := v_unit.metadata || jsonb_build_object(
    'last_checkout', jsonb_build_object(
      'checkout_date', p_checkout_date,
      'reason', COALESCE(p_reason, 'Checkout penyewa'),
      'checked_out_at', now(),
      'previous_member_id', v_member_id,
      'previous_contract_start', v_unit.metadata->>'contract_start',
      'previous_contract_end', v_unit.metadata->>'contract_end'
    )
  );

  v_updated_metadata := v_updated_metadata - 'contract_start' - 'contract_end' - 'tenant_member_id' - 'notes';

  UPDATE public.tenant_units
  SET status = 'vacant',
      metadata = v_updated_metadata,
      updated_at = now()
  WHERE id = p_unit_id;

  IF v_member_id IS NOT NULL THEN
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE id = v_member_id;
  ELSE
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND unit_id = p_unit_id;
  END IF;

  IF p_cancel_future_bills THEN
    WITH cancelled AS (
      UPDATE public.billing_items
      SET status = 'cancelled',
          metadata = metadata || jsonb_build_object(
            'cancelled_reason', 'Checkout kamar lebih awal',
            'cancelled_at', now()
          ),
          updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND unit_id = p_unit_id
        AND status = 'unpaid'
        AND period > v_checkout_period
      RETURNING id
    )
    SELECT count(*) INTO v_cancelled_bills_count FROM cancelled;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'unit_id', p_unit_id,
    'unit_label', v_unit.label,
    'status', 'vacant',
    'checkout_date', p_checkout_date,
    'cancelled_future_bills', v_cancelled_bills_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_kos_room(UUID, INT, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_kos_room(UUID, INT, DATE, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN) TO authenticated, service_role;


-- B.6 check_arisan_round_readiness(uuid)
-- Guard: tenant_id IN (SELECT public.current_tenant_ids()) OR is_platform_admin()
CREATE OR REPLACE FUNCTION public.check_arisan_round_readiness(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_total_bills integer := 0;
  v_paid_bills integer := 0;
  v_is_ready boolean := false;
BEGIN
  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Putaran tidak ditemukan');
  END IF;

  -- Guard otorisasi (SEC-1.1)
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR v_round.tenant_id IN (SELECT public.current_tenant_ids())
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  IF v_round.status IN ('drawn', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', true,
      'round_id', p_round_id,
      'status', v_round.status,
      'message', 'Putaran sudah berstatus ' || v_round.status
    );
  END IF;

  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid')
  INTO v_total_bills, v_paid_bills
  FROM public.billing_items
  WHERE tenant_id = v_round.tenant_id
    AND (
      (metadata->>'round_id') = p_round_id::text
      OR period = v_round.period
    );

  IF v_total_bills > 0 AND v_paid_bills = v_total_bills THEN
    v_is_ready := true;
    UPDATE public.arisan_rounds
    SET status = 'ready_to_draw',
        updated_at = now()
    WHERE id = p_round_id;
  ELSIF v_round.status = 'ready_to_draw' AND v_paid_bills < v_total_bills THEN
    UPDATE public.arisan_rounds
    SET status = 'collecting',
        updated_at = now()
    WHERE id = p_round_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'status', CASE WHEN v_is_ready THEN 'ready_to_draw' ELSE 'collecting' END,
    'total_bills', v_total_bills,
    'paid_bills', v_paid_bills,
    'is_ready_to_draw', v_is_ready
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_arisan_round_readiness(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_arisan_round_readiness(UUID) TO authenticated, service_role;


-- B.7 get_tenant_opening_balance(uuid, date)
-- Guard: p_tenant_id IN (SELECT public.current_tenant_ids()) OR is_platform_admin() OR is_tenant_owner()
CREATE OR REPLACE FUNCTION public.get_tenant_opening_balance(
  p_tenant_id uuid,
  p_before_date date
)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inflow_payments numeric(12,2);
  v_inflow_non_ipl numeric(12,2);
  v_outflow_expenses numeric(12,2);
  v_start_timestamptz timestamptz;
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR public.is_tenant_owner(p_tenant_id)
    OR p_tenant_id IN (SELECT public.current_tenant_ids())
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  v_start_timestamptz := (p_before_date::text || ' 00:00:00+07')::timestamptz;

  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_inflow_payments
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND status = 'completed'
    AND amount > 0
    AND paid_at IS NOT NULL
    AND paid_at < v_start_timestamptz;

  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_inflow_non_ipl
  FROM public.non_ipl_incomes
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
    AND amount > 0
    AND COALESCE(metadata->>'status', 'verified') != 'rejected'
    AND income_date < p_before_date;

  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_outflow_expenses
  FROM public.expenses
  WHERE tenant_id = p_tenant_id
    AND amount > 0
    AND expense_date < p_before_date;

  RETURN (v_inflow_payments + v_inflow_non_ipl - v_outflow_expenses);
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_opening_balance(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_opening_balance(UUID, DATE) TO authenticated, service_role;


-- B.8 check_listing_expirations()
-- Guard: is_platform_admin()
CREATE OR REPLACE FUNCTION public.check_listing_expirations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_unfeatured_count INTEGER := 0;
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  WITH expired_rows AS (
    UPDATE public.public_listings
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'active'
      AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO v_expired_count FROM expired_rows;

  WITH unfeatured_rows AS (
    UPDATE public.public_listings
    SET is_featured = false,
        featured_until = NULL,
        updated_at = now()
    WHERE is_featured = true
      AND featured_until IS NOT NULL
      AND featured_until < now()
    RETURNING id
  )
  SELECT count(*) INTO v_unfeatured_count FROM unfeatured_rows;

  RETURN jsonb_build_object(
    'success', true,
    'expired_listings_count', v_expired_count,
    'unfeatured_listings_count', v_unfeatured_count,
    'processed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_listing_expirations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_listing_expirations() TO authenticated, service_role;


-- ==============================================================================
-- PART D: SET search_path = public UNTUK FUNGSI UTILITAS
-- ==============================================================================

ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.is_valid_calendar_date(text) SET search_path = public;
ALTER FUNCTION public.storage_extract_tenant_id(text) SET search_path = public;
ALTER FUNCTION public.is_valid_expense_receipt_path(text) SET search_path = public;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- GRANT EXECUTE ON FUNCTION public.activate_tenant_subscription(UUID, TEXT) TO authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.activate_listing_payment(UUID, TEXT) TO authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.check_subscription_expirations() TO authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.migrate_legacy_portal_warga(TEXT, TEXT, TEXT) TO authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.draw_arisan_winner(UUID, UUID, UUID) TO PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.start_new_arisan_cycle(UUID, UUID, BOOLEAN) TO PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.generate_arisan_round_bills(UUID, UUID, DATE) TO PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.auto_generate_kos_billing(TEXT, UUID) TO PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.checkout_kos_room(UUID, INT, DATE, TEXT, BOOLEAN) TO PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN) TO PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.check_arisan_round_readiness(UUID) TO PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.check_listing_expirations() TO PUBLIC, anon, authenticated, service_role;
