-- Migration: Protect Billing Columns on Subscriptions and Public Listings
-- Task: SEC-2.1 (Security Hardening Batch 2)
-- Date: 2026-10-09
-- Ref: docs/handoff/SEC-2.md, docs/handoff/SEC-1-review.md (F1, F2, F3)

BEGIN;

-- ==============================================================================
-- 1. HELPER: is_billing_privileged()
-- Menentukan apakah pemanggil adalah sistem/backend terpercaya atau platform admin
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_billing_privileged() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR current_user IN ('postgres', 'supabase_admin')
      OR public.is_platform_admin();
$$;

GRANT EXECUTE ON FUNCTION public.is_billing_privileged() TO authenticated, service_role;


-- ==============================================================================
-- 2. PART A: PROTEKSI tenant_subscriptions (F1)
-- Cabut policy UPDATE oleh tenant owner; hanya platform admin yang boleh UPDATE
-- ==============================================================================

DROP POLICY IF EXISTS "tenant_subscriptions_update_owner" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "tenant_subscriptions_update_platform_admin" ON public.tenant_subscriptions;

CREATE POLICY "tenant_subscriptions_update_platform_admin" ON public.tenant_subscriptions
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());


-- ==============================================================================
-- 3. PART B: PROTEKSI public_listings (F2)
-- Cegah manipulasi kolom expires_at, is_featured, featured_until & status
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
    NEW.is_featured := false;
    NEW.featured_until := NULL;

    -- Batasi masa tayang maksimal 30 hari dari sekarang
    IF NEW.expires_at IS NULL OR NEW.expires_at > (now() + interval '30 days' + interval '1 hour') OR NEW.expires_at <= now() THEN
      NEW.expires_at := now() + interval '30 days';
    END IF;

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

    -- Transisi status yang sah:
    -- Boleh jika status tidak berubah
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    -- Boleh berubah ke 'rented_or_sold' atau 'expired'
    IF NEW.status IN ('rented_or_sold', 'expired') THEN
      RETURN NEW;
    END IF;

    -- Boleh berubah ke 'active' HANYA jika masa tayang listing masih berlaku
    IF NEW.status = 'active' THEN
      IF OLD.expires_at > now() THEN
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

DROP TRIGGER IF EXISTS trg_guard_listing_billing_columns ON public.public_listings;
CREATE TRIGGER trg_guard_listing_billing_columns
  BEFORE INSERT OR UPDATE ON public.public_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_listing_billing_columns();


-- ==============================================================================
-- 4. PART C: PROTEKSI listing_payments (F3)
-- Paksa status pending, paid_at NULL, dan nominal sesuai tabel harga resmi
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guard_listing_payment_insert()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_listing_type public.listing_type;
  v_duration_days integer;
  v_is_featured boolean;
  v_expected_price numeric(12,2);
BEGIN
  -- Privilege bypass: backend/service_role atau platform admin
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id wajib disertakan'
      USING ERRCODE = '42501';
  END IF;

  -- Ambil tipe listing dari tabel public_listings
  SELECT type INTO v_listing_type
  FROM public.public_listings
  WHERE id = NEW.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % tidak ditemukan', NEW.listing_id
      USING ERRCODE = '42501';
  END IF;

  v_duration_days := coalesce(NEW.duration_days, 30);
  v_is_featured := coalesce(NEW.is_featured, false);

  -- Ambil harga resmi dari catalog listing_pricing
  SELECT price INTO v_expected_price
  FROM public.listing_pricing
  WHERE listing_type = v_listing_type
    AND is_featured = v_is_featured
    AND duration_days = v_duration_days
  LIMIT 1;

  IF v_expected_price IS NULL THEN
    RAISE EXCEPTION 'Konfigurasi tarif listing tidak ditemukan untuk tipe %, featured %, durasi % hari',
      v_listing_type, v_is_featured, v_duration_days
      USING ERRCODE = '42501';
  END IF;

  -- Paksa field pembayaran yang aman
  NEW.status := 'pending';
  NEW.paid_at := NULL;
  NEW.amount := v_expected_price;
  NEW.duration_days := v_duration_days;
  NEW.is_featured := v_is_featured;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_listing_payment_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_listing_payment_insert() TO service_role;

DROP TRIGGER IF EXISTS trg_guard_listing_payment_insert ON public.listing_payments;
CREATE TRIGGER trg_guard_listing_payment_insert
  BEFORE INSERT ON public.listing_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_listing_payment_insert();

-- Pastikan policy UPDATE listing_payments hanya untuk platform admin
DROP POLICY IF EXISTS "platform_admin_manage_listing_payments" ON public.listing_payments;
CREATE POLICY "platform_admin_manage_listing_payments" ON public.listing_payments
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TRIGGER IF EXISTS trg_guard_listing_payment_insert ON public.listing_payments;
-- DROP FUNCTION IF EXISTS public.guard_listing_payment_insert();
-- DROP TRIGGER IF EXISTS trg_guard_listing_billing_columns ON public.public_listings;
-- DROP FUNCTION IF EXISTS public.guard_listing_billing_columns();
-- DROP POLICY IF EXISTS "tenant_subscriptions_update_platform_admin" ON public.tenant_subscriptions;
-- CREATE POLICY "tenant_subscriptions_update_owner" ON public.tenant_subscriptions
--   FOR UPDATE USING (tenant_id IN (SELECT current_tenant_ids()));
-- DROP FUNCTION IF EXISTS public.is_billing_privileged();
