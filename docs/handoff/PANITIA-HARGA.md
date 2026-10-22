# PANITIA-HARGA — Masa aktif per acara

Status: ✅ **Disetujui user 2026-10-22** (urutan kerja: PANITIA-2 → PANITIA-3 → PANITIA-HARGA → ARISAN-1). Termasuk migration HARGA.1, yang menyentuh langganan tenant Kepanitiaan.

## Model harga (keputusan user 2026-10-22)
- **Acara pertama** tiap organisasi: **gratis 1 bulan** sejak didaftarkan. Contoh: daftar 2 Jan 2026 → gratis sampai 1 Feb 2026.
- Setelah itu, untuk tetap bisa mencatat pembayaran, pengeluaran, dan pengingat, acara harus diaktifkan dengan **Rp25.000 per 12 bulan**. Contoh: bayar pada 2 Feb 2026 → aktif sampai 2 Feb 2027.
- **Acara kedua dan seterusnya:** langsung Rp25.000 per 12 bulan, tanpa bulan gratis.
- **Lewat masa aktif:** acara **baca-saja**. Data, laporan, CSV, dan LPJ tetap bisa dilihat; acara bisa diperpanjang Rp25.000 untuk 12 bulan lagi.
- **Pembayaran menunggu DOKU platform aktif.** Batch ini tidak membuat alur bayar. Tombol aktivasi tampil nonaktif dengan keterangan "Pembayaran QRIS segera tersedia".
- Organisasi Kepanitiaan **tidak** memakai uji coba tenant 15 hari. Anggota, pengumuman, agenda, dan penyusunan acara/RAB/dokumen tetap jalan tanpa batas waktu.

## Yang dikunci saat acara belum aktif atau lewat masa
Penjaga ada di database, jadi aplikasi tidak bisa melewatinya. Yang ditolak:
- pemasukan dan pengeluaran yang bertaut ke acara itu (tambah, ubah, hapus);
- iuran acara: menerbitkan, serta mengubah nominal, anggota, atau acaranya;
- pembayaran baru untuk iuran acara itu (transfer anggota maupun tunai).

Tetap boleh:
- verifikasi pembayaran yang sudah diajukan;
- membatalkan iuran;
- menyusun dan mengubah acara, RAB, dan dokumen;
- semua yang tidak bertaut acara.

## Aturan executor
- Sama dengan `PANITIA-2.md` § Aturan executor.
- **Jangan** membuat Edge Function pembayaran atau mengubah alur pembayaran langganan yang ada.

---

## HARGA.1 — Migration masa aktif acara
- Salin **persis** dengan `cp`: `docs/handoff/assets/PANITIA-HARGA/program_access.sql` → `supabase/migrations/202610220003_program_access.sql`. Migration ini harus berjalan **setelah** `202610220001_program_dues.sql` (memakai `billing_items.program_id`). Claude sudah dry-run (lulus).
- Test `supabase/tests/program_access_matrix.sql` (aturan fixture seperti test PANITIA sebelumnya; perlu jabatan dengan `manage_expenses`, `generate_billing`, `manage_billing_transfer`, `manage_programs`):
  - **H1.** Tenant `panitia` baru langsung `tenant_subscriptions.status = 'active'`. Tenant `rt_rw` baru tetap `trial`.
  - **H2.** Acara pertama: `is_free_trial = true`, `access_until` ±1 bulan dari sekarang. Acara kedua yang dikirim dengan `access_until` 5 tahun dan `is_free_trial = true` tetap tersimpan `access_until = NULL`, `is_free_trial = false`.
  - **H3.** Pengelola tidak bisa mengubah `access_until` (`insufficient_privilege`), tetapi bisa mengubah nama.
  - **H4.**
    - pengeluaran acara 1 diterima;
    - pengeluaran dan pemasukan acara 2 ditolak;
    - pos RAB acara 2 diterima;
    - pengeluaran tanpa acara diterima.
  - **H5.** Iuran acara 2 ditolak. Iuran acara 1 diterima, dan anggota bisa mengajukan transfer.
  - **H6.** Setelah `access_until` acara 1 dimundurkan ke kemarin (sebagai postgres):
    - mengubah pengeluaran acara 1 ditolak;
    - mengubah nominal iuran ditolak;
    - pembayaran tunai baru ditolak;
    - verifikasi pembayaran yang sudah diajukan (update `payments` + `billing_items.status = 'paid'`) **berhasil**.
  - **H7.** `extend_program_access` oleh `authenticated` ditolak. Oleh `service_role` berhasil, dengan masa aktif ±12 bulan dari sekarang, lalu `program_is_writable` = true.
  - **H8.** Acara ketiga tidak mendapat jatah gratis. **H9.** Acara milik tenant `rt_rw` tetap `program_is_writable` = true.
  - **H10 (backfill).** Ketentuan backfill: acara tertua tiap tenant `panitia` yang sudah ada sebelum migration mendapat `is_free_trial` dan `access_until = created_at + 1 bulan`. Kasus ini cukup dijelaskan dalam komentar test, karena hanya terjadi saat migration pertama kali dipasang.
- Commit: `feat(panitia): HARGA.1 migration masa aktif per acara`

