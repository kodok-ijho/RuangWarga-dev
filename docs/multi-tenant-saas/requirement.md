# Requirement.md — Portal Warga Multi-Tenant SaaS

## 1. Latar Belakang

Portal Warga (repo: `kodok-ijho/PortalWarga`) saat ini adalah aplikasi manajemen paguyuban
perumahan single-tenant (satu instance Supabase = satu kompleks perumahan), dengan fitur inti:
manajemen warga, tagihan IPL, pembayaran QRIS, laporan keuangan, dan RBAC 4 role
(Admin, Bendahara, Pengurus, Warga).

Tujuan proyek ini adalah **mengubah Portal Warga menjadi platform SaaS multi-tenant**,
terinspirasi dari model bisnis SumoPod (PaaS container Indonesia): satu mesin/infrastruktur,
banyak "template" pemakaian yang dijual sebagai layanan berlangganan mandiri (self-serve).

Platform baru harus bisa melayani 4 jenis kelompok (vertikal) sekaligus:

1. **RT/RW & Koordinator Perumahan** — pengelolaan IPL (fitur yang sudah ada)
2. **Kos-kosan / Kontrakan** — pengelolaan sewa kamar/unit
3. **Arisan** — pengelolaan kontribusi & pengocokan giliran
4. **Kelas** (mis. iuran kelas sekolah/kursus) — pengelolaan iuran kelompok kecil

## 2. Tujuan Bisnis

- Mengubah PortalWarga dari aplikasi single-purpose menjadi **produk SaaS multi-vertikal**
- Memungkinkan **self-signup** tanpa approval manual dari pemilik platform
- Monetisasi melalui **model langganan berbasis blok kapasitas** (per 10 unit / per 5 unit)
- Mempertahankan seluruh fitur inti yang sudah berjalan di PortalWarga (matriks pembayaran,
  verifikasi transfer, laporan keuangan, RBAC, PWA) agar dapat dipakai lintas vertikal

## 3. Aktor & Peran

> **Catatan Revisi:** Tabel di bawah adalah versi **awal** (v1) yang menjadi dasar Phase
> 0–11 di `task.md` yang sudah diimplementasikan dan di-merge ke `main` pada repo
> `RuangWarga-dev`. Tabel ini **digantikan** oleh model role baru di §3.2 (v2 — Custom
> Role & Permission Berjenjang). Dipertahankan di sini sebagai catatan sejarah keputusan,
> BUKAN sebagai acuan implementasi aktif. Lihat §3.2 untuk model yang berlaku.

| Aktor (v1 — historis) | Deskripsi | Level |
|---|---|---|
| **Platform Owner** | Pemilik bisnis SaaS ini (kamu) | Super admin lintas tenant |
| **Tenant Admin** | Ketua RT/RW, Koordinator Perumahan, Pemilik Kos/Kontrakan, Admin Arisan, Admin Kelas | Admin dalam 1 tenant |
| **Bendahara** | Role finansial dalam satu tenant (opsional, tergantung vertikal) | Staff tenant |
| **Pengurus** | Role read-only/staff pendukung dalam satu tenant | Staff tenant |
| **Anggota** | Warga / Penyewa kos / Peserta arisan / Siswa kelas | User tenant |

## 3.1 Prinsip Urutan Pembangunan (Platform-First)

Proyek ini dibangun dengan filosofi **"pabrik dulu, baru produk"** — meniru model SumoPod:
lapisan **platform** (tenant provisioning, subscription, billing platform, dua dashboard
level) harus berdiri lebih dulu sebagai fondasi, sebelum modul operasional per vertikal
(RT/RW, kos, arisan, kelas) dibangun di atasnya. Modul **Listing Publik/Iklan** (§4.6)
menyusul setelah modul vertikal berjalan, karena bergantung pada data dari modul-modul
tersebut (status kamar kosong, keanggotaan warga terverifikasi).

Alasan urutan ini bersifat mengikat untuk seluruh dokumen turunan (`specification.md`,
`task.md`):

- Seluruh tabel operasional (billing, payments, expenses) bergantung pada `tenant_id` dan
  status `tenant_subscriptions` untuk RLS-nya — membangunnya belakangan berisiko migrasi
  ulang & penulisan ulang policy keamanan.
