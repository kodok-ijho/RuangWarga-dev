-- Migration: Align Subscription & Listing Payments Schema and Activate Subscription Logic
-- Task: PAY-1F.1 (Perbaikan Hasil Review PAY-1)
-- Ref: docs/handoff/PAY-1F.md, docs/handoff/PAY-1-review.md

BEGIN;

-- ==============================================================================
-- 1. TAMBAH KOLOM PADA subscription_payments
-- Menyelaraskan skema database dengan kebutuhan aktivasi & gateway ref
-- ==============================================================================

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES public.subscription_periods(id),
  ADD COLUMN IF NOT EXISTS payment_gateway_ref TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- ==============================================================================
-- 2. SESUAIKAN CONSTRAINT STATUS subscription_payments AGAR MENGIZINKAN 'settled'
-- ==============================================================================

DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.subscription_payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.subscription_payments DROP CONSTRAINT ' || quote_ident(v_constraint.conname);
  END LOOP;
END $$;

ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_status_check
  CHECK (status IN ('pending', 'settled', 'paid', 'failed', 'expired'));

-- ==============================================================================
-- 3. INDEKS REFERENSI PEMBAYARAN GATEWAY & QRIS
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_sub_payments_gateway_ref ON public.subscription_payments(payment_gateway_ref);
CREATE INDEX IF NOT EXISTS idx_listing_payments_qris_ref ON public.listing_payments(qris_ref);

-- ==============================================================================
-- 4. PERBARUI FUNGSI RPC: activate_tenant_subscription()
-- Menjaga idempotensi 'settled', menolak non-pending, menolak period_id NULL,
-- serta memperbarui tenant_subscription_blocks dari metadata pembayaran (G3).
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

  -- Tolak bila period_id NULL
  IF v_payment.period_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record has no period_id');
  END IF;

  -- Ambil data periode langganan
  SELECT * INTO v_period
  FROM public.subscription_periods
  WHERE id = v_payment.period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription period not found');
  END IF;

  -- Ambil data langganan tenant
  SELECT * INTO v_subscription
  FROM public.tenant_subscriptions
  WHERE id = v_payment.subscription_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant subscription not found');
  END IF;

  -- Hitung masa berlaku baru
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

  -- 3. Ganti blok langganan dari v_payment.metadata (G3)
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

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER TABLE public.subscription_payments DROP COLUMN IF EXISTS period_id;
-- ALTER TABLE public.subscription_payments DROP COLUMN IF EXISTS payment_gateway_ref;
-- ALTER TABLE public.subscription_payments DROP COLUMN IF EXISTS payment_method;
-- DROP INDEX IF EXISTS idx_sub_payments_gateway_ref;
-- DROP INDEX IF EXISTS idx_listing_payments_qris_ref;
