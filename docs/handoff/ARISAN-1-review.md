# ARISAN-1 Review (Claude, 2026-10-22)

Hasil: **diterima dengan catatan**. Server sudah benar: kocokan final, hanya peserta lunas yang ikut, dan hasil tercatat permanen. Tampilan layar kocok masih punya dua bug menengah, yaitu daftar peserta dan hadiah Rp0. Keduanya masuk ke `PANITIA-ARISAN-1F.md` § F.1 dan perlu dikerjakan sebelum dipakai sungguhan.

## Verifikasi
- **Migration:**
  - `202610220004_arisan_transparent_draw.sql` identik byte dengan aset;
  - **sudah terpasang di dev** (riwayat `arisan_transparent_draw`);
  - penjaga A1–A6 dijalankan di sub-transaksi, dan data uji tidak tersisa;
  - `DROP TRIGGER IF EXISTS` diganti `CREATE OR REPLACE TRIGGER` karena MCP menolak perintah berisi DROP. Hasilnya sama, karena trigger belum ada sebelumnya.
- **Suite penuh:** lint bersih, build sukses, vitest 93 file / 1206 test lolos.

## Yang dicek
- **Embed:** `winner:winner_member_id(...)` dan `operator:drawn_by(...)` memakai bentuk kolom, sehingga valid dengan dua FK ke `tenant_members`.
- **`fetchArisanRoundBills`:** hanya mencocokkan `metadata->>round_id`; parameter periode sudah dibuang.
- **`fetchMyArisanBills`:** filter tenant, anggota, dan `type = 'arisan_contribution'`.
- **`getRoundContributionSummary`:** perhitungannya benar.
- **Teks WA:**
  - waktu dalam WIB;
  - ada daftar peserta yang ikut;
  - baris "Belum lunas …" hanya muncul bila ada yang dikecualikan;
  - ada kalimat "permanen".
- **Kocok:** konfirmasi sesuai spesifikasi, dan pemenang selalu dari RPC atau DB, bukan dipilih di klien. Operator diambil server dari `auth.uid()`.
- **Rute dan menu:**
  - `arisan/my` dijaga `isMember`;
  - "Setoran Saya" hanya tampil di tenant arisan;
  - modal bayar memakai ulang `MemberBillPayModal`.
- **Template jabatan:** `ROLE_TEMPLATES.arisan` sesuai spesifikasi, dan semua izin ada di `PLATFORM_PERMISSIONS`.

## Perbaikan oleh Claude
1. **`fetchArisanRoundBills`:**
   - Masalah: kode memilih `proof_file_path`, padahal kolom `payments` adalah `proof_url`. Query pembayaran gagal diam-diam, sehingga status pembayaran terakhir selalu kosong di mode Supabase.
   - Perbaikan: diganti `proof_url`.

## Temuan lain (→ `PANITIA-ARISAN-1F.md` § F.1–F.2)
- **Menengah: pemenang lama tampil "Ikut kocok".**
  - Daftar "Ikut kocok" di layar kocok dibangun dari status tagihan saja, sehingga pemenang putaran lalu yang sudah setor ikut tampil. Server mengecualikan mereka.
  - Angka di layar bisa berbeda dari hasil RPC.
  - Bila hanya pemenang lama yang lunas, tombol Kocok aktif lalu ditolak server.
- **Menengah: hadiah Rp0.** Hadiah tampil Rp0 setelah halaman dimuat ulang, di riwayat, di teks bagikan, dan di "Hasil kocok terakhir", karena kode membaca `pool_amount` sedangkan kolomnya `total_pool_amount`.
- **Ringan:**
  - label slot selalu "Peserta";
  - waktu kocok di kartu diambil dari jam perangkat;
  - judul teks WA "HASIL PENGUKURAN" (salah kata);
  - link "Riwayat Transparan" membuka tab arena.
- **Ringan, setoran:**
  - kartu dashboard menampilkan setoran terjauh, bukan terdekat;
  - kartu "Semua Setoran Lunas" tampil saat memuat atau error;
  - tombol WA tampil tanpa nomor HP;
  - "Salin semua" tidak menangani gagal salin;
  - link verifikasi tersembunyi untuk bendahara yang hanya punya izin tunai;
  - tagihan batal dianggap "Belum bayar".

## Catatan untuk executor
- **Fixture test tidak sama dengan bentuk data DB** (`pool_amount`, `slot_label`, snapshot berupa string). Akibatnya dua bug menengah di atas lolos test.
- **Alur kocok tidak teruji:** test kocok tidak pernah menekan tombol Kocok, jadi alur RPC → kartu hasil belum teruji.
- **Laporan tidak akurat:** laporan menyatakan semua query memakai nama kolom asli, padahal tidak (`proof_file_path`, `pool_amount`).
- **Perubahan tanpa penjelasan:** `components/ui/Modal.jsx` diubah (alias `isOpen`) tanpa dijelaskan.

## Uji manual (dev, buat tenant Arisan dengan 3 slot dan 3 anggota)
1. **Pengelola:** buat putaran, lalu terbitkan tagihan.
   - Satu anggota membayar sendiri dari "Setoran Saya" (transfer + bukti), lalu pengelola memverifikasinya.
   - Satu anggota ditandai lunas oleh pengelola.
2. **Rincian Iuran:**
   - status tiga peserta benar;
   - tombol WA hanya untuk yang belum bayar;
   - "Salin pengingat" berfungsi.
3. **Kocok:**
   - konfirmasi final muncul;
   - pemenang salah satu dari dua yang lunas;
   - bagikan ke WA membuka teks hasil.
4. **Riwayat Transparan:** daftar ikut / tidak ikut tampil.
   - Catat bila hadiah tampil Rp0 setelah halaman dimuat ulang; ini temuan F.1.
5. **Putaran kedua:** pemenang putaran 1 masih tampil di "Ikut kocok" (temuan F.1), tetapi server tidak akan memilihnya.
