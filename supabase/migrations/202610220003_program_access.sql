-- Migration: PANITIA-HARGA.1 Masa aktif per acara
-- Ref: docs/handoff/PANITIA-HARGA.md § HARGA.1
-- Date: 2026-10-22
--
-- Model harga Kepanitiaan (keputusan user 2026-10-22):
--   * Tenant Kepanitiaan TIDAK memakai uji coba tenant 15 hari: langganan tenant selalu 'active'
--     tanpa tanggal akhir (current_period_end NULL; trial_ends_at NOT NULL dibiarkan, tidak dipakai
--     check_subscription_expirations untuk status 'active'). Penguncian dipindah ke tiap acara.
--   * Acara pertama tiap tenant: gratis 1 bulan sejak dibuat.
--   * Acara berikutnya: belum aktif sampai dibayar (Rp25.000 / 12 bulan; pembayaran menunggu DOKU platform).
--   * Lewat masa aktif: acara baca-saja (bisa diperpanjang lewat pembayaran).
-- "Menulis transaksi acara" = pemasukan/pengeluaran yang bertaut acara, menerbitkan/mengubah nominal
-- iuran acara, dan membuat pembayaran iuran acara. Menyusun acara/RAB/dokumen tetap boleh.
-- Verifikasi pembayaran yang sudah diajukan (perubahan status tagihan) tetap boleh.
-- Fungsi SECURITY DEFINER milik postgres, service_role, dan platform admin melewati penjaga
-- (is_billing_privileged), sehingga Edge Function pembayaran kelak bisa memperpanjang masa aktif.

BEGIN;

-- ==============================================================================
-- 1. LANGGANAN TENANT KEPANITIAAN SELALU AKTIF
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.activate_panitia_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'panitia' THEN
    UPDATE public.tenant_subscriptions
    SET status = 'active',
        current_period_end = NULL,
        updated_at = now()
    WHERE tenant_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_panitia_subscription() FROM PUBLIC, anon, authenticated;

-- Nama trigger sengaja diawali 'trg_p' agar berjalan setelah trg_new_tenant_provisioning (urutan alfabet)
DROP TRIGGER IF EXISTS trg_panitia_subscription_active ON public.tenants;
CREATE TRIGGER trg_panitia_subscription_active
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.activate_panitia_subscription();

UPDATE public.tenant_subscriptions s
SET status = 'active', current_period_end = NULL, updated_at = now()
FROM public.tenants t
WHERE t.id = s.tenant_id AND t.type = 'panitia';

-- ==============================================================================
-- 2. MASA AKTIF ACARA
-- ==============================================================================
ALTER TABLE public.tenant_programs
  ADD COLUMN IF NOT EXISTS access_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS is_free_trial BOOLEAN NOT NULL DEFAULT false;

