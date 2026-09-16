-- Migration: Refactor RLS Policies to use has_permission() and is_tenant_owner()
-- Task: T12.7, T12.8
-- Date: 2026-09-17
-- Ref: requirement.md §3.2, FR-34, FR-39, FR-40; specification.md §2.1.4, §6, §6.1, §6.2

BEGIN;

-- ============================================================
-- 1. TABEL TENANTS
-- ============================================================

DROP POLICY IF EXISTS "tenants_select_membership" ON public.tenants;
DROP POLICY IF EXISTS "tenants_select" ON public.tenants;
CREATE POLICY "tenants_select" ON public.tenants
  FOR SELECT USING (
    public.is_platform_admin()
    OR id IN (SELECT public.current_tenant_ids())
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "tenants_update_admin" ON public.tenants;
DROP POLICY IF EXISTS "tenants_update" ON public.tenants;
CREATE POLICY "tenants_update" ON public.tenants
  FOR UPDATE USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(id)
    OR public.has_permission(id, 'manage_settings')
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_tenant_owner(id)
    OR public.has_permission(id, 'manage_settings')
  );

-- ============================================================
-- 2. TABEL TENANT_UNITS
-- ============================================================

DROP POLICY IF EXISTS "tenant_units_select_tenant" ON public.tenant_units;
DROP POLICY IF EXISTS "tenant_units_select" ON public.tenant_units;
CREATE POLICY "tenant_units_select" ON public.tenant_units
  FOR SELECT USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_tenant_owner(tenant_id)
  );

DROP POLICY IF EXISTS "tenant_units_insert_admin" ON public.tenant_units;
DROP POLICY IF EXISTS "tenant_units_insert_when_active" ON public.tenant_units;
CREATE POLICY "tenant_units_insert_when_active" ON public.tenant_units
  FOR INSERT WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_settings')
    )
  );

DROP POLICY IF EXISTS "tenant_units_update_admin" ON public.tenant_units;
DROP POLICY IF EXISTS "tenant_units_update_when_active" ON public.tenant_units;
CREATE POLICY "tenant_units_update_when_active" ON public.tenant_units
  FOR UPDATE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_settings')
    )
  )
  WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_settings')
    )
  );

DROP POLICY IF EXISTS "tenant_units_delete_admin" ON public.tenant_units;
DROP POLICY IF EXISTS "tenant_units_delete" ON public.tenant_units;
CREATE POLICY "tenant_units_delete" ON public.tenant_units
  FOR DELETE USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'manage_settings')
  );

-- ============================================================
-- 3. TABEL TENANT_MEMBERS
-- ============================================================

DROP POLICY IF EXISTS "tenant_members_select_tenant" ON public.tenant_members;
CREATE POLICY "tenant_members_select_tenant" ON public.tenant_members
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "tenant_members_update" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_update_when_active" ON public.tenant_members;
CREATE POLICY "tenant_members_update_when_active" ON public.tenant_members
  FOR UPDATE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR user_id = auth.uid()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_members')
      OR public.has_permission(tenant_id, 'manage_tenant_users')
    )
  )
  WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR user_id = auth.uid()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_members')
      OR public.has_permission(tenant_id, 'manage_tenant_users')
    )
  );

DROP POLICY IF EXISTS "tenant_members_delete_admin" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_delete_when_active" ON public.tenant_members;
CREATE POLICY "tenant_members_delete_when_active" ON public.tenant_members
  FOR DELETE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_members')
      OR public.has_permission(tenant_id, 'manage_tenant_users')
    )
  );

-- ============================================================
-- 4. TABEL BILLING_ITEMS
-- ============================================================

DROP POLICY IF EXISTS "billing_items_select" ON public.billing_items;
CREATE POLICY "billing_items_select" ON public.billing_items
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "billing_items_insert_when_active" ON public.billing_items;
CREATE POLICY "billing_items_insert_when_active" ON public.billing_items
  FOR INSERT WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'generate_billing')
    )
  );

DROP POLICY IF EXISTS "billing_items_update_when_active" ON public.billing_items;
CREATE POLICY "billing_items_update_when_active" ON public.billing_items
  FOR UPDATE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'generate_billing')
      OR public.has_permission(tenant_id, 'manage_billing_cash')
      OR public.has_permission(tenant_id, 'manage_billing_transfer')
    )
  )
  WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'generate_billing')
      OR public.has_permission(tenant_id, 'manage_billing_cash')
      OR public.has_permission(tenant_id, 'manage_billing_transfer')
    )
  );

DROP POLICY IF EXISTS "billing_items_delete" ON public.billing_items;
CREATE POLICY "billing_items_delete" ON public.billing_items
  FOR DELETE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'generate_billing')
    )
  );

-- ============================================================
-- 5. TABEL PAYMENTS
-- ============================================================

DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "payments_insert_when_active" ON public.payments;
CREATE POLICY "payments_insert_when_active" ON public.payments
  FOR INSERT WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_billing_cash')
      OR public.has_permission(tenant_id, 'manage_billing_transfer')
      OR (member_id IN (SELECT id FROM public.tenant_members WHERE user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "payments_update_when_active" ON public.payments;
CREATE POLICY "payments_update_when_active" ON public.payments
  FOR UPDATE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_billing_transfer')
      OR public.has_permission(tenant_id, 'manage_billing_cash')
    )
  )
  WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_billing_transfer')
      OR public.has_permission(tenant_id, 'manage_billing_cash')
    )
  );

-- ============================================================
-- 6. TABEL EXPENSES
-- ============================================================

DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "expenses_insert_when_active" ON public.expenses;
CREATE POLICY "expenses_insert_when_active" ON public.expenses
  FOR INSERT WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_expenses')
    )
  );

DROP POLICY IF EXISTS "expenses_update_when_active" ON public.expenses;
CREATE POLICY "expenses_update_when_active" ON public.expenses
  FOR UPDATE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_expenses')
    )
  )
  WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_expenses')
    )
  );

DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;
CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_expenses')
    )
  );

-- ============================================================
-- 7. TABEL ARISAN (arisan_rounds & arisan_participants)
-- ============================================================

DROP POLICY IF EXISTS "arisan_rounds_select" ON public.arisan_rounds;
CREATE POLICY "arisan_rounds_select" ON public.arisan_rounds
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "arisan_rounds_insert" ON public.arisan_rounds;
CREATE POLICY "arisan_rounds_insert" ON public.arisan_rounds
  FOR INSERT WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'run_special_action')
    )
  );

DROP POLICY IF EXISTS "arisan_rounds_update" ON public.arisan_rounds;
CREATE POLICY "arisan_rounds_update" ON public.arisan_rounds
  FOR UPDATE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'run_special_action')
    )
  )
  WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'run_special_action')
    )
  );

DROP POLICY IF EXISTS "arisan_participants_select" ON public.arisan_participants;
CREATE POLICY "arisan_participants_select" ON public.arisan_participants
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

DROP POLICY IF EXISTS "arisan_participants_insert" ON public.arisan_participants;
CREATE POLICY "arisan_participants_insert" ON public.arisan_participants
  FOR INSERT WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'run_special_action')
    )
  );

DROP POLICY IF EXISTS "arisan_participants_delete" ON public.arisan_participants;
CREATE POLICY "arisan_participants_delete" ON public.arisan_participants
  FOR DELETE USING (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'run_special_action')
    )
  );

-- ============================================================
-- 8. TABEL PUBLIC_LISTINGS
-- ============================================================

DROP POLICY IF EXISTS "public_listings_insert_when_active" ON public.public_listings;
CREATE POLICY "public_listings_insert_when_active" ON public.public_listings
  FOR INSERT WITH CHECK (
    public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'post_listing')
      OR (tenant_id IN (SELECT public.current_tenant_ids()) AND category = 'umkm')
    )
  );

DROP POLICY IF EXISTS "public_listings_update_when_active" ON public.public_listings;
CREATE POLICY "public_listings_update_when_active" ON public.public_listings
  FOR UPDATE USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'post_listing')
    OR posted_by IN (SELECT id FROM public.tenant_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'post_listing')
    OR posted_by IN (SELECT id FROM public.tenant_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "public_listings_delete_when_active" ON public.public_listings;
CREATE POLICY "public_listings_delete_when_active" ON public.public_listings
  FOR DELETE USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'post_listing')
    OR posted_by IN (SELECT id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- 9. TABEL TENANT_ROLES & TENANT_ROLE_PERMISSIONS
-- ============================================================

DROP POLICY IF EXISTS "tenant_roles_insert" ON public.tenant_roles;
CREATE POLICY "tenant_roles_insert" ON public.tenant_roles
  FOR INSERT WITH CHECK (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'manage_tenant_users')
  );

DROP POLICY IF EXISTS "tenant_roles_update" ON public.tenant_roles;
CREATE POLICY "tenant_roles_update" ON public.tenant_roles
  FOR UPDATE USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'manage_tenant_users')
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'manage_tenant_users')
  );

DROP POLICY IF EXISTS "tenant_roles_delete" ON public.tenant_roles;
CREATE POLICY "tenant_roles_delete" ON public.tenant_roles
  FOR DELETE USING (
    NOT (is_owner_role OR is_base_role)
    AND (
      public.is_platform_admin()
      OR public.is_tenant_owner(tenant_id)
      OR public.has_permission(tenant_id, 'manage_tenant_users')
    )
  );

DROP POLICY IF EXISTS "tenant_role_permissions_modify" ON public.tenant_role_permissions;
CREATE POLICY "tenant_role_permissions_modify" ON public.tenant_role_permissions
  FOR ALL USING (
    public.is_platform_admin()
    OR tenant_role_id IN (
      SELECT id FROM public.tenant_roles
      WHERE public.is_tenant_owner(tenant_id)
         OR public.has_permission(tenant_id, 'manage_tenant_users')
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR tenant_role_id IN (
      SELECT id FROM public.tenant_roles
      WHERE public.is_tenant_owner(tenant_id)
         OR public.has_permission(tenant_id, 'manage_tenant_users')
    )
  );

COMMIT;

