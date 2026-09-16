import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabaseClient';

export const TenantContext = createContext(null);

const ACTIVE_TENANT_KEY = 'pv_active_tenant_id';
const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export const ALL_PLATFORM_PERMISSIONS = [
  'manage_billing_cash',
  'manage_billing_transfer',
  'generate_billing',
  'manage_members',
  'manage_settings',
  'manage_expenses',
  'view_reports',
  'run_special_action',
  'post_listing',
  'manage_tenant_users',
];

// Mock tenants untuk mode demo (mewakili 4 vertikal)
export const DEMO_TENANTS = [
  {
    id: 'demo-tenant-rtrw',
    name: 'Palm Village RT 05',
    type: 'rt_rw',
    role: 'admin',
    is_owner: true,
    role_name: 'Admin',
    permissions: ALL_PLATFORM_PERMISSIONS,
    owner_id: 'demo-admin',
    subscription: {
      id: 'sub-demo-rtrw',
      status: 'active',
      trial_started_at: null,
      trial_ends_at: null,
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2026-12-31T23:59:59Z',
    },
  },
  {
    id: 'demo-tenant-kos',
    name: 'Kos Melati Harmoni',
    type: 'kos',
    role: 'admin',
    is_owner: true,
    role_name: 'Admin',
    permissions: ALL_PLATFORM_PERMISSIONS,
    owner_id: 'demo-admin',
    subscription: {
      id: 'sub-demo-kos',
      status: 'trial',
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 15 * 86400000).toISOString(),
      current_period_start: null,
      current_period_end: null,
    },
  },
  {
    id: 'demo-tenant-arisan',
    name: 'Arisan Mawar Berkah',
    type: 'arisan',
    role: 'admin',
    is_owner: true,
    role_name: 'Admin',
    permissions: ALL_PLATFORM_PERMISSIONS,
    owner_id: 'demo-admin',
    subscription: {
      id: 'sub-demo-arisan',
      status: 'trial',
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 15 * 86400000).toISOString(),
      current_period_start: null,
      current_period_end: null,
    },
  },
  {
    id: 'demo-tenant-kelas',
    name: 'Kelas Belajar Mandiri',
    type: 'kelas',
    role: 'admin',
    is_owner: true,
    role_name: 'Admin',
    permissions: ALL_PLATFORM_PERMISSIONS,
    owner_id: 'demo-admin',
    subscription: {
      id: 'sub-demo-kelas',
      status: 'trial',
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 15 * 86400000).toISOString(),
      current_period_start: null,
      current_period_end: null,
    },
  },
];


