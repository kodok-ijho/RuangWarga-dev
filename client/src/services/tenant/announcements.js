/**
 * announcements.js
 * Modul operasional tenant: pengumuman komunitas, penyematan (pin),
 * dan pengelolaan gambar pengumuman Cloudflare R2 via Edge Function.
 *
 * Ref: docs/handoff/RTRW-3.md § RTRW-3.1
 */

import { supabase, IS_DEMO } from './shared';
import { uploadTenantFile, getTenantFileUrl } from '../fileStorageService';
import { mockAnnouncements } from '../mockData';

// Store in-memory untuk mode demo
let demoAnnouncementsStore = (mockAnnouncements || []).map((ann) => ({ ...ann }));

/**
 * Validasi kolom judul pengumuman: wajib diisi, setelah di-trim panjang antara 1 s/d 150 karakter.
 *
 * @param {string} title
 * @returns {string} Judul yang sudah di-trim
 */
function validateAnnouncementTitle(title) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed || trimmed.length > 150) {
    throw new Error('Judul pengumuman wajib diisi (1-150 karakter).');
  }
  return trimmed;
}

/**
 * Validasi kolom isi pengumuman: opsional, maksimal 5000 karakter.
 *
 * @param {string} [body]
 * @returns {string} Isi pengumuman yang aman
 */
function validateAnnouncementBody(body) {
  if (body === null || body === undefined) return '';
  const str = String(body);
  if (str.length > 5000) {
    throw new Error('Isi pengumuman maksimal 5000 karakter.');
  }
  return str;
}

/**
 * Mengambil daftar pengumuman milik tenant tertentu.
 * Urutan: disematkan (is_pinned desc) terlebih dahulu, lalu tanggal terbit terbaru (published_at desc).
 *
 * @param {string} tenantId - UUID tenant
 * @param {object} [options]
 * @param {number} [options.limit] - Jumlah maksimal pengumuman yang diambil
 * @returns {Promise<Array<object>>} Daftar pengumuman
 */
export async function fetchTenantAnnouncements(tenantId, { limit } = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    let list = demoAnnouncementsStore.filter((a) => a.tenant_id === tenantId);
    if (list.length === 0) {
      list = demoAnnouncementsStore.map((a) => ({ ...a, tenant_id: tenantId }));
    }

    const sorted = [...list].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
    });

    if (typeof limit === 'number' && limit > 0) {
      return sorted.slice(0, limit);
    }
    return sorted;
  }

  let query = supabase
    .from('tenant_announcements')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false });

  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/announcements] fetchTenantAnnouncements error:', error);
    throw new Error(error.message || 'Gagal memuat pengumuman tenant.');
  }

  return data || [];
}

/**
 * Membuat pengumuman baru untuk sebuah tenant.
 *
 * @param {string} tenantId - UUID tenant
 * @param {object} params
 * @param {string} params.title - Judul (1-150 karakter)
 * @param {string} [params.body] - Isi pengumuman (maksimal 5000 karakter)
 * @param {boolean} [params.is_pinned=false] - Apakah disematkan di posisi teratas
 * @param {string} [params.image_path=null] - Canonical path gambar di R2
 * @returns {Promise<object>} Data pengumuman yang berhasil dibuat
 */
