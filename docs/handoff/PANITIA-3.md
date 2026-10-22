# PANITIA-3 — Dokumen acara dan LPJ

Status: ✅ **Disetujui user 2026-10-22** (urutan kerja: PANITIA-2 → PANITIA-3 → PANITIA-HARGA → ARISAN-1). Termasuk migration PANITIA-3.1 dan perubahan Edge Function penyimpanan (di-deploy Claude setelah review).

Dasar: `PANITIA-requirement.md`, yaitu dokumen acara (proposal, RAB, rundown/blueprint, surat, LPJ) di R2 dan LPJ siap cetak.

## Kondisi sekarang (hasil penelusuran Claude)
- **Edge Function penyimpanan** (`supabase/functions/storage-upload`, `storage-sign-url`):
  - hanya mengenal tiga jenis, masing-masing berupa daftar hardcode atau rantai if/else: `payment_proof`, `expense_receipt`, `announcement_image`;
  - aturan bersama ada di `supabase/functions/_shared/fileRules.ts`: `MAX_FILE_BYTES` 5 MB, `ALLOWED_MIME` (jpeg/png/webp/pdf), `detectMime` (tanpa deteksi ZIP/OOXML), `isValidPath`, dan pembuat path;
  - fungsi DB `can_upload_tenant_file` / `can_read_tenant_file` per jenis.
- **Client:** `services/fileStorageService.js` menyediakan `uploadTenantFile({ kind, tenantId, billingItemId, expenseDate, file })` dan `getTenantFileUrl({ kind, path })`. Contoh pemakaian: `services/tenant/announcements.js` ±274/±295 dan `pages/tenant/TenantAnnouncements.jsx`.
- **Test:** `client/src/utils/storageFileRules.test.js` mengimpor `fileRules.ts` langsung.

## Aturan executor
- Sama dengan `PANITIA-2.md` § Aturan executor.
- **Edge Function boleh diubah** (`storage-upload`, `storage-sign-url`, `_shared/fileRules.ts`), tetapi **jangan di-deploy**. Claude yang men-deploy setelah review.
- Jangan mengubah perilaku tiga jenis file lama.

---

## PANITIA-3.1 — Migration dokumen acara
- Salin **persis** dengan `cp`: `docs/handoff/assets/PANITIA-3/program_documents.sql` → `supabase/migrations/202610220002_program_documents.sql`. Claude sudah dry-run (lulus).
- Test `supabase/tests/program_documents_matrix.sql` (tenant `panitia`; aturan fixture seperti test PANITIA-1/2):
  - **E1.** `is_valid_program_document_path`: path `{tenant}/programs/{acara}/{uuid}_nama.pdf` valid; `..` ditolak; segmen selain `programs` ditolak.
  - **E2.** Sekretaris (`manage_programs`) boleh `can_upload_tenant_file('program_document', T)`; anggota biasa tidak.
  - **E3.**
    - Anggota T boleh `can_read_tenant_file('program_document', path)` dan melihat 1 baris dokumen;
    - anggota tenant lain tidak boleh membaca dan melihat 0 baris;
    - path tidak valid ditolak.
  - **E4.** Sekretaris menyimpan baris dokumen. Path dengan tenant lain ditolak `check_violation`. Anggota biasa ditolak `insufficient_privilege`.
  - **E5 (regresi).**
    - anggota tetap boleh unggah `payment_proof`;
    - anggota tetap tidak boleh unggah `expense_receipt`;
    - jenis tidak dikenal ditolak.
  - **E6.** Sekretaris menghapus baris dokumen dan berhasil. Anggota biasa menghapus, dan 0 baris terhapus.
- Commit: `feat(panitia): PANITIA-3.1 migration dokumen acara`

## PANITIA-3.2 — Edge Function: jenis `program_document`
- `supabase/functions/_shared/fileRules.ts`:
  - `MAX_DOCUMENT_BYTES = 10 * 1024 * 1024`;
  - `ALLOWED_DOCUMENT_MIME` = pdf, jpeg, png, webp, dan OOXML (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `…spreadsheetml.sheet`, `…presentationml.presentation`). `MIME_TO_EXTENSION` ditambah `docx` / `xlsx` / `pptx`;
  - `detectMime(bytes, fileName)`: tambah deteksi ZIP (`50 4B 03 04`). ZIP hanya diterima bila ekstensi nama file `.docx` / `.xlsx` / `.pptx`, lalu dipetakan ke MIME OOXML yang sesuai. ZIP lain → tidak dikenal. Pemanggil lama tanpa `fileName` tetap berperilaku sama;
  - `PROGRAM_DOCUMENT_PATH_REGEX` sama dengan validator DB: `^{uuid}/programs/{uuid}/{uuid}_[a-zA-Z0-9_.-]+$`;
  - `buildProgramDocumentPath(tenantId, programId, uuid, fileName, mime)` memakai `sanitizeFileName` dan menyesuaikan ekstensi;
  - `isValidPath` mengenal `program_document`.
- `supabase/functions/storage-upload/index.ts`:
  - terima `kind = 'program_document'` dengan field wajib `programId` (UUID);
  - batas ukuran `MAX_DOCUMENT_BYTES` (jenis lain tetap `MAX_FILE_BYTES`);
  - MIME harus di `ALLOWED_DOCUMENT_MIME`;
  - path dari `buildProgramDocumentPath(tenantId, programId, crypto.randomUUID(), file.name, mime)`;
  - hak lewat RPC `can_upload_tenant_file` yang sama.