- Onboarding (self-signup → pilih tipe tenant → trial aktif) adalah first impression
  produk yang harus mulus sejak awal, sesuai positioning "self-serve" ala SumoPod.
- PortalWarga existing (fitur RT/RW) diperlakukan sebagai **satu template/isi** yang
  dipasang di atas platform, bukan sebagai pusat pembangunan yang lain mengikutinya.
- Modul Listing Publik memanfaatkan data yang baru bisa ada setelah modul vertikal (kamar
  kosong dari kos, keanggotaan warga dari RT/RW) benar-benar berjalan — sehingga secara
  teknis maupun bisnis, modul ini logisnya menyusul, bukan mendahului.

## 3.2 Model Role Berjenjang (v2 — Revisi RBAC, Berlaku Aktif)

### 3.2.1 Latar Belakang Revisi

Model v1 di atas mewarisi struktur role tetap (`admin`, `bendahara`, `pengurus`, `anggota`)
langsung dari PortalWarga single-tenant, yang didesain khusus untuk struktur organisasi
RT/RW. Setelah platform berkembang ke 4 vertikal (RT/RW, Kos, Arisan, Kelas), ditemukan
inkonsistensi: istilah "Bendahara"/"Pengurus" tidak relevan untuk kos, arisan, atau kelas,
dan role ini tidak dapat disesuaikan Tenant Admin sesuai kebutuhan operasional nyata
mereka (misal: kos butuh role "petugas kebersihan" dengan akses terbatas; RT/RW mungkin
butuh role "Sekretaris" terpisah dari "Bendahara").

Revisi ini mengganti role tetap dengan **sistem permission granular + custom role per
tenant**, sekaligus memperjelas mekanisme kepemilikan tenant ketika 1 orang mengelola
banyak tenant dan mendelegasikan sebagian ke orang lain.

### 3.2.2 Empat Level Wewenang (Containment Penuh)

Model ini berbentuk **4 lingkaran bersarang (containment penuh, bukan irisan sebagian)**:
setiap level yang lebih dalam adalah **subset wewenang penuh** dari level yang
membungkusnya — level luar otomatis bisa melakukan semua yang bisa dilakukan level dalam,
ditambah wewenang eksklusif miliknya sendiri. Tidak ada wewenang milik level dalam yang
tidak dimiliki level luar.

```
Super Admin  ⊃  Admin  ⊃  Pengelola  ⊃  Warga/Anggota
```

| Level | Cakupan | Wewenang Inti |
|---|---|---|
| **Super Admin** | Seluruh tenant di platform | Semua wewenang Admin, di TENANT MANAPUN (bukan cuma miliknya) + wewenang eksklusif level platform (atur `block_pricing`, `subscription_periods`, `listing_pricing`, lihat dashboard revenue/MRR lintas platform) |
| **Admin** | 1 atau lebih tenant yang dimiliki (`tenants.owner_id`) | Semua wewenang Pengelola, di tenant miliknya + wewenang eksklusif: membuat custom role, meng-assign/mencabut Pengelola per tenant, mengatur subscription & billing platform untuk tenant miliknya, selalu bisa memonitor tenant miliknya walau didelegasikan |
| **Pengelola** | 1 tenant spesifik, atas penugasan Admin | Semua wewenang Anggota, di tenant tsb + wewenang operasional sesuai kombinasi permission yang diberikan Admin (lihat §3.2.4) |
| **Warga/Anggota** | Data & tagihan miliknya sendiri, dalam 1 tenant | Lihat & bayar tagihan sendiri, lihat riwayat sendiri, (khusus RT/RW) posting listing UMKM sendiri |

### 3.2.3 Kepemilikan Multi-Tenant & Delegasi ke Pengelola

- FR-31: Satu **Admin** dapat memiliki **lebih dari satu tenant**, termasuk lintas tipe
  berbeda (mis. 1 tenant `rt_rw` + 2 tenant `kos` berbeda milik orang yang sama).
- FR-32: Admin dapat **mendelegasikan** operasional 1 tenant spesifik ke orang lain dengan
  menugaskan mereka sebagai **Pengelola** tenant tersebut, tanpa kehilangan kepemilikan
  atau kemampuan memonitor tenant itu.
