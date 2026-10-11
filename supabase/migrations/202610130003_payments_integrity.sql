-- Migration: Integritas Pembayaran dan Sinkronisasi Status Tagihan
-- Task: SEC-5.3 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S5, F3)
-- Date: 2026-10-13
--
-- 1. Trigger trg_guard_payment_insert menjaga validitas nominal, kepemilikan tagihan, dan metode pembayaran.
-- 2. Trigger trg_sync_bill_status_after_payment (SECURITY DEFINER) menyelaraskan status billing_items secara atomik.
-- 3. Unique index uq_payments_open_per_bill mencegah pembayaran ganda untuk tagihan yang sama.

BEGIN;

-- ==============================================================================
-- 1. TRIGGER GUARD_PAYMENT_INSERT
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guard_payment_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_bill_tenant_id UUID;
  v_bill_unit_id BIGINT;
  v_bill_member_id UUID;
  v_bill_amount NUMERIC;
  v_bill_late_fee NUMERIC;
  v_bill_status TEXT;
  v_member_unit_id BIGINT;
  v_member_exists BOOLEAN := false;
BEGIN
  -- Bypass untuk service_role, migrasi, dan platform admin
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;

  -- 1a. Ambil data tagihan terkait
  SELECT tenant_id, unit_id, member_id, amount, late_fee, status
  INTO v_bill_tenant_id, v_bill_unit_id, v_bill_member_id, v_bill_amount, v_bill_late_fee, v_bill_status
  FROM public.billing_items
  WHERE id = NEW.billing_item_id;

  IF v_bill_tenant_id IS NULL OR v_bill_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Tagihan tidak valid untuk komunitas ini.' USING ERRCODE = '42501';
  END IF;

  -- 1b. Staff bypass (pemilik komunitas atau pengurus berwenang)
  IF public.is_tenant_owner(NEW.tenant_id)
     OR public.has_permission(NEW.tenant_id, 'manage_billing_cash')
     OR public.has_permission(NEW.tenant_id, 'manage_billing_transfer') THEN
    RETURN NEW;
  END IF;

  -- 1c. Validasi ketat untuk non-staff (warga)
  SELECT unit_id, true
  INTO v_member_unit_id, v_member_exists
  FROM public.tenant_members
  WHERE id = NEW.member_id
    AND tenant_id = NEW.tenant_id
    AND user_id = auth.uid()
    AND status = 'approved';

  IF NOT coalesce(v_member_exists, false) THEN
    RAISE EXCEPTION 'Akses ditolak: anggota tidak valid.' USING ERRCODE = '42501';
  END IF;

  -- Tagihan harus sesuai kepemilikan anggota atau unit terdaftar
  IF NOT (
    (v_bill_member_id IS NOT NULL AND v_bill_member_id = NEW.member_id)
    OR (v_bill_member_id IS NULL AND v_bill_unit_id IS NOT NULL AND v_bill_unit_id = v_member_unit_id)
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: tagihan ini bukan milik Anda.' USING ERRCODE = '42501';
  END IF;

  -- Metode dan status yang diizinkan untuk warga
  IF NEW.method <> 'bank_transfer' OR NEW.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'Warga hanya dapat mengajukan pembayaran transfer bank yang menunggu verifikasi.' USING ERRCODE = '42501';
  END IF;

  -- Nominal harus sama persis dengan total tagihan
  IF NEW.amount <> (v_bill_amount + coalesce(v_bill_late_fee, 0)) THEN
    RAISE EXCEPTION 'Nominal tidak sesuai tagihan.' USING ERRCODE = '22023';
  END IF;

  -- Tagihan harus berstatus unpaid
  IF v_bill_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Tagihan ini sudah dibayar atau sedang diverifikasi.' USING ERRCODE = '23505';
  END IF;

  -- Cegah manipulasi kolom verifikasi oleh pemohon
  NEW.verified_by := NULL;
  NEW.verified_at := NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_payment_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_guard_payment_insert
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_payment_insert();


-- ==============================================================================
-- 2. TRIGGER SYNC_BILL_STATUS_AFTER_PAYMENT (SECURITY DEFINER)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_bill_status_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending_verification' THEN
    UPDATE public.billing_items
    SET status = 'pending_verification', updated_at = now()
    WHERE id = NEW.billing_item_id AND status = 'unpaid';
  ELSIF NEW.status = 'completed' THEN
    UPDATE public.billing_items
    SET status = 'paid', updated_at = now()
    WHERE id = NEW.billing_item_id AND status IN ('unpaid', 'pending_verification');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bill_status_after_payment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_sync_bill_status_after_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_bill_status_after_payment();


-- ==============================================================================
-- 3. UNIQUE INDEX ANTI-DOBEL PEMBAYARAN
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_open_per_bill
  ON public.payments (billing_item_id)
  WHERE status IN ('pending_verification', 'completed');

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER TABLE public.payments DISABLE TRIGGER trg_guard_payment_insert;
-- ALTER TABLE public.payments DISABLE TRIGGER trg_sync_bill_status_after_payment;
