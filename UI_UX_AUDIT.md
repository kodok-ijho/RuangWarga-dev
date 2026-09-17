# UI/UX Audit & Baseline — RuangWarga

Dokumen audit ini merupakan deliverable resmi untuk **Phase 0 (TASK-001, TASK-002, TASK-003)** dari [task-2.md](file:///root/project/ruangwarga/task-2.md) dalam proyek **RuangWarga UI/UX Redesign**.

Audit ini mendokumentasikan kondisi aktual frontend per September 2026, inventarisasi lengkap seluruh rute utama, pola antarmuka yang terduplikasi, kelemahan responsif di layar mobile, serta baseline masalah UX berdasarkan prioritas (P0, P1, P2).

---

## 1. Arsitektur Repositori & Frontend (TASK-001)

### 1.1 Struktur Aplikasi Frontend
Aplikasi frontend terletak di direktori `client/` berbasis **Single Page Application (SPA)** dan **Progressive Web App (PWA)**:
```
client/
├── public/                # Favicon, manifest.webmanifest, logo Palm Village
├── src/
│   ├── components/        # Komponen fungsional & modal (15 file)
│   │   └── ui/            # [BELUM ADA] Primitif UI belum distandarisasi
│   ├── context/           # AuthContext, TenantContext, ToastContext, TourContext
│   ├── hooks/             # useAuth, useTenant, useTenantTemplate, useSubscriptionGate, useToast
│   ├── pages/             # 19 file halaman utama + 7 subdirektori vertikal/layer
│   │   ├── account/       # Tenant Owner Dashboard (/account/*)
│   │   ├── arisan/        # Modul Arisan (/t/:tenantId/arisan/*)
│   │   ├── onboarding/    # Wizard setup & tipe tenant
│   │   ├── platform/      # Platform Owner Dashboard (/platform/*)
│   │   ├── public/        # Direktori listing kos & UMKM
│   │   ├── roles/         # Manajemen role kustom
│   │   └── tenant/        # Dashboard operasional harian & approval
│   ├── services/          # dataService, dataHelpers, tenantOperationalService, apiClient
│   ├── utils/             # imageCompressor.js
│   ├── App.jsx            # Routing terpusat, code splitting React.lazy, RoleGuard
│   ├── index.css          # Tailwind base, utilities, kelas kustom .pv-*
│   └── main.jsx           # Mount React root
├── package.json           # Dependensi React 18, Vite 5, Tailwind 3.4, Recharts 3.9
└── tailwind.config.js     # Definisi palet forest & gold, font Inter & Playfair Display
```

### 1.2 Routing & Pembagian Lapisan (Layered Architecture)
Routing didefinisikan di [client/src/App.jsx](file:///root/project/ruangwarga/client/src/App.jsx) dengan 5 lapisan isolasi:
1. **Public Layer:** `/`, `/login`, `/join/:inviteCode?`, `/listing/kos/*`, `/listing/umkm/*` (akses publik tanpa login & tanpa tenant context).
2. **Tenant Owner Layer (`/account/*`):** `/account/tenants`, `/account/add-tenant`, `/account/choose-plan`, `/account/subscription/*` (pengguna dengan kepemilikan tenant).
3. **Tenant Operational Layer (`/t/:tenantId/*`):** `/t/:tenantId/dashboard`, `/t/:tenantId/approval`, `/t/:tenantId/payment-verification`, `/t/:tenantId/expenses`, `/t/:tenantId/reports`, `/t/:tenantId/payment-matrix`, `/t/:tenantId/roles`, `/t/:tenantId/arisan/*`.
4. **Single-Tenant / Legacy Protected Layer (`ProtectedLayout`):** `/residents`, `/houses`, `/payment-matrix`, `/reports`, `/expenses`, `/events`, `/incomes`, `/users`, `/logs`, `/user-approval`, `/payment-verification`.
5. **Platform Owner Layer (`/platform/*`):** `/platform/tenants`, `/platform/pricing`, `/platform/revenue` (khusus Superadmin).

### 1.3 Arsitektur Komponen & Ketiadaan Primitif UI
- Repositori saat ini hanya memiliki **15 komponen** di `client/src/components/`, yang didominasi oleh modal fungsional besar (`QrisCheckoutModal.jsx`, `CreateBillingModal.jsx`, `CheckoutRoomModal.jsx`, `Modal.jsx`, `Header.jsx`, `Layout.jsx`, `WalkthroughTour.jsx`).
- **Tidak ada komponen primitif UI standar:** Komponen seperti `Button`, `IconButton`, `Input`, `Select`, `Badge`, `StatusBadge`, `Card`, `Section`, `DataRow`, `EmptyState`, `LoadingState`, `PageHeader`, `Drawer`, dan `MobileList` **belum tersedia**.
- Akibatnya, setiap halaman mengimplementasikan tombol `<button>`, input form `<input>`, baris tabel `<tr>`, dan spinner loading secara independen dengan gaya Tailwind yang berbeda-beda.

### 1.4 Sistem Styling & Design Tokens
- **TailwindCSS 3.4:**
  * Palet Warna: `forest` (50–950, warna dominan `#1a3d2e`) dan `gold` (50–900, aksen `#d4af37`).
  * Tipografi: `Inter` (sans) dan `Playfair Display` (serif untuk judul).
  * Bayangan: `shadow-card`, `shadow-elevated`.
- **Kelas Utilitas Kustom di `index.css`:**
  * `.pv-card`: `rounded-2xl bg-white border border-slate-200/90 shadow-card`
  * `.pv-btn-primary`: `rounded-xl bg-gold-500 text-forest-950 font-bold px-4 py-2.5`
  * `.pv-btn-ghost`: `rounded-xl text-slate-700 font-semibold hover:bg-slate-100`
  * `.pv-btn-danger`: `rounded-xl bg-red-50 text-red-700`
  * `.pv-input`: `rounded-xl border border-slate-200 focus:border-gold-500 focus:ring-2`
  * `.pv-badge`: `rounded-full px-2.5 py-0.5 text-[11px] font-semibold`
- **Kelemahan Token Saat Ini:**
  * Tidak ada pembatasan spasi terpusat (skala `4, 8, 12, 16, 20, 24, 32, 40, 48` belum ditegakkan secara disiplin; banyak nilai arbitrer).
  * Penggunaan bayangan (`shadow-md`, `shadow-lg`, `shadow-card`) terlalu sering dan tidak konsisten.
  * Status badge sering memakai kombinasi kelas Tailwind langsung (`bg-emerald-50 text-emerald-800 border-emerald-200`, `bg-amber-50`, `bg-rose-50`, `bg-purple-50`) tanpa komponen terpusat.

### 1.5 Pola State Management & Data Fetching
- **Auth & Session:** Dikelola oleh `AuthContext.jsx` (menyimpan `user`, `profile`, `role`, `session`, Google OAuth, dan demo mode flag).
- **Tenant Context:** Dikelola oleh `TenantContext.jsx` (menyimpan `activeTenant`, `activeTenantId`, `userTenants`, `switchTenant`, `refreshTenant`, permission checks).
- **Data Fetching:** Meskipun `@tanstack/react-query` telah terdaftar di `App.jsx`, mayoritas halaman utama (`Residents.jsx`, `PaymentMatrix.jsx`, `Reports.jsx`, `Houses.jsx`, `Expenses.jsx`) masih menggunakan pola lama:
  `useState` + `useEffect` + `useCallback` yang memanggil `fetchResidents()`, `fetchBillMatrix()`, dsb. dari `services/dataService.js`.
- **Demo Mode:** Didukung secara penuh melalui mock data di `services/mockData.js` saat `IS_DEMO_MODE=true`.

### 1.6 Batasan Autentikasi & Otorisasi
- Navigasi dan tombol aksi dibatasi berdasarkan helper RBAC di [client/src/services/dataHelpers.js](file:///root/project/ruangwarga/client/src/services/dataHelpers.js):
  * `canModifyData(role)`
  * `isStaffRole(role)` (admin, bendahara, pengurus)
  * `isBendaharaOrAbove(role)`
  * `canManageResidents(role, isReadOnly)`
  * `canManageHouses(role, isReadOnly)`
  * `canViewFinancialReports(role)`
  * `useSubscriptionGate(tenantId)` (memeriksa apakah tenant berstatus `read_only`).

### 1.7 Duplikasi Pola UI yang Teridentifikasi
1. **Pola Header Halaman:** Hampir semua halaman membuat elemen `div` header sendiri dengan judul `<h2>` atau `<h1>`, deskripsi subtitle, dan deretan tombol aksi di sebelah kanan.
2. **Pola Pencarian & Filter:** Komponen filter (input search dengan icon svg search + deretan `<select>`) ditulis ulang dari awal di `Residents.jsx`, `Houses.jsx`, `Users.jsx`, `Logs.jsx`, `Expenses.jsx`.
3. **Pola Loading State:** Spinner inline SVG ditulis manual di tiap tabel (`animate-spin text-gold-500` atau `border-2 border-forest-600 border-t-gold-500`).
4. **Pola Empty State:** Tulisan kosong berupa `<tr><td colSpan={N} className="text-slate-400">Tidak ada data</td></tr>` yang generik dan tidak informatif.
5. **Pola Modal Form:** Input form di dalam modal ditulis berulang-ulang tanpa form layout wrapper yang konsisten.

---

## 2. Inventarisasi Rute Utama & Masalah UX (TASK-002)

| Rute & File | Peran Target | Tujuan Utama | Aksi Utama | Informasi Kritis (L1) | Informasi Pendukung (L2) | Informasi Detail (L3) | Masalah UX & Responsif Saat Ini |
|---|---|---|---|---|---|---|---|
| **`/`**<br>`Home.jsx` | Publik / Semua User | Orientasi awal: Landing page bagi pengunjung baru, Hub Workspace bagi user login | Masuk akun / Pilih tenant | Daftar tenant terdaftar, status langganan tenant | Ringkasan fitur, direktori listing publik | Detail versi app, info profil pengguna | - Komponen terlalu besar (751 baris)<br>- Saat login, kartu tenant sangat tebal dan memakan banyak ruang vertikal<br>- Banner superadmin terlihat kontras dan mendominasi layar |
| **`/login`**<br>`Login.jsx` | Publik (Belum Login) | Autentikasi masuk ke platform | Login Google / Login Email | Tombol Google Sign-In, status akun pending | Opsi login demo admin, link daftar | Syarat registrasi alamat unit rumah | - Halaman panjang (622 baris)<br>- Pilihan login demo dan registrasi manual bersaing secara visual dengan Google CTA |
| **`/t/:tenantId/dashboard`**<br>`TenantDashboard.jsx` | Semua Anggota & Pengurus | Dashboard operasional komunitas | Bayar iuran (warga) / Verifikasi bayar (pengurus) | Status iuran periode berjalan, total tagihan tertunggak | Akses cepat (Warga, Keuangan, Matriks), pengumuman | Kamus istilah unit/iuran, grafik statistik bulanan | - **Wall of cards**: Terlalu banyak kartu banner, statistik, dan kamus istilah dalam satu layar<br>- Warga sulit menemukan status tagihannya sendiri secara cepat<br>- Teks panjang dan berulang |
| **`/payment-matrix`** & **`/t/:tenantId/payment-matrix`**<br>`PaymentMatrix.jsx` | Warga & Pengurus | Cek matriks iuran 12 bulan & pembayaran | Pilih bulan & bayar via QRIS / Bukti Transfer | Status lunas/belum lunas per bulan berjalan, total bayar terpilih | Riwayat pembayaran lunas, metode bayar (Tunai/Transfer/QRIS) | ID transaksi, log audit, kuitansi digital, catatan verifikasi | - **Monolitik ekstrim (2.691 baris / 114 KB)**<br>- Tabel 12 bulan horizontal sangat sulit dioperasikan di HP 360px<br>- Modal pembayaran tumpang tindih<br>- Warga hanya butuh tahu tagihan bulan ini, bukan tabel matriks 12 bulan penuh |
| **`/payment-verification`**<br>`PaymentVerification.jsx` | Pengurus / Bendahara | Verifikasi bukti transfer iuran warga | Setujui / Tolak bukti bayar | Jumlah pembayaran pending, nama warga, nominal transfer | Tanggal transfer, bank tujuan, preview foto struk | Nomor referensi mutasi bank, alasan penolakan, timeline | - Tabel horizontal terpotong di layar ponsel<br>- Modal preview foto struk sering melebihi tinggi layar pada ponsel Android kecil |
| **`/residents`**<br>`Residents.jsx` | Semua (Read), Admin (CRUD) | Direktori warga / penghuni komunitas | Cari kontak warga / Tambah warga baru | Nama lengkap, alamat/unit, nomor telepon/WhatsApp, status tinggal | Status akun (aktif/sementara), pemilik unit vs penyewa | Email, riwayat log, detail occupancy | - Tabel horizontal (`overflow-x-auto`) tidak ramah sentuhan satu tangan di HP<br>- Kolom tabel terpotong di 360px–412px<br>- Kolom penting tersembunyi |
| **`/houses`**<br>`Houses.jsx` | Semua (Read), Admin (CRUD) | Manajemen kavling/rumah/kamar | Tambah/Edit unit, atur skema IPL | Nomor unit/blok, status hunian (terisi/kosong), nama pemilik | Luas bangunan, lantai, skema tarif IPL | Catatan properti, riwayat mutasi penghuni | - Sama seperti direktori warga: memaksakan tabel desktop ke ponsel<br>- Modal input unit sangat panjang dan melelahkan di layar kecil |
| **`/expenses`**<br>`Expenses.jsx` | Pengurus & Warga (Transparansi) | Pencatatan & pengawasan pengeluaran kas | Tambah transaksi pengeluaran (Bendahara) | Total nominal pengeluaran, kategori, tanggal transaksi | Keterangan pengeluaran, pelaksana kegiatan | Bukti kuitansi/nota belanja, persetujuan pengurus | - Tabel pengeluaran sulit dibaca di mobile<br>- Pratinjau nota belanja tidak memiliki zoom terpadu |
| **`/reports`**<br>`Reports.jsx` | Pengurus & Warga | Laporan keuangan, neraca arus kas, saldo berjalan | Filter periode & Unduh laporan / Cetak | Saldo kas saat ini, total pemasukan vs total pengeluaran bulan ini | Grafik tren bulanan Recharts, komposisi pengeluaran pie chart | Rincian mutasi kas, daftar pembayaran non-IPL | - File monolitik (1.809 baris / 84 KB)<br>- Grafik Recharts rentan overflow di layar ponsel 360px<br>- Terlalu banyak tabel rincian dalam satu layar |
| **`/settings`**<br>`Settings.jsx` | Pengurus / Admin | Pengaturan operasional komunitas | Simpan konfigurasi iuran & QRIS | Tanggal jatuh tempo, besaran denda, skema iuran aktif | Provider QRIS aktif, email notifikasi smoke test | Parameter teknis denda (persen vs nominal), log uji bayar | - Tampilan formulir panjang tanpa pembagian tab/seksional yang jelas<br>- Kontrol input dan label kurang ringkas |
| **`Header.jsx`** (Komponen Global) | Semua User | Navigasi aplikasi, ganti tenant, profil | Pindah rute / Logout | Nama tenant aktif, indikator demo/trial, avatar profil | Dropdown menu Keuangan, Warga, Sistem | Detail email pengguna, tour walkthrough | - Sangat panjang (786 baris)<br>- Nested dropdown rumit dan sulit disentuh di smartphone<br>- Tidak ada bottom navigation bar untuk navigasi jempol warga |

---

## 3. Evaluasi UX Baseline Berdasarkan Prioritas (TASK-003)

Berdasarkan kriteria **comprehension, task completion, mobile usability, navigation, information visibility,** dan **performance**:

### 3.1 Masalah Kritis (P0 — Critical Usability & Usability Gate)

1. **[P0-01] Kegagalan Responsif Tabel di Layar Smartphone (360px–412px):**
   * *Lokasi:* `Residents.jsx`, `Houses.jsx`, `Expenses.jsx`, `PaymentVerification.jsx`, `Users.jsx`.
   * *Dampak:* Pengguna smartphone (mayoritas warga mengakses via HP) terpaksa melakukan scroll horizontal canggung untuk melihat status atau menekan tombol aksi.
   * *Target Solusi:* Implementasikan pola **Mobile Card List** adaptif via komponen `MobileList` dan detail via slide-over `Drawer`.
2. **[P0-02] Kelebihan Informasi & Ketiadaan Hierarki di Dashboard (`TenantDashboard.jsx`):**
   * *Lokasi:* `TenantDashboard.jsx`.
   * *Dampak:* Gagal memenuhi kriteria *3-second test*. Warga tidak langsung tahu apakah iurannya bulan ini sudah lunas atau belum karena layar dipenuhi kartu statistik dan banner pengurus.
   * *Target Solusi:* Terapkan 5 tingkat hierarki ketat. Tampilkan status tagihan warga dan tombol bayar utama di posisi paling atas layar pertama (above the fold).
3. **[P0-03] Kerumitan Navigasi Mobile di `Header.jsx`:**
   * *Lokasi:* `Header.jsx`.
   * *Dampak:* Navigasi bertingkat (dropdown dalam hamburger menu) membingungkan dan memperlambat penyelesaian tugas warga (membayar IPL atau mengecek saldo kas).
   * *Target Solusi:* Buat **Bottom Navigation Bar** untuk 4 tab utama warga (`Beranda`, `Tagihan`, `Warga`, `Menu`) dan topbar ramping.
4. **[P0-04] Monolitik & Kerapuhan Matriks Pembayaran (`PaymentMatrix.jsx`):**
   * *Lokasi:* `PaymentMatrix.jsx` (2.691 baris).
   * *Dampak:* Beban rendering berat di HP, logika UI bercampur baur dengan modal, dan tabel 12 bulan tidak intuitif bagi warga biasa yang hanya ingin membayar tagihan 1 bulan.
   * *Target Solusi:* Buat mode tampilan mobile khusus: kartu tagihan aktif + daftar bulan tertunggak dengan kalkulasi total instan.
5. **[P0-05] Status yang Bergantung pada Warna Saja:**
   * *Lokasi:* Status sel matriks, status verifikasi di berbagai tabel.
   * *Dampak:* Melanggar standar aksesibilitas (REQ-007 & REQ-018) bagi pengguna dengan keterbatasan penglihatan warna (color blindness).
   * *Target Solusi:* Standardisasi `StatusBadge` dengan ikon simbolik + label teks jelas (`✓ Lunas`, `• Menunggu`, `! Belum Bayar`, `× Gagal`).

### 3.2 Masalah Konsistensi & Kualitas (P1 — Important Quality & Consistency)

1. **[P1-01] Duplikasi Tombol & Input Tanpa Komponen Primitif:**
   * *Lokasi:* Seluruh halaman di `client/src/pages/`.
   * *Dampak:* Inkonsistensi ukuran font, padding, rounded radius, dan focus-ring.
   * *Target Solusi:* Bangun primitif di `client/src/components/ui/` (`Button`, `IconButton`, `Input`, `Select`, `Card`, `Section`, `Badge`).
2. **[P1-02] Empty State Generik ("No data"):**
   * *Lokasi:* `Residents.jsx`, `Expenses.jsx`, `PaymentVerification.jsx`, `Logs.jsx`.
   * *Dampak:* Tidak memberi tahu pengguna mengapa data kosong dan apa langkah selanjutnya.
   * *Target Solusi:* Buat komponen `EmptyState` yang memuat ikon konteks, penjelasan singkat, dan tombol tindakan (CTA).
3. **[P1-03] Loading State yang Memblokir Layar:**
   * *Lokasi:* Berbagai tabel memuat spinner tengah yang menyebabkan layout shift.
   * *Target Solusi:* Gunakan localized subtle spinner atau `Skeleton` placeholder.
4. **[P1-04] Teks Penjelasan Terlalu Panjang (Violating REQ-004):**
   * *Lokasi:* Banner onboarding, deskripsi kartu di dashboard, modal verifikasi.
   * *Target Solusi:* Pangkas teks menjadi kalimat ringkas, natural, dan berorientasi tindakan.
5. **[P1-05] Ketiadaan Progressive Disclosure di Riwayat Pembayaran:**
   * *Lokasi:* `PaymentMatrix.jsx`, `PaymentVerification.jsx`.
   * *Dampak:* Detail transaksi teknis (ID referensi, audit trail, raw metadata) dipaksakan di layar utama.
   * *Target Solusi:* Batasi tampilan awal ke Level 1 & 2; tampilkan Level 3 di dalam drawer/modal terpisah.

### 3.3 Masalah Poles Visual (P2 — Visual Polish & Restraint)

1. **[P2-01] Penggunaan Card & Border yang Terlalu Tebal:**
   * Mengurangi efek card bertumpuk (*card-inside-card*); gunakan garis pembatas tipis (`border-slate-200/80`) dan spasi vertikal yang tenang.
2. **[P2-02] Inkonsistensi Spasi (Spacing Scale Tokens):**
   * Menyeragamkan seluruh margin dan padding ke skala `4, 8, 12, 16, 20, 24, 32, 40, 48` px.
3. **[P2-03] Animasi Berlebih:**
   * Memastikan transisi counter dan hover tetap ringan serta mendukung preferensi `prefers-reduced-motion`.

---

## 4. Kesimpulan & Kesiapan Masuk ke Phase 1

Audit Phase 0 telah selesai dilakukan secara menyeluruh tanpa mengubah kode aplikasi UI.

Dengan telah terdokumentasikannya:
1. Arsitektur frontend & repositori secara presisi (TASK-001)
2. Inventarisasi dan kelemahan seluruh rute utama (TASK-002)
3. Baseline prioritas masalah UX P0/P1/P2 (TASK-003)

Repositori kini **siap untuk melangkah ke Phase 1 — Design System Foundation (TASK-004 s/d TASK-008)**, yaitu perumusan token desain terpusat, pembangunan core component primitives di `client/src/components/ui/`, dan refaktorisasi global shell dengan mobile-first navigation.
