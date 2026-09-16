-- Migration: Drop legacy role column from tenant_members and remove is_tenant_admin() alias
-- Task: T12.11
-- Date: 2026-09-17
-- Ref: task.md T12.11, requirement.md FR-31 s/d FR-40, specification.md §2.1 & §6

BEGIN;

-- ==============================================================================
-- 1. Perbarui Stored Procedures agar tidak lagi memanggil is_tenant_admin()
-- ==============================================================================

-- 1a. auto_generate_kos_billing
DROP FUNCTION IF EXISTS public.auto_generate_kos_billing(TEXT, UUID);
CREATE OR REPLACE FUNCTION public.auto_generate_kos_billing(
  p_period TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_auth_id UUID;
  v_tenant RECORD;
  v_unit RECORD;
  v_member_id UUID;
  v_amount NUMERIC(12,2);
  v_due_date DATE;
  v_due_day INT;
  v_period_year INT;
  v_period_month INT;
  v_contract_start DATE;
  v_contract_end DATE;
  v_generated_count INT := 0;
  v_skipped_count INT := 0;
  v_items JSONB := '[]'::jsonb;
  v_item_id UUID;
  v_days_in_month INT;
  v_clamped_due_day INT;
  v_is_readonly BOOLEAN := FALSE;
BEGIN
  -- Validasi format periode 'YYYY-MM'
  IF p_period IS NULL OR p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Format periode tidak valid. Gunakan format YYYY-MM';
  END IF;

  v_caller_auth_id := auth.uid();

  -- Cek autorisasi jika dipanggil oleh authenticated user (bukan service role / postgres)
  IF v_caller_auth_id IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna non-platform admin wajib menyertakan tenant_id';
      END IF;

      IF NOT (public.is_tenant_owner(p_tenant_id) OR public.has_permission(p_tenant_id, 'generate_billing')) THEN
        RAISE EXCEPTION 'Hanya admin atau pengurus tenant yang berhak membuat tagihan sewa';
      END IF;
    END IF;
  END IF;

  v_period_year := split_part(p_period, '-', 1)::INT;
  v_period_month := split_part(p_period, '-', 2)::INT;

  IF v_period_month < 1 OR v_period_month > 12 THEN
    RAISE EXCEPTION 'Bulan periode tidak valid: %', v_period_month;
  END IF;

  -- Hitung jumlah hari dalam bulan tersebut
  v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', make_date(v_period_year, v_period_month, 1)) + interval '1 month' - interval '1 day'))::INT;

  -- Iterasi tenant bertipe 'kos'
  FOR v_tenant IN
    SELECT t.id, t.name, t.settings
    FROM public.tenants t
    WHERE t.type = 'kos'
      AND (p_tenant_id IS NULL OR t.id = p_tenant_id)
  LOOP
    -- Periksa subscription status tenant. Jika read_only, jangan generate
    BEGIN
      v_is_readonly := (public.tenant_subscription_status(v_tenant.id) = 'read_only');
    EXCEPTION WHEN OTHERS THEN
      v_is_readonly := FALSE;
    END;

    IF v_is_readonly THEN
      -- Tenant dalam masa read-only karena subscription kadaluarsa
      CONTINUE;
    END IF;

    -- Tentukan tanggal jatuh tempo dari settings tenant (default tgl 5)
    v_due_day := COALESCE(
      (v_tenant.settings->>'billing_due_day')::INT,
      (v_tenant.settings->>'due_day')::INT,
      5
    );
    v_clamped_due_day := LEAST(GREATEST(v_due_day, 1), v_days_in_month);
    v_due_date := make_date(v_period_year, v_period_month, v_clamped_due_day);

    -- Iterasi unit/kamar dengan status 'occupied'
    FOR v_unit IN
      SELECT u.id, u.label, u.metadata
      FROM public.tenant_units u
      WHERE u.tenant_id = v_tenant.id
        AND u.status = 'occupied'
    LOOP
      -- Ambil rentang kontrak sewa dari metadata kamar
      IF (v_unit.metadata ? 'contract_start') AND (v_unit.metadata ? 'contract_end') THEN
        BEGIN
          v_contract_start := (v_unit.metadata->>'contract_start')::DATE;
          v_contract_end := (v_unit.metadata->>'contract_end')::DATE;
        EXCEPTION WHEN OTHERS THEN
          v_contract_start := NULL;
          v_contract_end := NULL;
        END;
      ELSE
        v_contract_start := NULL;
        v_contract_end := NULL;
      END IF;

      -- Tagihan hanya di-generate jika kontrak aktif mencakup periode p_period
      IF v_contract_start IS NOT NULL AND v_contract_end IS NOT NULL
         AND to_char(v_contract_start, 'YYYY-MM') <= p_period
         AND to_char(v_contract_end, 'YYYY-MM') >= p_period THEN

        -- Cek apakah tagihan untuk unit ini pada periode ini sudah ada
        IF EXISTS (
          SELECT 1 FROM public.billing_items b
          WHERE b.tenant_id = v_tenant.id
            AND b.unit_id = v_unit.id
            AND b.period = p_period
        ) THEN
          v_skipped_count := v_skipped_count + 1;
        ELSE
          -- Ambil harga sewa
          v_amount := COALESCE(
            (v_unit.metadata->>'rent_price')::NUMERIC,
            (v_unit.metadata->>'default_rent_price')::NUMERIC,
            (v_tenant.settings->>'default_rent_price')::NUMERIC,
            0
          );

          -- Cari penyewa yang menempati unit
          v_member_id := NULL;
          IF (v_unit.metadata ? 'tenant_member_id') AND (v_unit.metadata->>'tenant_member_id') IS NOT NULL AND (v_unit.metadata->>'tenant_member_id') != '' THEN
            BEGIN
              v_member_id := (v_unit.metadata->>'tenant_member_id')::UUID;
            EXCEPTION WHEN OTHERS THEN
              v_member_id := NULL;
            END;
          END IF;

          IF v_member_id IS NULL THEN
            SELECT tm.id INTO v_member_id
            FROM public.tenant_members tm
            WHERE tm.tenant_id = v_tenant.id
              AND tm.unit_id = v_unit.id
              AND tm.status = 'approved'
            LIMIT 1;
          END IF;

          -- Masukkan tagihan sewa baru
          INSERT INTO public.billing_items (
            tenant_id,
            unit_id,
            member_id,
            period,
            amount,
            late_fee,
            due_date,
            status,
            contract_start,
            contract_end,
            metadata
          ) VALUES (
            v_tenant.id,
            v_unit.id,
            v_member_id,
            p_period,
            v_amount,
            0,
            v_due_date,
            'unpaid',
            v_contract_start,
            v_contract_end,
            jsonb_build_object(
              'billing_type', 'rent',
              'auto_generated', true,
              'room_label', v_unit.label,
              'generated_at', now()
            )
          )
          RETURNING id INTO v_item_id;

          v_generated_count := v_generated_count + 1;
          v_items := v_items || jsonb_build_object(
            'id', v_item_id,
            'tenant_id', v_tenant.id,
            'unit_id', v_unit.id,
            'unit_label', v_unit.label,
            'period', p_period,
            'amount', v_amount
          );
        END IF;
      ELSE
        -- Kamar tidak memiliki kontrak aktif pada periode ini
        v_skipped_count := v_skipped_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period', p_period,
    'generated_count', v_generated_count,
    'skipped_count', v_skipped_count,
    'items', v_items
  );
