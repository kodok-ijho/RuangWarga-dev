/**
 * events.js
 * Modul operasional tenant: agenda dan acara komunitas multi-tenant (public.tenant_events).
 *
 * Catatan Pengelolaan Gambar Acara:
 * Gambar acara (poster kegiatan dsb.) menggunakan jenis file 'announcement_image'
 * dan bucket storage Cloudflare R2 yang sama dengan pengumuman tenant.
 * UI memakai helper yang sudah ada:
 * - uploadAnnouncementImage(tenantId, file)
 * - getAnnouncementImageUrl(imagePath)
 * dari ./announcements atau tenantOperationalService.
 *
 * Catatan Arsitektur Query Filter (Supabase vs Client):
 * Filter kondisi scope ('upcoming' / 'past') diterapkan langsung pada query Supabase
 * menggunakan builder `.or(...)` dengan nested `and(...)` karena:
 * 1. Skalabilitas & Efisiensi Jaringan: Batasan `limit` (misal 3 acara untuk widget dashboard)
 *    dieksekusi langsung di level database engine PostgreSQL, menghindari transfer seluruh
 *    histori acara tenant melalui jaringan internet.
 * 2. Memanfaatkan Index: Mengoptimalkan index komposit `idx_tenant_events_tenant_starts_at`
 *    `(tenant_id, starts_at)` yang dibuat pada migration RTRW-3.2a untuk filter dan sorting.
 * 3. Konsistensi Semantik: Logika predikat yang sama diterapkan di memory untuk mode demo,
 *    sehingga hasil pada mode Supabase dan mode Demo 100% konsisten.
 *
 * Ref: docs/handoff/RTRW-3.md § RTRW-3.2
 */

import { supabase, IS_DEMO } from './shared';
import { mockEvents } from '../mockData';
import { getStartOfTodayJakarta } from '../../utils/eventLinks';

// Store in-memory untuk mode demo
let demoEventsStore = (mockEvents || []).map((evt) => ({ ...evt }));

/**
 * Validasi kolom judul acara: wajib diisi, setelah di-trim panjang antara 1 s/d 150 karakter.
 *
 * @param {string} title
 * @returns {string} Judul yang sudah di-trim
 */
function validateEventTitle(title) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed || trimmed.length > 150) {
    throw new Error('Judul acara wajib diisi (1-150 karakter).');
  }
  return trimmed;
}

/**
 * Validasi kolom deskripsi acara: opsional, maksimal 5000 karakter.
 *
 * @param {string} [description]
 * @returns {string} Deskripsi acara
 */
function validateEventDescription(description) {
  if (description === null || description === undefined) return '';
  const str = String(description);
  if (str.length > 5000) {
    throw new Error('Deskripsi acara maksimal 5000 karakter.');
  }
  return str;
}

/**
 * Validasi kolom lokasi acara: opsional, maksimal 200 karakter.
 *
 * @param {string} [location]
 * @returns {string|null} Lokasi yang sudah dibersihkan atau null
 */
function validateEventLocation(location) {
  if (location === null || location === undefined || location === '') return null;
  const trimmed = typeof location === 'string' ? location.trim() : String(location).trim();
  if (trimmed.length > 200) {
    throw new Error('Lokasi acara maksimal 200 karakter.');
  }
  return trimmed || null;
}

/**
 * Validasi tanggal mulai dan selesai acara.
 * - starts_at wajib dan harus tanggal valid
 * - ends_at opsional, jika diisi harus valid dan tidak boleh sebelum starts_at
 *
 * @param {string|Date} startsAt
 * @param {string|Date} [endsAt]
 * @returns {{ starts_at: string, ends_at: string|null }}
 */
function validateEventDates(startsAt, endsAt) {
  if (!startsAt) {
    throw new Error('Waktu mulai acara (starts_at) wajib diisi.');
  }
  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Waktu mulai acara (starts_at) tidak valid.');
  }

  let validEndsAt = null;
  if (endsAt !== null && endsAt !== undefined && endsAt !== '') {
    const endDate = new Date(endsAt);
    if (Number.isNaN(endDate.getTime())) {
      throw new Error('Waktu selesai acara (ends_at) tidak valid.');
    }
    if (endDate.getTime() < startDate.getTime()) {
      throw new Error('Waktu selesai acara (ends_at) tidak boleh sebelum waktu mulai.');
    }
    validEndsAt = typeof endsAt === 'string' ? endsAt : endDate.toISOString();
  }

  const validStartsAt = typeof startsAt === 'string' ? startsAt : startDate.toISOString();

  return {
    starts_at: validStartsAt,
    ends_at: validEndsAt,
  };
}

