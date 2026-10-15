# Requirement: Pendalaman vertikal RuangWarga

Status: **kumpulan ide, belum dijadwalkan** (diskusi user dan Claude, 2026-10-15).
Setiap vertikal akan dipecah menjadi plan dan batch task tersendiri saat gilirannya tiba (lihat "Urutan").

## Prinsip yang berlaku untuk semua vertikal
- Backend **Supabase saja** (RLS, RPC, Edge Function). **n8n tidak disentuh dan tidak dipakai.**
- File (foto, bukti, dokumen) disimpan di **Cloudflare R2** lewat `storage-upload` / `storage-sign-url`.
- Uang milik tenant **tidak pernah lewat platform**. Pembayaran ke tenant memakai rekening tenant sendiri (transfer/tunai + bukti + verifikasi). QRIS per tenant hanya sebagai fitur premium kelak, dengan merchant DOKU milik tenant.
- Isolasi data per tenant dijaga RLS, dan setiap jabatan diatur lewat izin RBAC v2 (`tenant_roles`, `tenant_role_permissions`).
- Warga, penyewa, peserta, dan siswa **tidak diblokir** membuka layanan sendiri, karena mereka calon pelanggan (NAV-1).

---

## 1. RT/RW (prioritas pertama, Palm Village adalah pelanggan pertama)
Yang sedang dikerjakan: RTRW-2 (kelola warga, unit dan penghuni, pengaturan, SetupWizard, jabatan) dan RTRW-3 (pengumuman dan acara).

| Prioritas | Fitur | Catatan |
|---|---|---|
| P1 | **Surat pengantar RT online** | Warga mengajukan (domisili, SKCK, nikah, dll.), ketua menyetujui, lalu terbit PDF bernomor dengan QR verifikasi. Fitur pembeda yang kuat. |
| P1 | **Iuran non-IPL dan sumbangan** | Contoh: 17-an, takziah, pembangunan. Ada target, progres, dan daftar penyumbang (boleh anonim). |
| P1 | **Pengingat tunggakan via WA** | Tombol `wa.me` dengan pesan siap kirim, gratis tanpa API. Daftar tunggakan per rumah. |
| P2 | **Data kependudukan per rumah** | KK, anggota keluarga, status tinggal (tetap/kontrak/kos), lapor tamu menginap 1×24 jam. Data pribadi, jadi akses dibatasi ketat. |
| P2 | **Pengaduan/aspirasi warga** | Foto, status tindak lanjut, dan notifikasi ke pelapor |
| P2 | **Jadwal ronda/siskamling dan piket** | Rotasi otomatis per rumah dan pengingat |
| P3 | **Polling/musyawarah online** | Satu suara per rumah, hasil transparan |
| P3 | **Papan transparansi kas** | Ringkasan pemasukan dan pengeluaran untuk warga (sudah ada sebagian di "Matriks Transparansi") |

Template jabatan RT/RW (RTRW-2.6): Ketua, Sekretaris, Bendahara, Koordinator Blok, dan Warga.

---

## 2. Kos / Kontrakan (vertikal kedua; paling cepat menghasilkan pemasukan)
**Masalah pemilik:** tunggakan sewa, kontrak berserakan, deposit, kamar kosong lama, dan biaya tambahan yang tercecer.

Aset yang sudah ada: `KosSetupWizard`, kamar = `tenant_units`, `billing_items.contract_start/contract_end`, RPC `checkout_kos_room` dan `auto_generate_kos_billing`, listing kamar publik (`public_listings`, `/listing/kos`).

| Prioritas | Fitur | Catatan |
|---|---|---|
| P1 | **Kontrak sewa per kamar** | Tanggal masuk, durasi (1/3/6/12 bulan), harga, deposit. Tagihan terbit otomatis per siklus (perlu `pg_cron`). |
| P1 | **Papan status kamar** | Terisi, kosong, booking, perbaikan. Dashboard tingkat hunian. |
| P1 | **Kamar kosong menjadi iklan dengan 1 klik** | Masuk ke direktori listing publik. Sumber **pendapatan iklan platform**. |
| P1 | **Pengingat jatuh tempo dan denda** | Tombol WA dan denda keterlambatan otomatis (opsional per tenant) |
| P2 | **Biaya tambahan per kamar** | Listrik (meteran/token), air, laundry, parkir. Variabel per bulan. |
| P2 | **Check-out dan pengembalian deposit** | Deposit dikurangi tunggakan dan kerusakan, dengan berita acara |
| P2 | **Tiket keluhan/perbaikan** | Foto ke R2, status, dan teknisi |
| P3 | **Multi-properti** | Dashboard gabungan untuk pemilik dengan beberapa kos |
| P3 | **Rekap pendapatan per kamar per tahun** | Bahan lapor pajak pemilik |

