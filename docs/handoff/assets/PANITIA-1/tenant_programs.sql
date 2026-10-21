-- Migration: PANITIA-1.2b Acara, anggaran (RAB), dan tautan realisasi
-- Ref: docs/handoff/PANITIA-1.md § PANITIA-1.2
-- Date: 2026-10-21
--
-- 1. Izin baru manage_programs (Kelola Acara & Anggaran) + helper can_manage_programs(uuid).
-- 2. Tabel tenant_programs (acara milik tenant) dan program_budget_items (pos RAB pemasukan/pengeluaran).
-- 3. Kolom program_id dan budget_item_id (opsional) di expenses dan non_ipl_incomes,
--    dengan FK komposit supaya acara dan pos anggaran selalu milik tenant yang sama.
-- 4. RLS: semua anggota approved tenant boleh membaca acara dan RAB (transparansi panitia).
--    Acara ditulis oleh can_manage_programs; RAB ditulis oleh can_manage_programs atau manage_expenses.
--    Tulis ditolak saat langganan read_only.
-- Tidak terikat jenis tenant: RT/RW (mis. panitia 17-an) bisa memakainya kelak.

BEGIN;

-- ==============================================================================
-- 1. IZIN & HELPER
-- ==============================================================================
INSERT INTO public.permissions (key, label, description)
VALUES (
  'manage_programs',
  'Kelola Acara & Anggaran',
  'Membuat acara, mengubah status acara, dan menyusun anggaran (RAB)'
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public.can_manage_programs(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_tenant_id IS NOT NULL AND COALESCE(
    public.has_permission(p_tenant_id, 'manage_programs')
    OR public.has_permission(p_tenant_id, 'manage_settings'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_programs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_programs(uuid) TO authenticated, service_role;

-- ==============================================================================
-- 2. TABEL tenant_programs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  description     TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  location        TEXT NULL CHECK (location IS NULL OR char_length(location) <= 200),
  starts_on       DATE NULL,
  ends_on         DATE NULL,
  status          TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'running', 'done', 'archived')),
  lead_member_id  UUID NULL REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  created_by      UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tenant_programs_dates CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT uq_tenant_programs_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_programs_tenant_status
  ON public.tenant_programs (tenant_id, status, starts_on);

DROP TRIGGER IF EXISTS trg_tenant_programs_updated ON public.tenant_programs;
CREATE TRIGGER trg_tenant_programs_updated
  BEFORE UPDATE ON public.tenant_programs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ==============================================================================
-- 3. TABEL program_budget_items (RAB)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.program_budget_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  program_id  UUID NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  section     TEXT NOT NULL DEFAULT '' CHECK (char_length(section) <= 80),
  item        TEXT NOT NULL CHECK (char_length(btrim(item)) BETWEEN 1 AND 150),
  quantity    NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_label  TEXT NOT NULL DEFAULT '' CHECK (char_length(unit_label) <= 30),
  unit_price  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  amount      NUMERIC(16,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  notes       TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_program_budget_items_program FOREIGN KEY (program_id, tenant_id)
    REFERENCES public.tenant_programs(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT uq_program_budget_items_id_program UNIQUE (id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_program_budget_items_program
  ON public.program_budget_items (program_id, kind, sort_order);

DROP TRIGGER IF EXISTS trg_program_budget_items_updated ON public.program_budget_items;
CREATE TRIGGER trg_program_budget_items_updated
  BEFORE UPDATE ON public.program_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ==============================================================================
-- 4. TAUTAN REALISASI: expenses & non_ipl_incomes
-- ==============================================================================
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS program_id UUID NULL,
  ADD COLUMN IF NOT EXISTS budget_item_id UUID NULL;

ALTER TABLE public.non_ipl_incomes
  ADD COLUMN IF NOT EXISTS program_id UUID NULL,
  ADD COLUMN IF NOT EXISTS budget_item_id UUID NULL;

DO $$
BEGIN
  -- Acara yang sudah punya transaksi tidak bisa dihapus (arsipkan saja)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_program') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT fk_expenses_program FOREIGN KEY (program_id, tenant_id)
      REFERENCES public.tenant_programs(id, tenant_id) ON DELETE RESTRICT;
  END IF;
  -- Pos anggaran dihapus: transaksi tetap di acaranya, hanya tautan posnya yang dikosongkan
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_budget_item') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT fk_expenses_budget_item FOREIGN KEY (budget_item_id, program_id)
      REFERENCES public.program_budget_items(id, program_id) ON DELETE SET NULL (budget_item_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_expenses_budget_needs_program') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT chk_expenses_budget_needs_program CHECK (budget_item_id IS NULL OR program_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_non_ipl_incomes_program') THEN
    ALTER TABLE public.non_ipl_incomes
      ADD CONSTRAINT fk_non_ipl_incomes_program FOREIGN KEY (program_id, tenant_id)
      REFERENCES public.tenant_programs(id, tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_non_ipl_incomes_budget_item') THEN
    ALTER TABLE public.non_ipl_incomes
      ADD CONSTRAINT fk_non_ipl_incomes_budget_item FOREIGN KEY (budget_item_id, program_id)
      REFERENCES public.program_budget_items(id, program_id) ON DELETE SET NULL (budget_item_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_non_ipl_incomes_budget_needs_program') THEN
    ALTER TABLE public.non_ipl_incomes
      ADD CONSTRAINT chk_non_ipl_incomes_budget_needs_program CHECK (budget_item_id IS NULL OR program_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_program
  ON public.expenses (tenant_id, program_id) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_non_ipl_incomes_tenant_program
  ON public.non_ipl_incomes (tenant_id, program_id) WHERE program_id IS NOT NULL;

-- ==============================================================================
-- 5. RLS & PRIVILEGES
-- ==============================================================================
ALTER TABLE public.tenant_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_budget_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_programs FROM anon;
REVOKE ALL ON TABLE public.program_budget_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_programs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_budget_items TO authenticated, service_role;

DROP POLICY IF EXISTS "tenant_programs_select" ON public.tenant_programs;
CREATE POLICY "tenant_programs_select" ON public.tenant_programs
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "tenant_programs_insert" ON public.tenant_programs;
CREATE POLICY "tenant_programs_insert" ON public.tenant_programs
  FOR INSERT
  WITH CHECK (
    public.can_manage_programs(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
    AND (
      lead_member_id IS NULL
      OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.id = lead_member_id AND tm.tenant_id = tenant_programs.tenant_id)
    )
  );

DROP POLICY IF EXISTS "tenant_programs_update" ON public.tenant_programs;
CREATE POLICY "tenant_programs_update" ON public.tenant_programs
  FOR UPDATE
  USING (
    public.can_manage_programs(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  )
  WITH CHECK (
    public.can_manage_programs(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
    AND (
      lead_member_id IS NULL
      OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.id = lead_member_id AND tm.tenant_id = tenant_programs.tenant_id)
    )
  );

DROP POLICY IF EXISTS "tenant_programs_delete" ON public.tenant_programs;
CREATE POLICY "tenant_programs_delete" ON public.tenant_programs
  FOR DELETE
  USING (
    public.can_manage_programs(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "program_budget_items_select" ON public.program_budget_items;
CREATE POLICY "program_budget_items_select" ON public.program_budget_items
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "program_budget_items_insert" ON public.program_budget_items;
CREATE POLICY "program_budget_items_insert" ON public.program_budget_items
  FOR INSERT
  WITH CHECK (
    (public.can_manage_programs(tenant_id) OR public.has_permission(tenant_id, 'manage_expenses'))
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "program_budget_items_update" ON public.program_budget_items;
CREATE POLICY "program_budget_items_update" ON public.program_budget_items
  FOR UPDATE
  USING (
    (public.can_manage_programs(tenant_id) OR public.has_permission(tenant_id, 'manage_expenses'))
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  )
  WITH CHECK (
    (public.can_manage_programs(tenant_id) OR public.has_permission(tenant_id, 'manage_expenses'))
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "program_budget_items_delete" ON public.program_budget_items;
CREATE POLICY "program_budget_items_delete" ON public.program_budget_items
  FOR DELETE
  USING (
    (public.can_manage_programs(tenant_id) OR public.has_permission(tenant_id, 'manage_expenses'))
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS chk_expenses_budget_needs_program,
--   DROP CONSTRAINT IF EXISTS fk_expenses_budget_item, DROP CONSTRAINT IF EXISTS fk_expenses_program,
--   DROP COLUMN IF EXISTS budget_item_id, DROP COLUMN IF EXISTS program_id;
-- ALTER TABLE public.non_ipl_incomes DROP CONSTRAINT IF EXISTS chk_non_ipl_incomes_budget_needs_program,
--   DROP CONSTRAINT IF EXISTS fk_non_ipl_incomes_budget_item, DROP CONSTRAINT IF EXISTS fk_non_ipl_incomes_program,
--   DROP COLUMN IF EXISTS budget_item_id, DROP COLUMN IF EXISTS program_id;
-- DROP TABLE IF EXISTS public.program_budget_items CASCADE;
-- DROP TABLE IF EXISTS public.tenant_programs CASCADE;
-- DROP FUNCTION IF EXISTS public.can_manage_programs(uuid);
-- DELETE FROM public.permissions WHERE key = 'manage_programs';