-- Jatah gratis: satu per tenant, tetap tercatat walau acaranya dihapus (tanpa FK ke acara)
CREATE TABLE IF NOT EXISTS public.program_free_trials (
  tenant_id   UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id  UUID NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_free_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.program_free_trials FROM anon, authenticated;
GRANT SELECT ON TABLE public.program_free_trials TO authenticated;
GRANT ALL ON TABLE public.program_free_trials TO service_role;

DROP POLICY IF EXISTS "program_free_trials_select" ON public.program_free_trials;
CREATE POLICY "program_free_trials_select" ON public.program_free_trials
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

-- Masa aktif selalu ditentukan server saat acara dibuat (nilai dari klien diabaikan)
CREATE OR REPLACE FUNCTION public.set_program_access_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_granted integer := 0;
BEGIN
  SELECT type::text INTO v_type FROM public.tenants WHERE id = NEW.tenant_id;

  NEW.is_free_trial := false;
  NEW.access_until := NULL;

  IF v_type = 'panitia' THEN
    INSERT INTO public.program_free_trials (tenant_id, program_id)
    VALUES (NEW.tenant_id, NEW.id)
    ON CONFLICT (tenant_id) DO NOTHING;
    GET DIAGNOSTICS v_granted = ROW_COUNT;

    IF v_granted = 1 THEN
      NEW.is_free_trial := true;
      NEW.access_until := now() + interval '1 month';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_program_access_on_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_program_access ON public.tenant_programs;
CREATE TRIGGER trg_set_program_access
  BEFORE INSERT ON public.tenant_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_program_access_on_insert();

-- Masa aktif hanya bisa diubah oleh jalur istimewa (pembayaran / admin platform)
CREATE OR REPLACE FUNCTION public.guard_program_access_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;
  IF NEW.access_until IS DISTINCT FROM OLD.access_until
     OR NEW.is_free_trial IS DISTINCT FROM OLD.is_free_trial THEN
    RAISE EXCEPTION 'Masa aktif acara hanya bisa diubah lewat pembayaran.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_program_access ON public.tenant_programs;
CREATE TRIGGER trg_guard_program_access
  BEFORE UPDATE ON public.tenant_programs
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_access_columns();

-- Apakah transaksi acara boleh ditulis sekarang. Tenant selain kepanitiaan mengikuti langganan tenant.
CREATE OR REPLACE FUNCTION public.program_is_writable(p_program_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT t.type::text <> 'panitia'
           OR (p.access_until IS NOT NULL AND p.access_until > now())
    FROM public.tenant_programs p
    JOIN public.tenants t ON t.id = p.tenant_id
    WHERE p.id = p_program_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.program_is_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.program_is_writable(uuid) TO authenticated, service_role;

-- Perpanjangan masa aktif (dipakai Edge Function pembayaran kelak; tidak bisa dipanggil klien)
CREATE OR REPLACE FUNCTION public.extend_program_access(p_program_id uuid, p_months integer DEFAULT 12)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until timestamptz;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;
  IF p_months IS NULL OR p_months < 1 OR p_months > 12 THEN
    RAISE EXCEPTION 'Durasi perpanjangan harus 1 sampai 12 bulan.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tenant_programs
  SET access_until = greatest(coalesce(access_until, now()), now()) + make_interval(months => p_months),
      updated_at = now()
  WHERE id = p_program_id
  RETURNING access_until INTO v_until;

  IF v_until IS NULL THEN
    RAISE EXCEPTION 'Acara tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_program_access(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_program_access(uuid, integer) TO service_role;

-- ==============================================================================
-- 3. PENJAGA TRANSAKSI ACARA
-- ==============================================================================
-- Pemasukan & pengeluaran: tambah/ubah/hapus yang menyentuh acara tidak aktif ditolak
CREATE OR REPLACE FUNCTION public.guard_program_transaction_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old uuid;
  v_new uuid;
BEGIN
  IF public.is_billing_privileged() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := OLD.program_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := NEW.program_id;
  END IF;

  IF (v_old IS NOT NULL AND NOT public.program_is_writable(v_old))
     OR (v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old AND NOT public.program_is_writable(v_new)) THEN
    RAISE EXCEPTION 'Acara belum aktif atau masa aktifnya habis. Transaksi acara ini hanya bisa dilihat.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_program_expense ON public.expenses;
CREATE TRIGGER trg_guard_program_expense
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_transaction_write();

DROP TRIGGER IF EXISTS trg_guard_program_income ON public.non_ipl_incomes;
CREATE TRIGGER trg_guard_program_income
  BEFORE INSERT OR UPDATE OR DELETE ON public.non_ipl_incomes
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_transaction_write();

-- Iuran acara: menerbitkan, atau mengubah nominal/anggota/acara, ditolak bila acara tidak aktif.
-- Perubahan status (verifikasi, pembatalan) tetap boleh.
CREATE OR REPLACE FUNCTION public.guard_program_dues_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_billing_privileged() OR NEW.program_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.program_id IS NOT DISTINCT FROM OLD.program_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
     AND NEW.amount = OLD.amount
     AND NEW.late_fee IS NOT DISTINCT FROM OLD.late_fee THEN
    RETURN NEW;
  END IF;

  IF NOT public.program_is_writable(NEW.program_id) THEN
    RAISE EXCEPTION 'Acara belum aktif atau masa aktifnya habis. Iuran acara ini tidak bisa diterbitkan atau diubah.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_program_dues ON public.billing_items;
CREATE TRIGGER trg_guard_program_dues
  BEFORE INSERT OR UPDATE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_dues_write();

-- Pembayaran baru untuk iuran acara yang tidak aktif ditolak (verifikasi pembayaran lama tetap boleh)
CREATE OR REPLACE FUNCTION public.guard_program_dues_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_program uuid;
BEGIN
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;

  SELECT program_id INTO v_program FROM public.billing_items WHERE id = NEW.billing_item_id;

  IF v_program IS NOT NULL AND NOT public.program_is_writable(v_program) THEN
    RAISE EXCEPTION 'Acara belum aktif atau masa aktifnya habis. Pembayaran iuran acara ini tidak bisa dicatat.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_program_dues_payment ON public.payments;
CREATE TRIGGER trg_guard_program_dues_payment
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_dues_payment();

-- ==============================================================================
-- 4. BACKFILL ACARA YANG SUDAH ADA
-- ==============================================================================
-- Acara tertua tiap tenant kepanitiaan mendapat jatah gratis 1 bulan sejak dibuat.
WITH first_programs AS (
  SELECT DISTINCT ON (p.tenant_id) p.id, p.tenant_id, p.created_at
  FROM public.tenant_programs p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE t.type = 'panitia'
  ORDER BY p.tenant_id, p.created_at, p.id
),
granted AS (
  INSERT INTO public.program_free_trials (tenant_id, program_id, granted_at)
  SELECT tenant_id, id, created_at FROM first_programs
  ON CONFLICT (tenant_id) DO NOTHING
  RETURNING tenant_id, program_id
)
UPDATE public.tenant_programs p
SET is_free_trial = true,
    access_until = p.created_at + interval '1 month'
FROM granted g
WHERE p.id = g.program_id;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TRIGGER IF EXISTS trg_guard_program_dues_payment ON public.payments;
-- DROP TRIGGER IF EXISTS trg_guard_program_dues ON public.billing_items;
-- DROP TRIGGER IF EXISTS trg_guard_program_income ON public.non_ipl_incomes;
-- DROP TRIGGER IF EXISTS trg_guard_program_expense ON public.expenses;
-- DROP TRIGGER IF EXISTS trg_guard_program_access ON public.tenant_programs;
-- DROP TRIGGER IF EXISTS trg_set_program_access ON public.tenant_programs;
-- DROP TRIGGER IF EXISTS trg_panitia_subscription_active ON public.tenants;
-- DROP FUNCTION IF EXISTS public.guard_program_dues_payment(), public.guard_program_dues_write(),
--   public.guard_program_transaction_write(), public.extend_program_access(uuid, integer),
--   public.program_is_writable(uuid), public.guard_program_access_columns(),
--   public.set_program_access_on_insert(), public.activate_panitia_subscription();
-- DROP TABLE IF EXISTS public.program_free_trials;
-- ALTER TABLE public.tenant_programs DROP COLUMN IF EXISTS is_free_trial, DROP COLUMN IF EXISTS access_until;
