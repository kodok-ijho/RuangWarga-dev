-- Migration: Bucket Privat Bukti Transfer Pembayaran dan Policy Storage
-- Task: SEC-5.4 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S6)
-- Date: 2026-10-13
--
-- 1. Penyediaan bucket private payment-proofs (kuota 5MB, mime terbatas).
-- 2. Fungsi validasi canonical path is_valid_payment_proof_path.
-- 3. RLS policy INSERT dan SELECT pada storage.objects untuk bukti transfer.

BEGIN;

-- ==============================================================================
-- 1. BUCKET PRIVATE PAYMENT-PROOFS
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- 2. FUNGSI VALIDASI CANONICAL PATH: {tenant_id}/payments/{bill_id}/{file}
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_payment_proof_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;

  -- Canonical regex:
  -- Segment 1: valid UUID tenant
  -- Segment 2: 'payments'
  -- Segment 3: valid UUID billing_item
  -- Segment 4: safe filename
  IF p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/payments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_\-\.]+$' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


-- ==============================================================================
-- 3. RLS POLICIES PADA STORAGE.OBJECTS
-- ==============================================================================

CREATE POLICY "payment_proofs_insert_member"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND public.is_valid_payment_proof_path(name)
  AND public.storage_extract_tenant_id(name) IN (SELECT public.current_tenant_ids())
  AND public.tenant_subscription_status(public.storage_extract_tenant_id(name)) <> 'read_only'::public.subscription_status
);

CREATE POLICY "payment_proofs_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND public.is_valid_payment_proof_path(name)
  AND (
    public.is_platform_admin()
    OR owner = auth.uid()
    OR public.is_tenant_owner(public.storage_extract_tenant_id(name))
    OR public.has_permission(public.storage_extract_tenant_id(name), 'manage_billing_transfer')
    OR public.has_permission(public.storage_extract_tenant_id(name), 'manage_billing_cash')
  )
);

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER POLICY "payment_proofs_insert_member" ON storage.objects WITH CHECK (false);
-- ALTER POLICY "payment_proofs_select" ON storage.objects USING (false);