END;
$$;

-- 1b. checkout_kos_room
DROP FUNCTION IF EXISTS public.checkout_kos_room(UUID, INT, DATE, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.checkout_kos_room(
  p_tenant_id UUID,
  p_unit_id INT,
  p_checkout_date DATE,
  p_reason TEXT DEFAULT NULL,
  p_cancel_future_bills BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_auth_id UUID;
  v_unit RECORD;
  v_member_id UUID;
  v_cancelled_bills_count INT := 0;
  v_checkout_period TEXT;
  v_updated_metadata JSONB;
BEGIN
  v_caller_auth_id := auth.uid();

  -- Cek autorisasi jika dipanggil oleh authenticated user
  IF v_caller_auth_id IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF NOT (public.is_tenant_owner(p_tenant_id) OR public.has_permission(p_tenant_id, 'run_special_action')) THEN
        RAISE EXCEPTION 'Hanya admin atau pengurus tenant yang berhak melakukan checkout kamar';
      END IF;
    END IF;
  END IF;

  -- Validasi keberadaan kamar dan kepemilikan tenant
  SELECT u.id, u.tenant_id, u.label, u.status, u.metadata
  INTO v_unit
  FROM public.tenant_units u
  WHERE u.id = p_unit_id AND u.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar/unit tidak ditemukan pada tenant ini';
  END IF;

  -- Ambil penyewa yang terikat
  IF (v_unit.metadata ? 'tenant_member_id') AND (v_unit.metadata->>'tenant_member_id') IS NOT NULL AND (v_unit.metadata->>'tenant_member_id') != '' THEN
    BEGIN
      v_member_id := (v_unit.metadata->>'tenant_member_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_member_id := NULL;
    END;
  END IF;

  IF v_member_id IS NULL THEN
    SELECT tm.id INTO v_member_id
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.unit_id = p_unit_id
      AND tm.status = 'approved'
    LIMIT 1;
  END IF;

  v_checkout_period := to_char(p_checkout_date, 'YYYY-MM');

  -- Siapkan metadata riwayat checkout dan bersihkan kontrak aktif
  v_updated_metadata := v_unit.metadata || jsonb_build_object(
    'last_checkout', jsonb_build_object(
      'checkout_date', p_checkout_date,
      'reason', COALESCE(p_reason, 'Checkout penyewa'),
      'checked_out_at', now(),
      'previous_member_id', v_member_id,
      'previous_contract_start', v_unit.metadata->>'contract_start',
      'previous_contract_end', v_unit.metadata->>'contract_end'
    )
  );

  -- Hapus field kontrak aktif agar auto-generate tagihan otomatis berhenti
  v_updated_metadata := v_updated_metadata - 'contract_start' - 'contract_end' - 'tenant_member_id' - 'notes';

  -- 1. Update status unit menjadi 'vacant'
  UPDATE public.tenant_units
  SET status = 'vacant',
      metadata = v_updated_metadata,
      updated_at = now()
  WHERE id = p_unit_id;

  -- 2. Lepaskan ikatan unit pada anggota tenant (penyewa)
  IF v_member_id IS NOT NULL THEN
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE id = v_member_id;
  ELSE
    -- Lepaskan semua member yang masih terikat ke unit ini
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND unit_id = p_unit_id;
  END IF;

  -- 3. Batalkan tagihan belum bayar di masa depan setelah periode checkout jika p_cancel_future_bills true
  IF p_cancel_future_bills THEN
    WITH cancelled AS (
      UPDATE public.billing_items
      SET status = 'cancelled',
          metadata = metadata || jsonb_build_object(
            'cancelled_reason', 'Checkout kamar lebih awal',
            'cancelled_at', now()
          ),
          updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND unit_id = p_unit_id
        AND status = 'unpaid'
        AND period > v_checkout_period
      RETURNING id
    )
    SELECT count(*) INTO v_cancelled_bills_count FROM cancelled;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'unit_id', p_unit_id,
    'unit_label', v_unit.label,
    'status', 'vacant',
    'checkout_date', p_checkout_date,
    'cancelled_future_bills', v_cancelled_bills_count
  );
END;
$$;

-- ==============================================================================
-- 2. Drop Kebijakan RLS Legacy yang Masih Memakai is_tenant_admin()
-- ==============================================================================

-- 2a. tenant_subscriptions: Ganti update_admin dengan update_owner (FR-35)
DROP POLICY IF EXISTS "tenant_subscriptions_update_admin" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "tenant_subscriptions_update_owner" ON public.tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_update_owner" ON public.tenant_subscriptions
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin() OR public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_platform_admin() OR public.is_tenant_owner(tenant_id));

-- 2b. Drop policy redundant yang sudah tergantikan oleh policy _when_active di T12.7
DROP POLICY IF EXISTS "tenant_units_manage_admin" ON public.tenant_units;
DROP POLICY IF EXISTS "billing_items_manage_admin" ON public.billing_items;
DROP POLICY IF EXISTS "payments_update_admin" ON public.payments;
DROP POLICY IF EXISTS "expenses_manage_admin" ON public.expenses;
DROP POLICY IF EXISTS "arisan_rounds_manage_admin" ON public.arisan_rounds;
DROP POLICY IF EXISTS "arisan_participants_manage_admin" ON public.arisan_participants;

-- ==============================================================================
-- 3. Hapus Fungsi Alias is_tenant_admin()
-- ==============================================================================
DROP FUNCTION IF EXISTS public.is_tenant_admin(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_tenant_admin(UUID);

-- ==============================================================================
-- 4. Perbarui Trigger handle_new_tenant() agar tidak menyisipkan kolom role
-- ==============================================================================
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
    tenant_role_id,
    is_owner,
    status
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    'Administrator',
    v_admin_role_id,
    true,
    'approved'
  );

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 5. Drop Kolom Legacy role dari tenant_members
-- ==============================================================================
DROP INDEX IF EXISTS public.idx_tenant_members_role;
ALTER TABLE public.tenant_members DROP COLUMN IF EXISTS role CASCADE;

COMMIT;

-- ROLLBACK:
-- ALTER TABLE public.tenant_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'anggota';
-- CREATE INDEX IF NOT EXISTS idx_tenant_members_role ON public.tenant_members(tenant_id, role);
-- CREATE OR REPLACE FUNCTION public.is_tenant_admin(t_id UUID)
-- RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   RETURN public.is_tenant_owner(t_id);
-- END;
-- $$;
