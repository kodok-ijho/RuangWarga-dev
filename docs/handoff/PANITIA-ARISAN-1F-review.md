# PANITIA-ARISAN-1F Review (Claude, 2026-10-23)

Hasil: **diterima**. Claude memperbaiki 1 temuan menengah (tanggal panel masa aktif). Sisa temuan ringan dicatat di bawah dan tidak memblokir.

## Verifikasi
- **Cek otomatis:**
  - `npm run lint` bersih;
  - `npm run build` sukses;
  - `npx vitest run`: **93 file, 1228/1228 lolos**, baik di `TZ=UTC` maupun `TZ=Asia/Jakarta`. Angka ini sama dengan laporan.
- **Cakupan perubahan:** semua perubahan di `client/src/`, ditambah laporan. Tidak ada migration, Edge Function, `.env`, atau file terlarang yang tersentuh, dan tidak ada secret.
- **Commit ganda:** F.1, F.2, dan F.5 masing-masing punya dua commit dengan pesan yang sama. Putaran kedua hanya penyesuaian kecil, tidak membatalkan apa pun:
  - F.1: label slot dan fixture test;
  - F.2: urutan setoran demo dan status muat di dashboard;
  - F.5: harga dari `PANITIA_PRICING`.

## Yang dicek
- **F.1 (layar kocok):**
  - daftar "Ikut kocok" / "Tidak ikut" dibangun dari kandidat `has_won = false` yang dicocokkan dengan tagihan putaran per `member_id`, sehingga pemenang lama tidak masuk kedua daftar;
  - tombol Kocok hanya aktif bila ada minimal 1 peserta lunas;
  - tidak ada lagi pembacaan `pool_amount`; semua memakai `total_pool_amount`;
  - slot pemenang diambil dari `eligible_snapshot`;
  - waktu kocok diambil dari `drawn_at` RPC atau putaran, bukan jam perangkat;
  - `?tab=history` dibaca saat halaman dimuat;
  - judul teks WA "HASIL KOCOKAN ARISAN";
  - test kini benar-benar menekan Kocok → konfirmasi → RPC tiruan → kartu hasil, dengan fixture berbentuk data DB.
- **F.2 (setoran):**
  - setoran belum lunas diurutkan dari jatuh tempo terdekat;
  - kartu dashboard punya keadaan memuat dan galat (dengan "Coba lagi");
  - tombol WA hanya tampil bila ada nomor HP;
  - salin semua memakai `await` dan `try/catch`;
  - link verifikasi memakai `canVerifyPayments` (tunai atau transfer);
  - tagihan batal diberi badge "Dibatalkan" tanpa aksi.
- **F.3 (iuran acara):**
  - galat iuran tidak lagi mengosongkan pemasukan dan pengeluaran, dan muncul banner peringatan;
  - ubah dan batal dikunci ke status `unpaid` (rantai query valid untuk supabase-js v2; 0 baris → pesan jelas);
  - `23505` dipetakan ke pesan ramah;
  - link WA hanya untuk pengurus berwenang;
  - modal bayar menampilkan nominal + denda, sama dengan yang dikirim.
- **F.4 (dokumen dan LPJ):**
  - `formatDateWIB` benar untuk timestamp (dicek di zona UTC, WIB, WITA, dan Los Angeles) dan untuk tanggal saja, tanpa pergeseran;
  - "Buka" membuka tab secara sinkron sebelum `await`, dengan cadangan `location.assign`;
  - kota LPJ kosong, dan kolom "Kategori";
  - nama di atas 200 karakter ditolak sebelum unggah;
  - hapus mengecek jumlah baris;
  - `accept` sesuai daftar ekstensi.
- **F.5 (masa aktif):**
  - `tenantType` kosong → tanpa batas;
  - deep link menunggu daftar acara termuat, lalu menampilkan toast untuk acara terkunci;
  - Expenses memuat acara sendiri dan meneruskan pesan galat hapus;
  - SubscriptionStatus menampilkan keadaan galat, tanpa kata "trial" untuk panitia;
  - di demo, tenant panitia langsung `active` dan jatah gratis hanya sekali;
  - tidak ada lagi angka "Rp25.000" yang ditulis langsung.

## Perbaikan oleh Claude
1. **Tanggal panel masa aktif acara** (`ProgramDetail.jsx`, commit `c7283f4`): badge sudah WIB, tetapi kalimat di bawahnya masih memakai `formatDate` (zona perangkat). Akibatnya badge dan kalimat bisa menunjukkan tanggal berbeda, misalnya "1 Feb" dan "2 Feb". Diganti `formatDateWIB`.

## Catatan ringan (tidak memblokir, untuk batch berikutnya yang menyentuh file yang sama)
- **Deep link ke acara yang tidak ada di daftar:** bila daftar acara gagal dimuat atau acara tidak ditemukan, form tetap terbuka dengan acara tersebut. Database tetap menolak simpan untuk acara terkunci; di mode demo, catatan tersimpan.
- **LPJ dan galat iuran:** LPJ tidak menampilkan peringatan saat data iuran gagal dimuat, sehingga bagian iuran tercetak kosong.
- **Demo transfer iuran acara:** status menjadi "menunggu verifikasi", tetapi pembayarannya tidak muncul di halaman verifikasi demo.
- **Test deep link Expenses:** hanya mencari teks di kode sumber, tidak merender halaman.
- **Nomor HP anggota:** nomor HP tetap terlihat oleh anggota biasa di tab Iuran. Link WA sudah disembunyikan, tetapi RLS `billing_items` memang mengizinkan semua anggota membaca tagihan. Menyembunyikan nomor HP adalah keputusan privasi tersendiri.
- **Arisan:**
  - kandidat di layar tidak difilter status anggota `approved` seperti di server;
  - bila satu anggota punya lebih dari satu tagihan di satu putaran (misalnya batal lalu terbit ulang), status yang dipakai adalah tagihan terakhir di daftar.
- **Nit:**
  - impor `formatDate` di `programs.js` tidak dipakai;
  - "12 bulan" dan "1 bulan" masih ditulis langsung di ChoosePlan dan SubscriptionStatus.

## Catatan untuk executor
- **Commit ganda:** satu task harus satu commit. Bila perlu memperbaiki task yang sudah di-commit, beri pesan `fix(...): F.x susulan — <apa yang diubah>`, dan sebutkan alasannya di laporan.
- **Isi laporan:** laporan menggabungkan dua commit F.5 tanpa menjelaskan bahwa commit kedua hanya soal harga. Test Expenses juga disebut sebagai test perilaku, padahal hanya mencari teks.

## Uji manual (dev)
Gunakan daftar uji di `PANITIA-2-review.md`, `PANITIA-3-review.md`, `PANITIA-HARGA-review.md`, dan `ARISAN-1-review.md`. Temuan yang di sana ditandai "temuan F.x" sekarang seharusnya sudah tidak muncul:
- hadiah Rp0;
- pemenang lama di "Ikut kocok";
- "Buka" di iPhone;
- tanggal bukan WIB;
- deep link acara terkunci.
