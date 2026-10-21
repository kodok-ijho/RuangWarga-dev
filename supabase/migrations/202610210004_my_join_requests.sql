-- Migration: 202610210004_my_join_requests.sql
-- Description: RPC get_my_join_requests() untuk membaca permohonan keanggotaan pending/rejected milik user login (KOS-1.4a)

CREATE OR REPLACE FUNCTION public.get_my_join_requests()
RETURNS TABLE (
  member_id uuid,
  tenant_id uuid,
  tenant_name text,
  tenant_type text,
  unit_label text,
  status text,
  requested_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tm.id, t.id, t.name, t.type::text, tu.label, tm.status, tm.created_at
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  LEFT JOIN public.tenant_units tu ON tu.id = tm.unit_id
  WHERE tm.user_id = auth.uid() AND tm.status IN ('pending', 'rejected')
  ORDER BY tm.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_join_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_join_requests() TO authenticated, service_role;