- FR-33: Satu orang yang sama dapat ditugaskan sebagai Pengelola di **lebih dari satu
  tenant** oleh Admin yang sama (mis. Orang A jadi Pengelola di Kos Melati DAN Kos Mawar,
  keduanya milik Admin yang sama) — namun penugasan ini **tidak otomatis berlaku lintas
  tenant**; Admin harus menugaskan secara terpisah untuk setiap tenant.
- FR-34: Pengelola **tidak dapat** membuat custom role baru atau menugaskan orang lain
  sebagai Pengelola, kecuali Admin secara eksplisit memberikan permission
  `manage_tenant_users` kepada role Pengelola tersebut (lihat §3.2.4) — mencegah
  privilege escalation oleh staff.
- FR-35: Pengelola **tidak dapat** mengubah subscription atau billing platform untuk
  tenant yang dikelolanya — wewenang ini eksklusif Admin (dan Super Admin).

### 3.2.4 Sistem Custom Role & Permission

- FR-36: Admin (dan Super Admin) dapat membuat **role kustom** dengan nama bebas (mis.
  "Bendahara", "Sekretaris", "Admin Kos", "Koordinator") untuk tenant yang dimilikinya,
  masing-masing dengan kombinasi permission granular berikut:

| Permission Key | Label Default | Cakupan Aksi |
|---|---|---|
| `manage_billing_cash` | Catat Pembayaran Tunai | Mencatat pembayaran tunai langsung |
| `manage_billing_transfer` | Catat & Verifikasi Transfer | Mencatat & memverifikasi bukti transfer |
| `generate_billing` | Terbitkan Tagihan | Generate tagihan berkala (IPL/sewa/kontribusi/iuran) |
| `manage_members` | Kelola Anggota | CRUD data anggota, approve/reject pendaftaran, impor CSV |
| `manage_settings` | Kelola Pengaturan | Edit konfigurasi tenant (komponen IPL, harga sewa, dst) |
| `manage_expenses` | Kelola Pengeluaran | CRUD pengeluaran (`expenses`) |
| `view_reports` | Lihat Laporan | Akses laporan keuangan (read-only) |
| `run_special_action` | Jalankan Aksi Khusus | Kocok arisan, checkout kamar kos, mulai siklus arisan baru |
| `post_listing` | Pasang Iklan | Posting listing publik (kamar kosong / UMKM) |
| `manage_tenant_users` | Kelola User & Audit | CRUD akun/akses user dalam tenant, ubah penugasan role, lihat log audit — **hanya diberikan ke role Pengelola bila Admin secara eksplisit mengizinkan (lihat FR-34)** |

- FR-37: Dua role bawaan otomatis tersedia di setiap tenant baru dan **tidak dapat
  dihapus**: role pemilik (seluruh permission, melekat pada Admin) dan role dasar
  Warga/Anggota (tanpa permission staff apapun).
- FR-38: Role kustom yang dibuat Admin dapat diberikan ke lebih dari satu anggota, dan
  satu anggota hanya memiliki **satu role aktif per tenant** pada satu waktu.

### 3.2.5 Wewenang Super Admin sebagai Superset

- FR-39: Super Admin memiliki seluruh wewenang Admin (§3.2.2) di **tenant manapun** tanpa
  perlu ditugaskan atau memiliki tenant tersebut — ini dipakai untuk keperluan dukungan
  teknis, audit, dan penanganan tenant bermasalah, bukan operasional rutin.
- FR-40: RLS untuk wewenang Super Admin diimplementasikan sebagai kondisi tambahan
  (`OR is_platform_admin()`) di setiap policy tenant, bukan sebagai jalur akses terpisah
  — lihat `specification.md` §6.2 untuk pola implementasi.

### 3.2.6 Pemetaan Istilah v1 → v2 (Untuk Membaca FR Lama)

Agar seluruh FR-1 s/d FR-30 di dokumen ini (ditulis sebelum revisi §3.2) tidak perlu
ditulis ulang satu-satu, berlaku pemetaan istilah berikut ketika membaca FR-FR tersebut:

