# KOS-1 Review (Claude, 2026-10-21)

Hasil: **diterima**, dengan dua perbaikan kecil oleh Claude. KOS-1.4a sudah terpasang di Supabase dev.

## Verifikasi di cloud Claude
- `npm run lint`: bersih. `npm run build`: sukses.
- `npx vitest run` (`VITE_DEMO_MODE=false`):
  - sebelum perbaikan: 1061/1062 lolos;
  - sesudah: **76 file, 1062/1062 lolos**.

## Yang dicek per task
- **1.1**:
  - `shouldAskOccupancy` / `getJoinableUnits` sesuai rencana;
  - "Status Tinggal" hanya untuk RT/RW, tenant lain mengirim `tenant`;
  - label "Pilih {unitLabel}";
  - kamar `occupied` / `inactive` tidak ditawarkan.
- **1.2**: `getOccupancyOptions` memakai nilai yang sudah ada (`tenant`, `booking`, `checkout`, `owner_occupied`) dengan label per jenis tenant. Filter dan form ubah di Residents memakainya.
- **1.5**:
  - `getMemberStatusBadge` memakai `status` (Aktif / Menunggu persetujuan / Ditolak), dengan fallback `is_active` untuk mode legacy;
  - banner "pendaftar menunggu" hanya untuk `canManageMembers`;
  - anggota pending menampilkan "Calon {memberLabel}" dan tautan "Tinjau & Setujui".
- **1.3**:
  - `createTenantUnit` / `updateTenantUnit` menggabungkan harga dan fasilitas ke metadata tanpa menghapus kontrak atau penghuni;
  - halaman Kamar (khusus Kos) punya isian harga dan fasilitas, dan kamar baru Kos/Kelas berstatus `vacant`;
  - wizard punya harga per baris.
- **1.4a**: fungsi `SECURITY DEFINER` baca-saja, hanya baris `auth.uid()` berstatus pending/rejected. `anon` dicabut.
- **1.4b**: `fetchMyJoinRequests` aman bila RPC belum ada (mengembalikan `[]`). `joinRequests` di context. Kartu "Permohonan Bergabung" di Beranda dan Layanan Saya.

## Perbaikan oleh Claude
1. `services/tenantOperationalService.exports.test.js` (penjaga ekspor DEBT-1.4) gagal, karena KOS-1 menambah ekspor `fetchMyJoinRequests`, `validateFacilities`, dan `validateRentPrice`. Ketiganya dimasukkan ke daftar, dan jumlahnya 83 → 86.
2. `supabase/tests/my_join_requests_matrix.sql` memberi UUID ke `tenant_units.id`, padahal kolomnya bigint, sehingga test gagal di tahap setup. Diubah menjadi `RETURNING id INTO v_unit_x_id` (BIGINT).

## Penerapan KOS-1.4a ke dev
- Dijalankan Claude lewat konektor Supabase. `CREATE OR REPLACE` tanpa `DROP` tidak memicu konfirmasi.
  1. Dry-run lebih dulu: migration ditambah test, diakhiri pembatalan paksa → lulus, lalu dipastikan tidak ada yang tertinggal.
  2. Penerapan: migration, lalu test sebagai penjaga di sub-transaksi (data uji selalu dibuang; bila gagal, seluruh transaksi batal), lalu catatan riwayat.
- Hasil:
  - `get_my_join_requests()` ada; `anon` tidak boleh, `authenticated` boleh;
  - 0 sisa data uji, jumlah tenant tetap;
  - riwayat `20261021052303 my_join_requests`.

## Catatan untuk executor
- Deskripsi KOS-1.1 dan KOS-1.2 di `KOS-1-report.md` tidak cocok dengan kodenya. Laporan menyebut nama fungsi dan nilai yang tidak ada (`getJoinUnitLabel`, `validateJoinForm`, `kos_penghuni`, "nomor kamar opsional"). Kodenya sendiri benar. Laporan harus ditulis dari diff yang sebenarnya.
- Selalu jalankan **seluruh** suite sebelum menulis laporan. Test penjaga ekspor hanya gagal di suite penuh.
- Test SQL: cek tipe kolom di skema (`tenant_units.id` bigint) sebelum menulis fixture.

## Belum diuji
- Uji manual di ruangwarga-dev setelah digabung ke `main`:
  - form daftar Kos;
  - Daftar Penyewa: badge dan banner;
  - harga dan fasilitas di halaman Kamar;
  - akun pendaftar melihat "Permohonan Bergabung" di Beranda.
