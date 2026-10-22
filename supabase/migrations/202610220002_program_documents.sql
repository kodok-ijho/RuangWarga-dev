-- Migration: PANITIA-3.1 Dokumen acara (R2)
-- Ref: docs/handoff/PANITIA-3.md § PANITIA-3.1
-- Date: 2026-10-22
--
-- 1. Validator path R2 untuk dokumen acara: {tenant}/programs/{program}/{uuid}_{nama-aman}
-- 2. Tabel program_documents (metadata dokumen; file di R2).
-- 3. can_upload_tenant_file / can_read_tenant_file ditambah jenis 'program_document'.
--    Isi cabang lama (payment_proof, expense_receipt, announcement_image) disalin persis dari
--    supabase/migrations/202610200001_tenant_announcements.sql, tidak diubah.
-- Unggah/hapus: can_manage_programs atau manage_expenses, langganan bukan read_only.
-- Baca: semua anggota approved tenant (transparansi panitia).

BEGIN;

-- ==============================================================================
-- 1. VALIDATOR PATH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_valid_program_document_path(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_path IS NOT NULL
    AND position('..' in p_path) = 0
    AND p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/programs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[a-zA-Z0-9_.-]+$';
$$;

REVOKE ALL ON FUNCTION public.is_valid_program_document_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_program_document_path(text) TO authenticated, service_role;

-- ==============================================================================
-- 2. TABEL program_documents
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.program_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  program_id   UUID NOT NULL,
  doc_type     TEXT NOT NULL CHECK (doc_type IN ('proposal', 'rab', 'rundown', 'blueprint', 'surat', 'lpj', 'lainnya')),
  title        TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  file_path    TEXT NOT NULL CHECK (public.is_valid_program_document_path(file_path)),
  file_name    TEXT NOT NULL DEFAULT '' CHECK (char_length(file_name) <= 200),
  mime_type    TEXT NOT NULL DEFAULT '' CHECK (char_length(mime_type) <= 100),
  file_size    BIGINT NOT NULL DEFAULT 0 CHECK (file_size >= 0 AND file_size <= 10485760),
  uploaded_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_program_documents_program FOREIGN KEY (program_id, tenant_id)
    REFERENCES public.tenant_programs(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT chk_program_documents_path_owner CHECK (
    split_part(file_path, '/', 1) = tenant_id::text
    AND split_part(file_path, '/', 3) = program_id::text
  ),
  CONSTRAINT uq_program_documents_path UNIQUE (file_path)
);

CREATE INDEX IF NOT EXISTS idx_program_documents_program
  ON public.program_documents (program_id, created_at DESC);

ALTER TABLE public.program_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.program_documents FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.program_documents TO authenticated, service_role;

DROP POLICY IF EXISTS "program_documents_select" ON public.program_documents;
CREATE POLICY "program_documents_select" ON public.program_documents
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "program_documents_insert" ON public.program_documents;
CREATE POLICY "program_documents_insert" ON public.program_documents
  FOR INSERT
  WITH CHECK (
    (public.can_manage_programs(tenant_id) OR public.has_permission(tenant_id, 'manage_expenses'))
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "program_documents_delete" ON public.program_documents;
CREATE POLICY "program_documents_delete" ON public.program_documents
  FOR DELETE
  USING (
    (public.can_manage_programs(tenant_id) OR public.has_permission(tenant_id, 'manage_expenses'))
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

-- ==============================================================================
-- 3. HAK UNGGAH & BACA FILE R2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.can_upload_tenant_file(p_kind text, p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
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

  -- 3. Gambar pengumuman (announcement_image):
  -- Pemanggil berhak mengelola pengumuman dan status langganan tenant bukan read_only
  ELSIF p_kind = 'announcement_image' THEN
    RETURN COALESCE(
      public.can_manage_announcements(p_tenant_id)
      AND public.tenant_subscription_status(p_tenant_id) <> 'read_only'::public.subscription_status,
      false
    );

  -- 4. Dokumen acara (program_document) — PANITIA-3:
  -- Pengelola acara atau pemegang manage_expenses, status langganan bukan read_only
  ELSIF p_kind = 'program_document' THEN
    RETURN COALESCE(
      (public.can_manage_programs(p_tenant_id) OR public.has_permission(p_tenant_id, 'manage_expenses'))
      AND public.tenant_subscription_status(p_tenant_id) <> 'read_only'::public.subscription_status,
      false
    );
  END IF;

  -- Jenis file tidak dikenal
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_tenant_file(p_kind text, p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
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

  -- 3. Gambar pengumuman (announcement_image):
  -- Wajib lolos validasi canonical path dan pemanggil adalah platform admin,
  -- owner tenant, atau anggota berstatus approved pada tenant terkait.
  ELSIF p_kind = 'announcement_image' THEN
    IF v_tenant_id IS NULL THEN
      RETURN false;
    END IF;

    RETURN COALESCE(
      public.is_valid_announcement_image_path(p_path)
      AND (
        public.is_platform_admin()
        OR public.is_tenant_owner(v_tenant_id)
        OR v_tenant_id IN (SELECT public.current_tenant_ids())
      ),
      false
    );

  -- 4. Dokumen acara (program_document) — PANITIA-3:
  -- Path valid dan pemanggil platform admin, owner, atau anggota approved tenant terkait.
  ELSIF p_kind = 'program_document' THEN
    IF v_tenant_id IS NULL THEN
      RETURN false;
    END IF;

    RETURN COALESCE(
      public.is_valid_program_document_path(p_path)
      AND (
        public.is_platform_admin()
        OR public.is_tenant_owner(v_tenant_id)
        OR v_tenant_id IN (SELECT public.current_tenant_ids())
      ),
      false
    );
  END IF;

  -- Jenis file tidak dikenal
  RETURN false;
END;
$$;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- Kembalikan can_upload_tenant_file / can_read_tenant_file ke versi 202610200001_tenant_announcements.sql.
-- DROP TABLE IF EXISTS public.program_documents CASCADE;
-- DROP FUNCTION IF EXISTS public.is_valid_program_document_path(text);
