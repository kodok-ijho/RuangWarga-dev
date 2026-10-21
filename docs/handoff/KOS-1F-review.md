# KOS-1F Review (Claude, 2026-10-21)

Hasil: **diterima**, dengan satu perbaikan test SQL oleh Claude. KOS-1F.6a sudah terpasang di Supabase dev.

## Verifikasi di cloud Claude
- `npm run lint`: bersih. `npm run build`: sukses.
- `npx vitest run` (`VITE_DEMO_MODE=false`): **78 file, 1080/1080 lolos**. Angkanya sama dengan laporan agy.

## Yang dicek per task
- **1F.1**:
  - banner trial berjalan hanya untuk `isTenantAdmin`;
  - banner baca-saja tetap tampil untuk semua, dengan teks khusus anggota ("Hubungi pengelola") dan tanpa tombol.
- **1F.2**:
  - `formatUnitName` menghindari "Kamar Kamar VIP";
  - nilai yang dikirim selalu teks (`tenant_units.label` atau `Blok x No. y`), jadi aman.
- **1F.3**: "Rincian & QRIS" hanya bila `isLegacyQrisEnabled`; selain itu "Rincian & cara bayar".
- **1F.4**:
  - `activeMember` / `isBaseRole` di context;
  - `displayRoleName` untuk label peran;
  - sapaan memakai nama anggota, lalu profil, lalu email.
- **1F.5**:
  - `countOccupiedUnits`: RT/RW tetap memakai `active` / `is_occupied`;
  - Kos/Kelas/Arisan: kamar terisi bila `occupied` atau ada anggota approved di kamar itu;
  - kamar `inactive` tidak dihitung.
- **1F.6a**:
  - migration identik dengan spesifikasi yang sudah di-dry-run Claude;
  - trigger hanya untuk tenant `kos`, hanya mengisi kamar `vacant` / `active`, dan tidak menimpa penyewa tercatat;
  - fungsi dicabut dari `PUBLIC`, `anon`, dan `authenticated`.
- **1F.6b**:
  - modal sukses dengan tombol "Atur Kontrak" ke matriks pembayaran;
  - badge "Belum ada kontrak" untuk kamar `occupied` tanpa `contract_start`.

## Perbaikan oleh Claude
`supabase/tests/kos_room_occupancy_matrix.sql` kasus 5 akan gagal di database:
1. `checkout_kos_room` dipanggil tanpa konteks, sehingga ditolak "Akses ditolak" (butuh `service_role` atau `manage_members`). Ditambah `set_config('request.jwt.claims', '{"role":"service_role"}', true)`.
2. Persetujuan ulang memakai anggota 2. Padahal `unit_id` anggota 2 masih Kamar A (checkout hanya melepas penyewa tercatat, yaitu anggota 1), jadi `unit_id` tidak berubah dan trigger tidak berjalan. Diganti anggota 3, yang dipindah dari Kamar B (nonaktif) ke Kamar A.

## Penerapan KOS-1F.6a ke dev
- Dijalankan Claude lewat konektor Supabase dalam satu transaksi:
  1. migration (tanpa `DROP TRIGGER IF EXISTS`, karena trigger belum ada);
  2. test kasus 1–5 sebagai penjaga di sub-transaksi (data uji selalu dibuang; bila gagal, seluruh transaksi batal);
  3. catatan riwayat.
- Hasil:
  - trigger `trg_sync_kos_room_occupancy` ada; `anon` dan `authenticated` tidak boleh mengeksekusi fungsinya;
  - backfill: **Kamar VIP sekarang `occupied` atas nama Toro**; 0 kandidat tersisa;
  - 0 sisa data uji, jumlah tenant tetap;
  - riwayat `20261021082003 kos_room_occupancy_on_approval`.

## Tindak lanjut (belum dikerjakan)
- **Dua penyewa di satu kamar.** Checkout hanya melepas penyewa tercatat. Penyewa kedua masih approved dengan `unit_id` kamar itu, jadi dashboard (1F.5) tetap menghitung kamar terisi walaupun statusnya `vacant`.
- **Pindah kamar.** Bila `unit_id` anggota approved diganti, kamar baru menjadi `occupied`, tetapi kamar lama tidak otomatis dikosongkan. Saat ini pengosongan harus lewat checkout.
- Template jabatan per vertikal (dari audit) masih terbuka.

## Belum diuji
- Uji manual di ruangwarga-dev setelah digabung ke `main`:
  - login Toro: tanpa banner trial, "Kamar VIP" (bukan "Kamar Kamar VIP"), sapaan dengan nama, tombol "Rincian & cara bayar";
  - login pemilik: dashboard menghitung 1 kamar terisi;
  - setujui pendaftar baru: muncul modal "Atur Kontrak", kamar langsung terisi, dan badge "Belum ada kontrak" tampil di halaman Kamar.
