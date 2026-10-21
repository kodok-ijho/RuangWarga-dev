# PANITIA-1F — Perbaikan susulan Kepanitiaan

Status: ⏳ **Menunggu persetujuan user.** Semuanya frontend; tidak ada migration.

Dasar: `PANITIA-1-review.md`. Bug berat sudah diperbaiki Claude. Batch ini berisi temuan menengah dan ringan dari review.

## Aturan executor
- Sama dengan `PANITIA-1.md` § Aturan executor. Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`, satu task = satu commit, push setelah setiap commit, dan jangan push ke `main`.
- Baca `PANITIA-1-review.md` § "Catatan untuk executor" sebelum mulai.
- Laporan `docs/handoff/PANITIA-1F-report.md` **wajib** ditulis dari `git diff` dan output test yang sebenarnya:
  - nama file harus persis;
  - jumlah test harus disalin dari ringkasan vitest;
  - test yang gagal harus disebut.

---

## PANITIA-1F.1 — Halaman paket Kepanitiaan tanpa harga RT/RW
- `pages/account/ChoosePlan.jsx`: bila `isPanitia`, tampilkan **hanya** kartu pemberitahuan dan tombol nonaktif "Paket Segera Tersedia".
  - Kalkulator blok (Section 1), ringkasan tagihan, dan pilihan periode tidak dirender, karena `calculateSubscriptionBill` jatuh ke harga RT/RW untuk jenis yang tidak dikenal.
- Test: tenant panitia tidak menampilkan teks "Masukkan Perkiraan Jumlah", maupun angka harga apa pun. Tenant RT/RW tetap menampilkan kalkulator.
- Commit: `fix(panitia): PANITIA-1F.1 halaman paket kepanitiaan tanpa harga RT/RW`

## PANITIA-1F.2 — Cetak laporan acara yang rapi
- `components/tenant/TenantShell.jsx`: header sticky, pembungkus banner langganan, dan bottom nav mobile diberi `print:hidden`.
- `pages/tenant/ProgramDetail.jsx`: saat dicetak, ketiga bagian (Ringkasan, Anggaran, Transaksi) tampil berurutan, tidak hanya tab yang sedang dibuka.
  - Tab yang tidak aktif dirender dengan `hidden print:block`.
  - Tombol aksi di dalam tabel diberi `print:hidden`.
  - Tambahkan judul cetak (nama acara, tanggal cetak) yang hanya tampil saat cetak (`hidden print:block`).
- Test: ketiga bagian ada di DOM walaupun tab aktif "Ringkasan", dan elemen judul cetak ada.
- Commit: `fix(panitia): PANITIA-1F.2 cetak laporan acara lengkap tanpa navigasi`

## PANITIA-1F.3 — Tanda selisih konsisten di CSV
- `pages/tenant/ProgramDetail.jsx` ±433-438: semua kolom "Selisih" di CSV memakai **realisasi − rencana**. Ini berlaku untuk baris seksi, "Di luar anggaran" (rencana 0), "Total Pemasukan", dan "Total Pengeluaran".
- Test: baris "Total Pengeluaran" bernilai realisasi − rencana pada data contoh.
- Commit: `fix(panitia): PANITIA-1F.3 selisih CSV acara konsisten`

## PANITIA-1F.4 — Error jangan ditelan
- `pages/tenant/Programs.jsx` ±74-75 dan `components/dashboard/PanitiaDashboard.jsx` ±46, ±68:
  - error dari service tidak lagi diubah menjadi daftar kosong;
  - tampilkan keadaan error ("Gagal memuat acara.") dengan tombol "Coba lagi", dan catat ke `console.error`.
- `pages/account/SubscriptionStatus.jsx` ±70: bila gagal menghitung, tampilkan "–", bukan angka 1.
- Test: service melempar error → teks error dan tombol "Coba lagi" tampil, bukan empty state "Belum ada acara".
- Commit: `fix(panitia): PANITIA-1F.4 tampilkan error muat acara`

## PANITIA-1F.5 — Kurangi jumlah request daftar acara
- Service baru `fetchProgramsOverview(tenantId)` di `services/tenant/programs.js`. Total hanya **4 query**:
  - acara;
  - semua pos RAB tenant;
  - pemasukan tenant dengan `program_id` tidak null dan belum dihapus;
  - pengeluaran tenant dengan `program_id` tidak null.
- Data dikelompokkan per acara, lalu dihitung dengan `summarizeProgram`. Kembalikan `[{ ...program, summary }]`.
- `Programs.jsx` dan `PanitiaDashboard.jsx` memakai fungsi ini, menggantikan 3 request per acara.
- Ekspor ulang lewat `tenantOperationalService.js`, dan perbarui `tenantOperationalService.exports.test.js`.
- Test: mode demo dengan 2 acara menghasilkan ringkasan yang sama dengan memanggil `summarizeProgram` per acara.
- Commit: `perf(panitia): PANITIA-1F.5 ringkasan semua acara dalam 4 query`

## PANITIA-1F.6 — Detail UX
- **Buat acara dari dashboard:** `PanitiaDashboard` "Buat Acara" mengarah ke `/programs?new=1`, dan `Programs.jsx` membuka form bila `new=1` dan pengguna berhak.
- **Bersihkan URL:** di `Programs.jsx`, `TenantIncomes.jsx`, dan `pages/Expenses.jsx` (mode tenant), setelah form dibuka dari `new=1`, hapus parameter `new` dengan `setSearchParams(..., { replace: true })`. Acara bawaan dari `program` hanya dipakai untuk form yang dibuka dari URL itu.
- **Cegah klik ganda:** tombol simpan di form Pemasukan dan simpan status di `ProgramDetail` nonaktif selama proses.
- **Tanggal lokal:**
  - tanggal bawaan form Pemasukan, form Pengeluaran (mode tenant), dan fallback di `services/tenant/incomes.js` memakai tanggal lokal `YYYY-MM-DD` (tahun/bulan/hari lokal), bukan `toISOString()` (UTC);
  - buat helper murni `getLocalDateString(date = new Date())` di `utils/` dan beri test.
- **Key React:** `TenantIncomes.jsx` ±346-353, elemen yang dikembalikan `renderItem` diberi `key={inc.id}`.
- Test:
  - `getLocalDateString` pada `2026-11-01T00:30:00+07:00` menghasilkan `2026-11-01`;
  - `Programs` dengan `?new=1` membuka form;
  - tombol simpan Pemasukan nonaktif selama menyimpan.
- Commit: `fix(panitia): PANITIA-1F.6 detail UX form acara dan pemasukan`

## Definition of Done
- `docs/handoff/PANITIA-1F-report.md` berisi hash commit tiap task.
- `npx vitest run` (seluruh suite), `npm run lint`, dan `npm run build` hijau. Salin baris ringkasan vitest apa adanya ke laporan.