Template jabatan: Pemilik, Pengelola/Penjaga (catat tunai, check-in/out), Teknisi, Penyewa.
Monetisasi: per kamar per bulan (sesuai pricing blok yang ada), ditambah boost iklan listing.

---

## 3. Kelas (les, bimbel, kursus, TPA/TPQ, senam, komunitas hobi)
**Masalah pemilik:** iuran tidak teratur, presensi manual, honor pengajar dihitung manual, dan komunikasi ke orang tua.

Aset yang sudah ada: `KelasSetupWizard` (kuota siswa, jadwal SPP, rekening). Tagihan masih memakai modul umum.

| Prioritas | Fitur | Catatan |
|---|---|---|
| P1 | **Jadwal dan presensi per sesi** | Pengajar mencentang hadir, siswa atau wali melihat riwayat |
| P1 | **Model iuran fleksibel** | Bulanan (SPP), paket N pertemuan, per sesi, diskon saudara |
| P1 | **Akun wali murid** | Orang tua terhubung ke satu atau lebih anak, dan menerima tagihan serta info kehadiran. Anak tidak wajib punya akun. |
| P2 | **Rekap honor pengajar** | Berdasarkan sesi yang diajar, plus export |
| P2 | **Kuota dan daftar tunggu** | Pendaftaran lewat link publik |
| P3 | **Listing kelas publik** | Kategori listing baru, sumber pendapatan iklan |
| P3 | **Catatan perkembangan siswa** | Rapor sederhana |

Template jabatan: Pemilik/Admin, Pengajar, Bendahara, Wali Murid, Siswa.
Monetisasi: per siswa aktif per bulan.

---

## 4. Arisan (jalur akuisisi pengguna)
**Masalah pengelola:** kepercayaan pada kocokan, tagihan setoran, peserta yang menunggak setelah menang.
Kemauan membayar rendah, tetapi satu grup berisi 20–40 orang yang mengenal RuangWarga, jadi cocok sebagai paket gratis atau murah.

Aset yang sudah ada: `arisan_rounds`, `arisan_participants`, `ArisanRounds`, `ArisanDraw`, RPC `draw_arisan_winner`, `start_new_arisan_cycle`, dan `generate_arisan_round_bills`.

| Prioritas | Fitur | Catatan |
|---|---|---|
| P1 | **Kocokan transparan** | Hasil tercatat permanen (waktu, peserta yang eligible, pemenang), bisa dibagikan ke grup WA, dan tidak bisa diulang diam-diam |
| P1 | **Status setoran per putaran** | Siapa sudah/belum bayar, pengingat WA, aturan "belum lunas tidak ikut kocok" |
| P2 | **Multi-slot dan setengah slot** | Satu orang beberapa slot, atau patungan satu slot |
| P2 | **Tukar giliran** | Diajukan peserta dan disetujui ketua |
| P2 | **Bukti serah terima dana** | Foto ke R2 dan konfirmasi penerima |
| P3 | **Rekap per peserta** | Total setor dibanding total terima |

Template jabatan: Ketua/Pengelola, Bendahara, Peserta.
Catatan: tidak mendukung arisan berbunga/menurun berbasis lelang, untuk menghindari unsur bunga dan perjudian.

---

## 5. Fitur lintas vertikal (sekali bangun, dipakai semua)
| Prioritas | Fitur | Catatan |
|---|---|---|
| P1 | **Tombol "Ingatkan via WA"** | Link `wa.me` dengan template pesan per vertikal. Gratis. |
| P1 | **Tagihan otomatis terjadwal** | `pg_cron` memanggil RPC atau Edge Function per tenant (sudah ada di BACKLOG) |
| P1 | **Template jabatan per vertikal** | Dibuat dari aplikasi, tetap bisa diubah tenant |
| P2 | **Kuitansi digital PDF + QR verifikasi** | Sudah ada sebagian (`receiptService`) |
| P2 | **Export Excel/CSV laporan** | |
| P3 | **QRIS otomatis per tenant** | Merchant DOKU milik tenant, fitur premium |
| P3 | **Notifikasi email transaksional** | Lewat Edge Function dan penyedia email, bukan n8n |

---

## Urutan
1. **RT/RW**: RTRW-2 (termasuk 2.6 Jabatan), lalu RTRW-3 (Pengumuman & Acara), lalu fitur P1 RT/RW di atas.
2. **Audit Kos/Arisan/Kelas** di mode non-demo (seperti `AUDIT-RTRW.md`) sebelum membangun fitur baru.
3. **Kos**, lalu **Kelas**, lalu **Arisan**.
4. Fitur lintas vertikal P1 dikerjakan begitu dibutuhkan vertikal yang sedang digarap.
