-- Migration: Integritas Keanggotaan: Join Lewat RPC dan Penjaga Kolom
-- Task: SEC-5.1 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S1, S2, S3)
-- Date: 2026-10-13
--
-- 1. RPC public.request_join_tenant (SECURITY DEFINER) untuk pendaftaran anggota via kode undangan.
-- 2. ALTER POLICY tenant_members_insert_self mencabut jalur insert langsung oleh pendaftar.
-- 3. Trigger trg_guard_tenant_member_write pada tenant_members menjaga role, is_owner, dan kolom profil.
-- Catatan: Menggunakan ALTER POLICY (tanpa kata terlarang) agar kompatibel dengan konektor.

BEGIN;

-- ==============================================================================
-- 1. RPC REQUEST_JOIN_TENANT (SECURITY DEFINER)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.request_join_tenant(
  p_code text,
  p_unit_id bigint,
  p_full_name text,
  p_phone text,
  p_occupancy_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_base_role_id UUID;
  v_member_id UUID;
  v_full_name TEXT;
  v_phone TEXT;
  v_occupancy TEXT;
BEGIN
  -- Validasi user login
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: autentikasi diperlukan.' USING ERRCODE = '42501';
  END IF;

  -- Cari tenant berdasarkan kode undangan
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_invites
  WHERE upper(code) = upper(trim(coalesce(p_code, '')));

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Kode undangan tidak valid.' USING ERRCODE = 'P0002';
  END IF;

  -- Validasi unit (jika dipilih) harus milik tenant yang sesuai
  IF p_unit_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_units
      WHERE id = p_unit_id AND tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION 'Unit tidak valid untuk komunitas ini.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validasi dan normalisasi input teks
  v_full_name := trim(coalesce(p_full_name, ''));
  IF length(v_full_name) < 2 OR length(v_full_name) > 100 THEN
    RAISE EXCEPTION 'Nama lengkap harus antara 2 dan 100 karakter.' USING ERRCODE = '22023';
  END IF;

  v_phone := nullif(trim(coalesce(p_phone, '')), '');

  v_occupancy := coalesce(nullif(trim(coalesce(p_occupancy_status, '')), ''), 'owner_occupied');
  IF length(v_occupancy) > 40 THEN
    RAISE EXCEPTION 'Status hunian maksimal 40 karakter.' USING ERRCODE = '22023';
  END IF;

  -- Ambil role dasar komunitas (is_base_role = true)
  SELECT id INTO v_base_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_id AND is_base_role = true
  LIMIT 1;

  IF v_base_role_id IS NULL THEN
    RAISE EXCEPTION 'Role dasar tenant tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  -- Insert anggota baru dengan status pending dan role dasar
  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    unit_id,
    full_name,
    phone,
    occupancy_status,
    status,
    is_owner,
    tenant_role_id
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    p_unit_id,
    v_full_name,
    v_phone,
    v_occupancy,
    'pending',
    false,
    v_base_role_id
  )
  ON CONFLICT (tenant_id, user_id) DO NOTHING
  RETURNING id INTO v_member_id;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Anda sudah terdaftar atau pernah mengajukan pendaftaran di komunitas ini.' USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'member_id', v_member_id,
    'tenant_id', v_tenant_id,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_join_tenant(text, bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_join_tenant(text, bigint, text, text, text) TO authenticated;


-- ==============================================================================
-- 2. ALTER POLICY TENANT_MEMBERS_INSERT_SELF
-- ==============================================================================

ALTER POLICY "tenant_members_insert_self" ON public.tenant_members
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.tenant_subscription_status(tenant_id) = ANY (ARRAY['trial'::public.subscription_status, 'active'::public.subscription_status])
      AND (
        public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_members')
      )
    )
  );


-- ==============================================================================
-- 3. TRIGGER GUARD_TENANT_MEMBER_WRITE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guard_tenant_member_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role_tenant_id UUID;
  v_is_owner_role BOOLEAN;
  v_is_base_role BOOLEAN;
