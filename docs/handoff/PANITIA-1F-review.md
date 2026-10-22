# PANITIA-1F Review (Claude, 2026-10-22)

Hasil: **diterima**, dengan dua perbaikan test kecil oleh Claude. Tidak ada migration.

## Verifikasi
- Kondisi commit executor:
  - `npm run lint` bersih, `npm run build` sukses;
  - `npx vitest run`: **2 test gagal** (86/88 file lulus), padahal laporan menyebut 88/88 lulus.
- Sesudah perbaikan Claude:
  - `npx vitest run` (`VITE_DEMO_MODE=false`, TZ UTC): **88 file, 1146/1146 lolos**;
  - test tanggal juga dijalankan dengan `TZ=Asia/Jakarta` dan lulus;
  - lint bersih.
- Tidak ada file terlarang, migration, atau dependency yang tersentuh.

## Yang dicek per task
- **1F.1** `ChoosePlan.jsx`:
  - untuk `panitia` hanya pemberitahuan dan tombol nonaktif yang tampil;
  - kalkulator dan ringkasan tidak dirender, dan perhitungan harga dilewati;
  - efek sinkronisasi aman terhadap `optimalResult = null`.
- **1F.2**:
  - header, banner langganan, dan bottom nav di `TenantShell` diberi `print:hidden`;
  - ketiga bagian `ProgramDetail` dirender, dan tab yang tidak aktif memakai `hidden print:block`;
  - kolom aksi disembunyikan saat cetak, dan judul cetak tersedia.
- **1F.3**: semua kolom "Selisih" di CSV = realisasi − rencana.
- **1F.4**:
  - `Programs` dan `PanitiaDashboard` menampilkan "Gagal memuat acara." dengan tombol "Coba lagi";
  - status langganan menampilkan "–" bila gagal.
- **1F.5** `fetchProgramsOverview`:
  - 4 query paralel, dengan embed `tenant_members(id, full_name)` yang benar;
  - pemasukan difilter `deleted_at IS NULL`, dan pengeluaran/pemasukan hanya yang bertaut acara;
  - dikelompokkan per acara, lalu `summarizeProgram`.
- **1F.6**:
  - `?new=1` dibersihkan dari URL setelah form dibuka (Programs, Pemasukan, Pengeluaran mode tenant);
  - acara bawaan dari URL tidak terbawa ke form berikutnya;
  - tombol simpan Pemasukan dan simpan status dikunci selama proses;
  - tanggal bawaan memakai tanggal lokal;
  - item daftar mobile diberi `key`.

## Perbaikan oleh Claude
1. `utils/date.test.js` bergantung pada zona waktu mesin. `new Date('2026-11-01T00:30:00+07:00')` di mesin UTC jatuh pada 31 Oktober, sehingga test gagal di mana pun kecuali WIB. Diganti `new Date(2026, 10, 1, 0, 30)` (komponen tanggal lokal), sehingga lulus di semua zona.
2. `services/publicListingService.js` (bukan bagian batch ini, flaky lama): ID pembayaran demo `pay-lst-${Date.now()}` bisa kembar antar-test dalam milidetik yang sama, sehingga verifikasi menemukan pembayaran yang salah. Kemarin lulus, hari ini gagal di suite penuh, dan lulus bila dijalankan sendiri. Ditambah sufiks acak, pola yang sama dengan perbaikan ID demo di PANITIA-1.

## Catatan untuk executor
- Laporan kembali menyatakan semua test lulus, padahal 2 gagal di mesin lain. Test yang memakai waktu harus independen dari zona waktu mesin; jangan mengandalkan perangkat yang kebetulan WIB.
- `utils/dateUtils.js` dibuat hanya untuk re-export `utils/date.js`, dan laporan menyebutnya sebagai file baru yang dipakai. File itu tidak dipakai di mana pun. Dibiarkan, karena tidak berbahaya.

## Belum diuji (manual di ruangwarga-dev setelah digabung)
- Halaman Paket untuk tenant Kepanitiaan.
- Cetak laporan acara (Ctrl+P / Bagikan → Cetak di HP): tanpa navigasi, dan tiga bagian tampil.
- Tombol "Buat Acara" di dashboard langsung membuka form.
