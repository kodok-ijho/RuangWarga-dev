import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROGRAM_DOC_TYPES,
  fetchProgramDocuments,
  uploadProgramDocument,
  deleteProgramDocument,
  getProgramDocumentUrl,
  resetDemoProgramDocumentsStore,
} from './programDocuments';
import * as fileStorageService from '../fileStorageService';
import { supabase } from '../supabaseClient';

describe('PANITIA-3.3: programDocuments service', () => {
  const tenantId = 'demo-tenant-panitia-1';
  const programId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
    resetDemoProgramDocumentsStore();
  });

  describe('Validasi uploadProgramDocument', () => {
    it('menolak jika tenantId atau programId kosong', async () => {
      await expect(
        uploadProgramDocument(null, programId, {
          docType: 'proposal',
          title: 'Proposal',
          file: new File([''], 'doc.pdf'),
        })
      ).rejects.toThrow('Tenant ID dan Program ID wajib disertakan.');

      await expect(
        uploadProgramDocument(tenantId, null, {
          docType: 'proposal',
          title: 'Proposal',
          file: new File([''], 'doc.pdf'),
        })
      ).rejects.toThrow('Tenant ID dan Program ID wajib disertakan.');
    });

    it('menolak tipe dokumen yang tidak dikenal', async () => {
      const file = new File(['dummy'], 'proposal.pdf', { type: 'application/pdf' });
      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'unknown_type',
          title: 'Proposal Acara',
          file,
        })
      ).rejects.toThrow('Tipe dokumen tidak valid.');
    });

    it('menolak judul dokumen kosong atau lebih dari 150 karakter', async () => {
      const file = new File(['dummy'], 'proposal.pdf', { type: 'application/pdf' });
      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'proposal',
          title: '   ',
          file,
        })
      ).rejects.toThrow('Judul dokumen wajib diisi (1-150 karakter).');

      const longTitle = 'A'.repeat(151);
      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'proposal',
          title: longTitle,
          file,
        })
      ).rejects.toThrow('Judul dokumen wajib diisi (1-150 karakter).');
    });

    it('menolak jika file tidak disertakan', async () => {
      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'proposal',
          title: 'Proposal Acara',
          file: null,
        })
      ).rejects.toThrow('File dokumen wajib diunggah.');
    });

    it('menolak ukuran file melebihi 10 MB', async () => {
      const oversizedFile = {
        name: 'dokumen_besar.pdf',
        size: 10 * 1024 * 1024 + 1,
        type: 'application/pdf',
      };
      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'proposal',
          title: 'Proposal Acara',
          file: oversizedFile,
        })
      ).rejects.toThrow('Ukuran file melebihi batas maksimal 10 MB.');
    });

    it('menolak format file yang tidak diizinkan (.exe atau .zip)', async () => {
      const exeFile = new File(['dummy'], 'program.exe', { type: 'application/x-msdownload' });
      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'proposal',
          title: 'Proposal Acara',
          file: exeFile,
        })
      ).rejects.toThrow(
        'Format file tidak didukung. Gunakan PDF, Word, Excel, PowerPoint, JPG, PNG, atau WebP.'
      );

      const zipFile = new File(['dummy'], 'arsip.zip', { type: 'application/zip' });
      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'proposal',
          title: 'Proposal Acara',
          file: zipFile,
        })
      ).rejects.toThrow(
        'Format file tidak didukung. Gunakan PDF, Word, Excel, PowerPoint, JPG, PNG, atau WebP.'
      );
    });

    it('menolak nama file lebih dari 200 karakter tanpa memanggil uploadTenantFile', async () => {
      const uploadSpy = vi.spyOn(fileStorageService, 'uploadTenantFile');
      const longFileName = 'A'.repeat(197) + '.pdf'; // 201 karakter
      const file = new File(['dummy'], longFileName, { type: 'application/pdf' });

      await expect(
        uploadProgramDocument(tenantId, programId, {
          docType: 'proposal',
          title: 'Proposal Acara',
          file,
        })
      ).rejects.toThrow('Nama file terlalu panjang (maks. 200 karakter)');

      expect(uploadSpy).not.toHaveBeenCalled();
    });
  });

  describe('Alur demo unggah -> daftar -> hapus', () => {
    it('mengunggah dokumen, mendaftar dokumen, lalu menghapus dokumen', async () => {
      // 1. Awalnya kosong
      const initial = await fetchProgramDocuments(tenantId, programId);
      expect(initial).toEqual([]);

      // 2. Unggah proposal (PDF)
      const filePdf = new File(['content-pdf'], 'proposal_final.pdf', {
        type: 'application/pdf',
      });
      const doc1 = await uploadProgramDocument(tenantId, programId, {
        docType: 'proposal',
        title: 'Proposal Acara Dies Natalis',
        file: filePdf,
      });

      expect(doc1.id).toBeTruthy();
      expect(doc1.title).toBe('Proposal Acara Dies Natalis');
      expect(doc1.doc_type).toBe('proposal');
      expect(doc1.file_name).toBe('proposal_final.pdf');

      // 3. Unggah RAB (XLSX)
      const fileXlsx = new File(['content-xlsx'], 'rab_rincian.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const doc2 = await uploadProgramDocument(tenantId, programId, {
        docType: 'rab',
        title: 'Rincian Anggaran Biaya',
        file: fileXlsx,
      });

      // 4. Daftar dokumen mengembalikan 2 dokumen
      const docs = await fetchProgramDocuments(tenantId, programId);
      expect(docs.length).toBe(2);
      expect(docs.map((d) => d.id)).toContain(doc1.id);
      expect(docs.map((d) => d.id)).toContain(doc2.id);

      // 5. Hapus dokumen 1
      const delRes = await deleteProgramDocument(tenantId, doc1.id);
      expect(delRes.success).toBe(true);

      // 6. Sisa 1 dokumen
      const docsAfter = await fetchProgramDocuments(tenantId, programId);
      expect(docsAfter.length).toBe(1);
      expect(docsAfter[0].id).toBe(doc2.id);
    });

    it('deleteProgramDocument melempar error bila dokumen tidak ada di demo store (0 baris)', async () => {
      await expect(
        deleteProgramDocument(tenantId, 'non-existent-doc-id')
      ).rejects.toThrow('Dokumen tidak ditemukan atau gagal dihapus.');
    });

    it('deleteProgramDocument melempar error bila 0 baris terhapus di Supabase', async () => {
      const mockFrom = vi.spyOn(supabase, 'from').mockReturnValue({
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      });

      const realTenantId = '11111111-1111-1111-1111-111111111111';
      await expect(
        deleteProgramDocument(realTenantId, 'non-existent-doc-id')
      ).rejects.toThrow('Dokumen tidak ditemukan atau gagal dihapus.');

      mockFrom.mockRestore();
    });
  });

  describe('getProgramDocumentUrl', () => {
    it('memanggil getTenantFileUrl dengan kind program_document', async () => {
      const getSpy = vi
        .spyOn(fileStorageService, 'getTenantFileUrl')
        .mockResolvedValue('https://r2.ruangwarga.test/presigned-doc-url');

      const path = '11111111-1111-1111-1111-111111111111/programs/22222222-2222-2222-2222-222222222222/doc_uuid_proposal.pdf';
      const url = await getProgramDocumentUrl(path);

      expect(getSpy).toHaveBeenCalledWith({
        kind: 'program_document',
        path,
      });
      expect(url).toBe('https://r2.ruangwarga.test/presigned-doc-url');
    });
  });

  describe('Penanganan error insert Supabase', () => {
    it('melempar error spesifik jika insert gagal setelah unggah berhasil', async () => {
      vi.spyOn(fileStorageService, 'uploadTenantFile').mockResolvedValue(
        '11111111-1111-1111-1111-111111111111/programs/22222222-2222-2222-2222-222222222222/doc_uuid_proposal.pdf'
      );

      const mockFrom = vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error('DB connection failure') }),
          }),
        }),
      });

      const file = new File(['content'], 'proposal.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // Bukan demo tenant agar masuk jalur Supabase
      const realTenantId = '11111111-1111-1111-1111-111111111111';

      await expect(
        uploadProgramDocument(realTenantId, programId, {
          docType: 'proposal',
          title: 'Proposal Resmi',
          file,
        })
      ).rejects.toThrow('file sudah terunggah tetapi gagal dicatat; coba lagi');

      mockFrom.mockRestore();
    });
  });
});
