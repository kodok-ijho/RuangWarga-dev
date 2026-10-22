# PANITIA-HARGA Review (Claude, 2026-10-22)

Hasil: **diterima**. Penguncian di database bekerja. Claude memperbaiki 1 bug berat di tampilan. Temuan lain masuk ke `PANITIA-ARISAN-1F.md` § F.5.

## Verifikasi
- **Migration:**
  - `202610220003_program_access.sql` identik byte dengan aset;
  - **sudah terpasang di dev** (riwayat `program_access`), dengan penjaga H1–H9 di sub-transaksi;
  - backfill tidak mengubah apa pun karena dev belum punya tenant Kepanitiaan.
- **Suite penuh:** lint bersih, build sukses, vitest 93 file / 1206 test lolos.
- **Commit `037c299`** (`testTimeout: 20000`):
  - suite penuh juga lulus dengan batas bawaan 5 detik;
  - diterima sebagai penyangga mesin yang lambat, tetapi batas besar bisa menyembunyikan test yang macet.

## Yang dicek
- **`getProgramAccessState`:**
  - kelima state benar;
  - tepat pada `access_until` sudah dianggap habis, sama dengan `access_until > now()` di DB.
- **`ProgramDetail`:**
  - enam tombol transaksi nonaktif dengan keterangan yang diminta;
  - RAB, dokumen, edit acara, LPJ/CSV, verifikasi, dan batalkan iuran tetap aktif;
  - panel "Aktifkan / Perpanjang" nonaktif dengan teks "Pembayaran QRIS segera tersedia".
- **Dropdown acara di Pemasukan/Pengeluaran:** acara yang terkunci nonaktif, dengan akhiran "(belum aktif)" atau "(masa aktif habis)".
- **`updateProgram`:** hanya mengirim kolom yang boleh, sehingga tidak menyentuh `access_until`.
- **Halaman paket dan status:**
  - ChoosePlan panitia menjelaskan model harga tanpa kalkulator;
  - SubscriptionStatus menampilkan "Organisasi aktif (tanpa batas waktu)" dan daftar acara;
  - `TrialCountdownBanner` tidak tampil untuk panitia.

## Perbaikan oleh Claude
1. **Bug berat:** tombol "Bayar" di "Iuran Saya" (`PanitiaDashboard`) nonaktif untuk **semua** iuran, termasuk acara gratis atau aktif.
   - Penyebab: kode membaca `due.program`, yang hanya berisi `{id, name}` tanpa data masa aktif, sehingga setiap acara dianggap "belum aktif".
   - Perbaikan: acara dicari dulu di daftar `programs` (yang membawa `access_until`).

## Temuan lain (→ `PANITIA-ARISAN-1F.md` § F.5)
- **Tautan langsung ke form transaksi:** `?program=<id>&new=1` untuk acara terkunci tetap membuka form tanpa toast, karena daftar acara belum termuat saat efek berjalan. Database tetap menolak simpan. Di mode demo, catatan tersimpan.
- **Tanggal masa aktif bukan WIB:** label memakai zona perangkat. Contoh: "1 Feb" vs "2 Feb".
- **`tenantType` kosong:** dianggap panitia. Acara non-panitia sempat tampil "Belum aktif" saat tenant masih dimuat.
- **Hapus pengeluaran:** pesan penjaga DB tertutup pesan umum.
- **SubscriptionStatus:**
  - gagal memuat acara tampil sebagai "Belum ada acara";
  - teks "masa percobaan (trial)" masih muncul untuk panitia.
- **Demo:**
  - tenant panitia baru masih `trial` 15 hari;
  - acara gratis bisa didapat lagi setelah acara pertama dihapus.
- **Konstanta harga:** `PANITIA_PRICING` tidak dipakai; "Rp25.000" ditulis langsung di 4 tempat.

## Catatan untuk executor
- **Laporan tidak akurat:**
  - menyebut "RLS policy", padahal penjaganya trigger;
  - menyebut `set_program_access_defaults()`, padahal fungsinya `set_program_access_on_insert()`;
  - mengklaim tanggal WIB dan tombol "Bayar" yang benar.
- **Angka test di laporan berasal dari working tree** sebelum commit terakhir.
- **Celah test:** test "Iuran Saya" hanya mengecek tombol ada, tidak mengecek tombolnya aktif. Bug di atas lolos karena itu.

## Uji manual (dev, buat tenant Kepanitiaan baru)
1. **Langganan organisasi:**
   - halaman Paket menampilkan penjelasan Rp25.000 per acara per 12 bulan dan gratis 1 bulan untuk acara pertama;
   - status langganan "Organisasi aktif".
2. **Acara pertama:**
   - badge "Gratis sampai …" (±1 bulan);
   - bisa catat pemasukan, pengeluaran, dan iuran;
   - anggota bisa menekan "Bayar" di dashboard.
3. **Acara kedua:**
   - badge "Belum aktif";
   - tombol transaksi nonaktif;
   - RAB, dokumen, dan LPJ tetap bisa;
   - di form Pengeluaran, acara ini nonaktif.
4. **Masa aktif lewat dan perpanjangan:** perlu SQL. Claude bisa memundurkan `access_until` di dev bila ingin diuji.
