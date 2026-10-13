-- Migration: Kunci Baris dengan FOR UPDATE pada Aktivasi Pembayaran Langganan Tenant
-- Task: SEC-3.4 (Ref: docs/handoff/SEC-3.md, PAY-1F)
-- Catatan: File ini dipisahkan secara mandiri karena berisi statement DELETE pada tabel blok (G3).

BEGIN;

-- ==============================================================================
-- 1. PERBARUI FUNGSI RPC: activate_tenant_subscription()
-- Mengunci baris subscription_payments dengan FOR UPDATE untuk mencegah race condition
-- ==============================================================================

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
  -- 1. Ambil record pembayaran dengan kunci baris FOR UPDATE (SEC-3.4)
  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record not found');
  END IF;

  -- 2. Idempotency check: jika sudah settled, kembalikan success
  IF v_payment.status = 'settled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Payment already settled');
  END IF;

  -- Validasi status: hanya proses bila berstatus pending
  IF v_payment.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment status tidak valid: ' || v_payment.status);
  END IF;

  -- Tolak bila period_id NULL
  IF v_payment.period_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record has no period_id');
  END IF;

  -- 3. Ambil data periode langganan
  SELECT * INTO v_period
  FROM public.subscription_periods
  WHERE id = v_payment.period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription period not found');
  END IF;

  -- 4. Ambil data langganan tenant
  SELECT * INTO v_subscription
  FROM public.tenant_subscriptions
  WHERE id = v_payment.subscription_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant subscription not found');
  END IF;

  -- 5. Hitung masa berlaku baru
  IF v_subscription.status = 'active' AND v_subscription.current_period_end > now() THEN
    v_new_end := v_subscription.current_period_end + (v_period.duration_months || ' months')::interval;
  ELSE
    v_new_end := now() + (v_period.duration_months || ' months')::interval;
  END IF;

  -- 6. Update subscription_payments
  UPDATE public.subscription_payments
  SET status = 'settled',
      paid_at = now(),
      payment_gateway_ref = COALESCE(p_gateway_ref, payment_gateway_ref),
      updated_at = now()
  WHERE id = p_payment_id;

  -- 7. Update tenant_subscriptions
  UPDATE public.tenant_subscriptions
  SET status = 'active',
      period_id = v_payment.period_id,
      current_period_start = now(),
      current_period_end = v_new_end,
      updated_at = now()
  WHERE id = v_payment.subscription_id;

  -- 8. Ganti blok langganan dari v_payment.metadata (G3)
  DELETE FROM public.tenant_subscription_blocks
  WHERE subscription_id = v_payment.subscription_id;

  IF COALESCE((v_payment.metadata->>'blocks10')::integer, 0) > 0 THEN
    INSERT INTO public.tenant_subscription_blocks (
      subscription_id,
      block_size,
      quantity,
      price_snapshot
    ) VALUES (
      v_payment.subscription_id,
      10,
      (v_payment.metadata->>'blocks10')::integer,
      COALESCE((v_payment.metadata->>'price10')::numeric, 0)
    );
  END IF;

  IF COALESCE((v_payment.metadata->>'blocks5')::integer, 0) > 0 THEN
    INSERT INTO public.tenant_subscription_blocks (
      subscription_id,
      block_size,
      quantity,
      price_snapshot
    ) VALUES (
      v_payment.subscription_id,
      5,
      (v_payment.metadata->>'blocks5')::integer,
      COALESCE((v_payment.metadata->>'price5')::numeric, 0)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_payment.subscription_id,
    'status', 'active',
    'current_period_end', v_new_end
  );
END;
$$;

-- Amankan hak akses fungsi definer (pola SEC-1)
REVOKE ALL ON FUNCTION public.activate_tenant_subscription(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_tenant_subscription(UUID, TEXT) TO service_role;

COMMIT;
