-- Migration: Harden expense-receipts Storage RLS and Canonical Path Security
-- Sub-Gate: 8.1-B5 (Storage RLS Hardening)
-- Date: 2026-09-22
-- Target: RuangWarga-dev (Multi-Tenant SaaS)

BEGIN;

-- ============================================================
-- 1. HELPER FUNCTIONS FOR STORAGE PATH VALIDATION
-- ============================================================

-- Safely extract and validate tenant UUID from the first segment of object path
CREATE OR REPLACE FUNCTION public.storage_extract_tenant_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_first_segment text;
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RETURN NULL;
  END IF;

  v_first_segment := split_part(p_name, '/', 1);

  IF pg_input_is_valid(v_first_segment, 'uuid') THEN
    RETURN v_first_segment::uuid;
  END IF;

  RETURN NULL;
END;
$$;

-- Enforce canonical path structure: {tenant_id}/expenses/{year}/{uuid}_{safe_file_name}
CREATE OR REPLACE FUNCTION public.is_valid_expense_receipt_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;

  -- Canonical regex:
  -- Segment 1: valid UUID
  -- Segment 2: 'expenses'
  -- Segment 3: 4-digit fiscal year (1900-2099)
  -- Segment 4: safe filename (letters, digits, underscores, dashes, dots)
  IF p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/expenses/[12][0-9]{3}/[a-zA-Z0-9_\-\.]+$' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- ============================================================
-- 2. BUCKET PROVISIONING: expense-receipts (STRICTLY PRIVATE)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- ============================================================
-- 3. STORAGE.OBJECTS RLS POLICIES
-- ============================================================

-- 1. SELECT: Platform admin or authorized tenant finance staff
DROP POLICY IF EXISTS "expense_receipts_select_staff_only" ON storage.objects;
CREATE POLICY "expense_receipts_select_staff_only"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'expense-receipts'
  AND (
    public.is_platform_admin()
    OR (
      public.is_valid_expense_receipt_path(name)
      AND public.has_permission(public.storage_extract_tenant_id(name), 'manage_expenses'::text)
    )
  )
);

-- 2. INSERT: Platform admin or authorized tenant finance staff with active subscription
DROP POLICY IF EXISTS "expense_receipts_insert_staff_only" ON storage.objects;
CREATE POLICY "expense_receipts_insert_staff_only"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND (
    public.is_platform_admin()
    OR (
      public.is_valid_expense_receipt_path(name)
      AND public.has_permission(public.storage_extract_tenant_id(name), 'manage_expenses'::text)
      AND public.tenant_subscription_status(public.storage_extract_tenant_id(name)) != 'read_only'::public.subscription_status
    )
  )
);

-- 3. UPDATE: Platform admin or authorized tenant finance staff with active subscription
DROP POLICY IF EXISTS "expense_receipts_update_staff_only" ON storage.objects;
CREATE POLICY "expense_receipts_update_staff_only"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'expense-receipts'
  AND (
    public.is_platform_admin()
    OR (
      public.is_valid_expense_receipt_path(name)
      AND public.has_permission(public.storage_extract_tenant_id(name), 'manage_expenses'::text)
      AND public.tenant_subscription_status(public.storage_extract_tenant_id(name)) != 'read_only'::public.subscription_status
    )
  )
)
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND (
    public.is_platform_admin()
    OR (
      public.is_valid_expense_receipt_path(name)
      AND public.has_permission(public.storage_extract_tenant_id(name), 'manage_expenses'::text)
      AND public.tenant_subscription_status(public.storage_extract_tenant_id(name)) != 'read_only'::public.subscription_status
    )
  )
);

-- 4. DELETE: Platform admin or authorized tenant finance staff with active subscription
DROP POLICY IF EXISTS "expense_receipts_delete_staff_only" ON storage.objects;
CREATE POLICY "expense_receipts_delete_staff_only"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'expense-receipts'
  AND (
    public.is_platform_admin()
    OR (
      public.is_valid_expense_receipt_path(name)
      AND public.has_permission(public.storage_extract_tenant_id(name), 'manage_expenses'::text)
      AND public.tenant_subscription_status(public.storage_extract_tenant_id(name)) != 'read_only'::public.subscription_status
    )
  )
);

COMMIT;

-- ROLLBACK:
-- DROP POLICY IF EXISTS "expense_receipts_delete_staff_only" ON storage.objects;
-- DROP POLICY IF EXISTS "expense_receipts_update_staff_only" ON storage.objects;
-- DROP POLICY IF EXISTS "expense_receipts_insert_staff_only" ON storage.objects;
-- DROP POLICY IF EXISTS "expense_receipts_select_staff_only" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'expense-receipts';
-- DROP FUNCTION IF EXISTS public.is_valid_expense_receipt_path(text);
-- DROP FUNCTION IF EXISTS public.storage_extract_tenant_id(text);
