# PANITIA-3 Review (Claude, 2026-10-22)

Hasil: **diterima**. Tidak ada celah lintas tenant atau lintas acara. Claude memperbaiki satu bug kecil di aturan nama file, lalu men-deploy Edge Function. Temuan klien masuk ke `PANITIA-ARISAN-1F.md` § F.4.

## Verifikasi
- **Migration:**
  - `202610220002_program_documents.sql` identik byte dengan aset;
  - **sudah terpasang di dev** (riwayat `program_documents`);
  - penjaga E1–E5 dijalankan di sub-transaksi. E6 (hapus) tidak bisa dijalankan lewat MCP karena perintah berisi `DELETE FROM` dibatalkan; E6 tetap ada di `supabase/tests/program_documents_matrix.sql` untuk SQL Editor.
  - `can_upload_tenant_file` dan `can_read_tenant_file` diterapkan dengan cabang lama yang persis sama, ditambah cabang `program_document`.
- **Edge Function di-deploy ke dev:**
  - `storage-upload` v5 dan `storage-sign-url` v4, `verify_jwt` tetap aktif;
  - sebelum deploy, kode yang terpasang dicek sama dengan `main`, jadi tidak ada drift.
- **Suite penuh:** lint bersih, build sukses, vitest 93 file / 1206 test lolos.

## Yang dicek (keamanan penyimpanan)
- **Jenis file lama tidak berubah:**
  - batas 5 MB dan daftar format sama;
  - ZIP bernama `.docx` kini terdeteksi sebagai OOXML, tetapi jenis lama tetap menolaknya dengan 415 yang sama.
- **`program_document`:**
  - `programId` wajib UUID, dengan batas 10 MB;
  - ZIP hanya diterima dengan ekstensi `.docx`, `.xlsx`, atau `.pptx`;
  - path disusun server dengan UUID dari server, sehingga klien tidak bisa memilih path.
- **Regex path sama dengan validator DB:** case-sensitive, dan `..` ditolak.
- **Lintas tenant:**
  - izin unggah dicek untuk `tenantId` yang sama dengan segmen pertama path;
  - izin baca dicek terhadap keanggotaan tenant dari path;
  - sign-url tidak punya jalur cadangan uploader untuk dokumen;
  - baris dokumen dijaga cek segmen path, FK komposit, dan RLS.
- **Tab Dokumen:**
  - unggah dan hapus hanya untuk `(canManagePrograms || canManageExpenses) && canTransact`;
  - hapus memakai konfirmasi.
- **LPJ:**
  - 8 bagian ada, dan angka ringkasan langsung dari `summarizeProgram`;
  - input penandatangan `print:hidden`, dan teksnya muncul di bagian pengesahan.

## Perbaikan oleh Claude
1. **Bug lama `sanitizeFileName`, kini lebih sering kena:**
   - Masalah: memotong nama di atas 100 karakter bisa menyambung titik dengan ekstensi menjadi `..`. Path lalu ditolak dan unggahan gagal 400. Nama dokumen acara biasanya panjang, jadi lebih sering kena.
   - Perbaikan: titik ganda dirapikan setelah pemotongan.
   - Ditambah test di `storageFileRules.test.js`, lalu di-deploy bersama Edge Function.

## Temuan lain (→ `PANITIA-ARISAN-1F.md` § F.4)
- **Tombol "Buka" di iPhone:** `window.open` dipanggil setelah `await`, sehingga diblokir Safari/PWA iOS tanpa pesan apa pun.
- **Tanggal bukan WIB:** tanggal dokumen dan LPJ memakai zona perangkat.
- **Kota LPJ:** bawaannya "Jakarta" (tidak ada kolom kota tenant). Seharusnya kosong.
- **Nama file panjang:**
  - nama file di atas 200 karakter lolos unggah tetapi gagal dicatat;
  - setiap "coba lagi" meninggalkan objek yatim di R2.
- **Kolom pengeluaran LPJ:** "Penerima" selalu "-"; seharusnya kategori.
- **Hapus dokumen:** hapus yang diblokir RLS tetap menampilkan "berhasil dihapus".
- **Pemilih file:** menawarkan `.doc`, `.xls`, dan `.ppt`, yang kemudian ditolak.
- **Keterbatasan yang diterima:**
  - hapus dokumen hanya menghapus baris; objek R2 tetap ada;
  - `programId` di unggahan tidak dicek kepemilikannya. Objek tetap di folder tenant sendiri, jadi akibatnya hanya objek yatim.

## Catatan untuk executor
- Laporan 3.1 menyebut kolom `created_by` dan `updated_at`. Kolom sebenarnya `uploaded_by`, dan tidak ada `updated_at`.
- Laporan 3.2 menyebut path demo `demo-program-documents/…`, padahal kode menghasilkan path UUID biasa.

## Uji manual (dev, tenant Kepanitiaan)
1. **Sekretaris/Bendahara:** di tab Dokumen, unggah:
   - PDF;
   - `.docx`;
   - foto;
   - satu file `.zip` (harus ditolak).
2. **Buka:**
   - tekan "Buka" di laptop dan di HP (catat bila di iPhone tidak terbuka; ini temuan F.4);
   - tekan "Buka" dengan akun anggota biasa: harus bisa membuka, tetapi tidak ada form unggah.
3. **LPJ:**
   - "Susun LPJ", isi nama penandatangan dan kota, lalu cetak;
   - cek angka ringkasan sama dengan tab Ringkasan acara.
