-- Migration: Backfill tenant_role_id and is_owner on existing tenant_members
-- Task: T12.5
-- Date: 2026-09-17
-- Ref: requirement.md §3.2, FR-31, FR-32, FR-38; specification.md §2.1.2, §2.1.5

BEGIN;

-- 1. Set is_owner = true untuk baris di mana user_id = tenants.owner_id
UPDATE public.tenant_members tm
SET is_owner = true
FROM public.tenants t
WHERE tm.tenant_id = t.id
  AND tm.user_id = t.owner_id;

-- 2. Pastikan is_owner = false untuk semua baris lainnya
UPDATE public.tenant_members tm
SET is_owner = false
FROM public.tenants t
WHERE tm.tenant_id = t.id
  AND tm.user_id <> t.owner_id;

-- 3. Map role 'admin' -> tenant_roles "Admin" (is_owner_role = true)
UPDATE public.tenant_members tm
SET tenant_role_id = tr.id
FROM public.tenant_roles tr
WHERE tm.tenant_id = tr.tenant_id
  AND tr.is_owner_role = true
  AND tm.role = 'admin';

-- 4. Map role 'bendahara' -> tenant_roles "Bendahara"
UPDATE public.tenant_members tm
SET tenant_role_id = tr.id
FROM public.tenant_roles tr
WHERE tm.tenant_id = tr.tenant_id
  AND tr.name = 'Bendahara'
  AND tm.role = 'bendahara';

-- 5. Map role 'pengurus' -> tenant_roles "Pengurus"
UPDATE public.tenant_members tm
SET tenant_role_id = tr.id
FROM public.tenant_roles tr
WHERE tm.tenant_id = tr.tenant_id
  AND tr.name = 'Pengurus'
  AND tm.role = 'pengurus';

-- 6. Map role 'anggota' / null / other -> tenant_roles "Warga/Anggota" (is_base_role = true)
UPDATE public.tenant_members tm
SET tenant_role_id = tr.id
FROM public.tenant_roles tr
WHERE tm.tenant_id = tr.tenant_id
  AND tr.is_base_role = true
  AND (tm.role = 'anggota' OR tm.role IS NULL OR tm.tenant_role_id IS NULL);

COMMIT;
