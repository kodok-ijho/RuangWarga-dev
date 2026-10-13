-- Migration: Kunci Baris dengan FOR UPDATE pada Aktivasi Pembayaran Listing
-- Task: SEC-3.4 (Ref: docs/handoff/SEC-3.md, PAY-1F)

BEGIN;

-- ==============================================================================
-- 1. PERBARUI RPC: activate_listing_payment()
-- Mengunci baris listing_payments dengan FOR UPDATE untuk mencegah race condition
-- ==============================================================================

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
  -- 1. Ambil record pembayaran listing dengan kunci baris FOR UPDATE (SEC-3.4)
  SELECT * INTO v_payment
  FROM public.listing_payments
  WHERE id = p_payment_id
  FOR UPDATE;

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

  IF v_listing.status = 'active' AND v_listing.expires_at IS NOT NULL AND v_listing.expires_at > now() THEN
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

REVOKE ALL ON FUNCTION public.activate_listing_payment(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_listing_payment(UUID, TEXT) TO service_role;

COMMIT;