/**
 * Mengambil daftar acara milik tenant tertentu.
 * Scope:
 * - 'upcoming': ends_at >= sekarang, atau (ends_at null dan starts_at >= awal hari ini, zona Asia/Jakarta); urut starts_at naik.
 * - 'past': kebalikannya; urut starts_at turun.
 * - 'all': semua acara; urut starts_at turun.
 *
 * @param {string} tenantId - UUID tenant
 * @param {object} [options]
 * @param {'upcoming'|'past'|'all'} [options.scope='upcoming']
 * @param {number} [options.limit] - Jumlah maksimal data yang diambil
 * @returns {Promise<Array<object>>} Daftar acara
 */
export async function fetchTenantEvents(tenantId, { scope = 'upcoming', limit } = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    let list = demoEventsStore.filter((e) => e.tenant_id === tenantId);
    if (list.length === 0) {
      list = demoEventsStore.map((e) => ({ ...e, tenant_id: tenantId }));
    }

    const now = new Date();
    const startOfTodayJakarta = getStartOfTodayJakarta(now);

    let filtered = list;
    if (scope === 'upcoming') {
      filtered = list.filter((e) => {
        if (e.ends_at) {
          return new Date(e.ends_at).getTime() >= now.getTime();
        }
        return new Date(e.starts_at).getTime() >= startOfTodayJakarta.getTime();
      });
      filtered.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    } else if (scope === 'past') {
      filtered = list.filter((e) => {
        if (e.ends_at) {
          return new Date(e.ends_at).getTime() < now.getTime();
        }
        return new Date(e.starts_at).getTime() < startOfTodayJakarta.getTime();
      });
      filtered.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
    } else {
      // 'all'
      filtered = [...list].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
    }

    if (typeof limit === 'number' && limit > 0) {
      return filtered.slice(0, limit);
    }
    return filtered;
  }

  let query = supabase
    .from('tenant_events')
    .select('*')
    .eq('tenant_id', tenantId);

  const nowIso = new Date().toISOString();
  const startOfTodayIso = getStartOfTodayJakarta().toISOString();

  if (scope === 'upcoming') {
    query = query
      .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${startOfTodayIso})`)
      .order('starts_at', { ascending: true });
  } else if (scope === 'past') {
    query = query
      .or(`ends_at.lt.${nowIso},and(ends_at.is.null,starts_at.lt.${startOfTodayIso})`)
      .order('starts_at', { ascending: false });
  } else {
    // 'all'
    query = query.order('starts_at', { ascending: false });
  }

  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/events] fetchTenantEvents error:', error);
    throw new Error(error.message || 'Gagal memuat acara tenant.');
  }

  return data || [];
}

/**
 * Membuat acara baru untuk sebuah tenant.
 *
 * @param {string} tenantId - UUID tenant
 * @param {object} params
 * @param {string} params.title - Judul acara (1-150 karakter)
 * @param {string} [params.description] - Deskripsi (maksimal 5000 karakter)
 * @param {string} [params.location] - Lokasi (maksimal 200 karakter)
 * @param {string|Date} params.starts_at - Waktu mulai acara (wajib)
 * @param {string|Date} [params.ends_at] - Waktu selesai acara (opsional, >= starts_at)
 * @param {string} [params.image_path] - Canonical path gambar poster di R2
 * @returns {Promise<object>} Data acara yang berhasil dibuat
 */
export async function createTenantEvent(tenantId, {
  title,
  description = '',
  location = null,
  starts_at,
  ends_at = null,
  image_path = null,
} = {}) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan.');
  }

  const validTitle = validateEventTitle(title);
  const validDesc = validateEventDescription(description);
  const validLoc = validateEventLocation(location);
  const validDates = validateEventDates(starts_at, ends_at);

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const newEvent = {
      id: `mock-evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      title: validTitle,
      description: validDesc,
      location: validLoc,
      starts_at: validDates.starts_at,
      ends_at: validDates.ends_at,
      image_path: image_path || null,
      created_by: 'demo-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoEventsStore.unshift(newEvent);
    return newEvent;
  }

  const payload = {
    tenant_id: tenantId,
    title: validTitle,
    description: validDesc,
    location: validLoc,
    starts_at: validDates.starts_at,
    ends_at: validDates.ends_at,
    image_path: image_path || null,
  };

  const { data, error } = await supabase
    .from('tenant_events')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/events] createTenantEvent error:', error);
    throw new Error(error.message || 'Gagal membuat acara.');
  }

  return data;
}

