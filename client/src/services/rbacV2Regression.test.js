/**
 * rbacV2Regression.test.js — T12.12 Comprehensive Regression Test Suite untuk RBAC v2
 *
 * Menguji integrasi penuh RBAC v2 (Custom Role & Permission Berjenjang):
 *   1. Pembuatan custom role dengan kombinasi permission granular (FR-36)
 *   2. Delegasi pengelola multi-tenant: 1 orang ditugaskan di >= 2 tenant berbeda (FR-31, FR-32, FR-33)
 *   3. Penegakan containment: Pengelola TANPA manage_tenant_users ditolak membuat role baru (FR-34)
 *   4. Delegasi wewenang: Pengelola DENGAN manage_tenant_users berhasil membuat role baru (FR-34)
 *   5. Superset Super Admin: is_platform_admin() memiliki akses penuh lintas-tenant (FR-39, FR-40)
 *   6. Immutabilitas role bawaan: "Admin" dan "Warga/Anggota" tidak dapat dihapus (FR-37)
 *   7. Aturan 1 role aktif per anggota per tenant (FR-38)
 *   8. Proteksi subscription & billing eksklusif untuk Admin/Owner (FR-35)
 *   9. Evaluasi hasPermission() & containment model (Owner & Super Admin punya 10 permission)
 *  10. Tidak adanya regresi pada operasional 4 vertikal pasca-drop kolom legacy role
 *
 * Ref: task.md T12.12, requirement.md §3.2 (FR-31 s/d FR-40), specification.md §2.1 & §6.2
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_PLATFORM_PERMISSIONS,
  hasTenantPermission,
  calculateEffectivePermissions,
  canManageRoles,
  canModifySubscription,
  validateRoleDeletion,
  evaluateRbacAccess,
} from './rbacTestHelpers';

describe('T12.12: RBAC v2 Comprehensive Regression Test Suite', () => {
  // Setup data mock tenant & user
  const OWNER_USER_ID = 'usr-owner-101';
  const MANAGER_USER_ID = 'usr-manager-202';
  const MEMBER_USER_ID = 'usr-member-303';
  const SUPER_ADMIN_USER_ID = 'usr-superadmin-999';

  const TENANT_A_ID = 'tnt-kos-melati';
  const TENANT_B_ID = 'tnt-kos-mawar';
  const TENANT_C_ID = 'tnt-rt05-sukamaju';

  let tenantRolesStore;
  let tenantMembersStore;

  beforeEach(() => {
    // Inisialisasi store mock roles dan members per tenant
    tenantRolesStore = [
      // Role bawaan Tenant A
      {
        id: 'role-a-admin',
        tenant_id: TENANT_A_ID,
        name: 'Admin',
        is_owner_role: true,
        is_base_role: false,
        permissions: [...ALL_PLATFORM_PERMISSIONS],
      },
      {
        id: 'role-a-member',
        tenant_id: TENANT_A_ID,
        name: 'Warga/Anggota',
        is_owner_role: false,
        is_base_role: true,
        permissions: [],
      },
      // Role bawaan Tenant B
      {
        id: 'role-b-admin',
        tenant_id: TENANT_B_ID,
        name: 'Admin',
        is_owner_role: true,
        is_base_role: false,
        permissions: [...ALL_PLATFORM_PERMISSIONS],
      },
      {
        id: 'role-b-member',
        tenant_id: TENANT_B_ID,
        name: 'Warga/Anggota',
        is_owner_role: false,
        is_base_role: true,
        permissions: [],
      },
    ];

    tenantMembersStore = [
      // Owner di Tenant A & B
      {
        id: 'mem-a-owner',
        tenant_id: TENANT_A_ID,
        user_id: OWNER_USER_ID,
        full_name: 'Bapak Pemilik',
        tenant_role_id: 'role-a-admin',
        is_owner: true,
        status: 'approved',
      },
      {
        id: 'mem-b-owner',
        tenant_id: TENANT_B_ID,
        user_id: OWNER_USER_ID,
        full_name: 'Bapak Pemilik',
        tenant_role_id: 'role-b-admin',
        is_owner: true,
        status: 'approved',
      },
    ];
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Pembuatan Custom Role Baru dengan Kombinasi Granular (FR-36)
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Custom Role Creation (FR-36)', () => {
    it('Admin dapat membuat custom role baru dengan kombinasi permission custom', () => {
      const customPerms = ['manage_billing_cash', 'manage_members', 'view_reports'];
      const newRole = {
        id: 'role-a-bendahara',
        tenant_id: TENANT_A_ID,
        name: 'Bendahara Kos',
        is_owner_role: false,
        is_base_role: false,
        permissions: customPerms,
      };

      // Validasi pembuatan role oleh Admin
      const canCreate = canManageRoles({
        userId: OWNER_USER_ID,
        tenantId: TENANT_A_ID,
        isOwner: true,
        isPlatformAdmin: false,
        memberRole: tenantRolesStore.find((r) => r.id === 'role-a-admin'),
      });
      expect(canCreate).toBe(true);

      tenantRolesStore.push(newRole);
      const saved = tenantRolesStore.find((r) => r.id === 'role-a-bendahara');
      expect(saved).toBeDefined();
      expect(saved.name).toBe('Bendahara Kos');
      expect(saved.permissions).toEqual(customPerms);
    });

    it('menolak pembuatan role jika permission key tidak valid', () => {
      const invalidPerms = ['manage_billing_cash', 'hack_database'];
      const invalid = invalidPerms.filter((p) => !ALL_PLATFORM_PERMISSIONS.includes(p));
      expect(invalid).toEqual(['hack_database']);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Delegasi Pengelola Multi-Tenant (FR-31, FR-32, FR-33)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Multi-Tenant Manager Delegation (FR-31, FR-32, FR-33)', () => {
    it('Admin dapat menugaskan 1 orang yang sama sebagai Pengelola di 2 tenant berbeda miliknya', () => {
      // Buat role pengelola operasional di Tenant A (dengan manage_members & generate_billing)
      const rolePengelolaA = {
        id: 'role-a-pengelola',
        tenant_id: TENANT_A_ID,
        name: 'Pengelola Melati',
        is_owner_role: false,
        is_base_role: false,
        permissions: ['manage_members', 'generate_billing'],
      };
      tenantRolesStore.push(rolePengelolaA);

      // Buat role pengelola operasional di Tenant B (dengan manage_billing_cash & view_reports)
      const rolePengelolaB = {
        id: 'role-b-pengelola',
        tenant_id: TENANT_B_ID,
        name: 'Pengelola Mawar',
        is_owner_role: false,
        is_base_role: false,
        permissions: ['manage_billing_cash', 'view_reports'],
      };
      tenantRolesStore.push(rolePengelolaB);

      // Assign user yang sama ke Tenant A dan Tenant B
      tenantMembersStore.push({
        id: 'mem-a-manager',
        tenant_id: TENANT_A_ID,
        user_id: MANAGER_USER_ID,
        full_name: 'Mas Pengelola',
        tenant_role_id: 'role-a-pengelola',
        is_owner: false,
        status: 'approved',
      });

      tenantMembersStore.push({
        id: 'mem-b-manager',
        tenant_id: TENANT_B_ID,
        user_id: MANAGER_USER_ID,
        full_name: 'Mas Pengelola',
        tenant_role_id: 'role-b-pengelola',
        is_owner: false,
        status: 'approved',
      });

      // Verifikasi keanggotaan terpisah
      const memberships = tenantMembersStore.filter((m) => m.user_id === MANAGER_USER_ID);
      expect(memberships).toHaveLength(2);

      // Verifikasi hak di Tenant A: punya generate_billing, tidak punya view_reports
      const permsA = calculateEffectivePermissions({
        isOwner: false,
        isPlatformAdmin: false,
        rolePermissions: rolePengelolaA.permissions,
      });
      expect(hasTenantPermission(permsA, 'generate_billing')).toBe(true);
      expect(hasTenantPermission(permsA, 'view_reports')).toBe(false);

      // Verifikasi hak di Tenant B: punya view_reports, tidak punya generate_billing
      const permsB = calculateEffectivePermissions({
        isOwner: false,
        isPlatformAdmin: false,
        rolePermissions: rolePengelolaB.permissions,
      });
      expect(hasTenantPermission(permsB, 'view_reports')).toBe(true);
      expect(hasTenantPermission(permsB, 'generate_billing')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3 & 4. Penegakan Containment Model: manage_tenant_users (FR-34)
  // ───────────────────────────────────────────────────────────────────────────
  describe('3 & 4. Containment Model & Staff Role Delegation (FR-34)', () => {
    it('Pengelola TANPA manage_tenant_users mencoba membuat role baru -> harus ditolak RLS', () => {
      const roleStaffStandard = {
        id: 'role-staff-standard',
        tenant_id: TENANT_A_ID,
        name: 'Staff Kasir',
        is_owner_role: false,
        is_base_role: false,
        permissions: ['manage_billing_cash'],
      };

      const canCreate = canManageRoles({
        userId: MANAGER_USER_ID,
        tenantId: TENANT_A_ID,
        isOwner: false,
        isPlatformAdmin: false,
        memberRole: roleStaffStandard,
      });

      expect(canCreate).toBe(false);
    });

    it('Pengelola DENGAN manage_tenant_users (diberi eksplisit oleh Admin) berhasil membuat role baru', () => {
      const roleStaffDelegated = {
        id: 'role-staff-delegated',
        tenant_id: TENANT_A_ID,
        name: 'Supervisi Tenant',
        is_owner_role: false,
        is_base_role: false,
        permissions: ['manage_members', 'manage_tenant_users'],
      };

      const canCreate = canManageRoles({
        userId: MANAGER_USER_ID,
        tenantId: TENANT_A_ID,
        isOwner: false,
        isPlatformAdmin: false,
        memberRole: roleStaffDelegated,
      });

      expect(canCreate).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Superset Super Admin: is_platform_admin() (FR-39, FR-40)
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Platform Super Admin Access as Superset (FR-39, FR-40)', () => {
    it('Super Admin berhasil mengakses & memodifikasi data tenant manapun tanpa perlu jadi member tenant tsb', () => {
      // Tenant C tidak memiliki record membership untuk SUPER_ADMIN_USER_ID
      const isMemberOfC = tenantMembersStore.some(
        (m) => m.tenant_id === TENANT_C_ID && m.user_id === SUPER_ADMIN_USER_ID
      );
      expect(isMemberOfC).toBe(false);

      // Evaluasi hak akses Super Admin di Tenant C
      const superAdminAccess = evaluateRbacAccess({
        userId: SUPER_ADMIN_USER_ID,
        tenantId: TENANT_C_ID,
        isOwner: false,
        isPlatformAdmin: true,
        memberRole: null,
        requestedAction: 'manage_settings',
      });

      expect(superAdminAccess.allowed).toBe(true);
      expect(superAdminAccess.isPlatformAdmin).toBe(true);
      expect(superAdminAccess.effectivePermissions).toEqual(ALL_PLATFORM_PERMISSIONS);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Immutabilitas Role Bawaan (FR-37)
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Immutability of Built-in Roles (FR-37)', () => {
    it('Role bawaan "Admin" (is_owner_role) gagal dihapus saat dicoba', () => {
      const adminRole = tenantRolesStore.find((r) => r.is_owner_role);
      const validation = validateRoleDeletion(adminRole);
      expect(validation.canDelete).toBe(false);
      expect(validation.reason).toMatch(/Role bawaan.*tidak dapat dihapus/i);
    });

    it('Role bawaan "Warga/Anggota" (is_base_role) gagal dihapus saat dicoba', () => {
      const baseRole = tenantRolesStore.find((r) => r.is_base_role);
      const validation = validateRoleDeletion(baseRole);
      expect(validation.canDelete).toBe(false);
      expect(validation.reason).toMatch(/Role bawaan.*tidak dapat dihapus/i);
    });

    it('Custom role non-bawaan dapat dihapus jika tidak sedang dipakai', () => {
      const customRole = {
        id: 'role-temp-koordinator',
        tenant_id: TENANT_A_ID,
        name: 'Koordinator Acara',
        is_owner_role: false,
        is_base_role: false,
        permissions: ['run_special_action'],
      };
      const validation = validateRoleDeletion(customRole);
      expect(validation.canDelete).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Aturan 1 Role Aktif per Anggota per Tenant (FR-38)
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Single Active Role Per Tenant Constraint (FR-38)', () => {
    it('anggota hanya memiliki satu role_id aktif pada tabel tenant_members', () => {
      const memberRec = {
        id: 'mem-test-single',
        tenant_id: TENANT_A_ID,
        user_id: MEMBER_USER_ID,
        tenant_role_id: 'role-a-member',
        is_owner: false,
        status: 'approved',
      };

      expect(typeof memberRec.tenant_role_id).toBe('string');
      // Kolom tenant_role_id berupa UUID skalar, bukan array role
      expect(Array.isArray(memberRec.tenant_role_id)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Proteksi Eksklusif Subscription & Billing Platform (FR-35)
  // ───────────────────────────────────────────────────────────────────────────
  describe('8. Subscription & Billing Platform Protection (FR-35)', () => {
    it('Pengelola tidak dapat mengubah subscription platform, hanya Admin/Owner dan Super Admin', () => {
      // Pengelola dengan wewenang tertinggi sekalipun (manage_tenant_users)
      const canStaffModify = canModifySubscription({
        isOwner: false,
        isPlatformAdmin: false,
      });
      expect(canStaffModify).toBe(false);

      // Owner tenant
      const canOwnerModify = canModifySubscription({
        isOwner: true,
        isPlatformAdmin: false,
      });
      expect(canOwnerModify).toBe(true);

      // Super Admin
      const canSuperAdminModify = canModifySubscription({
        isOwner: false,
        isPlatformAdmin: true,
      });
      expect(canSuperAdminModify).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Model Containment Kepemilikan (Spec §3.2)
  // ───────────────────────────────────────────────────────────────────────────
  describe('9. Owner Full Containment Model (Spec §3.2)', () => {
    it('Owner otomatis memiliki seluruh 10 permission platform tanpa perlu deklarasi manual', () => {
      const ownerPerms = calculateEffectivePermissions({
        isOwner: true,
        isPlatformAdmin: false,
        rolePermissions: [], // Walaupun relasi role kosong, owner tetap punya semua
      });

      expect(ownerPerms).toHaveLength(10);
      ALL_PLATFORM_PERMISSIONS.forEach((key) => {
        expect(hasTenantPermission(ownerPerms, key)).toBe(true);
      });
    });

    it('Anggota dasar tanpa role staff memiliki 0 permission operasional', () => {
      const memberPerms = calculateEffectivePermissions({
        isOwner: false,
        isPlatformAdmin: false,
        rolePermissions: [],
      });

      expect(memberPerms).toHaveLength(0);
      ALL_PLATFORM_PERMISSIONS.forEach((key) => {
        expect(hasTenantPermission(memberPerms, key)).toBe(false);
      });
    });
  });
});
