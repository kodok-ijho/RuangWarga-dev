import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../supabaseClient';
import {
  normalizeOccupant,
  parseUnitsCsv,
  createTenantUnit,
  updateTenantUnit,
  setTenantUnitStatus,
  deleteTenantUnit,
  importTenantUnitsCSV,
  updateTenantMember,
  removeTenantMember,
} from './members';
import { updateTenantProfileAndSettings } from './settings';

describe('tenant/members & settings - Unit Tests (RTRW-2.1)', () => {
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const UNIT_ID = 42;
  const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

  let fromSpy;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fromSpy) {
      fromSpy.mockRestore();
    }
  });

  describe('normalizeOccupant', () => {
    it('membersihkan whitespace, memformat phone hanya digit dan +, serta memvalidasi status tinggal', () => {
      const input = {
        name: '  Pak Joko  ',
        phone: ' +62 812-3456-7890 ',
        occupancy_status: 'owner_occupied',
        note: '  Rumah pojok  ',
      };
      const result = normalizeOccupant(input);
      expect(result).toEqual({
        name: 'Pak Joko',
        phone: '+6281234567890',
        occupancy_status: 'owner_occupied',
        note: 'Rumah pojok',
      });
    });

    it('mengosongkan occupancy_status jika tidak valid dan membuang field kosong', () => {
      const input = {
        name: '  ',
        phone: 'invalid-letters',
        occupancy_status: 'alien_status',
        note: '',
      };
      const result = normalizeOccupant(input);
      expect(result).toEqual({});
    });

    it('menerima status tenant dengan benar', () => {
      const input = {
        name: 'Siti',
        occupancy_status: 'tenant',
      };
      const result = normalizeOccupant(input);
      expect(result).toEqual({
        name: 'Siti',
        occupancy_status: 'tenant',
      });
    });
  });

  describe('parseUnitsCsv', () => {
    it('memetakan variasi header case-insensitive dan nilai status tinggal', () => {
      const csvText = `Label,NAMA_PENGHUNI,No_HP,Status_Tinggal,Keterangan
A-01,Budi Santoso,0812-3456-7890,pemilik,Catatan 1
A-02,Ani Wijaya,0812-9999-8888,penyewa,Catatan 2
A-03,Joko,0813-0000-1111,owner_occupied,Catatan 3
A-04,Rudi,0814-2222-3333,kontrak,Catatan 4
A-05,Doni,,lainnya,
`;
      const rows = parseUnitsCsv(csvText);
      expect(rows).toHaveLength(5);

      expect(rows[0]).toEqual({
        label: 'A-01',
        occupant_name: 'Budi Santoso',
        occupant_phone: '0812-3456-7890',
        occupancy_status: 'owner_occupied',
        note: 'Catatan 1',
      });
      expect(rows[1].occupancy_status).toBe('tenant');
      expect(rows[2].occupancy_status).toBe('owner_occupied');
      expect(rows[3].occupancy_status).toBe('tenant');
      expect(rows[4].occupancy_status).toBe('');
    });

    it('mengembalikan array kosong jika input teks kosong atau invalid', () => {
      expect(parseUnitsCsv('')).toEqual([]);
      expect(parseUnitsCsv(null)).toEqual([]);
    });
  });

  describe('createTenantUnit', () => {
    it('menolak bila label kosong atau hanya spasi', async () => {
      await expect(createTenantUnit(TENANT_ID, { label: '   ' })).rejects.toThrow(
        'Label unit wajib diisi.'
      );
    });

    it('menolak label duplikat (case-insensitive + trim) dengan pesan error spesifik', async () => {
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_units') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 1, label: 'Blok A-01' }],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      await expect(
        createTenantUnit(TENANT_ID, { label: '  blok a-01  ' })
      ).rejects.toThrow('Unit dengan label "blok a-01" sudah ada.');
    });

    it('mengirim payload insert yang benar ke Supabase ketika valid', async () => {
      let insertedPayload = null;
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_units') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 1, label: 'Blok A-01' }],
                error: null,
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 2, ...payload },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const res = await createTenantUnit(TENANT_ID, {
        label: 'Blok B-02',
        occupant: {
          name: 'Hendra',
          phone: '0812-1111-2222',
          occupancy_status: 'owner_occupied',
        },
      });

      expect(insertedPayload).toEqual({
        tenant_id: TENANT_ID,
        label: 'Blok B-02',
        status: 'active',
        metadata: {
          occupant: {
            name: 'Hendra',
            phone: '081211112222',
            occupancy_status: 'owner_occupied',
          },
        },
      });
      expect(res.id).toBe(2);
      expect(res.label).toBe('Blok B-02');
    });

    it('berjalan pada cabang demo mode minimal', async () => {
      const demoTenantId = 'demo-tenant-rtrw';
      const unit = await createTenantUnit(demoTenantId, {
        label: 'Blok Demo-99',
        occupant: { name: 'Demo Occupant' },
      });
      expect(unit).toBeDefined();
      expect(unit.label).toBe('Blok Demo-99');
      expect(unit.status).toBe('active');
      expect(unit.metadata.occupant.name).toBe('Demo Occupant');

      // Percobaan kedua dengan label sama di demo mode harus melempar duplikat error
      await expect(
        createTenantUnit(demoTenantId, { label: 'blok demo-99' })
      ).rejects.toThrow('Unit dengan label "blok demo-99" sudah ada.');
    });

    it('KOS-1.3: menyimpan rentPrice dan facilities di metadata dengan status vacant', async () => {
      let insertedPayload = null;
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_units') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 3, ...payload },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const res = await createTenantUnit(TENANT_ID, {
        label: 'Kamar 101',
        status: 'vacant',
        rentPrice: 1500000,
        facilities: ['  AC  ', 'WiFi', 'AC', '   ', 'Kamar Mandi'],
      });

      expect(insertedPayload.status).toBe('vacant');
      expect(insertedPayload.metadata.default_rent_price).toBe(1500000);
      expect(insertedPayload.metadata.facilities).toEqual(['AC', 'WiFi', 'Kamar Mandi']);
      expect(res.id).toBe(3);
    });

    it('KOS-1.3: melempar error jika rentPrice negatif', async () => {
      await expect(
        createTenantUnit(TENANT_ID, {
          label: 'Kamar 102',
          rentPrice: -50000,
        })
      ).rejects.toThrow('Harga sewa harus berupa angka yang lebih besar atau sama dengan 0.');
    });
  });

  describe('updateTenantUnit', () => {
    it('menggabungkan metadata.occupant tanpa menghilangkan kunci metadata lain dan memfilter tenant_id', async () => {
      let capturedEqTenant = null;
      let capturedEqUnit = null;
      let capturedUpdatePayload = null;

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_units') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col1, val1) => {
                if (col1 === 'tenant_id') capturedEqTenant = val1;
                return {
                  eq: vi.fn().mockImplementation((col2, val2) => {
                    if (col2 === 'id') capturedEqUnit = val2;
                    return {
                      single: vi.fn().mockResolvedValue({
                        data: {
                          id: UNIT_ID,
                          tenant_id: TENANT_ID,
                          label: 'Blok A-01',
                          status: 'active',
                          metadata: {
                            block: 'A',
                            unit_number: '01',
                            occupant: {
                              name: 'Budi Lama',
                              phone: '081299990000',
                              occupancy_status: 'owner_occupied',
                            },
                          },
                        },
                        error: null,
                      }),
                    };
                  }),
                };
              }),
            }),
            update: vi.fn().mockImplementation((payload) => {
              capturedUpdatePayload = payload;
              return {
                eq: vi.fn().mockImplementation((c1, v1) => {
                  expect(c1).toBe('tenant_id');
                  expect(v1).toBe(TENANT_ID);
                  return {
                    eq: vi.fn().mockImplementation((c2, v2) => {
                      expect(c2).toBe('id');
                      expect(v2).toBe(UNIT_ID);
                      return {
                        select: vi.fn().mockReturnValue({
                          single: vi.fn().mockResolvedValue({
                            data: { id: UNIT_ID, ...payload },
                            error: null,
                          }),
                        }),
                      };
                    }),
                  };
                }),
              };
            }),
          };
        }
        return {};
      });

      const res = await updateTenantUnit(TENANT_ID, UNIT_ID, {
        occupant: {
          name: 'Budi Baru',
        },
      });

      expect(capturedEqTenant).toBe(TENANT_ID);
      expect(capturedEqUnit).toBe(UNIT_ID);
      expect(capturedUpdatePayload.metadata).toEqual({
        block: 'A',
        unit_number: '01',
        occupant: {
          name: 'Budi Baru',
          phone: '081299990000', // nomor telepon lama tetap dipertahankan
          occupancy_status: 'owner_occupied',
        },
      });
      expect(res.id).toBe(UNIT_ID);
    });

    it('menolak update jika label baru bentrok dengan unit lain pada tenant yang sama', async () => {
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_units') {
          return {
            select: vi.fn().mockImplementation((fields) => {
              if (fields === '*') {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: {
                          id: UNIT_ID,
                          tenant_id: TENANT_ID,
                          label: 'Blok A-01',
                          status: 'active',
                          metadata: {},
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              // Pemeriksaan duplikat
              return {
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({
                    data: [{ id: 99, label: 'Blok B-02' }],
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      await expect(
        updateTenantUnit(TENANT_ID, UNIT_ID, { label: '  blok b-02 ' })
      ).rejects.toThrow('Unit dengan label "blok b-02" sudah ada.');
    });

    it('berjalan pada cabang demo mode minimal', async () => {
      const demoTenantId = 'demo-tenant-rtrw';
      const updated = await updateTenantUnit(demoTenantId, 1, {
        occupant: { name: 'Warga Demo Terupdate' },
      });
      expect(updated).toBeDefined();
      expect(updated.metadata.occupant.name).toBe('Warga Demo Terupdate');
    });

    it('KOS-1.3: menyimpan harga dan fasilitas di metadata tanpa menghapus contract_start / tenant_member_id', async () => {
      let capturedPayload = null;
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_units') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: UNIT_ID,
                      tenant_id: TENANT_ID,
                      label: 'Kamar 105',
                      status: 'occupied',
                      metadata: {
                        contract_start: '2026-01-01',
                        tenant_member_id: 'member-abc-123',
                        occupant: { name: 'Penyewa Ada' },
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((payload) => {
              capturedPayload = payload;
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { id: UNIT_ID, ...payload },
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      await updateTenantUnit(TENANT_ID, UNIT_ID, {
        rentPrice: 1750000,
        facilities: ['AC', 'WiFi', 'Kasur'],
      });

      expect(capturedPayload.metadata.default_rent_price).toBe(1750000);
      expect(capturedPayload.metadata.facilities).toEqual(['AC', 'WiFi', 'Kasur']);
      expect(capturedPayload.metadata.contract_start).toBe('2026-01-01');
      expect(capturedPayload.metadata.tenant_member_id).toBe('member-abc-123');
      expect(capturedPayload.metadata.occupant.name).toBe('Penyewa Ada');
    });

    it('KOS-1.3: menolak update unit dengan harga negatif', async () => {
      await expect(
        updateTenantUnit(TENANT_ID, UNIT_ID, { rentPrice: -1000 })
      ).rejects.toThrow('Harga sewa harus berupa angka yang lebih besar atau sama dengan 0.');
    });
  });

  describe('setTenantUnitStatus (VERT-1.6)', () => {
    it('menerima status vacant selain active dan inactive', async () => {
      const demoTenantId = 'demo-tenant-rtrw';
      const resVacant = await setTenantUnitStatus(demoTenantId, 1, 'vacant');
      expect(resVacant.status).toBe('vacant');

      const resInactive = await setTenantUnitStatus(demoTenantId, 1, 'inactive');
      expect(resInactive.status).toBe('inactive');
    });

    it('menolak status occupied (hanya lewat kontrak sewa) dan status tidak valid lainnya', async () => {
      await expect(setTenantUnitStatus(TENANT_ID, UNIT_ID, 'occupied')).rejects.toThrow(
        'Status unit hanya boleh "active", "inactive", atau "vacant".'
      );
      await expect(setTenantUnitStatus(TENANT_ID, UNIT_ID, 'pending')).rejects.toThrow(
        'Status unit hanya boleh "active", "inactive", atau "vacant".'
      );
      await expect(setTenantUnitStatus(TENANT_ID, UNIT_ID, 'deleted')).rejects.toThrow(
        'Status unit hanya boleh "active", "inactive", atau "vacant".'
      );
    });
  });

  describe('deleteTenantUnit', () => {
    it('menolak penghapusan bila unit sudah memiliki tagihan di billing_items', async () => {
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                count: 3,
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      await expect(deleteTenantUnit(TENANT_ID, UNIT_ID)).rejects.toThrow(
        'Unit ini sudah memiliki tagihan dan tidak dapat dihapus. Nonaktifkan saja.'
      );
    });

    it('menghapus unit bila belum ada tagihan', async () => {
      let deleteCalledForTenant = null;
      let deleteCalledForUnit = null;

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                count: 0,
                error: null,
              }),
            }),
          };
        }
        if (table === 'tenant_units') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((c1, v1) => {
                deleteCalledForTenant = v1;
                return {
                  eq: vi.fn().mockImplementation((c2, v2) => {
                    deleteCalledForUnit = v2;
                    return Promise.resolve({ error: null });
                  }),
                };
              }),
            }),
          };
        }
        return {};
      });

      const res = await deleteTenantUnit(TENANT_ID, UNIT_ID);
      expect(deleteCalledForTenant).toBe(TENANT_ID);
      expect(deleteCalledForUnit).toBe(UNIT_ID);
      expect(res).toEqual({ success: true, id: UNIT_ID });
    });
  });

  describe('importTenantUnitsCSV', () => {
    it('memproses campuran label baru, label existing, duplikat dalam file, dan label kosong', async () => {
      let batchInserted = null;
      const updatedUnits = [];

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_units') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 10,
                    label: 'A-01',
                    metadata: { note: 'Lama', occupant: { name: 'Nama Lama' } },
                  },
                ],
                error: null,
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              batchInserted = payload;
              return Promise.resolve({ error: null });
            }),
            update: vi.fn().mockImplementation((payload) => {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((col, val) => {
                    updatedUnits.push({ id: val, payload });
                    return Promise.resolve({ error: null });
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const rows = [
        { label: '  ', occupant_name: 'Kosong' }, // label kosong -> skipped
        { label: 'A-01', occupant_name: 'Nama Baru', occupancy_status: 'alien' }, // existing -> update (occupancy_status invalid dibersihkan)
        { label: 'B-01', occupant_name: 'Warga B-01', occupant_phone: '0812-3333', occupancy_status: 'tenant' }, // baru -> insert
        { label: 'B-01', occupant_name: 'Warga B-01 Duplikat' }, // duplikat di file -> skipped
        { label: 'C-01', occupant_name: 'Warga C-01' }, // baru -> insert
      ];

      const res = await importTenantUnitsCSV(TENANT_ID, rows);

      expect(res.created).toBe(2); // B-01 dan C-01
      expect(res.updated).toBe(1); // A-01
      expect(res.skipped).toHaveLength(2);
      expect(res.skipped[0].reason).toBe('Label unit kosong.');
      expect(res.skipped[1].reason).toBe('Duplikat label di dalam file CSV.');

      // Batch insert verifikasi
      expect(batchInserted).toHaveLength(2);
      expect(batchInserted[0].label).toBe('B-01');
      expect(batchInserted[0].metadata.occupant).toEqual({
        name: 'Warga B-01',
        phone: '08123333',
        occupancy_status: 'tenant',
      });
      expect(batchInserted[1].label).toBe('C-01');

      // Update existing verifikasi
      expect(updatedUnits).toHaveLength(1);
      expect(updatedUnits[0].id).toBe(10);
      expect(updatedUnits[0].payload.metadata).toEqual({
        note: 'Lama',
        occupant: {
          name: 'Nama Baru', // Nama di-merge
        },
      });
    });
  });

  describe('updateTenantMember', () => {
    it('hanya mengirim kolom yang diizinkan dan tidak pernah menyertakan tenant_id/user_id/is_owner/tenant_role_id/status', async () => {
      let capturedPayload = null;
      let capturedTenantId = null;
      let capturedMemberId = null;

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_members') {
          return {
            update: vi.fn().mockImplementation((payload) => {
              capturedPayload = payload;
              return {
                eq: vi.fn().mockImplementation((c1, v1) => {
                  capturedTenantId = v1;
                  return {
                    eq: vi.fn().mockImplementation((c2, v2) => {
                      capturedMemberId = v2;
                      return {
                        select: vi.fn().mockReturnValue({
                          single: vi.fn().mockResolvedValue({
                            data: { id: MEMBER_ID, ...payload },
                            error: null,
                          }),
                        }),
                      };
                    }),
                  };
                }),
              };
            }),
          };
        }
        return {};
      });

      await updateTenantMember(TENANT_ID, MEMBER_ID, {
        full_name: 'Budi Santoso',
        phone: '0812-9876-5432',
        unit_id: 5,
        occupancy_status: 'tenant',
      });

      expect(capturedTenantId).toBe(TENANT_ID);
      expect(capturedMemberId).toBe(MEMBER_ID);

      // Pastikan kolom terlarang tidak pernah terkirim
      expect(capturedPayload).not.toHaveProperty('tenant_id');
      expect(capturedPayload).not.toHaveProperty('user_id');
      expect(capturedPayload).not.toHaveProperty('is_owner');
      expect(capturedPayload).not.toHaveProperty('tenant_role_id');
      expect(capturedPayload).not.toHaveProperty('status');

      // Kolom yang dikirim
      expect(capturedPayload.full_name).toBe('Budi Santoso');
      expect(capturedPayload.phone).toBe('0812-9876-5432');
      expect(capturedPayload.unit_id).toBe(5);
      expect(capturedPayload.occupancy_status).toBe('tenant');
      expect(capturedPayload).toHaveProperty('updated_at');
    });

    it('menolak jika full_name disediakan tapi kosong', async () => {
      await expect(
        updateTenantMember(TENANT_ID, MEMBER_ID, { full_name: '   ' })
      ).rejects.toThrow('Nama lengkap tidak boleh kosong.');
    });
  });

  describe('removeTenantMember', () => {
    it('menolak pengeluaran jika anggota adalah pemilik komunitas (is_owner = true)', async () => {
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: MEMBER_ID, is_owner: true },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(removeTenantMember(TENANT_ID, MEMBER_ID)).rejects.toThrow(
        'Pemilik komunitas tidak dapat dikeluarkan.'
      );
    });

    it('menghapus anggota jika bukan owner', async () => {
      let deleteCalled = false;
      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenant_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: MEMBER_ID, is_owner: false },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation(() => {
                  deleteCalled = true;
                  return Promise.resolve({ error: null });
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await removeTenantMember(TENANT_ID, MEMBER_ID);
      expect(deleteCalled).toBe(true);
      expect(res).toEqual({ success: true, id: MEMBER_ID });
    });
  });

  describe('updateTenantProfileAndSettings (Merge Settings Guard)', () => {
    it('settings lama (mis. logo_url, legacy_qris_enabled) tetap ada setelah update (shallow merge)', async () => {
      let updatedPayload = null;

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    settings: {
                      logo_url: '/logo-tenant.png',
                      legacy_qris_enabled: true,
                      due_day: 10,
                    },
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockImplementation((payload) => {
              updatedPayload = payload;
              return {
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: TENANT_ID, ...payload },
                      error: null,
                    }),
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      await updateTenantProfileAndSettings(TENANT_ID, {
        settings: {
          due_day: 15,
          bank_account: {
            bank_name: 'BCA',
            account_number: '12345678',
            account_holder: 'Kas Baru',
          },
        },
      });

      expect(updatedPayload).toBeDefined();
      expect(updatedPayload.settings).toEqual({
        logo_url: '/logo-tenant.png', // tetap ada!
        legacy_qris_enabled: true,    // tetap ada!
        due_day: 15,                  // diperbarui
        bank_account: {
          bank_name: 'BCA',
          account_number: '12345678',
          account_holder: 'Kas Baru',
        },
      });
    });
  });
});
