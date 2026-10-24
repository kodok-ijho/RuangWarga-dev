-- Migration: Tabel kos_contracts, sinkronisasi status kamar kos, dan backfill kontrak master
-- Task: KOS-2.1 (Ref: docs/handoff/KOS-2.md)
-- Date: 2026-10-24

BEGIN;

-- ==============================================================================
-- 1. TABEL public.kos_contracts
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.kos_contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unit_id       BIGINT NOT NULL REFERENCES public.tenant_units(id) ON DELETE CASCADE,
  member_id     UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  tenant_name   TEXT,
  rent_price    NUMERIC(12,2) NOT NULL CHECK (rent_price >= 0),
  start_date    DATE NOT NULL,
  end_date      DATE,
  grace_days    INT NOT NULL DEFAULT 10 CHECK (grace_days >= 0 AND grace_days <= 28),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  ended_at      TIMESTAMPTZ,
  end_reason    TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_kos_contracts_end_date CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT ck_kos_contracts_tenant_identity CHECK (
    member_id IS NOT NULL OR (tenant_name IS NOT NULL AND btrim(tenant_name) <> '')
  )
);

-- Index performa pencarian
CREATE INDEX IF NOT EXISTS idx_kos_contracts_tenant_id ON public.kos_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kos_contracts_unit_id ON public.kos_contracts(unit_id);
CREATE INDEX IF NOT EXISTS idx_kos_contracts_member_id ON public.kos_contracts(member_id);
CREATE INDEX IF NOT EXISTS idx_kos_contracts_status ON public.kos_contracts(status);

-- Unique index parsial (Aturan Inti KOS-2)
-- Satu kamar kos maksimal 1 kontrak aktif
CREATE UNIQUE INDEX IF NOT EXISTS uq_kos_contracts_active_unit
  ON public.kos_contracts (unit_id)
  WHERE (status = 'active');

-- Satu penyewa (member_id) maksimal 1 kontrak aktif per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_kos_contracts_active_member
  ON public.kos_contracts (tenant_id, member_id)
  WHERE (status = 'active' AND member_id IS NOT NULL);


-- ==============================================================================
-- 2. KOLOM BARU PADA public.billing_items
-- ==============================================================================
ALTER TABLE public.billing_items
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.kos_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_start DATE,
  ADD COLUMN IF NOT EXISTS service_end DATE;

CREATE INDEX IF NOT EXISTS idx_billing_items_contract_id ON public.billing_items(contract_id);

-- Unique parsial untuk mencegah duplikasi tagihan periode kontrak yang sama
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_items_contract_period
  ON public.billing_items (contract_id, service_start)
  WHERE (contract_id IS NOT NULL AND status <> 'cancelled');


-- ==============================================================================
-- 3. TRIGGER SINKRONISASI STATUS KAMAR KOS (KOS_CONTRACTS -> TENANT_UNITS)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sync_kos_room_on_contract_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_type TEXT;
  v_unit_id BIGINT;
  v_unit_status TEXT;
  v_has_active_contract BOOLEAN;
BEGIN
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  SELECT type INTO v_tenant_type
  FROM public.tenants
  WHERE id = v_tenant_id;

  IF v_tenant_type = 'kos' THEN
    -- Aktifkan flag session agar trigger penjaga tenant_units mengizinkan update tersinkron ini
    PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);

    -- Kasus A: Kontrak baru atau berubah menjadi 'active'
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.unit_id IS DISTINCT FROM OLD.unit_id)))
       AND NEW.status = 'active' THEN

      SELECT status INTO v_unit_status
      FROM public.tenant_units
      WHERE id = NEW.unit_id;

      IF v_unit_status = 'inactive' THEN
        PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);
        RAISE EXCEPTION 'Kamar tidak aktif tidak dapat memiliki kontrak aktif.';
      END IF;

      UPDATE public.tenant_units
      SET status = 'occupied',
          metadata = metadata || jsonb_build_object(
            'tenant_member_id', NEW.member_id,
            'contract_start', NEW.start_date,
            'contract_end', NEW.end_date,
            'contract_id', NEW.id
          ),
          updated_at = now()
      WHERE id = NEW.unit_id;

    -- Kasus B: Kontrak aktif diakhiri/dibatalkan/dihapus
    ELSIF (TG_OP = 'DELETE' AND OLD.status = 'active')
       OR (TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status <> 'active') THEN

      v_unit_id := OLD.unit_id;

      SELECT EXISTS (
        SELECT 1 FROM public.kos_contracts
        WHERE unit_id = v_unit_id AND status = 'active'
          AND (TG_OP = 'DELETE' OR id <> NEW.id)
      ) INTO v_has_active_contract;

      IF NOT v_has_active_contract THEN
        SELECT status INTO v_unit_status
        FROM public.tenant_units
        WHERE id = v_unit_id;

        UPDATE public.tenant_units
        SET status = CASE WHEN v_unit_status = 'inactive' THEN 'inactive' ELSE 'vacant' END,
            metadata = (metadata - 'tenant_member_id' - 'contract_start' - 'contract_end' - 'contract_id') ||
                       jsonb_build_object('previous_tenant_member_id', OLD.member_id),
            updated_at = now()
        WHERE id = v_unit_id;
      END IF;
    END IF;

    PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_kos_room_on_contract_change ON public.kos_contracts;
