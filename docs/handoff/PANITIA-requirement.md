# Requirement: Vertikal Kepanitiaan & Acara

Status: ✅ disetujui user 2026-10-21.

Vertikal ini **menggantikan Kelas** (SPP) di pilihan pendaftaran tenant. Contoh pengguna: panitia PenSi (Pentas Seni), School Expo, OSIS/BEM, karang taruna, panitia 17-an, komunitas, dan kegiatan rumah ibadah.

## Masalah pengguna
- Uang acara tercatat di buku, spreadsheet, atau chat. Sulit dicocokkan dengan nota.
- Anggaran (RAB) dibuat di awal, tetapi realisasinya tidak pernah dibandingkan.
- Laporan pertanggungjawaban (LPJ) disusun manual di akhir acara.
- Dokumen (proposal, RAB, rundown/blueprint, surat, LPJ) tersebar di banyak tempat.
- Iuran panitia ditagih lewat chat, dan sulit tahu siapa yang sudah membayar.

## Keputusan user (2026-10-21)
1. **Satu tenant = organisasi**, dengan banyak acara. Contoh: OSIS SMA X mengelola PenSi, School Expo, dan lainnya. Tiap acara punya anggaran, transaksi, dan laporan sendiri.
2. **Kelas diganti Kepanitiaan.** Pilihan "Kelas" hilang dari pendaftaran tenant. Di dev belum ada tenant Kelas.
3. **Pengeluaran langsung dicatat bendahara**, dengan nota. Tidak ada alur pengajuan dan persetujuan dana.
4. **Pemasukan dicatat manual** (sponsor, donatur, tiket, dana organisasi), **dan iuran panitia bisa ditagih** lewat modul tagihan.
5. **Harga per acara** (diperjelas 2026-10-22): acara pertama gratis 1 bulan, lalu Rp25.000 per acara per 12 bulan; acara kedua dst langsung Rp25.000 per 12 bulan; lewat masa aktif = baca-saja dan bisa diperpanjang. Tenant Kepanitiaan tidak memakai uji coba tenant. Pembayaran menunggu DOKU platform.

## Peran
- **Ketua** (owner): mengelola semuanya.
- **Wakil Ketua**, **Sekretaris**: mengelola acara dan anggaran, anggota, serta pengumuman.
- **Bendahara**: anggaran, pemasukan, pengeluaran, iuran, dan laporan.
- **Koordinator Seksi**: melihat laporan.
- **Anggota Panitia** (jabatan dasar): melihat acara, anggaran, dan transaksi. Ini untuk transparansi; data keuangan memang sudah terbaca semua anggota sekarang.

## Fitur dan batch
| Batch | Fitur |
|---|---|
| **PANITIA-1** | Jenis tenant dan setup; daftar acara (status: perencanaan, berjalan, selesai, arsip); **anggaran/RAB** per acara (pos pemasukan dan pengeluaran per seksi, jumlah × harga satuan); **pemasukan dan pengeluaran** yang ditautkan ke acara dan pos anggaran; **laporan per acara** (rencana vs realisasi per seksi, saldo); unduh CSV dan cetak; template jabatan; halaman Pemasukan yang juga dipakai RT/RW dan Kos. |
| **PANITIA-2** | **Iuran panitia**: tagihan per anggota per acara (nominal sama, bisa diubah per orang), tanpa unit, lewat transfer + bukti atau tunai, dengan verifikasi bendahara. Pembayaran masuk realisasi acara. Lihat `PANITIA-2.md`. |
| **PANITIA-3** | **Dokumen acara** (proposal, RAB, rundown/blueprint, surat, LPJ) di R2, dan **LPJ** siap cetak. Lihat `PANITIA-3.md`. |
| **PANITIA-HARGA** | Masa aktif per acara dan penguncian transaksi acara yang belum aktif / lewat masa. Pembayaran QRIS menyusul saat DOKU platform aktif. Lihat `PANITIA-HARGA.md`. |
| Nanti | Penjualan tiket online, listing acara publik, pengajuan dana per seksi, beberapa rekening per acara. |

## Catatan teknis
- Acara dan RAB disimpan di tabel baru `tenant_programs` dan `program_budget_items`. Keduanya tidak terikat jenis tenant, jadi RT/RW (misalnya panitia 17-an) bisa memakainya kelak.
- Pemasukan dan pengeluaran memakai tabel yang sudah ada (`non_ipl_incomes`, `expenses`), ditambah kolom opsional `program_id` dan `budget_item_id`. Laporan kas organisasi yang sudah ada otomatis ikut menghitungnya.
- Tabel `tenant_events` (agenda/acara RT/RW dari RTRW-3) tetap ada. Di tenant Kepanitiaan, menunya diberi label "Agenda" supaya tidak tertukar dengan "Acara".
- Kode Kelas (wizard, cabang SPP) dibiarkan tidak terpakai dulu. Penghapusannya batch tersendiri, setelah dipastikan tidak ada tenant Kelas di produksi.
- Setelah PANITIA-HARGA, tenant Kepanitiaan tidak lagi menjadi baca-saja karena uji coba tenant; penguncian ada di tiap acara.
