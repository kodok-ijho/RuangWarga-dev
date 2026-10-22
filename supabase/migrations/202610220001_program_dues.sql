-- Migration: PANITIA-2.1 Iuran panitia per acara
-- Ref: docs/handoff/PANITIA-2.md § PANITIA-2.1
-- Date: 2026-10-22
--
-- Iuran panitia = billing_items milik anggota (member_id terisi, unit_id NULL)
-- yang ditautkan ke acara lewat kolom baru program_id.
-- 1. Kolom billing_items.program_id + FK komposit ke tenant_programs (acara milik tenant yang sama).
--    Acara yang sudah punya tagihan iuran tidak bisa dihapus (RESTRICT); arsipkan saja.
-- 2. Tagihan iuran wajib punya member_id.
-- 3. Satu tagihan iuran aktif (bukan cancelled) per anggota per acara.
-- RLS billing_items dan payments tidak berubah: menerbitkan butuh generate_billing,
-- anggota membayar lewat alur payments yang sudah ada (bukti transfer + verifikasi).

BEGIN;

ALTER TABLE public.billing_items
  ADD COLUMN IF NOT EXISTS program_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_items_program') THEN
    ALTER TABLE public.billing_items
      ADD CONSTRAINT fk_billing_items_program FOREIGN KEY (program_id, tenant_id)
      REFERENCES public.tenant_programs(id, tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_items_program_member') THEN
    ALTER TABLE public.billing_items
      ADD CONSTRAINT chk_billing_items_program_member CHECK (program_id IS NULL OR member_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_items_tenant_program
  ON public.billing_items (tenant_id, program_id) WHERE program_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_items_program_member_active
  ON public.billing_items (program_id, member_id)
  WHERE program_id IS NOT NULL AND status <> 'cancelled';

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP INDEX IF EXISTS public.uq_billing_items_program_member_active;
-- DROP INDEX IF EXISTS public.idx_billing_items_tenant_program;
-- ALTER TABLE public.billing_items DROP CONSTRAINT IF EXISTS chk_billing_items_program_member,
--   DROP CONSTRAINT IF EXISTS fk_billing_items_program, DROP COLUMN IF EXISTS program_id;