CREATE TRIGGER trg_sync_kos_room_on_contract_change
AFTER INSERT OR UPDATE OF status, unit_id, member_id OR DELETE ON public.kos_contracts
FOR EACH ROW EXECUTE FUNCTION public.sync_kos_room_on_contract_change();

REVOKE ALL ON FUNCTION public.sync_kos_room_on_contract_change() FROM PUBLIC, anon, authenticated;


-- ==============================================================================
-- 4. TRIGGER PENJAGA INTEGRITAS STATUS KAMAR (BEFORE UPDATE ON TENANT_UNITS)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.guard_kos_room_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_type TEXT;
  v_has_active_contract BOOLEAN;
BEGIN
  SELECT type INTO v_tenant_type
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  IF v_tenant_type = 'kos' THEN
    -- Izinkan bila berasal dari proses sinkronisasi internal kos_contracts
    IF current_setting('ruangwarga.kos_contract_sync', true) = 'on' THEN
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.kos_contracts
      WHERE unit_id = NEW.id AND status = 'active'
    ) INTO v_has_active_contract;

    -- Aturan 1: Kamar inactive tidak boleh memiliki kontrak aktif
    IF NEW.status = 'inactive' AND v_has_active_contract THEN
      RAISE EXCEPTION 'Kamar tidak dapat dinonaktifkan karena masih memiliki kontrak aktif.';
    END IF;

    -- Aturan 2: Status occupied harus sesuai kontrak aktif
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'occupied' AND NOT v_has_active_contract THEN
        RAISE EXCEPTION 'Status kamar kos hanya dapat menjadi terisi (occupied) melalui kontrak aktif.';
      END IF;

      IF OLD.status = 'occupied' AND NEW.status = 'vacant' AND v_has_active_contract THEN
        RAISE EXCEPTION 'Status kamar kos tidak dapat diubah menjadi kosong (vacant) selama masih memiliki kontrak aktif.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_kos_room_status_change ON public.tenant_units;
CREATE TRIGGER trg_guard_kos_room_status_change
BEFORE UPDATE OF status ON public.tenant_units
FOR EACH ROW EXECUTE FUNCTION public.guard_kos_room_status_change();

REVOKE ALL ON FUNCTION public.guard_kos_room_status_change() FROM PUBLIC, anon, authenticated;


-- ==============================================================================
-- 5. DEAKTIVASI PERUBAHAN STATUS KAMAR DARI APPROVAL ANGGOTA
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_sync_kos_room_occupancy ON public.tenant_members;
CREATE OR REPLACE FUNCTION public.sync_kos_room_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: KOS-2 menegakkan bahwa status kamar kos sepenuhnya diatur oleh kos_contracts
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_kos_room_occupancy() FROM PUBLIC, anon, authenticated;


-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) UNTUK public.kos_contracts
-- ==============================================================================
ALTER TABLE public.kos_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kos_contracts_select" ON public.kos_contracts;
CREATE POLICY "kos_contracts_select" ON public.kos_contracts
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'generate_billing')
    OR public.has_permission(tenant_id, 'manage_billing_cash')
    OR public.has_permission(tenant_id, 'manage_billing_transfer')
    OR (member_id IS NOT NULL AND member_id IN (
        SELECT id FROM public.tenant_members WHERE user_id = auth.uid()
    ))
  );

