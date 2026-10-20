import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../supabaseClient';
import {
  fetchTenantEvents,
  createTenantEvent,
  updateTenantEvent,
  deleteTenantEvent,
} from './events';

describe('tenant/events - Unit Tests (RTRW-3.2b)', () => {
  const NON_DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const NON_DEMO_EVENT_ID = '22222222-2222-2222-2222-222222222222';

  let fromSpy;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fromSpy) {
      fromSpy.mockRestore();
    }
  });

  // ── (a) fetchTenantEvents ──────────────────────────────────────
  describe('(a) fetchTenantEvents', () => {
    it('scope "upcoming": memanggil .or() dan order("starts_at", { ascending: true }), serta limit bila ada', async () => {
      const mockData = [
        {
          id: 'evt-1',
          tenant_id: NON_DEMO_TENANT_ID,
          title: 'Acara Mendatang',
          starts_at: '2026-10-25T07:00:00Z',
          ends_at: '2026-10-25T10:00:00Z',
        },
      ];

      const queryBuilder = {
        eq: vi.fn().mockImplementation(() => queryBuilder),
        or: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        limit: vi.fn().mockImplementation(() => queryBuilder),
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: mockData, error: null }).then(onFulfilled, onRejected);
        },
      };

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue(queryBuilder),
      });

      const result = await fetchTenantEvents(NON_DEMO_TENANT_ID, { scope: 'upcoming', limit: 3 });

      expect(fromSpy).toHaveBeenCalledWith('tenant_events');
      expect(queryBuilder.eq).toHaveBeenCalledWith('tenant_id', NON_DEMO_TENANT_ID);
      expect(queryBuilder.or).toHaveBeenCalledWith(
        expect.stringMatching(/^ends_at\.gte\..*,and\(ends_at\.is\.null,starts_at\.gte\..*\)$/)
      );
      expect(queryBuilder.order).toHaveBeenCalledWith('starts_at', { ascending: true });
      expect(queryBuilder.limit).toHaveBeenCalledWith(3);
      expect(result).toEqual(mockData);
    });

    it('scope "past": memanggil .or() kondisi masa lampau dan order("starts_at", { ascending: false })', async () => {
      const queryBuilder = {
        eq: vi.fn().mockImplementation(() => queryBuilder),
        or: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        limit: vi.fn().mockImplementation(() => queryBuilder),
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        },
      };

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue(queryBuilder),
      });

      await fetchTenantEvents(NON_DEMO_TENANT_ID, { scope: 'past' });

      expect(queryBuilder.or).toHaveBeenCalledWith(
        expect.stringMatching(/^ends_at\.lt\..*,and\(ends_at\.is\.null,starts_at\.lt\..*\)$/)
      );
      expect(queryBuilder.order).toHaveBeenCalledWith('starts_at', { ascending: false });
      expect(queryBuilder.limit).not.toHaveBeenCalled();
    });

    it('scope "all": TIDAK memanggil .or() dan mengurutkan starts_at descending', async () => {
      const queryBuilder = {
        eq: vi.fn().mockImplementation(() => queryBuilder),
        or: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        limit: vi.fn().mockImplementation(() => queryBuilder),
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        },
      };

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue(queryBuilder),
      });

      await fetchTenantEvents(NON_DEMO_TENANT_ID, { scope: 'all' });

      expect(queryBuilder.or).not.toHaveBeenCalled();
      expect(queryBuilder.order).toHaveBeenCalledWith('starts_at', { ascending: false });
    });

    it('mengembalikan array kosong jika tenantId kosong atau tidak diberikan', async () => {
      const result = await fetchTenantEvents('');
      expect(result).toEqual([]);
    });

    it('melempar error jika query supabase mengembalikan error', async () => {
      const queryBuilder = {
        eq: vi.fn().mockImplementation(() => queryBuilder),
        or: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: null, error: { message: 'Database query failed' } }).then(onFulfilled, onRejected);
        },
      };

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue(queryBuilder),
      });

      await expect(fetchTenantEvents(NON_DEMO_TENANT_ID)).rejects.toThrow('Database query failed');
    });
  });

  // ── (b) createTenantEvent ──────────────────────────────────────
  describe('(b) createTenantEvent', () => {
    it('menolak jika tenantId kosong', async () => {
      await expect(createTenantEvent('', { title: 'Rapat RT', starts_at: '2026-10-25T10:00:00Z' })).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );
    });

    it('menolak judul kosong atau hanya spasi', async () => {
      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, { title: '', starts_at: '2026-10-25T10:00:00Z' })
      ).rejects.toThrow('Judul acara wajib diisi (1-150 karakter).');

      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, { title: '   ', starts_at: '2026-10-25T10:00:00Z' })
      ).rejects.toThrow('Judul acara wajib diisi (1-150 karakter).');
    });

    it('menolak judul lebih dari 150 karakter', async () => {
      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, {
          title: 'A'.repeat(151),
          starts_at: '2026-10-25T10:00:00Z',
        })
      ).rejects.toThrow('Judul acara wajib diisi (1-150 karakter).');
    });

    it('menolak deskripsi lebih dari 5000 karakter', async () => {
      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, {
          title: 'Acara Valid',
          description: 'D'.repeat(5001),
          starts_at: '2026-10-25T10:00:00Z',
        })
      ).rejects.toThrow('Deskripsi acara maksimal 5000 karakter.');
    });

    it('menolak lokasi lebih dari 200 karakter', async () => {
      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, {
          title: 'Acara Valid',
          location: 'L'.repeat(201),
          starts_at: '2026-10-25T10:00:00Z',
        })
      ).rejects.toThrow('Lokasi acara maksimal 200 karakter.');
    });

    it('menolak jika starts_at tidak ada atau tanggal tidak valid', async () => {
      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, { title: 'Acara Valid' })
      ).rejects.toThrow('Waktu mulai acara (starts_at) wajib diisi.');

      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, { title: 'Acara Valid', starts_at: 'bukan-tanggal' })
      ).rejects.toThrow('Waktu mulai acara (starts_at) tidak valid.');
    });

    it('menolak jika ends_at diisi tapi tanggal tidak valid', async () => {
      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, {
          title: 'Acara Valid',
          starts_at: '2026-10-25T10:00:00Z',
          ends_at: 'format-salah',
        })
      ).rejects.toThrow('Waktu selesai acara (ends_at) tidak valid.');
    });

    it('menolak jika ends_at lebih awal daripada starts_at', async () => {
      await expect(
        createTenantEvent(NON_DEMO_TENANT_ID, {
          title: 'Acara Valid',
          starts_at: '2026-10-25T10:00:00Z',
          ends_at: '2026-10-25T09:00:00Z',
        })
      ).rejects.toThrow('Waktu selesai acara (ends_at) tidak boleh sebelum waktu mulai.');
    });

    it('mengirim payload yang sesuai ke supabase table tenant_events', async () => {
      let capturedPayload = null;

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockImplementation((payload) => {
          capturedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'new-evt-uuid', ...payload },
                error: null,
              }),
            }),
          };
        }),
      });

      const res = await createTenantEvent(NON_DEMO_TENANT_ID, {
        title: '  Kerja Bakti Warga RT 05  ',
        description: 'Pembersihan saluran air dan jalan utama.',
        location: '  Pos Satpam Utama  ',
        starts_at: '2026-10-25T07:00:00.000Z',
        ends_at: '2026-10-25T10:00:00.000Z',
        image_path: 'announcements/poster-123.jpg',
      });

      expect(fromSpy).toHaveBeenCalledWith('tenant_events');
      expect(capturedPayload).toEqual({
        tenant_id: NON_DEMO_TENANT_ID,
        title: 'Kerja Bakti Warga RT 05',
        description: 'Pembersihan saluran air dan jalan utama.',
        location: 'Pos Satpam Utama',
        starts_at: '2026-10-25T07:00:00.000Z',
        ends_at: '2026-10-25T10:00:00.000Z',
        image_path: 'announcements/poster-123.jpg',
      });
      expect(res.id).toBe('new-evt-uuid');
    });
  });

  // ── (c) updateTenantEvent ──────────────────────────────────────
  describe('(c) updateTenantEvent', () => {
    it('menolak jika id acara kosong', async () => {
      await expect(updateTenantEvent('', { title: 'Baru' })).rejects.toThrow(
        'ID acara wajib disertakan.'
      );
    });

    it('menolak patch kosong atau tanpa field yang diizinkan', async () => {
      await expect(updateTenantEvent(NON_DEMO_EVENT_ID, {})).rejects.toThrow(
        'Tidak ada perubahan yang dikirim.'
      );

      await expect(
        updateTenantEvent(NON_DEMO_EVENT_ID, {
          tenant_id: 'fake-tenant',
          created_by: 'fake-user',
          id: 'fake-id',
        })
      ).rejects.toThrow('Tidak ada perubahan yang dikirim.');
    });

    it('hanya mengirim whitelist field (title, description, location, starts_at, ends_at, image_path) dan membuang yang lain', async () => {
      let capturedUpdate = null;
      let capturedEqId = null;

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn().mockImplementation((payload) => {
          capturedUpdate = payload;
          return {
            eq: vi.fn().mockImplementation((col, val) => {
              if (col === 'id') capturedEqId = val;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: val, ...payload },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }),
      });

      const patch = {
        title: '  Judul Acara Revisi  ',
        description: 'Deskripsi baru.',
        location: '  Balai RW Revisi  ',
        starts_at: '2026-10-25T08:00:00.000Z',
        ends_at: '2026-10-25T11:00:00.000Z',
        image_path: 'announcements/poster-rev.png',
        tenant_id: 'injected-tenant',
        created_by: 'injected-user',
        id: 'injected-id',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        random_field: 'ignored',
      };

      const res = await updateTenantEvent(NON_DEMO_EVENT_ID, patch);

      expect(fromSpy).toHaveBeenCalledWith('tenant_events');
      expect(capturedEqId).toBe(NON_DEMO_EVENT_ID);
      expect(capturedUpdate).toEqual({
        title: 'Judul Acara Revisi',
        description: 'Deskripsi baru.',
        location: 'Balai RW Revisi',
        starts_at: '2026-10-25T08:00:00.000Z',
        ends_at: '2026-10-25T11:00:00.000Z',
        image_path: 'announcements/poster-rev.png',
      });
      expect(capturedUpdate).not.toHaveProperty('tenant_id');
      expect(capturedUpdate).not.toHaveProperty('created_by');
      expect(capturedUpdate).not.toHaveProperty('id');
      expect(capturedUpdate).not.toHaveProperty('created_at');
      expect(capturedUpdate).not.toHaveProperty('updated_at');
      expect(capturedUpdate).not.toHaveProperty('random_field');
      expect(res.id).toBe(NON_DEMO_EVENT_ID);
    });

    it('memvalidasi tanggal saat update bila kedua starts_at dan ends_at dikirim', async () => {
      await expect(
        updateTenantEvent(NON_DEMO_EVENT_ID, {
          starts_at: '2026-10-25T10:00:00.000Z',
          ends_at: '2026-10-25T08:00:00.000Z',
        })
      ).rejects.toThrow('Waktu selesai acara (ends_at) tidak boleh sebelum waktu mulai.');
    });
  });

  // ── (d) deleteTenantEvent ──────────────────────────────────────
  describe('(d) deleteTenantEvent', () => {
    it('menolak jika id acara kosong', async () => {
      await expect(deleteTenantEvent('')).rejects.toThrow('ID acara wajib disertakan.');
    });

    it('memanggil delete().eq("id", id) dengan benar', async () => {
      let deleteCalled = false;
      let eqCol = null;
      let eqVal = null;

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn().mockImplementation(() => {
          deleteCalled = true;
          return {
            eq: vi.fn().mockImplementation((col, val) => {
              eqCol = col;
              eqVal = val;
              return Promise.resolve({ error: null });
            }),
          };
        }),
      });

      const res = await deleteTenantEvent(NON_DEMO_EVENT_ID);

      expect(fromSpy).toHaveBeenCalledWith('tenant_events');
      expect(deleteCalled).toBe(true);
      expect(eqCol).toBe('id');
      expect(eqVal).toBe(NON_DEMO_EVENT_ID);
      expect(res).toEqual({ success: true });
    });

    it('melempar error jika supabase delete mengembalikan error', async () => {
      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Delete error from database' },
          }),
        }),
      });

      await expect(deleteTenantEvent(NON_DEMO_EVENT_ID)).rejects.toThrow(
        'Delete error from database'
      );
    });
  });

  // ── (e) Cabang Demo ────────────────────────────────────────────
  describe('(e) cabang demo (tenantId "demo-…")', () => {
    it('fetchTenantEvents mengembalikan data contoh tanpa memanggil supabase dan memfilter per scope', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      // 1. Scope upcoming (default)
      const upcomingList = await fetchTenantEvents('demo-tenant-rtrw', { scope: 'upcoming' });
      expect(fromSpy).not.toHaveBeenCalled();
      expect(Array.isArray(upcomingList)).toBe(true);
      expect(upcomingList.length).toBeGreaterThanOrEqual(1);

      // Pastikan urut starts_at ascending
      for (let i = 0; i < upcomingList.length - 1; i += 1) {
        expect(new Date(upcomingList[i].starts_at).getTime()).toBeLessThanOrEqual(
          new Date(upcomingList[i + 1].starts_at).getTime()
        );
      }

      // 2. Scope past
      const pastList = await fetchTenantEvents('demo-tenant-rtrw', { scope: 'past' });
      expect(fromSpy).not.toHaveBeenCalled();
      expect(Array.isArray(pastList)).toBe(true);
      expect(pastList.length).toBeGreaterThanOrEqual(1);

      // Pastikan urut starts_at descending
      for (let i = 0; i < pastList.length - 1; i += 1) {
        expect(new Date(pastList[i].starts_at).getTime()).toBeGreaterThanOrEqual(
          new Date(pastList[i + 1].starts_at).getTime()
        );
      }

      // 3. Scope all
      const allList = await fetchTenantEvents('demo-tenant-rtrw', { scope: 'all' });
      expect(allList.length).toBe(upcomingList.length + pastList.length);

      // 4. Limit
      const limited = await fetchTenantEvents('demo-tenant-rtrw', { scope: 'all', limit: 1 });
      expect(limited).toHaveLength(1);
    });

    it('createTenantEvent menambahkan data acara demo baru tanpa memanggil supabase', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      const created = await createTenantEvent('demo-tenant-rtrw', {
        title: 'Acara Khusus Demo RT',
        description: 'Deskripsi acara demo baru.',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 90000000).toISOString(),
      });

      expect(fromSpy).not.toHaveBeenCalled();
      expect(created).toBeDefined();
      expect(created.tenant_id).toBe('demo-tenant-rtrw');
      expect(created.title).toBe('Acara Khusus Demo RT');
      expect(created.id).toMatch(/^mock-evt-/);
    });

    it('updateTenantEvent memperbarui data demo tanpa memanggil supabase', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      const updated = await updateTenantEvent('mock-evt-1', {
        title: 'Kerja Bakti RW 05 (Direvisi)',
      });

      expect(fromSpy).not.toHaveBeenCalled();
      expect(updated).toBeDefined();
      expect(updated.title).toBe('Kerja Bakti RW 05 (Direvisi)');
    });

    it('deleteTenantEvent menghapus acara demo tanpa memanggil supabase', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      const res = await deleteTenantEvent('mock-evt-4');

      expect(fromSpy).not.toHaveBeenCalled();
      expect(res).toEqual({ success: true });
    });
  });
});
