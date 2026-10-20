import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../supabaseClient';
import {
  fetchTenantAnnouncements,
  createTenantAnnouncement,
  updateTenantAnnouncement,
  deleteTenantAnnouncement,
  uploadAnnouncementImage,
  getAnnouncementImageUrl,
} from './announcements';
import { uploadTenantFile, getTenantFileUrl } from '../fileStorageService';

vi.mock('../fileStorageService', () => ({
  uploadTenantFile: vi.fn(),
  getTenantFileUrl: vi.fn(),
}));

describe('tenant/announcements - Unit Tests (RTRW-3.1)', () => {
  const NON_DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const NON_DEMO_ANN_ID = '22222222-2222-2222-2222-222222222222';

  let fromSpy;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fromSpy) {
      fromSpy.mockRestore();
    }
  });

  // (a) fetchTenantAnnouncements
  describe('(a) fetchTenantAnnouncements', () => {
    it('memanggil from("tenant_announcements"), eq("tenant_id"), lalu order is_pinned desc dan published_at desc, serta menghormati limit', async () => {
      const mockData = [
        { id: 'ann-1', tenant_id: NON_DEMO_TENANT_ID, title: 'Pinned Post', is_pinned: true, published_at: '2026-10-20T10:00:00Z' },
        { id: 'ann-2', tenant_id: NON_DEMO_TENANT_ID, title: 'Regular Post', is_pinned: false, published_at: '2026-10-19T10:00:00Z' },
      ];

      const queryBuilder = {
        eq: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        limit: vi.fn().mockImplementation(() => queryBuilder),
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: mockData, error: null }).then(onFulfilled, onRejected);
        },
      };

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue(queryBuilder),
      });

      // Panggilan dengan opsi limit
      const resultWithLimit = await fetchTenantAnnouncements(NON_DEMO_TENANT_ID, { limit: 5 });

      expect(fromSpy).toHaveBeenCalledWith('tenant_announcements');
      expect(queryBuilder.eq).toHaveBeenCalledWith('tenant_id', NON_DEMO_TENANT_ID);
      expect(queryBuilder.order).toHaveBeenNthCalledWith(1, 'is_pinned', { ascending: false });
      expect(queryBuilder.order).toHaveBeenNthCalledWith(2, 'published_at', { ascending: false });
      expect(queryBuilder.limit).toHaveBeenCalledWith(5);
      expect(resultWithLimit).toEqual(mockData);

      // Panggilan tanpa limit
      vi.clearAllMocks();
      await fetchTenantAnnouncements(NON_DEMO_TENANT_ID);
      expect(queryBuilder.limit).not.toHaveBeenCalled();
    });

    it('mengembalikan array kosong jika tenantId kosong atau tidak diberikan', async () => {
      const result = await fetchTenantAnnouncements('');
      expect(result).toEqual([]);
    });

    it('melempar error jika query supabase mengembalikan error', async () => {
      const queryBuilder = {
        eq: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        limit: vi.fn().mockImplementation(() => queryBuilder),
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: null, error: { message: 'Database error' } }).then(onFulfilled, onRejected);
        },
      };

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue(queryBuilder),
      });

      await expect(fetchTenantAnnouncements(NON_DEMO_TENANT_ID)).rejects.toThrow('Database error');
    });
  });

  // (b) createTenantAnnouncement
  describe('(b) createTenantAnnouncement', () => {
    it('menolak judul kosong atau hanya spasi', async () => {
      await expect(createTenantAnnouncement(NON_DEMO_TENANT_ID, { title: '' })).rejects.toThrow(
        'Judul pengumuman wajib diisi (1-150 karakter).'
      );
      await expect(createTenantAnnouncement(NON_DEMO_TENANT_ID, { title: '   ' })).rejects.toThrow(
        'Judul pengumuman wajib diisi (1-150 karakter).'
      );
      await expect(createTenantAnnouncement(NON_DEMO_TENANT_ID, {})).rejects.toThrow(
        'Judul pengumuman wajib diisi (1-150 karakter).'
      );
    });

    it('menolak judul lebih dari 150 karakter', async () => {
      const longTitle = 'A'.repeat(151);
      await expect(createTenantAnnouncement(NON_DEMO_TENANT_ID, { title: longTitle })).rejects.toThrow(
        'Judul pengumuman wajib diisi (1-150 karakter).'
      );
    });

    it('menolak isi pengumuman lebih dari 5000 karakter', async () => {
      const longBody = 'B'.repeat(5001);
      await expect(
        createTenantAnnouncement(NON_DEMO_TENANT_ID, { title: 'Pengumuman Valid', body: longBody })
      ).rejects.toThrow('Isi pengumuman maksimal 5000 karakter.');
    });

    it('menolak jika tenantId kosong', async () => {
      await expect(createTenantAnnouncement('', { title: 'Judul Valid' })).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );
    });

    it('mengirim payload yang sesuai termasuk tenant_id ke tabel tenant_announcements', async () => {
      let capturedPayload = null;

      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockImplementation((payload) => {
          capturedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'new-ann-uuid', ...payload },
                error: null,
              }),
            }),
          };
        }),
      });

      const res = await createTenantAnnouncement(NON_DEMO_TENANT_ID, {
        title: '   Rapat Warga RT 05   ',
        body: 'Agenda pembahasan kas dan keamanan.',
        is_pinned: true,
        image_path: 'announcements/poster-1.jpg',
      });

      expect(fromSpy).toHaveBeenCalledWith('tenant_announcements');
      expect(capturedPayload).toEqual({
        tenant_id: NON_DEMO_TENANT_ID,
        title: 'Rapat Warga RT 05',
        body: 'Agenda pembahasan kas dan keamanan.',
        is_pinned: true,
        image_path: 'announcements/poster-1.jpg',
      });
      expect(res.id).toBe('new-ann-uuid');
    });
  });

  // (c) updateTenantAnnouncement
  describe('(c) updateTenantAnnouncement', () => {
    it('menolak jika id pengumuman kosong', async () => {
      await expect(updateTenantAnnouncement('', { title: 'Baru' })).rejects.toThrow(
        'ID pengumuman wajib disertakan.'
      );
    });

    it('menolak patch tanpa field yang diizinkan (atau hanya field tak diizinkan)', async () => {
      await expect(
        updateTenantAnnouncement(NON_DEMO_ANN_ID, {
          tenant_id: 'fake-tenant',
          created_by: 'fake-user',
        })
      ).rejects.toThrow('Tidak ada perubahan yang dikirim.');

      await expect(updateTenantAnnouncement(NON_DEMO_ANN_ID, {})).rejects.toThrow(
        'Tidak ada perubahan yang dikirim.'
      );

      await expect(
        updateTenantAnnouncement(NON_DEMO_ANN_ID, {
          id: 'new-id',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        })
      ).rejects.toThrow('Tidak ada perubahan yang dikirim.');
    });

    it('membuang tenant_id, created_by, dan field lain dari patch, dan hanya mengirim field yang diizinkan', async () => {
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
        title: '   Judul Pengumuman Baru   ',
        body: 'Isi teks pengumuman yang baru.',
        is_pinned: 1,
        image_path: 'announcements/new-image.png',
        published_at: '2026-10-20T12:00:00Z',
        tenant_id: 'injected-tenant-uuid',
        created_by: 'injected-user-uuid',
        id: 'injected-id',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        random_field: 'ignored',
      };

      const res = await updateTenantAnnouncement(NON_DEMO_ANN_ID, patch);

      expect(fromSpy).toHaveBeenCalledWith('tenant_announcements');
      expect(capturedEqId).toBe(NON_DEMO_ANN_ID);
      expect(capturedUpdate).toEqual({
        title: 'Judul Pengumuman Baru',
        body: 'Isi teks pengumuman yang baru.',
        is_pinned: true,
        image_path: 'announcements/new-image.png',
        published_at: '2026-10-20T12:00:00Z',
      });
      expect(capturedUpdate).not.toHaveProperty('tenant_id');
      expect(capturedUpdate).not.toHaveProperty('created_by');
      expect(capturedUpdate).not.toHaveProperty('id');
      expect(capturedUpdate).not.toHaveProperty('created_at');
      expect(capturedUpdate).not.toHaveProperty('updated_at');
      expect(capturedUpdate).not.toHaveProperty('random_field');
      expect(res.id).toBe(NON_DEMO_ANN_ID);
    });

    it('mempertahankan validasi judul dan isi saat update', async () => {
      await expect(
        updateTenantAnnouncement(NON_DEMO_ANN_ID, { title: '   ' })
      ).rejects.toThrow('Judul pengumuman wajib diisi (1-150 karakter).');

      await expect(
        updateTenantAnnouncement(NON_DEMO_ANN_ID, { title: 'X'.repeat(151) })
      ).rejects.toThrow('Judul pengumuman wajib diisi (1-150 karakter).');

      await expect(
        updateTenantAnnouncement(NON_DEMO_ANN_ID, { body: 'Y'.repeat(5001) })
      ).rejects.toThrow('Isi pengumuman maksimal 5000 karakter.');
    });
  });

  // (d) deleteTenantAnnouncement
  describe('(d) deleteTenantAnnouncement', () => {
    it('menolak jika id pengumuman kosong', async () => {
      await expect(deleteTenantAnnouncement('')).rejects.toThrow(
        'ID pengumuman wajib disertakan.'
      );
    });

    it('memanggil delete().eq("id") dengan id yang tepat', async () => {
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

      const res = await deleteTenantAnnouncement(NON_DEMO_ANN_ID);

      expect(fromSpy).toHaveBeenCalledWith('tenant_announcements');
      expect(deleteCalled).toBe(true);
      expect(eqCol).toBe('id');
      expect(eqVal).toBe(NON_DEMO_ANN_ID);
      expect(res).toEqual({ success: true });
    });

    it('melempar error jika supabase delete menghasilkan error', async () => {
      fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Database delete failed' },
          }),
        }),
      });

      await expect(deleteTenantAnnouncement(NON_DEMO_ANN_ID)).rejects.toThrow(
        'Database delete failed'
      );
    });
  });

  // (e) uploadAnnouncementImage dan getAnnouncementImageUrl
  describe('(e) uploadAnnouncementImage dan getAnnouncementImageUrl', () => {
    it('uploadAnnouncementImage menolak jika tenantId atau file tidak disertakan', async () => {
      const mockFile = new File(['image-bytes'], 'poster.png', { type: 'image/png' });
      await expect(uploadAnnouncementImage('', mockFile)).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );
      await expect(uploadAnnouncementImage(NON_DEMO_TENANT_ID, null)).rejects.toThrow(
        'File gambar wajib disertakan.'
      );
    });

    it('uploadAnnouncementImage memanggil uploadTenantFile dengan kind "announcement_image"', async () => {
      const mockFile = new File(['image-bytes'], 'poster.png', { type: 'image/png' });
      uploadTenantFile.mockResolvedValueOnce('announcements/poster-abc.png');

      const path = await uploadAnnouncementImage(NON_DEMO_TENANT_ID, mockFile);

      expect(uploadTenantFile).toHaveBeenCalledWith({
        kind: 'announcement_image',
        tenantId: NON_DEMO_TENANT_ID,
        file: mockFile,
      });
      expect(path).toBe('announcements/poster-abc.png');
    });

    it('getAnnouncementImageUrl mengembalikan string kosong jika path tidak diberikan', async () => {
      expect(await getAnnouncementImageUrl('')).toBe('');
      expect(await getAnnouncementImageUrl(null)).toBe('');
      expect(await getAnnouncementImageUrl(undefined)).toBe('');
      expect(getTenantFileUrl).not.toHaveBeenCalled();
    });

    it('getAnnouncementImageUrl memanggil getTenantFileUrl dengan kind "announcement_image"', async () => {
      getTenantFileUrl.mockResolvedValueOnce('https://signed-url.test/announcements/poster-abc.png');

      const url = await getAnnouncementImageUrl('announcements/poster-abc.png');

      expect(getTenantFileUrl).toHaveBeenCalledWith({
        kind: 'announcement_image',
        path: 'announcements/poster-abc.png',
      });
      expect(url).toBe('https://signed-url.test/announcements/poster-abc.png');
    });
  });

  // (f) Cabang Demo
  describe('(f) cabang demo (tenantId "demo-…")', () => {
    it('fetchTenantAnnouncements mengembalikan data contoh tanpa memanggil supabase', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      const list = await fetchTenantAnnouncements('demo-tenant-rtrw');

      expect(fromSpy).not.toHaveBeenCalled();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty('title');
      expect(list[0]).toHaveProperty('is_pinned');

      // Memeriksa opsi limit pada mode demo
      const limited = await fetchTenantAnnouncements('demo-tenant-rtrw', { limit: 1 });
      expect(fromSpy).not.toHaveBeenCalled();
      expect(limited).toHaveLength(1);
    });

    it('createTenantAnnouncement mengembalikan data mock baru tanpa memanggil supabase', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      const created = await createTenantAnnouncement('demo-tenant-rtrw', {
        title: 'Pengumuman Khusus Demo',
        body: 'Isi pengumuman demo',
        is_pinned: false,
      });

      expect(fromSpy).not.toHaveBeenCalled();
      expect(created).toBeDefined();
      expect(created.tenant_id).toBe('demo-tenant-rtrw');
      expect(created.title).toBe('Pengumuman Khusus Demo');
      expect(created.id).toMatch(/^mock-ann-/);
    });

    it('updateTenantAnnouncement memperbarui data demo tanpa memanggil supabase', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      const updated = await updateTenantAnnouncement('demo-ann-custom', {
        title: 'Judul Demo Diperbarui',
      });

      expect(fromSpy).not.toHaveBeenCalled();
      expect(updated).toBeDefined();
      expect(updated.title).toBe('Judul Demo Diperbarui');
    });

    it('deleteTenantAnnouncement menghapus data demo tanpa memanggil supabase', async () => {
      fromSpy = vi.spyOn(supabase, 'from');

      const result = await deleteTenantAnnouncement('demo-ann-custom');

      expect(fromSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });
});
