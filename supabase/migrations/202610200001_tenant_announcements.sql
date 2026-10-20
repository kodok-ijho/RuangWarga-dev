-- Migration: Pengumuman Multi-Tenant: Izin, Helper, Tabel & RLS, dan Storage R2
-- Task: RTRW-3.1a (Ref: docs/handoff/RTRW-3.md § RTRW-3.1)
-- Date: 2026-10-20
--
-- Fitur:
-- 1. Menambahkan izin 'manage_announcements' ke tabel public.permissions.
-- 2. Membuat fungsi helper public.can_manage_announcements(uuid) SECURITY DEFINER.
-- 3. Membuat fungsi validator public.is_valid_announcement_image_path(text) IMMUTABLE.
-- 4. Membuat tabel public.tenant_announcements, feed index, touch_updated_at trigger, dan RLS policies.
-- 5. Memperbarui fungsi public.can_upload_tenant_file(text, uuid) dan
--    public.can_read_tenant_file(text, text) dengan cabang 'announcement_image'.
-- 6. Memberlakukan REVOKE/GRANT ketat untuk integritas dan isolasi tenant.

BEGIN;

-- ==============================================================================
-- 1. PERMISSION KATALOG: manage_announcements
-- ==============================================================================
INSERT INTO public.permissions (key, label, description)
VALUES (
  'manage_announcements',
  'Kelola Pengumuman & Acara',
  'Tulis, ubah, dan hapus pengumuman serta acara tenant'
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

-- ==============================================================================
-- 2. HELPER FUNCTION: can_manage_announcements(p_tenant_id uuid)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.can_manage_announcements(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE(
    public.is_platform_admin()
    OR public.is_tenant_owner(p_tenant_id)
    OR public.has_permission(p_tenant_id, 'manage_announcements')
    OR public.has_permission(p_tenant_id, 'manage_settings'),
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_announcements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_announcements(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_announcements(uuid) IS
  'Task RTRW-3.1: Memeriksa apakah pemanggil berhak mengelola pengumuman (platform admin, owner, manage_announcements, atau manage_settings).';

-- ==============================================================================
-- 3. VALIDATOR CANONICAL PATH: is_valid_announcement_image_path(p_path text)
--
-- Format Kanonis Final:
--   {tenant_id}/announcements/{image_uuid}.{jpg|jpeg|png|webp}
--
-- Contoh valid:
--   a0000000-0000-0000-0000-000000000001/announcements/b0000000-0000-0000-0000-000000000002.png
--   a0000000-0000-0000-0000-000000000001/announcements/b0000000-0000-0000-0000-000000000002.webp
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_valid_announcement_image_path(p_path text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_path IS NULL OR trim(p_path) = '' THEN
    RETURN false;
  END IF;

  -- Canonical regex:
  -- Segmen 1: valid UUID tenant (36 karakter hex dengan pemisah tanda hubung)
  -- Segmen 2: literal string 'announcements'
  -- Segmen 3: valid UUID gambar (36 karakter hex dengan pemisah tanda hubung) + ekstensi gambar
  IF p_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/announcements/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_announcement_image_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_announcement_image_path(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_valid_announcement_image_path(text) IS
  'Task RTRW-3.1: Validasi canonical path gambar pengumuman R2. Format kanonis: {tenant_id}/announcements/{image_uuid}.{jpg|jpeg|png|webp}';

-- ==============================================================================
-- 4. TABEL public.tenant_announcements
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  body          TEXT NOT NULL CHECK (char_length(body) <= 5000),
  image_path    TEXT NULL CHECK (image_path IS NULL OR public.is_valid_announcement_image_path(image_path)),
  is_pinned     BOOLEAN NOT NULL DEFAULT false,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index feed pengumuman tenant: disematkan (pinned) terlebih dahulu, lalu terbaru
CREATE INDEX IF NOT EXISTS idx_tenant_announcements_feed
  ON public.tenant_announcements (tenant_id, is_pinned DESC, published_at DESC);

-- Trigger sentuhan updated_at
DROP TRIGGER IF EXISTS trg_tenant_announcements_updated ON public.tenant_announcements;
CREATE TRIGGER trg_tenant_announcements_updated
  BEFORE UPDATE ON public.tenant_announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS & Privileges
ALTER TABLE public.tenant_announcements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_announcements FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_announcements TO authenticated, service_role;

DROP POLICY IF EXISTS "tenant_announcements_select" ON public.tenant_announcements;
CREATE POLICY "tenant_announcements_select" ON public.tenant_announcements
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_tenant_owner(tenant_id)
  );

DROP POLICY IF EXISTS "tenant_announcements_insert" ON public.tenant_announcements;
CREATE POLICY "tenant_announcements_insert" ON public.tenant_announcements
  FOR INSERT
  WITH CHECK (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "tenant_announcements_update" ON public.tenant_announcements;
CREATE POLICY "tenant_announcements_update" ON public.tenant_announcements
  FOR UPDATE
  USING (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  )
  WITH CHECK (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "tenant_announcements_delete" ON public.tenant_announcements;
CREATE POLICY "tenant_announcements_delete" ON public.tenant_announcements
  FOR DELETE
  USING (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

-- ==============================================================================
-- 5. STORAGE R2 FUNCTIONS: can_upload_tenant_file & can_read_tenant_file
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

  -- 3. Gambar pengumuman (announcement_image):
  -- Pemanggil berhak mengelola pengumuman dan status langganan tenant bukan read_only
  ELSIF p_kind = 'announcement_image' THEN
    RETURN COALESCE(
      public.can_manage_announcements(p_tenant_id)
      AND public.tenant_subscription_status(p_tenant_id) <> 'read_only'::public.subscription_status,
      false
    );
  END IF;

  -- Jenis file tidak dikenal
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_upload_tenant_file(text, uuid) IS
  'Task RTRW-3.1: Memeriksa hak upload file tenant (payment_proof / expense_receipt / announcement_image) ke Cloudflare R2.';

REVOKE ALL ON FUNCTION public.can_upload_tenant_file(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_tenant_file(text, uuid) TO authenticated, service_role;


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
  END IF;

  -- Jenis file tidak dikenal
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_read_tenant_file(text, text) IS
  'Task RTRW-3.1: Memeriksa hak akses baca presigned GET file tenant (payment_proof / expense_receipt / announcement_image) di Cloudflare R2.';

REVOKE ALL ON FUNCTION public.can_read_tenant_file(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_tenant_file(text, text) TO authenticated, service_role;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TABLE IF EXISTS public.tenant_announcements CASCADE;
-- DROP FUNCTION IF EXISTS public.can_manage_announcements(UUID);
-- DROP FUNCTION IF EXISTS public.is_valid_announcement_image_path(TEXT);
-- DELETE FROM public.permissions WHERE key = 'manage_announcements';
--
-- CATATAN RESTORASI FUNGSI STORAGE:
-- Untuk mengembalikan public.can_upload_tenant_file(text, uuid) dan
-- public.can_read_tenant_file(text, text) ke definisi awal sebelum jenis
-- 'announcement_image' ditambahkan, jalankan ulang DDL kedua fungsi tersebut
-- dari migration supabase/migrations/202610140001_storage_r2_access.sql.
