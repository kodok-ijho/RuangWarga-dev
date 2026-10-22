/**
 * programDocuments.js
 * Manajemen dokumen acara dan LPJ (PANITIA-3).
 * Menyimpan metadata dokumen di tabel program_documents dan file fisik di Cloudflare R2.
 */

import { supabase } from '../supabaseClient';
import { uploadTenantFile, getTenantFileUrl } from '../fileStorageService';

const IS_DEMO = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';

export const PROGRAM_DOC_TYPES = {
  proposal: 'Proposal',
  rab: 'RAB',
  rundown: 'Rundown',
  blueprint: 'Blueprint/Denah',
  surat: 'Surat',
  lpj: 'LPJ',
  lainnya: 'Lainnya',
};

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.jpeg', '.png', '.webp'];
const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

// ==============================================================================
// IN-MEMORY DEMO STORE
// ==============================================================================

let demoProgramDocumentsStore = [];

/**
 * Reset store dokumen demo (untuk testing dan demo mode)
 * @param {Array|null} initialDocs
 */
export function resetDemoProgramDocumentsStore(initialDocs = null) {
  if (Array.isArray(initialDocs)) {
    demoProgramDocumentsStore = [...initialDocs];
  } else {
    demoProgramDocumentsStore = [];
  }
}

/**
 * Mendapatkan dokumen demo untuk tenant dan program tertentu
 * @param {string} tenantId
 * @param {string} [programId]
 * @returns {Array}
 */
export function getDemoProgramDocuments(tenantId, programId) {
  if (!tenantId) return [];
  return demoProgramDocumentsStore.filter(
    (d) => d.tenant_id === tenantId && (!programId || d.program_id === programId)
  );
}

// ==============================================================================
// OPERATIONAL SERVICES
// ==============================================================================

/**
 * Mengambil daftar dokumen untuk acara tertentu
 * @param {string} tenantId
 * @param {string} programId
 * @returns {Promise<Array>}
 */
export async function fetchProgramDocuments(tenantId, programId) {
  if (!tenantId || !programId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const list = demoProgramDocumentsStore.filter(
      (d) => d.tenant_id === tenantId && d.program_id === programId
    );
    return [...list].sort((a, b) => {
      const dateA = a.created_at || '';
      const dateB = b.created_at || '';
      return dateB.localeCompare(dateA);
    });
  }

  const { data, error } = await supabase
    .from('program_documents')
    .select(`
      id,
      tenant_id,
      program_id,
      doc_type,
      title,
      file_path,
      file_name,
      mime_type,
      file_size,
      uploaded_by,
      created_at
    `)
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .order('created_at', { ascending: false });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[programDocuments] fetchProgramDocuments error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Mengunggah dokumen acara ke Cloudflare R2 dan mencatatnya ke database
 * @param {string} tenantId
 * @param {string} programId
 * @param {object} params
 * @param {string} params.docType - 'proposal'|'rab'|'rundown'|'blueprint'|'surat'|'lpj'|'lainnya'
 * @param {string} params.title - Judul dokumen (1-150 karakter)
 * @param {File} params.file - File dokumen
 * @returns {Promise<object>} Baris dokumen yang tersimpan
 */
export async function uploadProgramDocument(tenantId, programId, { docType, title, file } = {}) {
  if (!tenantId || !programId) {
    throw new Error('Tenant ID dan Program ID wajib disertakan.');
  }

  if (!docType || !PROGRAM_DOC_TYPES[docType]) {
    throw new Error('Tipe dokumen tidak valid.');
  }

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle || trimmedTitle.length < 1 || trimmedTitle.length > 150) {
    throw new Error('Judul dokumen wajib diisi (1-150 karakter).');
  }

  if (!file || typeof file !== 'object') {
    throw new Error('File dokumen wajib diunggah.');
  }

  if (file.size > MAX_DOC_BYTES) {
    throw new Error('Ukuran file melebihi batas maksimal 10 MB.');
  }

  const fileName = file.name || 'document';
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? `.${parts.pop().toLowerCase()}` : '';

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(
      'Format file tidak didukung. Gunakan PDF, Word, Excel, PowerPoint, JPG, PNG, atau WebP.'
    );
  }

  // 1. Unggah file fisik ke R2 via uploadTenantFile
  const uploadedPath = await uploadTenantFile({
    kind: 'program_document',
    tenantId,
    programId,
    file,
  });

  // 2. Simpan baris rekaman dokumen
  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const newDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenant_id: tenantId,
      program_id: programId,
      doc_type: docType,
      title: trimmedTitle,
      file_path: uploadedPath,
      file_name: fileName,
      mime_type: file.type || '',
      file_size: file.size || 0,
      uploaded_by: null,
      created_at: new Date().toISOString(),
    };
    demoProgramDocumentsStore.unshift(newDoc);
    return newDoc;
  }

  const { data, error } = await supabase
    .from('program_documents')
    .insert([
      {
        tenant_id: tenantId,
        program_id: programId,
        doc_type: docType,
        title: trimmedTitle,
        file_path: uploadedPath,
        file_name: fileName,
        mime_type: file.type || '',
        file_size: file.size || 0,
      },
    ])
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[programDocuments] uploadProgramDocument insert error:', error);
    throw new Error('file sudah terunggah tetapi gagal dicatat; coba lagi');
  }

  return data;
}

/**
 * Menghapus dokumen acara dari database.
 * Catatan keterbatasan: hanya baris metadata yang dihapus dari database;
 * objek file fisik di Cloudflare R2 tetap ada.
 *
 * @param {string} tenantId
 * @param {string} documentId
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteProgramDocument(tenantId, documentId) {
  if (!tenantId || !documentId) {
    throw new Error('Tenant ID dan Document ID wajib disertakan.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoProgramDocumentsStore.findIndex(
      (d) => d.tenant_id === tenantId && d.id === documentId
    );
    if (idx !== -1) {
      demoProgramDocumentsStore.splice(idx, 1);
    }
    return { success: true };
  }

  const { error } = await supabase
    .from('program_documents')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', documentId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[programDocuments] deleteProgramDocument error:', error);
    throw error;
  }

  return { success: true };
}

/**
 * Mendapatkan presigned URL untuk melihat/mengunduh dokumen acara
 * @param {string} path - Canonical path dokumen di R2
 * @returns {Promise<string>}
 */
export async function getProgramDocumentUrl(path) {
  return getTenantFileUrl({ kind: 'program_document', path });
}
