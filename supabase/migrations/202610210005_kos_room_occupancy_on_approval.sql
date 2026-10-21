CREATE OR REPLACE FUNCTION public.sync_kos_room_occupancy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.unit_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.unit_id IS DISTINCT FROM NEW.unit_id)
     AND EXISTS (SELECT 1 FROM public.tenants WHERE id = NEW.tenant_id AND type = 'kos') THEN
    UPDATE public.tenant_units
    SET status = 'occupied',
        metadata = metadata || jsonb_build_object('tenant_member_id', NEW.id),
        updated_at = now()
    WHERE id = NEW.unit_id AND tenant_id = NEW.tenant_id AND status IN ('vacant', 'active');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_kos_room_occupancy ON public.tenant_members;
CREATE TRIGGER trg_sync_kos_room_occupancy
AFTER INSERT OR UPDATE OF status, unit_id ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.sync_kos_room_occupancy();
REVOKE ALL ON FUNCTION public.sync_kos_room_occupancy() FROM PUBLIC, anon, authenticated;

-- Backfill: anggota kos approved yang kamarnya masih vacant/active
UPDATE public.tenant_units u
SET status = 'occupied',
    metadata = u.metadata || jsonb_build_object('tenant_member_id', m.id),
    updated_at = now()
FROM public.tenant_members m
JOIN public.tenants t ON t.id = m.tenant_id
WHERE t.type = 'kos' AND m.status = 'approved' AND m.unit_id = u.id
  AND u.tenant_id = m.tenant_id AND u.status IN ('vacant', 'active');
