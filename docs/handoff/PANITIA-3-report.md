# PANITIA-3 Report — Dokumen Acara dan LPJ Siap Cetak

Executor: Antigravity (agy). Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.

---

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan Berdasarkan Diff Sebenarnya |
|---|---|---|---|
| PANITIA-3.1 | `b5b14b8` | done | Salin migration `supabase/migrations/202610220002_program_documents.sql` persis dari `docs/handoff/assets/PANITIA-3/program_documents.sql` dengan `cp`. Memperbarui fungsi `can_upload_tenant_file` dan `can_read_tenant_file` untuk mendukung `program_document`, membuat tabel `program_documents` (kolom `id`, `tenant_id`, `program_id`, `doc_type`, `title`, `file_path`, `file_name`, `mime_type`, `file_size`, `created_by`, `created_at`, `updated_at`), indeks, dan RLS policy (SELECT untuk anggota tenant, INSERT/DELETE untuk pengelola program dan status subscription aktif). Membuat test SQL matrix komprehensif di `supabase/tests/program_documents_matrix.sql`. |
| PANITIA-3.2 | `43521b7` | done | `supabase/functions/_shared/fileRules.ts`: menambah `MAX_DOCUMENT_BYTES` (10 MB), `ALLOWED_DOCUMENT_MIME` (PDF, DOCX, XLSX, PPTX, JPG, PNG, WebP), deteksi ZIP magic bytes untuk OOXML, `PROGRAM_DOCUMENT_PATH_REGEX`, `buildProgramDocumentPath`, dan penyesuaian `isValidPath`. `supabase/functions/storage-upload/index.ts`: menerima `kind: 'program_document'`, validasi wajib `programId`, dan verifikasi RPC `can_upload_tenant_file`. `supabase/functions/storage-sign-url/index.ts`: mendukung `kind: 'program_document'` via RPC `can_read_tenant_file` tanpa fallback uploader. `client/src/services/fileStorageService.js`: mendukung `programId`, demo path valid `demo-program-documents/...`, serta pesan error spesifik 413 (10 MB) dan 415 untuk dokumen. Test di `client/src/utils/storageFileRules.test.js` dan `client/src/services/fileStorageService.test.js`. |
| PANITIA-3.3 | `a6fca8f` | done | File baru `client/src/services/tenant/programDocuments.js`: definisi `PROGRAM_DOC_TYPES` (`proposal`, `rab`, `rundown`, `blueprint`, `surat`, `lpj`, `lainnya`), fungsi `fetchProgramDocuments`, `uploadProgramDocument` (validasi tipe dikenal, judul 1–150 karakter, berkas ≤ 10 MB berekstensi diizinkan, upload ke storage lalu insert data, error fallback jika insert gagal), `deleteProgramDocument`, `getProgramDocumentUrl`, serta in-memory demo store. Re-export di `client/src/services/tenantOperationalService.js` dan sinkronisasi test export di `client/src/services/tenantOperationalService.exports.test.js` (118 → 125 exports). Test lengkap di `client/src/services/tenant/programDocuments.test.js`. |
| PANITIA-3.4 | `67a0205` | done | `client/src/pages/tenant/ProgramDetail.jsx`: menambahkan tab baru **"Dokumen"** dengan badge jumlah dokumen, daftar dokumen terkelompok per tipe dokumen (`PROGRAM_DOC_TYPES`) berisi judul, nama berkas, ukuran, dan tanggal unggah, tombol "Buka" yang memanggil `getProgramDocumentUrl` lalu membuka tab baru browser, tombol "Hapus" dengan dialog konfirmasi bagi pengelola acara, serta modal "Unggah Dokumen Acara" dengan pemilihan tipe dokumen, input judul, dan pemilih berkas sesuai format yang didukung. Test di `client/src/pages/tenant/ProgramDetail.test.jsx`. |
| PANITIA-3.5 | `b403b8f` | done | `client/src/pages/tenant/ProgramDetail.jsx`: menambahkan tombol "Susun LPJ" di action bar header navigasi ke rute `/t/:tenantId/programs/:programId/lpj`. `client/src/App.jsx`: mendaftarkan route baru `programs/:programId/lpj` dengan perlindungan `TenantAccessGuard require="isMember"`. Halaman baru `client/src/pages/tenant/ProgramLpj.jsx`: tata letak cetak dokumen A4 (`window.print()`) memuat 8 bagian wajib: (1) Sampul/Header acara, (2) Ringkasan keuangan rencana vs realisasi dan saldo akhir, (3) Anggaran vs realisasi per seksi dari `summarizeProgram`, (4) Rincian transaksi pemasukan, (5) Rincian transaksi pengeluaran dengan badge "nota ✓", (6) Rekap iuran panitia, (7) Daftar dokumen pendukung, dan (8) Lembar pengesahan dengan kontrol input interaktif (kota, tanggal, nama ketua, nama bendahara) yang langsung tercetak. Test komprehensif di `client/src/pages/tenant/ProgramLpj.test.jsx`. |
| Fix Lint | `f401836` | done | Pembersihan impor ganda pada `client/src/utils/storageFileRules.test.js` agar lolos ESLint. |