export function TenantProvider({ children }) {
  const { user, profile, isAuthenticated, loading: authLoading } = useAuth();

  const [userTenants, setUserTenants] = useState([]);
  const [activeTenantId, setActiveTenantIdState] = useState(() => {
    return localStorage.getItem(ACTIVE_TENANT_KEY) || null;
  });
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ganti tenant aktif dan simpan ke localStorage
  const setActiveTenantId = useCallback((id) => {
    if (id) {
      localStorage.setItem(ACTIVE_TENANT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_TENANT_KEY);
    }
    setActiveTenantIdState(id);
  }, []);

  // Fetch daftar tenant milik pengguna saat auth siap
  const fetchTenantData = useCallback(async () => {
    if (!isAuthenticated) {
      setUserTenants([]);
      setIsPlatformAdmin(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const currentEmail = (user?.email || profile?.email || '').toLowerCase();
    const isSuperAdminEmail = currentEmail === 'dyudhiantoro@gmail.com';
    const currentUserId = user?.id || profile?.id;
    const isRealUserSession = Boolean(currentUserId && !String(currentUserId).startsWith('demo-'));

    // ── DEMO MODE HANYA UNTUK SESI DEMO MURNI TANPA SUPABASE ───────
    if (IS_DEMO && !isRealUserSession && !isSuperAdminEmail) {
      setUserTenants([]);
      setIsPlatformAdmin(false);
      setLoading(false);
      return;
    }

    // ── SUPABASE / PRODUCTION MODE ──────────────────────────────────
    try {
      const currentUserId = user?.id || profile?.id;
      if (!currentUserId) {
        setUserTenants([]);
        setLoading(false);
        return;
      }

      // 1. Cek apakah user adalah platform admin
      const currentEmail = (user?.email || profile?.email || '').toLowerCase();
      const isSuperAdminEmail = currentEmail === 'dyudhiantoro@gmail.com';

      if (isSuperAdminEmail) {
        setIsPlatformAdmin(true);
      } else {
        try {
          const { data: adminData } = await supabase
            .from('platform_admins')
            .select('user_id')
            .eq('user_id', currentUserId)
            .maybeSingle();
          setIsPlatformAdmin(Boolean(adminData?.user_id));
        } catch (_e) {
          setIsPlatformAdmin(false);
        }
      }

      // 2. Ambil seluruh keanggotaan tenant (sebagai owner atau member approved)
      // Ambil tenant dari tenant_members
      const { data: memberRows, error: memberErr } = await supabase
        .from('tenant_members')
        .select(`
          tenant_id,
          status,
          tenant_role_id,
          is_owner,
          tenant_roles:tenant_role_id (
            id,
            name,
            is_owner_role,
            is_base_role,
            tenant_role_permissions (
              permission_key
            )
          ),
          tenants:tenant_id (
            id,
            name,
            type,
            owner_id,
            address,
            contact_phone,
            settings,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', currentUserId)
        .eq('status', 'approved');

      if (memberErr) {
        // eslint-disable-next-line no-console
        console.warn('[TenantContext] Error fetching tenant memberships:', memberErr.message);
      }

      // Ambil tenant dari tenants di mana user adalah owner
      const { data: ownedRows, error: ownedErr } = await supabase
        .from('tenants')
        .select('id, name, type, owner_id, address, contact_phone, settings, created_at, updated_at')
        .eq('owner_id', currentUserId);

      if (ownedErr) {
        // eslint-disable-next-line no-console
        console.warn('[TenantContext] Error fetching owned tenants:', ownedErr.message);
      }

      // Gabungkan hasil unik
      const tenantMap = new Map();

      // Tambahkan owned tenants
      (ownedRows || []).forEach((t) => {
        tenantMap.set(t.id, {
          ...t,
          role: 'admin', // Owner selalu bertindak sebagai admin
          is_owner: true,
          role_name: 'Admin',
          permissions: ALL_PLATFORM_PERMISSIONS,
        });
      });

      // Tambahkan/override dengan data tenant_members
      (memberRows || []).forEach((m) => {
        if (m.tenants) {
          const existing = tenantMap.get(m.tenant_id);
          const isOwner = Boolean(
            m.is_owner ||
            m.tenants.owner_id === currentUserId ||
            existing?.is_owner
          );
          const roleName = isOwner
            ? 'Admin'
            : (m.tenant_roles?.name || 'Anggota');
          const rawPerms = m.tenant_roles?.tenant_role_permissions?.map((p) => p.permission_key) || [];
          const perms = isOwner ? ALL_PLATFORM_PERMISSIONS : rawPerms;

          const legacyRoleAlias = isOwner
            ? 'admin'
            : (m.tenant_roles?.is_owner_role ? 'admin' : (m.tenant_roles?.is_base_role ? 'anggota' : (m.tenant_roles?.name?.toLowerCase() || 'anggota')));

          tenantMap.set(m.tenant_id, {
            ...m.tenants,
            role: legacyRoleAlias,
            tenant_role_id: m.tenant_role_id,
            is_owner: isOwner,
            role_name: roleName,
            permissions: perms,
          });
        }
      });

      const compiledTenants = Array.from(tenantMap.values());

      // 3. Ambil subscription untuk setiap tenant
      if (compiledTenants.length > 0) {
        const tenantIds = compiledTenants.map((t) => t.id);
        const { data: subRows, error: subErr } = await supabase
          .from('tenant_subscriptions')
          .select('id, tenant_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, period_id')
          .in('tenant_id', tenantIds);

        if (!subErr && subRows) {
          const subMap = new Map(subRows.map((s) => [s.tenant_id, s]));
          compiledTenants.forEach((t) => {
            t.subscription = subMap.get(t.id) || {
              status: 'read_only',
              trial_ends_at: null,
            };
          });
        }
      }

      setUserTenants(compiledTenants);

      // 4. Resolusi activeTenantId (T2.2: persisten atau fallback ke tenant pertama)
      const savedId = localStorage.getItem(ACTIVE_TENANT_KEY);
      const isSavedValid = compiledTenants.some((t) => t.id === savedId);

      if (savedId && isSavedValid) {
        setActiveTenantIdState(savedId);
      } else if (compiledTenants.length > 0) {
        const defaultTenant = compiledTenants[0];
        setActiveTenantIdState(defaultTenant.id);
        localStorage.setItem(ACTIVE_TENANT_KEY, defaultTenant.id);
      } else {
        setActiveTenantIdState(null);
        localStorage.removeItem(ACTIVE_TENANT_KEY);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TenantContext] Failed to load tenant context:', err);
      setError(err.message || 'Gagal memuat konteks tenant');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, profile?.id, profile?.role]);

  useEffect(() => {
    if (!authLoading) {
      fetchTenantData();
    }
  }, [authLoading, fetchTenantData]);

  // Resolusi data tenant aktif terpilih
  const activeTenant = useMemo(() => {
    if (!activeTenantId || userTenants.length === 0) return null;
    return userTenants.find((t) => t.id === activeTenantId) || null;
  }, [activeTenantId, userTenants]);

  const tenantType = activeTenant?.type || null;
  const subscription = activeTenant?.subscription || null;
  const subscriptionStatus = subscription?.status || 'read_only';
  const userRole = activeTenant?.role || 'anggota';

  const isOwner = Boolean(
    activeTenant?.is_owner ||
    activeTenant?.owner_id === (user?.id || profile?.id)
  );
  const isTenantAdmin = isOwner || userRole === 'admin';

  const activeRoleName = activeTenant?.role_name || (
    isOwner
      ? 'Admin'
      : (activeTenant?.role ? activeTenant.role.charAt(0).toUpperCase() + activeTenant.role.slice(1) : 'Anggota')
  );

  const permissions = useMemo(() => {
    if (isPlatformAdmin || isOwner) {
      return ALL_PLATFORM_PERMISSIONS;
    }
    return activeTenant?.permissions || [];
  }, [isPlatformAdmin, isOwner, activeTenant?.permissions]);

  const hasPermission = useCallback((key) => {
    if (isPlatformAdmin || isOwner) return true;
    return permissions.includes(key);
  }, [isPlatformAdmin, isOwner, permissions]);

  // Buat tenant baru (Demo mode & Supabase mode) sesuai T2.4
  const createTenant = useCallback(async ({ name, type }) => {
    const currentUserId = user?.id || profile?.id;
    if (!currentUserId) {
      throw new Error('Anda harus masuk terlebih dahulu untuk membuat layanan baru.');
    }

    if (IS_DEMO) {
      const newMockTenant = {
        id: `demo-tenant-${Date.now()}`,
        name: name.trim(),
        type,
        owner_id: currentUserId,
        role: 'admin',
        is_owner: true,
        role_name: 'Admin',
        permissions: ALL_PLATFORM_PERMISSIONS,
        subscription: {
          id: `sub-demo-${Date.now()}`,
          status: 'trial',
          trial_started_at: new Date().toISOString(),
          trial_ends_at: new Date(Date.now() + 15 * 86400000).toISOString(),
          current_period_start: null,
          current_period_end: null,
        },
      };
      setUserTenants((prev) => [newMockTenant, ...prev]);
      setActiveTenantId(newMockTenant.id);
      return newMockTenant;
    }

    const { data: newTenant, error: insertError } = await supabase
      .from('tenants')
      .insert({
        name: name.trim(),
        type,
        owner_id: currentUserId,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message || 'Gagal mendaftarkan tenant baru.');
    }

    await fetchTenantData();
    setActiveTenantId(newTenant.id);
    return newTenant;
  }, [user?.id, profile?.id, setActiveTenantId, fetchTenantData]);

  const value = {
    // State Utama (Spec §7 & T2.1)
    activeTenantId,
    activeTenant,
    tenantType,
    subscription,
    subscriptionStatus,
    userRole,
    userTenants,
    isTenantAdmin,
    isPlatformAdmin,
    isOwner,
    activeRoleName,
    permissions,
    hasPermission,
    loading: loading || authLoading,
    error,

    // Actions
    setActiveTenantId,
    switchTenant: setActiveTenantId,
    refreshTenant: fetchTenantData,
    createTenant,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant harus digunakan di dalam <TenantProvider>');
  }
  return context;
}