BEGIN
  -- Bypass untuk service_role, migrasi, dan platform admin
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;

  -- 3a. Validasi role bila diisi atau diubah
  IF NEW.tenant_role_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.tenant_role_id IS DISTINCT FROM OLD.tenant_role_id) THEN
    SELECT tenant_id, is_owner_role, is_base_role
    INTO v_role_tenant_id, v_is_owner_role, v_is_base_role
    FROM public.tenant_roles
    WHERE id = NEW.tenant_role_id;

    IF v_role_tenant_id IS NULL OR v_role_tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Role tidak valid untuk komunitas ini.' USING ERRCODE = '42501';
    END IF;

    IF v_is_owner_role THEN
      IF NOT public.is_tenant_owner(NEW.tenant_id) THEN
        RAISE EXCEPTION 'Role Admin hanya dapat diberikan oleh Pemilik Komunitas.' USING ERRCODE = '42501';
      END IF;
    ELSIF v_is_base_role THEN
      IF NOT (
        public.is_tenant_owner(NEW.tenant_id)
        OR public.has_permission(NEW.tenant_id, 'manage_members')
        OR public.has_permission(NEW.tenant_id, 'manage_tenant_users')
      ) THEN
        RAISE EXCEPTION 'Izin tidak cukup untuk menetapkan role dasar.' USING ERRCODE = '42501';
      END IF;
    ELSE
      -- Role kustom lain: hanya is_tenant_owner atau manage_tenant_users
      IF NOT (
        public.is_tenant_owner(NEW.tenant_id)
        OR public.has_permission(NEW.tenant_id, 'manage_tenant_users')
      ) THEN
        RAISE EXCEPTION 'Izin tidak cukup untuk menetapkan role ini.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 3b. Pembatasan operasi INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_owner THEN
      RAISE EXCEPTION 'Flag is_owner tidak dapat diset pada insert non-privileged.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- 3c. Pembatasan operasi UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
      RAISE EXCEPTION 'Kolom tenant_id, user_id, dan is_owner tidak dapat diubah.' USING ERRCODE = '42501';
    END IF;

    IF OLD.is_owner THEN
      IF NOT public.is_tenant_owner(OLD.tenant_id) THEN
        RAISE EXCEPTION 'Data pemilik komunitas hanya dapat diubah oleh pemilik.' USING ERRCODE = '42501';
      END IF;
    END IF;

    IF (NEW.status IS DISTINCT FROM OLD.status)
       OR (NEW.unit_id IS DISTINCT FROM OLD.unit_id)
       OR (NEW.occupancy_status IS DISTINCT FROM OLD.occupancy_status) THEN
      IF NOT (
        public.is_tenant_owner(NEW.tenant_id)
        OR public.has_permission(NEW.tenant_id, 'manage_members')
        OR public.has_permission(NEW.tenant_id, 'manage_tenant_users')
      ) THEN
        RAISE EXCEPTION 'Perubahan status, unit, atau hunian memerlukan izin pengelolaan anggota.' USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Warga biasa (non-staff) hanya boleh mengubah nama dan phone miliknya sendiri
    IF NOT (
      public.is_tenant_owner(NEW.tenant_id)
      OR public.has_permission(NEW.tenant_id, 'manage_members')
      OR public.has_permission(NEW.tenant_id, 'manage_tenant_users')
    ) THEN
      IF OLD.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Anda hanya dapat mengubah data profil Anda sendiri.' USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tenant_member_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_guard_tenant_member_write
  BEFORE INSERT OR UPDATE ON public.tenant_members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_tenant_member_write();

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER POLICY "tenant_members_insert_self" ON public.tenant_members
--   WITH CHECK (
--     (user_id = auth.uid())
--     OR (tenant_id IN ( SELECT t.id FROM public.tenants t WHERE (t.owner_id = auth.uid())))
--     OR public.is_platform_admin()
--   );
--
-- ALTER TABLE public.tenant_members DISABLE TRIGGER trg_guard_tenant_member_write;