| Istilah v1 (dipakai di FR-1 s/d FR-30) | Dibaca sebagai (v2) |
|---|---|
| "Tenant Admin" | **Admin** — pemilik tenant (§3.2.2), kecuali disebutkan eksplisit sebagai "Admin & Pengelola" |
| "Owner"/"pendaftar" saat signup (FR-1 s/d FR-4) | **Admin** — hasil self-signup selalu membuat Admin baru, tidak pernah langsung membuat Pengelola |
| "Bendahara", "Pengurus" (bila muncul di narasi luar §3) | Contoh **nama role kustom** yang dapat dibuat Admin (§3.2.4), bukan lagi role tetap platform |
| "Anggota" | Tetap sama — **Warga/Anggota** (§3.2.2), role dasar yang tidak berubah |

Ketentuan baru di §3.2 (FR-31 s/d FR-40) berlaku sebagai **lapisan tambahan** di atas FR-1
s/d FR-30, bukan pengganti keseluruhan — FR-1 s/d FR-30 tetap sepenuhnya berlaku dengan
pemetaan istilah di atas.

## 4. Kebutuhan Fungsional

### 4.0 Dashboard Dua Level (Platform vs Tenant) — Fondasi

- FR-0.1: Sistem harus menyediakan **Platform Owner Dashboard**, terpisah dari dashboard
  operasional tenant manapun, berisi minimal:
  - Daftar seluruh tenant terdaftar (tipe, status subscription, tanggal daftar)
  - Dashboard revenue (MRR — Monthly Recurring Revenue), dengan breakdown per tipe tenant
    (rt_rw, kos, arisan, kelas) dan per status (trial vs active vs read_only)
  - Halaman kelola `block_pricing` dan `subscription_periods` (CRUD harga blok & diskon
    periode per tipe tenant)
  - Kemampuan mencari tenant tertentu (misal untuk menindaklanjuti tenant yang lama berada
    di status `read_only`)
- FR-0.2: Akses Platform Owner Dashboard dibatasi hanya untuk Platform Owner (bukan Tenant
  Admin manapun), ditegakkan di level RLS, bukan hanya disembunyikan di routing frontend.
- FR-0.3: Sistem harus menyediakan **Tenant Owner Dashboard** — dashboard akun bagi
  pendaftar (Ketua RT/RW, Pemilik Kos, Admin Arisan, dst) sebagai pelanggan platform,
  terpisah dari dashboard operasional hariannya. Isinya minimal:
  - **My Tenants** — daftar seluruh tenant yang dimiliki/dikelola user tersebut (mendukung
    kasus 1 user mengelola >1 tenant, misal pemilik 2 kos berbeda), dengan opsi berpindah
    tenant aktif
  - **Tambah Layanan Baru** — titik masuk untuk membuat tenant baru (memicu alur FR-1
    s/d FR-4), tanpa perlu logout/signup ulang
  - **Subscription & Billing** — status langganan tenant yang sedang aktif dipilih, riwayat
    pembayaran subscription, dan aksi renewal (lihat §4.2)
- FR-0.4: Dari Tenant Owner Dashboard, memilih satu tenant akan mengarahkan user ke
  **dashboard operasional tenant** tersebut (fitur RT/RW, kos, arisan, atau kelas sesuai
  tipe tenant) — dashboard operasional ini secara eksplisit dianggap lapisan terpisah yang
  "dipasang di atas" fondasi platform, bukan bagian dari fondasi itu sendiri.

### 4.1 Onboarding & Tenant Management

- FR-1: Sistem harus mengizinkan **self-signup** langsung tanpa approval dari Platform Owner,
  untuk 5 jenis peran pendaftar: Ketua RT/RW, Koordinator Perumahan, Pemilik Kos/Kontrakan,
  Admin Arisan, Admin Kelas.
- FR-2: Saat signup, pendaftar memilih **tipe tenant** (`rt_rw`, `kos`, `arisan`, `kelas`),
  yang menentukan template dashboard, istilah (naming), dan alur bisnis yang ditampilkan.
- FR-3: Sistem harus otomatis membuat 1 tenant baru dan menjadikan pendaftar sebagai Tenant
  Admin dari tenant tersebut.
- FR-4: Setiap tenant baru mendapat **trial otomatis**: 1 blok besar (kapasitas 10 unit),
  berlaku 15 hari, dengan akses penuh ke semua fitur (termasuk transaksi).
