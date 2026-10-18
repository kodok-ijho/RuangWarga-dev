import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../supabaseClient';
import {
  fetchTenantRoles,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
  assignMemberRole,
  ROLE_TEMPLATES,
  applyRoleTemplate,
  PLATFORM_PERMISSIONS,
} from './rbac';

describe('tenant/rbac - Unit Tests (DEBT-1F.1)', () => {
  const NON_DEMO_TENANT_ID = '33333333-3333-3333-3333-333333333333';
  const NON_DEMO_ROLE_ID = '44444444-4444-4444-4444-444444444444';
  const NON_DEMO_MEMBER_ID = '55555555-5555-5555-5555-555555555555';

  let fromSpy;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fromSpy) {
      fromSpy.mockRestore();
    }
  });

  describe('fetchTenantRoles', () => {
    it('memuat relasi tenant_role_permissions, tidak memuat kolom permissions di tenant_roles, dan memetakan permission_key', async () => {
      let capturedSelectQuery = null;

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_roles') {
          return {
            select: vi.fn().mockImplementation((query) => {
              capturedSelectQuery = query;
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: NON_DEMO_ROLE_ID,
                        tenant_id: NON_DEMO_TENANT_ID,
                        name: 'Pengurus Lingkungan',
                        is_base_role: false,
                        is_owner_role: false,
                        tenant_role_permissions: [
                          { permission_key: 'view_reports' },
                          { permission_key: 'manage_expenses' },
                        ],
                      },
                    ],
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const roles = await fetchTenantRoles(NON_DEMO_TENANT_ID);

      expect(capturedSelectQuery).toContain('tenant_role_permissions');
      // Kolom 'permissions' tidak boleh di-select langsung dari tabel tenant_roles
      expect(capturedSelectQuery).not.toMatch(/\bpermissions\b/);
      expect(roles).toHaveLength(1);
      expect(roles[0].permissions).toEqual(['view_reports', 'manage_expenses']);
    });
  });

  describe('createTenantRole', () => {
    it('insert ke tenant_roles tanpa kolom permissions, lalu insert ke tenant_role_permissions', async () => {
      let roleInsertPayload = null;
      let permInsertPayload = null;

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_roles') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              roleInsertPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'new-role-uuid',
                      tenant_id: NON_DEMO_TENANT_ID,
                      name: 'Auditor Kas',
                      is_owner_role: false,
                      is_base_role: false,
                      created_at: '2026-10-11T00:00:00Z',
                    },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'tenant_role_permissions') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              permInsertPayload = payload;
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return {};
      });

      const result = await createTenantRole(NON_DEMO_TENANT_ID, {
        name: 'Auditor Kas',
        permissions: ['view_reports'],
      });

      expect(roleInsertPayload).toBeDefined();
      const roleRow = Array.isArray(roleInsertPayload) ? roleInsertPayload[0] : roleInsertPayload;
      expect(roleRow.name).toBe('Auditor Kas');
      expect(roleRow.tenant_id).toBe(NON_DEMO_TENANT_ID);
      // Kolom permissions TIDAK boleh ada di tabel tenant_roles
      expect(roleRow).not.toHaveProperty('permissions');

      // Permissions harus disimpan di tabel relasi tenant_role_permissions
      expect(permInsertPayload).toBeDefined();
      expect(permInsertPayload).toEqual([
        { tenant_role_id: 'new-role-uuid', permission_key: 'view_reports' },
      ]);
      expect(result.permissions).toEqual(['view_reports']);
    });
  });

  describe('updateTenantRole dan deleteTenantRole proteksi role bawaan', () => {
    it('updateTenantRole melempar error dan TIDAK memanggil .update jika is_owner_role: true', async () => {
      const updateSpy = vi.fn();

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: NON_DEMO_ROLE_ID,
                    tenant_id: NON_DEMO_TENANT_ID,
                    name: 'Admin Utama',
                    is_owner_role: true,
                    is_base_role: false,
                  },
                  error: null,
                }),
              }),
            }),
            update: updateSpy,
          };
        }
        return {};
      });

      await expect(
        updateTenantRole(NON_DEMO_ROLE_ID, { name: 'Owner Ganti Nama' })
      ).rejects.toThrow(/Role bawaan/);

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('deleteTenantRole melempar error dan TIDAK memanggil .delete jika is_owner_role: true', async () => {
      const deleteSpy = vi.fn();

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: NON_DEMO_ROLE_ID,
                    name: 'Admin Utama',
                    is_owner_role: true,
                    is_base_role: false,
                  },
                  error: null,
                }),
              }),
            }),
            delete: deleteSpy,
          };
        }
        return {};
      });

      await expect(deleteTenantRole(NON_DEMO_ROLE_ID)).rejects.toThrow(/Role bawaan/);
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });

  describe('assignMemberRole', () => {
    it('melempar error jika tenantRoleId kosong atau null', async () => {
      await expect(assignMemberRole(NON_DEMO_MEMBER_ID, null)).rejects.toThrow(
        'Member ID dan Tenant Role ID wajib disertakan.'
      );
      await expect(assignMemberRole(NON_DEMO_MEMBER_ID, '')).rejects.toThrow(
        'Member ID dan Tenant Role ID wajib disertakan.'
      );
    });
  });

  describe('ROLE_TEMPLATES dan PLATFORM_PERMISSIONS (RTRW-2.6)', () => {
    it('entri post_listing memiliki label dan description baru yang tepat', () => {
      const perm = PLATFORM_PERMISSIONS.find((p) => p.key === 'post_listing');
      expect(perm).toBeDefined();
      expect(perm.label).toBe('Kelola Iklan Komunitas');
      expect(perm.description).toContain('Melihat & mengelola semua iklan listing komunitas');
    });

    it('ROLE_TEMPLATES memiliki konfigurasi rt_rw dengan 6 jabatan standar', () => {
      expect(ROLE_TEMPLATES.rt_rw).toBeDefined();
      expect(ROLE_TEMPLATES.rt_rw).toHaveLength(6);

      const names = ROLE_TEMPLATES.rt_rw.map((r) => r.name);
      expect(names).toEqual([
        'Ketua RT/RW',
        'Wakil Ketua',
        'Sekretaris',
        'Bendahara',
        'Koordinator Blok',
        'Humas',
      ]);

      // Pastikan manage_tenant_users dan run_special_action TIDAK ADA di template mana pun
      for (const tpl of Object.values(ROLE_TEMPLATES)) {
        for (const roleDef of tpl) {
          expect(roleDef.permissions).not.toContain('manage_tenant_users');
          expect(roleDef.permissions).not.toContain('run_special_action');
        }
      }
    });
  });

  describe('applyRoleTemplate (RTRW-2.6)', () => {
    it('melempar error jika tenantId kosong atau template tidak dikenal', async () => {
      await expect(applyRoleTemplate('')).rejects.toThrow('Tenant ID wajib disertakan.');
      await expect(applyRoleTemplate('demo-t1', 'non_existent')).rejects.toThrow(
        'Template jabatan tidak dikenal.'
      );
    });

    it('hanya membuat jabatan yang belum ada (case-insensitive & trim); skip yang sudah ada', async () => {
      // Misalkan role existing: 'Admin', '  bendahara  ' (lowercase)
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_roles') {
          return {
            select: vi.fn().mockImplementation((query) => {
              if (query.includes('tenant_role_permissions')) {
                return {
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [
                        { id: 'r-admin', name: 'Admin', is_owner_role: true, tenant_role_permissions: [] },
                        { id: 'r-bendahara', name: '  bendahara  ', is_owner_role: false, tenant_role_permissions: [] },
                      ],
                      error: null,
                    }),
                  }),
                };
              }
              return {};
            }),
            insert: vi.fn().mockImplementation((payload) => {
              const row = Array.isArray(payload) ? payload[0] : payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: `mock-${row.name}`, ...row },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'tenant_role_permissions') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      });

      const result = await applyRoleTemplate(NON_DEMO_TENANT_ID, 'rt_rw');

      // 'Bendahara' harus di-skip karena sudah ada '  bendahara  '
      expect(result.skipped).toContain('Bendahara');
      expect(result.skipped).toHaveLength(1);

      // 5 jabatan lainnya dibuat
      expect(result.created).toEqual([
        'Ketua RT/RW',
        'Wakil Ketua',
        'Sekretaris',
        'Koordinator Blok',
        'Humas',
      ]);
      expect(result.created).toHaveLength(5);
    });
  });
});
