# AUDIT-KOS-SAAS — Apakah vertikal Kos/Kontrakan sudah layak disebut SaaS manajemen usaha kos?

Tanggal: 2026-10-27. Penulis: Claude (sudut pandang CTO, PM, arsitek). Dasar: kode di `main` (`bf51bf1`) dan data dev.
Status: **usulan, menunggu prioritas user.** Belum ada task yang diterbitkan.

## 1. Kesimpulan singkat
**Fondasinya sudah benar, tetapi belum "wajib punya".** Siklus inti sudah lengkap dan rapi: kamar → kontrak → tagihan otomatis → bukti bayar → verifikasi → laporan. Ini sudah lebih baik daripada buku tulis atau Excel.

Namun tiga hal yang paling sering membuat pemilik kos pusing belum diselesaikan:
1. **menagih penyewa yang telat** (pengingat masih manual, denda belum ada);
2. **kontrakan tahunan** (tagihan hanya bulanan);
3. **uang jaminan / deposit** (hanya ditulis di catatan).

Tanpa ketiganya, pemilik akan tetap memakai WhatsApp dan Excel di samping aplikasi. Itu tanda produk belum lengket.

## 2. Yang sudah ada (kekuatan)
| Area | Fitur | Catatan |
|---|---|---|
| Kamar | Daftar kamar, status terisi/kosong otomatis dari kontrak, fasilitas, harga default | Sinkron di database (trigger) |
| Kontrak | Kontrak master per penyewa + kamar; satu kontrak aktif per kamar; durasi bulanan/tetap; checkout | KOS-2/2F |
| Tagihan | Terbit otomatis tiap malam sesuai tanggal masuk; anti-geser akhir bulan; prorata opsional; add-on per kontrak dengan rincian | KOS-2/3/4 |
| Pembayaran | Penyewa unggah bukti; pengurus verifikasi; catat tunai/transfer; matriks pembayaran | Manual (bukan QRIS), sesuai keputusan |
| Penagihan | Tombol pengingat WhatsApp (manual) | `utils/waReminder` |
| Keuangan | Pemasukan, pengeluaran, laporan | Umum untuk semua tipe tenant |
| Penyewa | Gabung lewat kode undangan, persetujuan, portal penyewa melihat tagihannya | |
| Staf | Peran dan izin (penjaga kos, bendahara) | RBAC v2, RBAC-UI-1 |
| Pemasaran | Katalog publik ala marketplace, WhatsApp, iklan otomatis saat kamar kosong | LIST-UI-1, LIST-AUTO-1 |
| Platform | Langganan per tenant, PWA | Dompet menyusul (WALLET-1) |

## 3. Celah dibanding kebutuhan nyata pemilik kos/kontrakan
Diurutkan dari dampak terbesar terhadap alasan orang mau membayar.

| # | Celah | Kenapa penting | Kondisi sekarang |
|---|---|---|---|
| G1 | **Pengingat otomatis + tunggakan + denda** | Masalah nomor satu pemilik kos adalah menagih. Pengingat H-3 / H0 / H+3 dan denda keterlambatan menghemat waktu dan canggung. | Pengingat WA hanya manual per tagihan. Kolom `late_fee` ada, tetapi tagihan kontrak selalu 0. Belum ada daftar umur tunggakan. |
| G2 | **Periode bayar fleksibel** (bulanan, 3, 6, 12 bulan di muka) | Kontrakan umumnya disewa **tahunan**; sebagian kos menerima bayar per 3/6 bulan dengan potongan. | Siklus hanya bulanan. Template sudah bernama "Kos-kosan & Kontrakan", tetapi alurnya belum mendukung kontrakan. |
| G3 | **Deposit / uang jaminan** | Hampir semua kos memungut deposit, lalu mengembalikannya saat keluar dengan potongan kerusakan. Ini sumber sengketa. | Hanya teks di catatan kontrak dan checkout. |
| G4 | **Kwitansi digital** | Penyewa (dan orang tua mahasiswa) meminta bukti bayar resmi. Pemilik tampak profesional. | Belum ada kwitansi tagihan sewa (yang ada hanya untuk pengeluaran). |
| G5 | **Pengingat kontrak berakhir + perpanjangan** | Kamar kosong = kehilangan uang. Peringatan "kontrak Kamar 3 berakhir 30 hari lagi", lalu tanya perpanjang atau pasang iklan. | Tidak ada. LIST-AUTO-1 baru bereaksi setelah kamar kosong. |
| G6 | **Data penghuni + dokumen kontrak** | KTP, nomor darurat, pekerjaan/kampus, plat kendaraan; wajib lapor RT/RW untuk penghuni baru; surat perjanjian sewa yang bisa dicetak atau ditandatangani. | Hanya nama dan akun. Tidak ada surat perjanjian. |
| G7 | **Tagihan utilitas variabel** (listrik/air meteran per kamar) | Banyak kos menagih listrik sesuai pemakaian; add-on sekarang hanya nominal tetap. | Belum ada catat meteran atau tagihan variabel. |
| G8 | **Keluhan & perbaikan** | "AC kamar 5 bocor" lewat WA mudah tenggelam. Tiket keluhan dengan status membuat penyewa betah. | Tidak ada. |
| G9 | **Dashboard pemilik** | Tingkat hunian, pendapatan bulan ini vs potensi, total tunggakan, kontrak akan berakhir, dalam satu layar. Untuk pemilik dengan beberapa properti: ringkasan gabungan. | Dashboard umum; belum ada metrik khas kos dan tampilan portofolio. |
| G10 | **Calon penyewa (booking)** | Dari klik WhatsApp iklan → survei → booking/DP → kontrak. Pemilik tahu iklan mana yang menghasilkan. | Iklan berakhir di WhatsApp; tidak tercatat. |
| G11 | **Laporan pajak sewa** | Pendapatan sewa properti kena PPh final; pemilik butuh rekap tahunan per properti. | Laporan umum; belum ada rekap sewa per tahun siap ekspor. |