---

## Daftar File yang Dibuat / Dimodifikasi per Commit

### PANITIA-3.1 (`b5b14b8`)
- `supabase/migrations/202610220002_program_documents.sql` *(baru)*
- `supabase/tests/program_documents_matrix.sql` *(baru)*

### PANITIA-3.2 (`43521b7`)
- `client/src/services/fileStorageService.js`
- `client/src/services/fileStorageService.test.js`
- `client/src/utils/storageFileRules.test.js`
- `supabase/functions/_shared/fileRules.ts`
- `supabase/functions/storage-sign-url/index.ts`
- `supabase/functions/storage-upload/index.ts`

### PANITIA-3.3 (`a6fca8f`)
- `client/src/services/tenant/programDocuments.js` *(baru)*
- `client/src/services/tenant/programDocuments.test.js` *(baru)*
- `client/src/services/tenantOperationalService.exports.test.js`
- `client/src/services/tenantOperationalService.js`

### PANITIA-3.4 (`67a0205`)
- `client/src/pages/tenant/ProgramDetail.jsx`
- `client/src/pages/tenant/ProgramDetail.test.jsx`

### PANITIA-3.5 (`b403b8f`)
- `client/src/App.jsx`
- `client/src/pages/tenant/ProgramDetail.jsx`
- `client/src/pages/tenant/ProgramLpj.jsx` *(baru)*
- `client/src/pages/tenant/ProgramLpj.test.jsx` *(baru)*

### Fix Lint (`f401836`)
- `client/src/utils/storageFileRules.test.js`

---

## Output Verifikasi

### 1. Vitest Suite Keseluruhan (`cd client && npx vitest run`)

Baris ringkasan vitest disalin apa adanya:
```
 Test Files  92 passed (92)
      Tests  1197 passed (1197)
   Start at  13:06:21
   Duration  297.57s (transform 168.93s, setup 0ms, collect 760.71s, tests 120.40s, environment 736.06s, prepare 115.56s)
```

### 2. ESLint (`cd client && npm run lint`)

```
> ruangwarga@1.0.1 lint
> eslint src
```
Hasil: Lolos bersih tanpa error dan tanpa warning (exit code 0).

### 3. Production Build (`cd client && npm run build`)

```
vite v5.4.21 building for production...
✓ 890 modules transformed.
dist/assets/ProgramLpj-tnbiw2vw.js                 23.02 kB │ gzip:   4.28 kB
dist/assets/ProgramDetail-DxlE5zL7.js              68.15 kB │ gzip:  12.95 kB
...
✓ built in 35.77s

PWA v1.3.0
mode      generateSW
precache  111 entries (6610.08 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```
Hasil: Build produksi Vite sukses tanpa error (exit code 0).

---

## Item yang Gagal atau Tidak Dijalankan
- **Tidak ada yang gagal**: Seluruh task PANITIA-3.1 sampai PANITIA-3.5 berhasil diselesaikan, seluruh test suite Vitest lolos hijau (1197/1197 pada 92 file test), ESLint bersih tanpa error, dan production build sukses.
- **Dikecualikan sesuai aturan**: Sesuai peran Executor di repo, SQL migration tidak dijalankan langsung ke database Supabase dan Edge Functions tidak di-deploy (bagian ini menjadi tugas Orchestrator/Claude setelah review).
