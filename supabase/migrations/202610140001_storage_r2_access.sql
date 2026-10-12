-- Migration: Fungsi Izin Penyimpanan File Tenant R2 (Cloudflare R2)
-- Task: STOR-1.1 (Ref: docs/handoff/STOR-1.md, STOR-1-requirement.md, STOR-1-plan.md)
-- Date: 2026-10-14
--
-- Menyediakan 2 fungsi database untuk otorisasi akses penyimpanan file R2 privat:
-- 1. public.can_upload_tenant_file(p_kind text, p_tenant_id uuid) -> boolean
-- 2. public.can_read_tenant_file(p_kind text, p_path text) -> boolean
--
-- Keduanya menggantikan policy storage.objects Supabase secara fungsional untuk
-- Edge Function storage-upload dan storage-sign-url, memanfaatkan helper existing:
-- public.current_tenant_ids(), public.tenant_subscription_status(), public.has_permission(),
-- public.is_tenant_owner(), public.is_platform_admin(), public.storage_extract_tenant_id(),
-- public.is_valid_payment_proof_path(), dan public.is_valid_expense_receipt_path().

BEGIN;

-- ==============================================================================
-- 1. FUNGSI OTORISASI UPLOAD FILE TENANT (R2)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.can_upload_tenant_file(
  p_kind text,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Input NULL menghasilkan false (bukan NULL)
  IF p_kind IS NULL OR p_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Bukti transfer pembayaran (payment_proof):
  -- Pemanggil harus anggota aktif tenant terkait dan status langganan tenant bukan read_only
  IF p_kind = 'payment_proof' THEN
    RETURN COALESCE(
      p_tenant_id IN (SELECT public.current_tenant_ids())
      AND public.tenant_subscription_status(p_tenant_id) <> 'read_only'::public.subscription_status,
      false
    );

  -- 2. Nota pengeluaran (expense_receipt):
  -- Platform admin ATAU pemanggil berizin manage_expenses dengan status langganan bukan read_only
  ELSIF p_kind = 'expense_receipt' THEN
    RETURN COALESCE(
      public.is_platform_admin()
      OR (
        public.has_permission(p_tenant_id, 'manage_expenses')
        AND public.tenant_subscription_status(p_tenant_id) <> 'read_only'::public.subscription_status
      ),
      false
    );
  END IF;

  -- Jenis file tidak dikenal
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_upload_tenant_file(text, uuid) IS
  'Task STOR-1.1: Memeriksa hak upload file tenant (payment_proof / expense_receipt) ke Cloudflare R2.';


-- ==============================================================================
-- 2. FUNGSI OTORISASI BACA FILE TENANT (R2 PRESIGNED GET)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.can_read_tenant_file(
  p_kind text,
  p_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Input NULL atau path kosong menghasilkan false (bukan NULL)
  IF p_kind IS NULL OR p_path IS NULL OR trim(p_path) = '' THEN
    RETURN false;
  END IF;

  v_tenant_id := public.storage_extract_tenant_id(p_path);

  -- 1. Bukti transfer pembayaran (payment_proof):
  -- Wajib lolos validasi canonical path dan pemanggil adalah platform admin,
  -- owner tenant, atau staf berizin manage_billing_transfer / manage_billing_cash.
  --
  -- CATATAN OTORISASI PENGUNGGAH:
  -- Aturan "pengunggah sendiri boleh melihat bukti transfer miliknya" (owner = auth.uid())
  -- TIDAK ditangani di dalam fungsi database ini. Otorisasi kepemilikan oleh pengunggah
  -- ditangani oleh Edge Function (storage-sign-url) lewat metadata objek R2 (uploaded-by).
  IF p_kind = 'payment_proof' THEN
    IF v_tenant_id IS NULL THEN
      RETURN false;
    END IF;

    RETURN COALESCE(
      public.is_valid_payment_proof_path(p_path)
      AND (
        public.is_platform_admin()
        OR public.is_tenant_owner(v_tenant_id)
        OR public.has_permission(v_tenant_id, 'manage_billing_transfer')
        OR public.has_permission(v_tenant_id, 'manage_billing_cash')
      ),
      false
    );

  -- 2. Nota pengeluaran (expense_receipt):
  -- Platform admin ATAU (canonical path valid DAN pemanggil memiliki izin manage_expenses).
  ELSIF p_kind = 'expense_receipt' THEN
    RETURN COALESCE(
      public.is_platform_admin()
      OR (
        v_tenant_id IS NOT NULL
        AND public.is_valid_expense_receipt_path(p_path)
        AND public.has_permission(v_tenant_id, 'manage_expenses')
      ),
      false
    );
  END IF;

  -- Jenis file tidak dikenal
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_read_tenant_file(text, text) IS
  'Task STOR-1.1: Memeriksa hak akses baca presigned GET file tenant (payment_proof / expense_receipt) di Cloudflare R2.';


-- ==============================================================================
-- 3. GRANTS & REVOKES
-- ==============================================================================

REVOKE ALL ON FUNCTION public.can_upload_tenant_file(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_tenant_file(text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_tenant_file(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_tenant_file(text, text) TO authenticated, service_role;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP FUNCTION IF EXISTS public.can_read_tenant_file(text, text);
-- DROP FUNCTION IF EXISTS public.can_upload_tenant_file(text, uuid);