- FR-5: Tenant Admin dapat mengundang/mendaftarkan anggota melalui link/kode undangan unik,
  atau melalui pendaftaran mandiri oleh anggota via HP dengan status "pending approval".
- FR-6: Tenant Admin dapat menyetujui atau menolak pendaftaran anggota baru.

### 4.2 Subscription & Billing (Platform Owner ↔ Tenant)

- FR-7: Sistem harus menyediakan dua ukuran blok kapasitas:
  - Blok besar = 10 unit
  - Blok kecil = 5 unit
  Harga per unit pada blok kecil **lebih mahal** dibanding blok besar.
- FR-8: Harga blok **berbeda per tipe tenant** (rt_rw, kos, arisan, kelas), dikonfigurasi
  terpisah oleh Platform Owner.
- FR-9: Tenant Admin dapat membeli kombinasi campuran blok besar & kecil dalam satu
  subscription (mis. 2 blok besar + 1 blok kecil = kapasitas 25 unit).
- FR-10: Setelah trial berakhir, Tenant Admin wajib memilih periode subscription minimum
  **3 bulan**, dengan opsi tambahan **6 bulan** dan **12 bulan** (kemungkinan diskon
  berjenjang berdasarkan durasi, dikonfigurasi oleh Platform Owner).
- FR-11: Pada saat **renewal** (akhir periode berjalan), Tenant Admin bebas memilih ulang
  kombinasi blok dan durasi periode baru, **tidak harus sama** dengan periode sebelumnya.
- FR-12: Pembayaran subscription dilakukan melalui QRIS (gateway Mayar — infrastruktur
  yang sama dipakai untuk pembayaran IPL/sewa/kontribusi warga).
- FR-13: Sistem harus mendukung status tenant berikut:
  - `trial` — 15 hari pertama, akses penuh
  - `active` — subscription berjalan, akses penuh
  - `read_only` — subscription habis/belum dibayar, akses baca saja
- FR-14: Status **read_only** bersifat permanen (bukan sementara sebelum penghapusan data).
  Tenant dapat berada di status ini tanpa batas waktu dan kembali `active` kapan saja setelah
  pembayaran berhasil, **tanpa kehilangan data**.

### 4.3 Perilaku Read-Only (per Role)

> **Catatan Revisi:** butir di bawah awalnya ditulis dengan istilah role v1 (Tenant Admin,
> Anggota). Sesuai model v2 (§3.2), "Tenant Admin" pada FR-15 dibaca sebagai **Admin dan
> Pengelola** (semua yang memiliki permission staff apapun di tenant tsb), dan "pengurus"
> pada pesan ke Anggota dibaca sebagai istilah umum untuk siapapun yang memegang role
> pengelolaan tenant tsb, bukan role literal "Pengurus" dari v1.

- FR-15: Saat tenant berstatus `read_only`:
  - **Admin & Pengelola**: dapat login dan melihat seluruh data historis (anggota, tagihan,
    laporan keuangan). Aksi transaksi (generate tagihan baru, approve pembayaran, approve
    anggota baru, jalankan kocok arisan, posting listing) dinonaktifkan dengan penjelasan
    kontekstual, terlepas dari permission granular apa yang mereka miliki (lihat §3.2.4)
    — status `read_only` menonaktifkan SEMUA permission bertipe tulis (write), bukan hanya
    sebagian.
  - **Anggota** (Warga/Penyewa/Peserta/Siswa): dapat login dan melihat tagihan serta riwayat
    pembayaran mereka sendiri. Tombol "Bayar Sekarang" dinonaktifkan dengan pesan:
    *"Pembayaran sementara tidak tersedia. Silakan hubungi pengurus."* Tidak ada indikasi
    teknis mengenai status subscription platform yang ditampilkan ke anggota.

### 4.4 Fitur Inti per Vertikal (reuse dari PortalWarga existing)

- FR-16: **RT/RW & Koordinator Perumahan** — reuse penuh fitur existing PortalWarga:
  manajemen warga, komponen IPL, matriks pembayaran multi-tahun, verifikasi transfer,
  pengeluaran, laporan keuangan.