## HARGA.2 — Status masa aktif di service
- `config/panitiaPricing.js`: `PANITIA_PRICING = { freeTrialMonths: 1, pricePerProgram: 25000, periodMonths: 12 }`.
- `services/tenant/programs.js`:
  - `fetchPrograms`, `fetchProgram`, dan `fetchProgramsOverview` mengembalikan `access_until` dan `is_free_trial`, ditambah alias camelCase;
  - fungsi murni `getProgramAccessState(program, { tenantType, now = new Date() })` → `{ state, until, writable }`:
    - `tenantType !== 'panitia'` → `unlimited`, writable;
    - `access_until` lewat atau null dan `is_free_trial` → `expired`;
    - null dan bukan gratis → `inactive`;
    - masa depan + `is_free_trial` → `free_trial`;
    - masa depan + bukan gratis → `active`;
  - fungsi murni `formatProgramAccessLabel(stateObj)`: "Gratis sampai 1 Feb 2026", "Aktif sampai 2 Feb 2027", "Belum aktif", atau "Masa aktif habis 1 Feb 2026". Tanggal WIB.
- Pesan error dari penjaga database (teks "Acara belum aktif atau masa aktifnya habis…") diteruskan apa adanya ke toast.
- Test (independen zona waktu):
  - kelima state;
  - batas tepat pada `access_until`;
  - label;
  - `fetchPrograms` demo membawa field masa aktif.
  - Mode demo: acara demo pertama tenant panitia diberi `is_free_trial` + 1 bulan, dan acara berikutnya `inactive`, meniru server.
- Commit: `feat(panitia): HARGA.2 status masa aktif acara`

## HARGA.3 — Penguncian di tampilan
- Kartu acara (`Programs.jsx`, `PanitiaDashboard.jsx`) dan header `ProgramDetail`: badge masa aktif dari `formatProgramAccessLabel`. Warna: hijau aktif, biru gratis, abu belum aktif, merah habis.
- Bila `!writable`:
  - `ProgramDetail`:
    - tombol "Catat Pemasukan", "Catat Pengeluaran", "Terbitkan Iuran", "Catat Tunai", "Ubah Nominal", dan "Ingatkan via WA" nonaktif;
    - tooltip/keterangan "Acara belum aktif / masa aktif habis — hanya bisa dilihat";
    - RAB, dokumen, edit acara, dan ekspor/LPJ tetap aktif;
  - `PanitiaDashboard` "Iuran Saya" dan banner iuran di `ProgramDetail`: tombol "Bayar" nonaktif dengan keterangan yang sama;
  - `TenantIncomes` dan `Expenses` (mode tenant): pilihan Acara untuk catatan **baru** hanya acara yang `writable`. Acara lain tampil nonaktif dengan "(belum aktif)" / "(masa aktif habis)". Membuka `?program=<id>&new=1` untuk acara tidak aktif menampilkan toast penjelasan dan tidak membuka form.
- Test:
  - tombol transaksi nonaktif untuk acara `inactive` dan aktif untuk `free_trial`;
  - dropdown acara di form pemasukan menonaktifkan acara `expired`.
- Commit: `feat(panitia): HARGA.3 kunci transaksi acara yang belum aktif`

## HARGA.4 — Aktivasi dan halaman paket Kepanitiaan
- `ProgramDetail`, khusus pengelola (`canManagePrograms`): panel "Masa aktif acara".
  - Isi: status, tanggal, harga "Rp25.000 / 12 bulan", dan tombol **"Aktifkan / Perpanjang"** nonaktif dengan keterangan "Pembayaran QRIS segera tersedia".
  - Untuk acara gratis: "Gratis sampai {tanggal}. Setelah itu aktifkan Rp25.000 / 12 bulan."
- `pages/account/ChoosePlan.jsx` (panitia): ganti pemberitahuan "segera tersedia" dengan penjelasan model:
  - acara pertama gratis 1 bulan;
  - Rp25.000 per acara per 12 bulan;
  - acara lewat masa menjadi baca-saja;
  - pembayaran per acara dari halaman detail acara.
  - Tanpa kalkulator blok.
- `pages/account/SubscriptionStatus.jsx` (panitia):
  - kartu langganan tenant menampilkan "Organisasi aktif (tanpa batas waktu)";
  - daftar acara dengan badge masa aktif menggantikan hitungan "acara aktif".
- `components/TrialCountdownBanner.jsx`: tidak tampil untuk tenant `panitia`. Langganan tenant mereka selalu `active`, dan `trial_ends_at` lama tidak boleh memicu banner "mode baca-saja".
- Test:
  - ChoosePlan panitia menampilkan "Rp25.000" dan "gratis 1 bulan" tanpa kalkulator;
  - TrialCountdownBanner tidak dirender untuk panitia dengan `trial_ends_at` lampau;
  - RT/RW tetap seperti sebelumnya.
- Commit: `feat(panitia): HARGA.4 aktivasi acara dan halaman paket kepanitiaan`

## Di luar lingkup
- Pembayaran QRIS per acara: Edge Function yang memanggil `extend_program_access`. Menunggu merchant DOKU platform (lihat BACKLOG), batch sendiri.

## Definition of Done
- `docs/handoff/PANITIA-HARGA-report.md` (hash commit, nama file persis, ringkasan vitest apa adanya).
- `npx vitest run` (seluruh suite), `npm run lint`, dan `npm run build` hijau.
- Claude: review, lalu menerapkan HARGA.1 ke dev (setelah PANITIA-2.1), lalu lapor.
