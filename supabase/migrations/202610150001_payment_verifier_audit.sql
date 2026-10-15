-- Migration: Stempel dan Audit Otomatis Pemverifikasi Pembayaran
-- Task: AUDIT-VERIFY-1
-- Date: 2026-10-15
--
-- 1. Mengisi kolom verified_by dan metadata.verified_by_user_id secara tepercaya
--    melalui trigger database saat pembayaran disetujui ('completed').
-- 2. Mengunci kolom audit (verified_by, verified_at, metadata.verified_by_user_id)
--    dari manipulasi setelah status pembayaran 'completed'.
-- 3. Mendukung eksekusi tanpa auth.uid() (service_role, migrasi, background job).

BEGIN;

-- ==============================================================================
-- 1. FUNGSI STAMP_PAYMENT_VERIFIER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.stamp_payment_verifier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_member UUID;
BEGIN
  -- 1. Bila pemanggil adalah service_role / background job / migrasi (auth.uid() IS NULL),
  -- lewati stempel otomatis agar operasi sistem tidak terganggu.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Cari ID anggota tenant dari pengguna yang sedang login (hanya anggota yang approved).
  -- Nilai ini boleh NULL jika pemanggil adalah platform admin non-anggota.
  SELECT id INTO v_actor_member
  FROM public.tenant_members
  WHERE tenant_id = NEW.tenant_id
    AND user_id = auth.uid()
    AND status = 'approved'
  LIMIT 1;

  -- 3. Operasi INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      NEW.verified_by := v_actor_member;
      NEW.verified_at := now(); -- jam server, bukan nilai dari klien
      NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('verified_by_user_id', auth.uid()::text);
    END IF;
    RETURN NEW;
  END IF;

  -- 4. Operasi UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
      -- Transisi ke completed: stempel data pemverifikasi tepercaya
      NEW.verified_by := v_actor_member;
      NEW.verified_at := now(); -- jam server, bukan nilai dari klien
      NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('verified_by_user_id', auth.uid()::text);
    ELSE
      -- Selain transisi ke completed: kunci kolom audit agar tidak dapat dimanipulasi
      NEW.verified_by := OLD.verified_by;
      NEW.verified_at := OLD.verified_at;

      IF coalesce(OLD.metadata, '{}'::jsonb) ? 'verified_by_user_id' THEN
        NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('verified_by_user_id', OLD.metadata->>'verified_by_user_id');
      ELSE
        NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'verified_by_user_id';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_payment_verifier() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 2. TRIGGER TRG_STAMP_PAYMENT_VERIFIER
-- Berjalan SETELAH trg_guard_payment_insert karena urutan alfabetis nama trigger
-- ('trg_guard_payment_insert' < 'trg_stamp_payment_verifier')
-- ==============================================================================

CREATE OR REPLACE TRIGGER trg_stamp_payment_verifier
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_payment_verifier();

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TRIGGER IF EXISTS trg_stamp_payment_verifier ON public.payments;
-- DROP FUNCTION IF EXISTS public.stamp_payment_verifier();