- FR-17: **Kos-kosan/Kontrakan** — adaptasi dari fitur existing:
  - Unit menjadi "kamar", dengan status kosong/terisi/booking
  - Tagihan berbasis **kontrak sewa** (tanggal mulai–selesai), bukan iuran tetap bulanan
  - Auto-generate tagihan sewa bulanan selama kontrak aktif
  - Alur "checkout" ketika penyewa keluar sebelum kontrak berakhir (stop billing, unit
    kembali berstatus kosong)
  - Mendukung multi-properti (1 pemilik dapat mengelola >1 lokasi kos dalam 1 tenant atau
    beberapa tenant terpisah — keputusan detail di specification.md)
- FR-18: **Arisan** — fitur baru:
  - Semua anggota membayar kontribusi pada periode yang sama (bukan per-unit)
  - Mekanisme **pengocokan** (random draw) dijalankan Tenant Admin setelah kontribusi
    periode terkumpul
  - Anggota yang sudah menang tidak diikutkan pengocokan pada periode berikutnya sampai
    seluruh anggota mendapat giliran (siklus penuh)
  - Riwayat pengocokan tercatat transparan dan dapat dilihat semua anggota
- FR-19: **Kelas** — fitur baru namun dapat menggunakan pola generik yang sama dengan RT/RW
  (kontribusi/iuran per periode, tanpa mekanisme kocok).

### 4.5 Isolasi Data Multi-Tenant

- FR-20: Data antar tenant harus **terisolasi total** — satu tenant tidak dapat mengakses,
  melihat, atau memodifikasi data milik tenant lain, ditegakkan di level database
  (Row Level Security), bukan hanya di level aplikasi.
- FR-21: Arsitektur menggunakan **satu database bersama** dengan kolom `tenant_id` pada
  seluruh tabel data operasional (bukan satu project Supabase terpisah per tenant).

### 4.6 Modul Listing Publik / Iklan (Fitur Monetisasi Tambahan)

Modul ini memanfaatkan dua aset yang sudah dihasilkan platform (data unit kosong pada
tenant tipe `kos`, dan keanggotaan warga terverifikasi pada tenant tipe `rt_rw`) untuk
membuka kanal pendapatan baru berupa listing berbayar, terpisah dari subscription utama
platform.

- FR-22: Sistem harus menyediakan dua jenis listing publik:
  - **Iklan kamar kosong** (khusus tenant tipe `kos`) — dibuat oleh Tenant Admin/pemilik
    kos, ditujukan menjaring calon penyewa dari luar platform.
  - **Iklan UMKM warga** (khusus tenant tipe `rt_rw`) — dibuat oleh anggota/warga secara
    individual, ditujukan mempromosikan usaha mereka (jualan makanan, laundry, dst).
- FR-23: Kedua jenis listing harus dapat diakses secara **publik, tanpa perlu login atau
  menjadi anggota tenant manapun** — berbeda dari seluruh data operasional lain di
  platform yang terisolasi per tenant (lihat FR-20).
- FR-24: Listing UMKM warga harus dapat dilihat publik secara luas (tidak dibatasi hanya
  sesama warga satu tenant), agar warga bisa mempromosikan usahanya ke luar lingkungan
  RT-nya sendiri.
- FR-25: Pembuatan listing bersifat **berbayar terpisah** dari subscription utama tenant
  (add-on), dengan model biaya per listing/per durasi tayang, dikonfigurasi oleh Platform
  Owner.
- FR-26: Listing tidak dapat dibuat oleh tenant yang sedang berstatus `read_only` —
  mengikuti pola perilaku read-only yang sama seperti fitur transaksi lain (lihat FR-15),
  agar konsisten sebagai insentif tambahan untuk tetap berlangganan.
- FR-27: Untuk listing kamar kosong, sistem sebaiknya menawarkan prefill otomatis dari
  data kamar yang berstatus kosong (`tenant_units.status = 'vacant'`), agar owner tidak
  perlu input ulang dari nol.
- FR-28: Listing memiliki masa aktif (mis. 30 hari) dan status yang bisa berubah otomatis
  atau manual (aktif, tersewa/terjual, kedaluwarsa).
