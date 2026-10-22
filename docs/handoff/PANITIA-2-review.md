# PANITIA-2 Review (Claude, 2026-10-22)

Hasil: **diterima**. Claude memperbaiki 1 bug berat dan 1 bug kecil. Temuan menengah dan ringan masuk ke `PANITIA-ARISAN-1F.md` § F.3.

## Verifikasi
- **Migration:**
  - `202610220001_program_dues.sql` identik byte dengan aset;
  - **sudah terpasang di dev** (riwayat `program_dues`), dengan penjaga D1–D7 di sub-transaksi (data uji tidak tersisa).
- **Suite penuh**, dicek di HEAD gabungan keempat batch ditambah perbaikan Claude:
  - `npm run lint` bersih;
  - `npm run build` sukses;
  - `npx vitest run` (TZ UTC): **93 file, 1206/1206 lolos**.
- **Select dan embed:**
  - `member:tenant_members(id, full_name, phone)` dan `program:tenant_programs(id, name)` valid;
  - filter `tenant_id`, status, dan `program_id` benar.

## Yang dicek
- **`createProgramDues`:**
  - validasi nominal dan tanggal;
  - `period` diambil dari tanggal jatuh tempo;
  - anggota yang sudah punya iuran aktif dilewati;
  - `unit_id` null, dan `metadata.bill_type = 'program_dues'`.
- **`submitMemberTransfer`:** bukti wajib (tipe dan ukuran dicek), nominal dari server (amount + late_fee), lewat jalur `bank_transfer` non-staf.
- **Catat tunai:** lewat jalur staf, dan trigger sinkronisasi menandai iuran lunas.
- **`summarizeProgram`:** hanya iuran lunas yang masuk realisasi pemasukan.
- **Tombol:** Catat Tunai, Ubah, Batalkan, dan Verifikasi mengikuti `can* && canTransact` dan status iuran.
- **Modal bayar:** menampilkan rekening dengan tombol salin, dan submit dikunci selama proses.
- **TenantShell:** link "Verifikasi" hanya untuk `hasPrograms && canVerifyPayments`.

## Perbaikan oleh Claude
1. **Bug berat:** tombol "Verifikasi" di tab Iuran (`ProgramDetail.jsx`) membuka `/t/:id/verification`, rute yang tidak ada, sehingga bendahara dilempar ke 404. Diganti `/payment-verification`.
2. **Tombol "Pengaturan" mati:** tombol di peringatan rekening belum ada di `tenantAccess` (`canManageSettings`), sehingga tidak pernah tampil. Ditambah `canManageSettings: hasPerm('manage_settings')`, dan test bentuk objek akses diperbarui.

## Temuan lain (→ `PANITIA-ARISAN-1F.md` § F.3)
- **Data hilang tanpa pesan:** bila pengambilan iuran gagal, `fetchProgramTransactions` ikut gagal, sehingga pemasukan dan pengeluaran acara tampil kosong tanpa pesan.
- **Pesan mentah:** dua pengurus menerbitkan iuran bersamaan menghasilkan pesan "duplicate key …".
- **Ubah dan batalkan tanpa cek status:** aksi tidak mengecek ulang status `unpaid` saat menulis. Pembayaran yang masuk di antara baca dan tulis bisa tertimpa.
- **"Ingatkan via WA" terbuka untuk semua anggota:** link (berikut nomor HP) tampil untuk anggota biasa.
- **Jumlah "Anggota Ditagih" salah:** angkanya jatuh ke jumlah baris batal bila semua iuran dibatalkan.
- **Nominal di modal tanpa denda:** modal bayar menampilkan nominal tanpa `late_fee`, padahal nominal yang dikirim sudah benar.
- **Tanggal jatuh tempo bawaan:** diambil dari hari UTC, sehingga pukul 00.00–07.00 WIB jatuh ke kemarin.
- **Mode demo:** setelah "Bayar", iuran tetap belum bayar.

## Catatan untuk executor
- **Laporan tidak akurat:** laporan menyebut test banner anggota di `ProgramDetail.test.jsx`, padahal commit 2.4 tidak menyentuh file itu.
- **Celah test:** test "tombol tulis tersembunyi" tidak memeriksa link WA.

## Uji manual (dev, tenant Kepanitiaan)
1. **Bendahara:**
   - terbitkan iuran acara untuk 2–3 anggota;
   - ubah nominal satu orang;
   - batalkan satu.
2. **Anggota:** dari dashboard "Iuran Saya", tekan "Bayar", lalu unggah bukti transfer.
3. **Bendahara:**
   - tekan "Verifikasi" di tab Iuran; halaman verifikasi harus terbuka, bukan 404;
   - setujui pembayaran, lalu cek bahwa iuran menjadi Lunas dan realisasi pemasukan bertambah.
4. **Tunai:** "Catat Tunai" untuk anggota lain, lalu cek status Lunas.
