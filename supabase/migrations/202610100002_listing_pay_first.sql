-- Migration: Alur Iklan Wajib Bayar Dulu (Pay-First) & Pemulihan Policy SELECT
-- Task: PAY-1.7 (Migrasi Pembayaran DOKU - F6 & F9)
-- Ref: docs/handoff/PAY-1.md, docs/handoff/SEC-2.md

BEGIN;

-- ==============================================================================
-- 1. UBAH NILAI DEFAULT STATUS public_listings
-- Listing baru tidak boleh langsung aktif; wajib bayar terlebih dahulu
-- ==============================================================================

ALTER TABLE public.public_listings
  ALTER COLUMN status SET DEFAULT 'pending_payment';


-- ==============================================================================
-- 2. PERBARUI GUARD TRIGGER: guard_listing_billing_columns()
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guard_listing_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  -- Privilege bypass: backend/service_role atau platform admin
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;

  -- Operasi INSERT oleh non-privileged:
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending_payment';
    NEW.expires_at := NULL;
    NEW.is_featured := false;
    NEW.featured_until := NULL;
    RETURN NEW;
  END IF;

  -- Operasi UPDATE oleh non-privileged:
  IF TG_OP = 'UPDATE' THEN
    -- Kolom masa tayang & fitur berbayar DILARANG diubah langsung oleh pemanggil non-privileged
    IF NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
       OR NEW.featured_until IS DISTINCT FROM OLD.featured_until THEN
      RAISE EXCEPTION 'Kolom masa tayang hanya diubah lewat pembayaran'
        USING ERRCODE = '42501';
    END IF;

    -- Kolom type DILARANG diubah bila listing sudah dibayar / bukan pending_payment
    IF NEW.type IS DISTINCT FROM OLD.type AND OLD.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Tipe listing tidak dapat diubah setelah pembayaran diproses'
        USING ERRCODE = '42501';
    END IF;

    -- Boleh jika status tidak berubah
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    -- DILARANG mengubah status dari atau ke 'pending_payment' secara langsung
    IF OLD.status = 'pending_payment' OR NEW.status = 'pending_payment' THEN
      RAISE EXCEPTION 'Perubahan status dari atau ke pending_payment hanya dapat dilakukan melalui sistem pembayaran'
        USING ERRCODE = '42501';
    END IF;

    -- Boleh berubah ke 'rented_or_sold' atau 'expired'
    IF NEW.status IN ('rented_or_sold', 'expired') THEN
      RETURN NEW;
    END IF;

    -- Boleh berubah ke 'active' HANYA jika masa tayang listing masih berlaku
    IF NEW.status = 'active' THEN
      IF OLD.expires_at IS NOT NULL AND OLD.expires_at > now() THEN
        RETURN NEW;
      ELSE
        RAISE EXCEPTION 'Listing yang sudah kedaluwarsa tidak dapat diaktifkan kembali tanpa perpanjangan pembayaran'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Status di luar yang diizinkan ditolak
    RAISE EXCEPTION 'Transisi status listing tidak diizinkan'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_listing_billing_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_listing_billing_columns() TO service_role;


-- ==============================================================================
-- 3. PERBARUI RPC: activate_listing_payment()
-- Mengaktifkan listing pending_payment menjadi active dengan masa tayang dari now()
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


-- ==============================================================================
-- 4. PERBARUI RPC: check_listing_expirations()
-- Hanya memperbarui status expired untuk listing yang 'active'
-- ==============================================================================

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
-- 5. PULIHKAN POLICY SELECT PADA public_listings (Temuan F9)
-- Publik (anon & auth) hanya melihat listing active & belum expired (bukan pending_payment)
-- Pemilik listing, tenant admin, dan platform admin dapat melihat listing miliknya
-- ==============================================================================

DROP POLICY IF EXISTS "public_read_active_listings" ON public.public_listings;
DROP POLICY IF EXISTS "public_listings_select" ON public.public_listings;

CREATE POLICY "public_listings_select" ON public.public_listings
  FOR SELECT USING (
    (status = 'active' AND expires_at IS NOT NULL AND expires_at > now())
    OR
    public.is_platform_admin()
    OR
    public.is_tenant_owner(tenant_id)
    OR
    public.has_permission(tenant_id, 'post_listing')
    OR
    (posted_by IN (SELECT id FROM public.tenant_members WHERE user_id = auth.uid()))
  );

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER TABLE public.public_listings ALTER COLUMN status SET DEFAULT 'active';
-- DROP POLICY IF EXISTS "public_listings_select" ON public.public_listings;
-- CREATE POLICY "public_read_active_listings" ON public.public_listings
--   FOR SELECT USING (
--     (status = 'active' AND expires_at > now())
--     OR (posted_by IN (SELECT id FROM public.tenant_members WHERE user_id = auth.uid()))
--     OR public.is_platform_admin()
--   );
