/**
 * fileStorageService.js
 * Layanan penyimpanan file tenant ke Cloudflare R2 via Edge Function Supabase.
 *
 * Edge Functions:
 * - storage-upload: POST multipart/form-data -> { path, contentType, size }
 * - storage-sign-url: POST JSON { kind, path, expiresIn } -> { url, expiresIn }
 */

import { supabase } from './supabaseClient';

export const IS_DEMO = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

/**
 * Membatasi durasi kedaluwarsa URL antara 60 hingga 600 detik.
 * Default 300 detik jika tidak diberikan atau bukan angka valid.
 *
 * @param {number|string} expiresIn
 * @returns {number}
 */
export function clampExpiresIn(expiresIn) {
  if (expiresIn === null || expiresIn === undefined || expiresIn === '') return 300;
  const num = Number(expiresIn);
  if (isNaN(num)) return 300;
  if (num < 60) return 60;
  if (num > 600) return 600;
  return Math.round(num);
}

/**
 * Mengonversi error dari Edge Function menjadi Error dengan pesan Bahasa Indonesia yang ramah
 * dan menyimpan HTTP status code di err.status.
 *
 * @param {any} error
 * @returns {Promise<Error>}
 */
export async function parseInvokeError(error, kind) {
  let status = error?.context?.status ?? error?.status ?? 500;
  let serverMessage = '';

  if (error?.context && typeof error.context.json === 'function') {
    try {
      const resBody = await error.context.json();
      serverMessage = resBody?.error || resBody?.message || '';
    } catch (_e) {
      // Abaikan bila context bukan JSON atau stream response sudah terbaca
    }
  }

  let friendlyMessage = '';
  if (status === 413) {
    friendlyMessage = kind === 'program_document'
      ? 'Ukuran file melebihi batas 10 MB.'
      : 'Ukuran file melebihi batas 5 MB.';
  } else if (status === 415) {
    if (kind === 'program_document') {
      friendlyMessage = 'Format file tidak didukung. Gunakan PDF, Word, Excel, PowerPoint, JPG, PNG, atau WebP.';
    } else if (kind === 'announcement_image') {
      friendlyMessage = 'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.';
    } else {
      friendlyMessage = 'Format file tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.';
    }
  } else if (status === 403) {
    friendlyMessage = 'Anda tidak memiliki izin untuk file ini.';
  } else if (status === 401) {
    friendlyMessage = 'Sesi login berakhir. Silakan masuk kembali.';
  } else {
    friendlyMessage = serverMessage || error?.message || 'Gagal memproses file.';
  }

  const err = new Error(friendlyMessage);
  err.status = status;
  return err;
}

/**
 * Mengunggah file tenant ke Cloudflare R2 via Edge Function storage-upload.
 *
 * @param {object} params
 * @param {'payment_proof'|'expense_receipt'|'announcement_image'|'program_document'} params.kind - Jenis file
 * @param {string} params.tenantId - UUID tenant
 * @param {string} [params.billingItemId] - UUID billing_item (wajib jika kind === 'payment_proof')
 * @param {string} [params.expenseDate] - Tanggal ISO 'YYYY-MM-DD' (wajib jika kind === 'expense_receipt')
 * @param {string} [params.programId] - UUID program (wajib jika kind === 'program_document')
 * @param {File} params.file - Objek File yang akan diunggah
 * @param {object} [params.client] - Supabase client instance opsional (default: singleton)
 * @returns {Promise<string>} Canonical path file yang tersimpan
 */
export async function uploadTenantFile({
  kind,
  tenantId,
  billingItemId,
  expenseDate,
  programId,
  file,
  client = supabase,
} = {}) {
  if (IS_DEMO || (tenantId && String(tenantId).startsWith('demo-'))) {
    const fileName = file?.name || 'file.jpg';
    if (kind === 'payment_proof') {
      return `${tenantId || 'demo-tenant'}/payments/${billingItemId || 'demo-bill'}/${Date.now()}_${fileName}`;
    }
    if (kind === 'announcement_image') {
      return `${tenantId || 'demo-tenant'}/announcements/${Date.now()}_${fileName}`;
    }
    if (kind === 'program_document') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const tId = uuidRegex.test(tenantId) ? tenantId : '00000000-0000-0000-0000-000000000001';
      const pId = uuidRegex.test(programId) ? programId : '00000000-0000-0000-0000-000000000002';
      const docUuid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-0000-0000-000000000003';
      const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      return `${tId}/programs/${pId}/${docUuid}_${safeName}`;
    }
    const year = expenseDate ? String(expenseDate).slice(0, 4) : '2026';
    return `${tenantId || 'demo-tenant'}/expenses/${year}/${Date.now()}_${fileName}`;
  }

  const formData = new FormData();
  if (kind) formData.append('kind', kind);
  if (tenantId) formData.append('tenantId', tenantId);
  if (billingItemId) formData.append('billingItemId', billingItemId);
  if (expenseDate) formData.append('expenseDate', expenseDate);
  if (programId) formData.append('programId', programId);
  if (file) formData.append('file', file);

  const { data, error } = await client.functions.invoke('storage-upload', {
    body: formData,
  });

  if (error) {
    throw await parseInvokeError(error, kind);
  }

  if (!data?.path) {
    const err = new Error('Gagal memproses file.');
    err.status = 500;
    throw err;
  }

  return data.path;
}

/**
 * Mendapatkan presigned URL dari Cloudflare R2 via Edge Function storage-sign-url.
 *
 * @param {object} params
 * @param {'payment_proof'|'expense_receipt'|'announcement_image'} params.kind - Jenis file
 * @param {string} params.path - Canonical path file
 * @param {number} [params.expiresIn=300] - Durasi berlaku dalam detik (60..600)
 * @param {object} [params.client] - Supabase client instance opsional (default: singleton)
 * @returns {Promise<string>} Presigned URL untuk mengakses file
 */
export async function getTenantFileUrl({
  kind,
  path,
  expiresIn = 300,
  client = supabase,
} = {}) {
  const clampedExpiresIn = clampExpiresIn(expiresIn);

  if (IS_DEMO || (path && String(path).startsWith('demo-'))) {
    return typeof path === 'string' && path.startsWith('http')
      ? path
      : `https://demo.ruangwarga.test/${path || 'mock-file.jpg'}`;
  }

  const { data, error } = await client.functions.invoke('storage-sign-url', {
    body: {
      kind,
      path,
      expiresIn: clampedExpiresIn,
    },
  });

  if (error) {
    throw await parseInvokeError(error, kind);
  }

  if (!data?.url) {
    const err = new Error('Gagal memproses file.');
    err.status = 500;
    throw err;
  }

  return data.url;
}