-- DML hanya diperbolehkan melalui Security Definer RPC
REVOKE ALL ON public.kos_contracts FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.kos_contracts FROM authenticated;
GRANT SELECT ON public.kos_contracts TO authenticated;
GRANT ALL ON public.kos_contracts TO service_role;


-- ==============================================================================
-- 7. BACKFILL IDEMPOTEN (KOS-2.1 e)
-- ==============================================================================
DO $$
BEGIN
  PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);

  -- 7.1 Kamar occupied DENGAN contract_start -> Buat kontrak active
  INSERT INTO public.kos_contracts (
    tenant_id,
    unit_id,
    member_id,
    tenant_name,
    rent_price,
    start_date,
    end_date,
    grace_days,
    status,
    notes,
    created_at,
    updated_at
  )
  SELECT
    u.tenant_id,
    u.id AS unit_id,
    CASE 
      WHEN (u.metadata->>'tenant_member_id') ~ '^[0-9a-fA-F-]{36}$'
        AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.id = (u.metadata->>'tenant_member_id')::uuid AND m.tenant_id = u.tenant_id)
      THEN (u.metadata->>'tenant_member_id')::uuid
      ELSE NULL
    END AS member_id,
    COALESCE(
      (SELECT full_name FROM public.tenant_members m WHERE m.id = (u.metadata->>'tenant_member_id')::uuid),
      u.metadata->>'tenant_name',
      'Penyewa Kamar ' || u.label
    ) AS tenant_name,
    COALESCE(
      CASE WHEN (u.metadata->>'rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (u.metadata->>'rent_price')::numeric END,
      CASE WHEN (t.settings->>'default_rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (t.settings->>'default_rent_price')::numeric END,
      0
    ) AS rent_price,
    (u.metadata->>'contract_start')::date AS start_date,
    CASE
      WHEN (u.metadata->>'contract_end') IS NOT NULL AND (u.metadata->>'contract_end') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (u.metadata->>'contract_end')::date
      ELSE NULL
    END AS end_date,
    COALESCE(
      CASE WHEN (t.settings->>'rent_grace_days') ~ '^[0-9]+$' THEN (t.settings->>'rent_grace_days')::int END,
      10
    ) AS grace_days,
    'active',
    'Backfill dari metadata unit KOS-2.1',
    now(),
    now()
  FROM public.tenant_units u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE t.type = 'kos'
    AND u.status = 'occupied'
    AND u.metadata->>'contract_start' IS NOT NULL
    AND (u.metadata->>'contract_start') ~ '^\d{4}-\d{2}-\d{2}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.kos_contracts c WHERE c.unit_id = u.id AND c.status = 'active'
    );

  -- 7.2 Kamar occupied TANPA contract_start -> jadikan vacant, simpan previous_tenant_member_id
  UPDATE public.tenant_units u
  SET status = 'vacant',
      metadata = (u.metadata - 'tenant_member_id') || jsonb_build_object(
        'previous_tenant_member_id', u.metadata->'tenant_member_id'
      ),
      updated_at = now()
  FROM public.tenants t
  WHERE t.id = u.tenant_id
    AND t.type = 'kos'
    AND u.status = 'occupied'
    AND (u.metadata->>'contract_start' IS NULL OR NOT (u.metadata->>'contract_start' ~ '^\d{4}-\d{2}-\d{2}$'))
    AND NOT EXISTS (
      SELECT 1 FROM public.kos_contracts c WHERE c.unit_id = u.id AND c.status = 'active'
    );

  PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);
END $$;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TRIGGER IF EXISTS trg_guard_kos_room_status_change ON public.tenant_units;
-- DROP FUNCTION IF EXISTS public.guard_kos_room_status_change();
-- DROP TRIGGER IF EXISTS trg_sync_kos_room_on_contract_change ON public.kos_contracts;
-- DROP FUNCTION IF EXISTS public.sync_kos_room_on_contract_change();
-- DROP INDEX IF EXISTS public.uq_billing_items_contract_period;
-- ALTER TABLE public.billing_items DROP COLUMN IF EXISTS contract_id, DROP COLUMN IF EXISTS service_start, DROP COLUMN IF EXISTS service_end;
-- DROP TABLE IF EXISTS public.kos_contracts CASCADE;