/**
 * Memperbarui data acara yang sudah ada.
 * Hanya whitelist field yang diizinkan: title, description, location, starts_at, ends_at, image_path.
 *
 * @param {string} id - UUID acara
 * @param {object} patch - Kolom yang akan diubah
 * @returns {Promise<object>} Data acara yang telah diperbarui
 */
export async function updateTenantEvent(id, patch = {}) {
  if (!id) {
    throw new Error('ID acara wajib disertakan.');
  }

  const safePatch = patch && typeof patch === 'object' ? patch : {};
  const updateData = {};

  if ('title' in safePatch) {
    updateData.title = validateEventTitle(safePatch.title);
  }

  if ('description' in safePatch) {
    updateData.description = validateEventDescription(safePatch.description);
  }

  if ('location' in safePatch) {
    updateData.location = validateEventLocation(safePatch.location);
  }

  // Validasi waktu acara pada patch
  if ('starts_at' in safePatch && 'ends_at' in safePatch) {
    const dates = validateEventDates(safePatch.starts_at, safePatch.ends_at);
    updateData.starts_at = dates.starts_at;
    updateData.ends_at = dates.ends_at;
  } else if ('starts_at' in safePatch) {
    if (!safePatch.starts_at) {
      throw new Error('Waktu mulai acara (starts_at) wajib diisi.');
    }
    const startDate = new Date(safePatch.starts_at);
    if (Number.isNaN(startDate.getTime())) {
      throw new Error('Waktu mulai acara (starts_at) tidak valid.');
    }
    updateData.starts_at = typeof safePatch.starts_at === 'string' ? safePatch.starts_at : startDate.toISOString();
  } else if ('ends_at' in safePatch) {
    if (safePatch.ends_at !== null && safePatch.ends_at !== undefined && safePatch.ends_at !== '') {
      const endDate = new Date(safePatch.ends_at);
      if (Number.isNaN(endDate.getTime())) {
        throw new Error('Waktu selesai acara (ends_at) tidak valid.');
      }
      updateData.ends_at = typeof safePatch.ends_at === 'string' ? safePatch.ends_at : endDate.toISOString();
    } else {
      updateData.ends_at = null;
    }
  }

  if ('image_path' in safePatch) {
    updateData.image_path = safePatch.image_path;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('Tidak ada perubahan yang dikirim.');
  }

  const isDemoOrMock = IS_DEMO || String(id).startsWith('mock-') || String(id).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoEventsStore.findIndex((e) => e.id === id);
    if (idx >= 0) {
      // Validasi ends_at terhadap starts_at yang sudah ada jika salah satu diupdate
      const effectiveStartsAt = updateData.starts_at || demoEventsStore[idx].starts_at;
      const effectiveEndsAt = 'ends_at' in updateData ? updateData.ends_at : demoEventsStore[idx].ends_at;
      if (effectiveEndsAt && new Date(effectiveEndsAt).getTime() < new Date(effectiveStartsAt).getTime()) {
        throw new Error('Waktu selesai acara (ends_at) tidak boleh sebelum waktu mulai.');
      }

      demoEventsStore[idx] = {
        ...demoEventsStore[idx],
        ...updateData,
        updated_at: new Date().toISOString(),
      };
      return demoEventsStore[idx];
    }
    return {
      id,
      ...updateData,
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('tenant_events')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/events] updateTenantEvent error:', error);
    throw new Error(error.message || 'Gagal memperbarui acara.');
  }

  return data;
}

/**
 * Menghapus acara berdasarkan ID.
 *
 * @param {string} id - UUID acara
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteTenantEvent(id) {
  if (!id) {
    throw new Error('ID acara wajib disertakan.');
  }

  const isDemoOrMock = IS_DEMO || String(id).startsWith('mock-') || String(id).startsWith('demo-');
  if (isDemoOrMock) {
    demoEventsStore = demoEventsStore.filter((e) => e.id !== id);
    return { success: true };
  }

  const { error } = await supabase
    .from('tenant_events')
    .delete()
    .eq('id', id);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenant/events] deleteTenantEvent error:', error);
    throw new Error(error.message || 'Gagal menghapus acara.');
  }

  return { success: true };
}