- FR-29: Sistem menyediakan opsi listing **unggulan/featured** (tampil lebih menonjol atau
  diprioritaskan) sebagai tingkatan harga lebih tinggi dari listing biasa.
- FR-30: Sistem harus menyediakan dua halaman publik terpisah yang dapat diakses siapa
  saja: direktori kamar kos kosong dan direktori UMKM warga, masing-masing dengan halaman
  detail per listing dan cara menghubungi pemasang iklan (mis. tautan WhatsApp).

## 5. Kebutuhan Non-Fungsional

- NFR-1: Proses signup hingga tenant siap dipakai harus berlangsung cepat (target: di bawah
  1 menit), sejalan dengan positioning "self-serve" ala SumoPod.
- NFR-2: Sistem harus tetap PWA-installable seperti PortalWarga existing.
- NFR-3: RLS Supabase menjadi lapisan keamanan utama pemisah data tenant; guard di frontend
  (React Router) adalah lapisan kedua, bukan satu-satunya proteksi.
- NFR-4: Perubahan skema harus backward-compatible dengan opsi migrasi dari instance
  PortalWarga existing (single-tenant) ke multi-tenant.
- NFR-5: Semua perhitungan blok/harga/status subscription harus dapat diaudit (log perubahan
  status, histori pembayaran subscription tersimpan permanen).

## 5.1 Urutan Prioritas Fungsional (Ringkasan)

Untuk menegaskan §3.1, kebutuhan fungsional di atas diprioritaskan dalam urutan berikut,
tercermin langsung pada urutan phase di `task.md`:

1. **Fondasi platform** (§4.0, §4.1, §4.2, §4.5) — tenant, auth, subscription, billing
   platform, dua dashboard level, isolasi data. Tidak ada modul vertikal apapun yang aktif
   di sini selain data dummy untuk pengujian.
2. **Template vertikal pertama: RT/RW** (§4.4, FR-16) — memindahkan fitur PortalWarga
   existing ke atas fondasi platform, sekaligus jadi bukti bahwa fondasi bekerja.
3. **Template vertikal berikutnya**: Kos-kosan (FR-17), lalu Arisan (FR-18), lalu Kelas
   (FR-19) — dibangun satu per satu setelah pola generik dari RT/RW terbukti solid.
4. **Modul Listing Publik/Iklan** (§4.6) — dibangun setelah minimal template RT/RW dan
   Kos-kosan berjalan, karena bergantung pada data yang mereka hasilkan (unit kosong,
   keanggotaan warga terverifikasi). Modul ini secara sengaja diperlakukan sebagai
   pengecualian terhadap prinsip isolasi tenant (FR-20) karena tujuannya memang publik.

> **Catatan Revisi RBAC (§3.2):** Model role berjenjang (Super Admin ⊃ Admin ⊃ Pengelola
> ⊃ Warga/Anggota) dengan custom role & permission granular adalah **revisi yang berlaku
> di atas seluruh 4 langkah prioritas di atas** — bukan langkah tambahan terpisah. Karena
> perubahan ini bersifat struktural pada lapisan fondasi (tabel `tenant_members`, seluruh
> RLS policy), lihat `task.md` Phase 12 untuk urutan pengerjaan migrasi dari RBAC v1 (role
> tetap, sudah di-merge ke `main`) ke RBAC v2 (custom role & permission, revisi ini).

## 6. Di Luar Cakupan (Out of Scope) — Fase Awal

- Integrasi payment gateway selain Mayar/QRIS
- Aplikasi mobile native (React Native/Capacitor) — tetap PWA
- White-label penuh (custom domain per tenant)
- Automasi n8n lanjutan (notifikasi WA/email) — tetap sebagai roadmap Phase 2 seperti
  di PortalWarga existing
- Refund otomatis / prorata pembatalan subscription di tengah periode
- Moderasi konten listing publik secara otomatis (deteksi konten terlarang/spam pada
  Modul Listing §4.6) — pada fase awal, moderasi dilakukan manual oleh Platform Owner
- Sistem rating/review untuk listing publik (kos maupun UMKM)
- Fitur booking/reservasi kamar langsung dari halaman listing publik (fase awal hanya
  menghubungkan lewat kontak WhatsApp, bukan transaksi langsung di platform)