export async function createTenantAnnouncement(tenantId, {
  title,
  body = '',
  is_pinned = false,
  image_path = null,
} = {}) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan.');
  }

  const validTitle = validateAnnouncementTitle(title);
  const validBody = validateAnnouncementBody(body);

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const newAnnouncement = {
      id: `mock-ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      title: validTitle,
      body: validBody,
      image_path: image_path || null,
      is_pinned: Boolean(is_pinned),
      published_at: new Date().toISOString(),
      created_by: 'demo-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoAnnouncementsStore.unshift(newAnnouncement);
    return newAnnouncement;
  }

  const payload = {
    tenant_id: tenantId,
    title: validTitle,
    body: validBody,
    is_pinned: Boolean(is_pinned),
    image_path: image_path || null,
  };

  const { data, error } = await supabase
    .from('tenant_announcements')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/announcements] createTenantAnnouncement error:', error);
    throw new Error(error.message || 'Gagal membuat pengumuman.');
  }

  return data;
}

/**
 * Memperbarui data pengumuman yang sudah ada.
 * Hanya field yang diizinkan yang akan diproses: title, body, is_pinned, image_path, published_at.
 *
 * @param {string} id - UUID pengumuman
 * @param {object} patch - Kolom yang akan diubah ({ title, body, is_pinned, image_path, published_at })
 * @returns {Promise<object>} Data pengumuman yang diperbarui
 */
export async function updateTenantAnnouncement(id, patch = {}) {
  if (!id) {
    throw new Error('ID pengumuman wajib disertakan.');
  }

  const safePatch = patch && typeof patch === 'object' ? patch : {};
  const updateData = {};

  if ('title' in safePatch) {
    updateData.title = validateAnnouncementTitle(safePatch.title);
  }

  if ('body' in safePatch) {
    updateData.body = validateAnnouncementBody(safePatch.body);
  }

  if ('is_pinned' in safePatch) {
    updateData.is_pinned = Boolean(safePatch.is_pinned);
  }

  if ('image_path' in safePatch) {
    updateData.image_path = safePatch.image_path;
  }

  if ('published_at' in safePatch) {
    updateData.published_at = safePatch.published_at;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('Tidak ada perubahan yang dikirim.');
  }

  const isDemoOrMock = IS_DEMO || String(id).startsWith('mock-') || String(id).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoAnnouncementsStore.findIndex((a) => a.id === id);
    if (idx >= 0) {
      demoAnnouncementsStore[idx] = {
        ...demoAnnouncementsStore[idx],
        ...updateData,
        updated_at: new Date().toISOString(),
      };
      return demoAnnouncementsStore[idx];
    }
    return {
      id,
      ...updateData,
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('tenant_announcements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/announcements] updateTenantAnnouncement error:', error);
    throw new Error(error.message || 'Gagal memperbarui pengumuman.');
  }

  return data;
}

/**
 * Menghapus pengumuman berdasarkan ID.
 *
 * @param {string} id - UUID pengumuman
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteTenantAnnouncement(id) {
  if (!id) {
    throw new Error('ID pengumuman wajib disertakan.');
  }

  const isDemoOrMock = IS_DEMO || String(id).startsWith('mock-') || String(id).startsWith('demo-');
  if (isDemoOrMock) {
    demoAnnouncementsStore = demoAnnouncementsStore.filter((a) => a.id !== id);
    return { success: true };
  }

  const { error } = await supabase
    .from('tenant_announcements')
    .delete()
    .eq('id', id);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/announcements] deleteTenantAnnouncement error:', error);
    throw new Error(error.message || 'Gagal menghapus pengumuman.');
  }

  return { success: true };
}

/**
 * Mengunggah gambar poster/lampiran pengumuman ke Cloudflare R2 dengan kind 'announcement_image'.
 *
 * @param {string} tenantId - UUID tenant
 * @param {File} file - Objek file gambar (JPG/PNG/WebP, maks 5 MB)
 * @returns {Promise<string>} Canonical path file di R2
 */
export async function uploadAnnouncementImage(tenantId, file) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan.');
  }
  if (!file) {
    throw new Error('File gambar wajib disertakan.');
  }

  return uploadTenantFile({
    kind: 'announcement_image',
    tenantId,
    file,
  });
}

/**
 * Mendapatkan presigned URL untuk melihat gambar pengumuman dari Cloudflare R2.
 *
 * @param {string} path - Canonical path file di R2
 * @returns {Promise<string>} Presigned URL
 */
export async function getAnnouncementImageUrl(path) {
  if (!path) return '';

  return getTenantFileUrl({
    kind: 'announcement_image',
    path,
  });
}