## 4. Usulan prioritas (paket "wajib punya")
**Tahap 1 — "Tagih tanpa capek"** (alasan utama orang membayar)
1. **G1** Pengingat otomatis terjadwal + daftar tunggakan + denda keterlambatan (aturan di Aturan Kontrak Sewa: nominal tetap per hari atau persen, maks. sekian).
   Pilihan kanal pengingat:
   - (a) notifikasi PWA + email: gratis;
   - (b) tombol "kirim semua pengingat" yang membuka WA satu per satu: gratis;
   - (c) WhatsApp API otomatis: berbayar, cocok jadi fitur paket atas.
2. **G4** Kwitansi digital otomatis saat pembayaran diverifikasi (halaman/tautan + unduh PDF, nomor kwitansi berurutan).
3. **G2** Periode bayar 1/3/6/12 bulan di kontrak (untuk kontrakan tahunan dan diskon bayar di muka).

**Tahap 2 — "Kamar tidak pernah lama kosong"**
4. **G5** Peringatan kontrak berakhir (H-30/H-7) + tombol perpanjang atau iklankan (menyambung LIST-AUTO-1).
5. **G3** Deposit: catat saat kontrak, kembalikan saat checkout dengan potongan dan alasan; masuk laporan.
6. **G9** Dashboard pemilik: hunian, pendapatan, tunggakan, kontrak berakhir; ringkasan gabungan untuk banyak properti.

**Tahap 3 — "Penyewa betah, pemilik tenang"**
7. **G6** Data penghuni + surat perjanjian sewa (template, cetak PDF; tanda tangan digital nanti).
8. **G8** Keluhan & perbaikan.
9. **G7** Tagihan listrik/air dari meteran.
10. **G10** Pipeline calon penyewa; **G11** rekap pajak sewa tahunan.

## 5. Posisi produk & harga (usulan CTO/PM)
- **Pesan utama:** "Tagihan sewa terbit dan diingatkan otomatis, Anda tahu siapa yang menunggak, kamar kosong langsung terpasang iklan."
- **Pembeda dari aplikasi umum:** fokus pemilik kecil–menengah (5–50 kamar), bahasa sehari-hari, tanpa wajib payment gateway (cocok dengan kebiasaan transfer manual), plus marketplace iklan bawaan.
- **Harga:** berdasarkan jumlah kamar (mis. gratis s.d. 3–5 kamar untuk akuisisi, lalu bertingkat). Fitur berbiaya nyata (WhatsApp API, iklan unggulan) dibayar dari **Dompet RuangWarga**.
- **Ukuran keberhasilan:**
  - persentase tagihan lunas sebelum jatuh tempo;
  - rata-rata hari kamar kosong;
  - pemilik aktif mingguan;
  - konversi trial → berbayar.

## 6. Risiko dan catatan
- WhatsApp API resmi berbayar per pesan dan butuh verifikasi bisnis; mulai dari kanal gratis.
- Data KTP adalah data pribadi (UU PDP): simpan terenkripsi atau terbatas, akses hanya pemilik/izin khusus, ada masa simpan.
- Periode bayar 3/6/12 bulan mengubah mesin tagihan (rumus periode, prorata, add-on), jadi perlu desain dan test yang teliti seperti KOS-2.