- `supabase/functions/storage-sign-url/index.ts`: terima `program_document`; hak lewat `can_read_tenant_file`, tanpa jalur cadangan uploader.
- `client/src/services/fileStorageService.js`:
  - `uploadTenantFile` menerima `programId`;
  - demo mengembalikan path palsu yang valid;
  - pesan 415 per jenis (dokumen: "PDF, Word, Excel, PowerPoint, JPG, PNG, atau WebP");
  - pesan 413 per jenis (dokumen 10 MB).
- Test `client/src/utils/storageFileRules.test.js`:
  - deteksi docx/xlsx/pptx dari byte ZIP + ekstensi;
  - ZIP berekstensi `.zip` ditolak;
  - `buildProgramDocumentPath` lolos `isValidPath`;
  - path dokumen di tenant/segmen salah ditolak;
  - jenis lama tetap lulus.
- Commit: `feat(storage): PANITIA-3.2 jenis file dokumen acara`

## PANITIA-3.3 — Service dokumen acara
- File baru `services/tenant/programDocuments.js`:
  - `PROGRAM_DOC_TYPES`: `proposal` Proposal, `rab` RAB, `rundown` Rundown, `blueprint` Blueprint/Denah, `surat` Surat, `lpj` LPJ, `lainnya` Lainnya;
  - `fetchProgramDocuments(tenantId, programId)`;
  - `uploadProgramDocument(tenantId, programId, { docType, title, file })`:
    - validasi: tipe dikenal, judul 1–150 karakter, file ≤ 10 MB dengan ekstensi yang diizinkan;
    - `uploadTenantFile({ kind: 'program_document', tenantId, programId, file })`, lalu insert baris (`file_path`, `file_name`, `mime_type`, `file_size`);
    - bila insert gagal setelah unggah berhasil, lempar error yang menyebut "file sudah terunggah tetapi gagal dicatat; coba lagi";
  - `deleteProgramDocument(tenantId, documentId)`: hanya baris yang dihapus; objek R2 tetap ada (dicatat sebagai keterbatasan);
  - `getProgramDocumentUrl(path)`: `getTenantFileUrl({ kind: 'program_document', path })`.
- Test: validasi, alur demo unggah → daftar → hapus, dan URL demo.
- Commit: `feat(panitia): PANITIA-3.3 service dokumen acara`

## PANITIA-3.4 — Tab Dokumen di detail acara
- `ProgramDetail.jsx`: tab **"Dokumen"**.
  - Daftar dokumen dikelompokkan per tipe: judul, nama file, ukuran, dan tanggal unggah (WIB).
  - Tombol "Buka" mengambil URL bertanda tangan, lalu membuka tab baru.
  - Pengelola (`canManagePrograms || canManageExpenses`) dan `canTransact`:
    - form unggah: tipe, judul, dan file (`accept` sesuai jenis yang diizinkan);
    - tombol Hapus dengan konfirmasi.
  - Anggota lain: baca saja.
- Test:
  - daftar tampil;
  - form unggah memanggil `uploadProgramDocument` dengan tipe dan judul;
  - tombol unggah tersembunyi untuk anggota biasa.
- Commit: `feat(panitia): PANITIA-3.4 tab dokumen acara`

## PANITIA-3.5 — LPJ siap cetak
- Halaman baru `pages/tenant/ProgramLpj.jsx`, rute `programs/:programId/lpj` (`TenantAccessGuard require="isMember"`), dengan tombol "Susun LPJ" di header `ProgramDetail`.
- Tata letak cetak A4 (`window.print()`, navigasi shell sudah `print:hidden` sejak PANITIA-1F):
  1. **Sampul:** "Laporan Pertanggungjawaban", nama acara, nama organisasi (tenant), tanggal dan lokasi acara.
  2. **Ringkasan keuangan:** rencana vs realisasi pemasukan dan pengeluaran, iuran terkumpul, dan saldo akhir.
  3. **Anggaran vs realisasi per seksi:** tabel dari `summarizeProgram`, termasuk baris "Di luar anggaran".
  4. **Rincian pemasukan** dan 5. **Rincian pengeluaran:** tanggal, uraian, kategori/pos, dan jumlah; pengeluaran bernota diberi tanda "nota ✓".
  6. **Rekap iuran panitia:** anggota, nominal, status.
  7. **Daftar dokumen pendukung:** judul dan tipe.
  8. **Pengesahan:** tempat/tanggal, Ketua Acara, dan Bendahara.
- Nama penandatangan dan kota bisa diisi di layar sebelum cetak (input `print:hidden`, teks hasilnya tampil saat cetak). Bawaan: ketua dari `lead_member`; bendahara dikosongkan.
- Semua angka memakai `formatRupiah`, dan tanggal dalam WIB.
- Test:
  - LPJ merender semua bagian dari data demo;
  - total di bagian 2 sama dengan `summarizeProgram`;
  - input penandatangan muncul di teks cetak.
- Commit: `feat(panitia): PANITIA-3.5 LPJ acara siap cetak`

## Definition of Done
- `docs/handoff/PANITIA-3-report.md` (hash commit, nama file persis, ringkasan vitest apa adanya).
- `npx vitest run` (seluruh suite), `npm run lint`, dan `npm run build` hijau.
- Claude: review, lalu menerapkan migration 3.1 ke dev, men-deploy `storage-upload` dan `storage-sign-url`, lalu lapor.
