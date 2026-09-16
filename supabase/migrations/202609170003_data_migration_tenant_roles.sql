-- Migration: Data Migration: Provision Default & Custom Roles for Existing Tenants & Update Trigger
-- Task: T12.4
-- Date: 2026-09-17
-- Ref: requirement.md §3.2, FR-36, FR-37; specification.md §2.1.3, §2.1.5

BEGIN;

-- 1. Untuk setiap tenant yang sudah ada, buat role bawaan "Admin" & "Warga/Anggota"
--    serta buat role "Bendahara" / "Pengurus" jika ada anggotanya
DO $$
DECLARE
  t RECORD;
  v_admin_role_id UUID;
  v_member_role_id UUID;
  v_bendahara_role_id UUID;
  v_pengurus_role_id UUID;
BEGIN
  FOR t IN SELECT id, owner_id FROM public.tenants LOOP
    -- A. Role 'Admin' bawaan pemilik (is_owner_role = true)
    INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
    VALUES (t.id, 'Admin', true, false)
    ON CONFLICT (tenant_id, name) DO UPDATE
      SET is_owner_role = true
    RETURNING id INTO v_admin_role_id;

    -- Berikan seluruh 10 permission ke role Admin
    INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
    SELECT v_admin_role_id, key FROM public.permissions
    ON CONFLICT DO NOTHING;

    -- B. Role 'Warga/Anggota' bawaan anggota (is_base_role = true)
    INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
    VALUES (t.id, 'Warga/Anggota', false, true)
    ON CONFLICT (tenant_id, name) DO UPDATE
      SET is_base_role = true
    RETURNING id INTO v_member_role_id;

    -- C. Jika tenant memiliki anggota dengan role lama 'bendahara', buat role 'Bendahara'
    IF EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = t.id AND role = 'bendahara') THEN
      INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
      VALUES (t.id, 'Bendahara', false, false)
      ON CONFLICT (tenant_id, name) DO NOTHING
      RETURNING id INTO v_bendahara_role_id;

      IF v_bendahara_role_id IS NULL THEN
        SELECT id INTO v_bendahara_role_id FROM public.tenant_roles WHERE tenant_id = t.id AND name = 'Bendahara';
      END IF;

      -- Permission Bendahara: manage_billing_cash, manage_billing_transfer, manage_expenses, view_reports
      INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key) VALUES
        (v_bendahara_role_id, 'manage_billing_cash'),
        (v_bendahara_role_id, 'manage_billing_transfer'),
        (v_bendahara_role_id, 'manage_expenses'),
        (v_bendahara_role_id, 'view_reports')
      ON CONFLICT DO NOTHING;
    END IF;

    -- D. Jika tenant memiliki anggota dengan role lama 'pengurus', buat role 'Pengurus'
    IF EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = t.id AND role = 'pengurus') THEN
      INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
      VALUES (t.id, 'Pengurus', false, false)
      ON CONFLICT (tenant_id, name) DO NOTHING
      RETURNING id INTO v_pengurus_role_id;

      IF v_pengurus_role_id IS NULL THEN
        SELECT id INTO v_pengurus_role_id FROM public.tenant_roles WHERE tenant_id = t.id AND name = 'Pengurus';
      END IF;

      -- Permission Pengurus: manage_billing_transfer, manage_members, view_reports
      INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key) VALUES
        (v_pengurus_role_id, 'manage_billing_transfer'),
        (v_pengurus_role_id, 'manage_members'),
        (v_pengurus_role_id, 'view_reports')
      ON CONFLICT DO NOTHING;
    END IF;

  END LOOP;
END $$;

-- 2. Update trigger handle_new_tenant() agar tenant baru berikutnya otomatis dibuatkan
--    2 role bawaan ("Admin" & "Warga/Anggota") dan owner di-assign ke "Admin" (Spec §2.1.3)
CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id UUID;
  v_admin_role_id UUID;
  v_member_role_id UUID;
BEGIN
  -- 1. Buat record subscription trial 15 hari
  INSERT INTO public.tenant_subscriptions (
    tenant_id,
    status,
    trial_started_at,
    trial_ends_at
  ) VALUES (
    NEW.id,
    'trial',
    now(),
    now() + INTERVAL '15 days'
  ) RETURNING id INTO v_subscription_id;

  -- 2. Alokasikan 1 blok trial besar (10 unit kapasitas) sesuai FR-4
  INSERT INTO public.tenant_subscription_blocks (
    subscription_id,
    block_size,
    quantity,
    price_snapshot
  ) VALUES (
    v_subscription_id,
    10,
    1,
    0
  );

  -- 3. Buat 2 role bawaan (Spec §2.1.3, Req FR-37)
  -- 3a. Role 'Admin' bawaan pemilik
  INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
  VALUES (NEW.id, 'Admin', true, false)
  RETURNING id INTO v_admin_role_id;

  -- Role 'Admin' otomatis mendapat SEMUA 10 permission
  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  SELECT v_admin_role_id, key FROM public.permissions;

  -- 3b. Role 'Warga/Anggota' bawaan anggota (tanpa permission)
  INSERT INTO public.tenant_roles (tenant_id, name, is_owner_role, is_base_role)
  VALUES (NEW.id, 'Warga/Anggota', false, true)
  RETURNING id INTO v_member_role_id;

  -- 4. Daftarkan owner sebagai admin aktif pada tenant_members dengan penanda is_owner = true
  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    full_name,
    role,
    tenant_role_id,
    is_owner,
    status
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    COALESCE(NEW.name || ' (Admin)', 'Admin'),
    'admin',
    v_admin_role_id,
    true,
    'approved'
  ) ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = 'admin',
        tenant_role_id = v_admin_role_id,
        is_owner = true,
        status = 'approved';

  RETURN NEW;
END;
$$;

COMMIT;
