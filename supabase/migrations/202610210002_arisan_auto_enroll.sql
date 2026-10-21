-- Migration: Arisan Auto Enroll Participant Trigger
-- Task: VERT-2.2 (A1)
-- Date: 2026-10-21
-- Ref: docs/handoff/VERT-2.md § VERT-2.2
--
-- Membuat fungsi trigger sync_arisan_participant() untuk mendaftarkan otomatis
-- anggota tenant bertipe 'arisan' yang berstatus 'approved' dan memegang slot (unit_id IS NOT NULL)
-- ke dalam tabel arisan_participants.

BEGIN;

-- 1. Fungsi trigger sinkronisasi peserta arisan
CREATE OR REPLACE FUNCTION public.sync_arisan_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_type TEXT;
BEGIN
  -- Cek kondisi: status approved dan memiliki slot unit_id
  IF NEW.status = 'approved' AND NEW.unit_id IS NOT NULL THEN
    SELECT type INTO v_tenant_type
    FROM public.tenants
    WHERE id = NEW.tenant_id;

    IF v_tenant_type = 'arisan' THEN
      INSERT INTO public.arisan_participants (tenant_id, member_id, unit_slot_id)
      VALUES (NEW.tenant_id, NEW.id, NEW.unit_id)
      ON CONFLICT (tenant_id, member_id)
      DO UPDATE SET
        unit_slot_id = EXCLUDED.unit_slot_id,
        updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Pasang trigger pada tabel tenant_members
DROP TRIGGER IF EXISTS trg_sync_arisan_participant ON public.tenant_members;
CREATE TRIGGER trg_sync_arisan_participant
AFTER INSERT OR UPDATE OF status, unit_id ON public.tenant_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_arisan_participant();

-- 3. Batasi hak akses fungsi trigger
REVOKE ALL ON FUNCTION public.sync_arisan_participant() FROM PUBLIC, anon, authenticated;

-- 4. Backfill data eksisting: daftarkan anggota approved dengan unit_id pada tenant arisan
INSERT INTO public.arisan_participants (tenant_id, member_id, unit_slot_id)
SELECT tm.tenant_id, tm.id, tm.unit_id
FROM public.tenant_members tm
JOIN public.tenants t ON t.id = tm.tenant_id
WHERE t.type = 'arisan'
  AND tm.status = 'approved'
  AND tm.unit_id IS NOT NULL
ON CONFLICT (tenant_id, member_id) DO NOTHING;

COMMIT;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_sync_arisan_participant ON public.tenant_members;
-- DROP FUNCTION IF EXISTS public.sync_arisan_participant();
