# PANITIA-1 — Kepanitiaan: acara, anggaran, pemasukan, pengeluaran, laporan

Status: ✅ **Disetujui user 2026-10-21**, termasuk migration PANITIA-1.2 (jenis tenant baru, tabel baru, kolom baru di `expenses` / `non_ipl_incomes`, dan RLS).

Dasar:
- `PANITIA-requirement.md` (keputusan user 2026-10-21);
- hasil penelusuran Claude atas kode dan database dev.

## Temuan yang ikut diperbaiki (berlaku untuk semua jenis tenant)
1. **Pengeluaran tidak bisa disimpan di mode tenant.**
   - `pages/Expenses.jsx` ±67 mengambil `canWrite` dari `useSubscriptionGate(activeTenantId)`, padahal hook itu (`hooks/useSubscriptionGate.js` ±16, ±75) menerima objek opsi dan mengembalikan `canTransact`, bukan `canWrite`.
   - Akibatnya `subCanWrite` selalu `undefined`, dan tombol simpan selalu mati, termasuk untuk RT/RW dan Kos sekarang.
   - Test `Expenses.test.jsx` ±113 me-mock hook dengan bentuk yang salah (`canWrite: true`), sehingga bug ini tidak tertangkap.
2. **Ekspor CSV Laporan rusak di mode tenant.** `pages/Reports.jsx` ±680 `handleExportCSV` memanggil `report.details.map`, padahal laporan tenant tidak punya `details`.
3. **Belum ada halaman Pemasukan di mode tenant.** `pages/NonIplIncomes.jsx` hanya untuk jalur lama `/incomes` (API lama). Padahal tabel `non_ipl_incomes` sudah multi-tenant dan sudah dihitung oleh Laporan.

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit, push setelah setiap commit. Jangan push ke `main`.
- Ikuti `docs/handoff/README.md` dan `AGENT.md`. Path relatif ke `client/src/` kecuali disebut lain.
- 🚫 Jangan mengubah:
  - `services/dataService.js`, `services/apiClient.js`;
  - `api/`, `legacy-backend/`, `.env*`;
  - migration lama;
  - `pages/NonIplIncomes.jsx` (jalur lama Palm Village).
- Jangan menjalankan SQL ke Supabase. Jangan menghapus kode Kelas; biarkan tidak terpakai.
- Dukung mode demo dengan store memori per tenant (pola `services/tenant/events.js`). Test baru mengimpor kode asli.
- Ikuti gaya UI yang ada: `pv-*`, palet forest/gold, React Query, toast yang sudah dipakai halaman sekitarnya.
- Ekspor baru yang diekspor ulang lewat `services/tenantOperationalService.js` **wajib** ditambahkan ke `services/tenantOperationalService.exports.test.js`.
- Sebelum menulis laporan, jalankan **seluruh** `npx vitest run`, `npm run lint`, dan `npm run build`. Laporan ditulis dari diff yang sebenarnya.

---

## PANITIA-1.1 — Perbaikan keuangan tenant
- `pages/Expenses.jsx`: ambil `canTransact` dari `useSubscriptionGate()` (tanpa argumen; hook membaca tenant aktif dari context). Pakai `canTransact` sebagai pengganti `subCanWrite`, dan `isReadOnly` hook bila dipakai.
- `Expenses.test.jsx`: mock `useSubscriptionGate` mengikuti bentuk asli (`canTransact`, `isReadOnly`). Tambah test bahwa pemegang `manage_expenses` pada langganan aktif bisa membuka form dan menyimpan, dan langganan baca-saja tidak bisa.
- `pages/Reports.jsx`: di mode tenant, `handleExportCSV` mengekspor ringkasan kas yang memang ada, yaitu baris per bulan berisi pemasukan, pengeluaran, selisih, dan saldo, sesuai data yang tampil. Tidak ada lagi pemanggilan `report.details`. Jalur lama (tanpa tenant) tidak diubah.
- Test: ekspor CSV di mode tenant tidak melempar error dan memanggil `Papa.unparse` dengan baris ringkasan.
- Commit: `fix(finance): PANITIA-1.1 simpan pengeluaran dan ekspor laporan di mode tenant`

## PANITIA-1.2 — Migration jenis tenant, acara, dan anggaran
- Salin **persis** dengan `cp` (jangan diketik ulang):
  - `docs/handoff/assets/PANITIA-1/tenant_type_panitia.sql` → `supabase/migrations/202610210006_tenant_type_panitia.sql`;
  - `docs/handoff/assets/PANITIA-1/tenant_programs.sql` → `supabase/migrations/202610210007_tenant_programs.sql`.
  - Claude sudah dry-run file kedua di dev (lulus, lalu di-rollback).
- Test `supabase/tests/tenant_programs_matrix.sql`, dengan pola `BEGIN; DO $$ ... $$; ROLLBACK;` seperti `supabase/tests/my_join_requests_matrix.sql`. Pakai tenant jenis `rt_rw` di fixture; tabel ini tidak terikat jenis tenant, dan nilai enum `panitia` baru bisa dipakai setelah migration pertama ter-commit.
- Aturan fixture:
  - insert `auth.users (id, email, aud, role)` dulu, dengan email `@test.invalid`;
  - owner member dan jabatan dasar dibuat otomatis oleh trigger saat insert `tenants`. Jangan insert owner member manual;
  - jabatan: insert `tenant_roles (tenant_id, name, is_owner_role, is_base_role)`, lalu `tenant_role_permissions (tenant_role_id, permission_key)`;
  - ganti pengguna dengan `set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role', 'authenticated')::text, true)` dan `set_config('request.jwt.claim.sub', ...)`, lalu `EXECUTE 'SET LOCAL ROLE authenticated'`. Kembali ke `postgres` sebelum menyiapkan fixture lagi;
  - tangkap penolakan dengan `insufficient_privilege` (RLS), `foreign_key_violation`, atau `check_violation`.
- Fixture:
  - tenant T: sekretaris S (`manage_programs`), bendahara B (`manage_expenses`), anggota M (jabatan dasar);
  - tenant T2: anggota X, dan acara P2 milik T2.
- Kasus wajib:
  - **P.** `anon` tidak punya SELECT di `tenant_programs` / `program_budget_items` dan tidak punya EXECUTE `can_manage_programs`.
  - **C1.** S membuat acara P (ketua = M) dan Q. M melihat 2 acara dan semua pos RAB. X melihat 0 acara milik T.
  - **C2.** Pos RAB 50 × Rp15.000 → `amount` = 750000 (kolom otomatis).
  - **C3.** M menulis pos RAB, dan ditolak. B menambah pos RAB, dan berhasil.
  - **C4.** M membuat acara, dan ditolak.
  - **C5.** B mencatat pengeluaran (P + pos konsumsi) dan pemasukan (P + pos sponsor). Keduanya berhasil.
  - **C6.** Pengeluaran dengan `program_id` = P2 (tenant lain) ditolak `foreign_key_violation`.
  - **C7.** Pengeluaran di P dengan pos milik acara Q ditolak `foreign_key_violation`.
  - **C8.** Pemasukan dengan `budget_item_id` tanpa `program_id` ditolak `check_violation`.
  - **C9.** Acara dengan ketua dari tenant lain ditolak.
  - **C10.** Owner T menghapus acara P (sudah ada transaksi), dan ditolak `foreign_key_violation`. Owner menghapus acara Q (tanpa transaksi): berhasil, dan pos RAB Q ikut terhapus.
  - **C11.** Owner menghapus pos konsumsi: pengeluaran C5 tetap ada, `program_id` tetap P, dan `budget_item_id` menjadi NULL.
- Commit: `feat(panitia): PANITIA-1.2 migration jenis tenant kepanitiaan, acara, dan anggaran`

## PANITIA-1.3 — Jenis tenant Kepanitiaan dan setup
- `config/tenantTemplates.js`: template `panitia`:
  - label: `name: 'Kepanitiaan & Acara'`, `icon: '🎪'`, `memberLabel: 'Anggota Panitia'`, `memberPluralLabel: 'Daftar Panitia'`, `adminLabel: 'Ketua'`, `treasurerLabel: 'Bendahara'`, `communityLabel: 'Kepanitiaan'`, `billLabel: 'Iuran'`, `billPluralLabel: 'Iuran Panitia'`, `programLabel: 'Acara'`, `eventsLabel: 'Agenda'`;
  - `unitLabel: 'Seksi'` dan `unitPluralLabel: 'Seksi'` hanya sebagai fallback, karena tenant ini tidak memakai unit;
  - `features: { hasUnits: false, hasPrograms: true, hasMultiYearMatrix: false, hasRoomStatus: false, hasArisanDraw: false, hasStudentAttendance: false, hasPublicListing: false }`;
  - `incomeCategories`: Sponsor, Donasi, Penjualan Tiket, Dana Organisasi, Iuran Panitia, Lain-lain;
  - `expenseCategories`: Konsumsi, Perlengkapan, Dekorasi, Publikasi & Desain, Transportasi, Sewa Tempat & Alat, Pengisi Acara, Perizinan, Lain-lain;
  - template lain diberi `features.hasUnits: true` dan `hasPrograms: false`. Daftar kategori lama di `Expenses.jsx` ±39-47 dipindah menjadi `expenseCategories` template `rt_rw`, dan dipakai juga oleh Kos/Arisan/Kelas. Tambahkan juga `incomeCategories` umum: Sumbangan, Sewa Fasilitas, Denda, Lain-lain.
- `pages/onboarding/ChooseTenantType.jsx`:
  - opsi Kelas diganti Kepanitiaan & Acara, dengan deskripsi "Keuangan acara organisasi: anggaran, pemasukan, pengeluaran, laporan";
  - setelah dibuat, `panitia` diarahkan ke `/t/:id/setup`, sama dengan rt_rw dan kos (±122-127 dan ±172-176).
- Wizard baru `pages/onboarding/PanitiaSetupWizard.jsx`, dipanggil dari `SetupWizard.jsx` (pola dispatch ±340-352):
  1. **Organisasi.** Nama tenant, jenis organisasi (Sekolah/OSIS, Kampus/BEM, Karang Taruna, Komunitas, Rumah Ibadah, Perusahaan, Lainnya), deskripsi singkat, dan kontak.
  2. **Rekening penerima** (opsional; dipakai iuran di PANITIA-2). Pakai pola form rekening dan `pickBankAccountForForm` dari wizard Kelas.
  3. **Selesai.** Tautan undangan anggota (pola kode undangan wizard Kelas/Kos, pakai ulang kode yang sudah ada), lalu tombol "Buat Acara Pertama" ke `/t/:id/programs`.
  - Simpan lewat `updateTenantProfileAndSettings` dengan settings digabung: `organization_type`, `onboarding_completed: true`, dan rekening. **Tidak membuat unit.**
- `utils/joinForm.js`: `shouldAskUnit(tenantType)` bernilai `false` untuk `panitia`. `pages/public/JoinTenant.jsx` menyembunyikan pilihan unit bila `false` dan mengirim `unitId: null`. Pilihan status tinggal sudah tersembunyi untuk selain RT/RW.
- Label jenis: `components/TenantSwitcher.jsx` (ikon dan label), `pages/platform/PlatformTenantList.jsx` ±42, dan `services/dataHelpers.js` (label jabatan/occupancy, pola cabang `kelas`) mendapat entri `panitia`.
- Teks pemasaran yang menyebut Kelas (`Login.jsx` ±304, ±523; `Home.jsx` ±102, ±537, ±648; `account/MyTenants.jsx` ±53) diganti Kepanitiaan.
- Test:
  - template `panitia` ada dan semua template punya `features.hasUnits`;
  - `ChooseTenantType` menampilkan Kepanitiaan dan tidak menampilkan Kelas;
  - `shouldAskUnit`;
  - `PanitiaSetupWizard` menyimpan settings tanpa memanggil pembuatan unit.
- Commit: `feat(panitia): PANITIA-1.3 jenis tenant kepanitiaan dan setup`

## PANITIA-1.4 — Izin dan template jabatan
- `services/tenant/rbac.js`:
  - `PLATFORM_PERMISSIONS` ditambah `{ key: 'manage_programs', label: 'Kelola Acara & Anggaran', description: 'Membuat acara, mengubah status acara, dan menyusun anggaran (RAB)' }`;
  - `ROLE_TEMPLATES.panitia`:
    - **Ketua**: `manage_programs`, `manage_settings`, `manage_members`, `manage_announcements`, `view_reports`, `manage_expenses`;
    - **Wakil Ketua**: `manage_programs`, `manage_members`, `view_reports`;
    - **Sekretaris**: `manage_programs`, `manage_members`, `manage_announcements`, `view_reports`;
    - **Bendahara**: `manage_expenses`, `manage_billing_cash`, `manage_billing_transfer`, `generate_billing`, `view_reports`;
    - **Koordinator Seksi**: `view_reports`.
- `services/tenantAccess.js`:
  - `canManagePrograms = hasPerm('manage_programs') || hasPerm('manage_settings')`;
  - `canManageBudget = canManagePrograms || hasPerm('manage_expenses')`;
  - `canRecordIncome = hasPerm('manage_expenses') || hasPerm('manage_billing_cash')` (sama dengan RLS `non_ipl_incomes`);
  - ketiganya juga masuk objek default `false`.
- `pages/roles/ManageRoles.jsx` ±153-215: tombol template tampil bila `ROLE_TEMPLATES[activeTenant?.type]` ada, dan menerapkan template sesuai jenis tenant. Label: `rt_rw` → "RT/RW", `panitia` → "Kepanitiaan". Teks untuk RT/RW tidak berubah.
- Test:
  - semua izin di setiap `ROLE_TEMPLATES` ada di `PLATFORM_PERMISSIONS`;
  - flag baru untuk owner, pemegang izin terkait, dan anggota biasa;
  - `ManageRoles` tenant panitia menampilkan "Gunakan Template Jabatan Kepanitiaan".
- Commit: `feat(panitia): PANITIA-1.4 izin acara dan template jabatan kepanitiaan`

## PANITIA-1.5 — Service acara, anggaran, dan pemasukan
- File baru `services/tenant/programs.js`:
  - `PROGRAM_STATUS_LABELS`: `planning` Perencanaan, `running` Berjalan, `done` Selesai, `archived` Arsip;
  - `fetchPrograms(tenantId, { status } = {})`, `fetchProgram(tenantId, programId)`;
  - `createProgram(tenantId, { name, description, location, startsOn, endsOn, status, leadMemberId })`;
  - `updateProgram(tenantId, programId, fields)`: hanya field yang dikirim, dan filter juga `tenant_id`;
  - `deleteProgram(tenantId, programId)`. Error FK (`23503`) diterjemahkan menjadi "Acara yang sudah punya transaksi tidak bisa dihapus. Ubah statusnya menjadi Arsip.";
  - `fetchBudgetItems(tenantId, programId)`, `createBudgetItem(tenantId, programId, { kind, section, item, quantity, unitLabel, unitPrice, notes, sortOrder })`, `updateBudgetItem`, `deleteBudgetItem`. Jangan mengirim `amount` (kolom otomatis);
  - `fetchProgramTransactions(tenantId, programId)` → `{ incomes, expenses }`. Pemasukan hanya yang `deleted_at IS NULL`;
  - murni `summarizeProgram(budgetItems, incomes, expenses)` →
    `{ planned: { income, expense, balance }, actual: { income, expense, balance }, sections: [{ kind, section, planned, actual, variance, percent }], unbudgeted: { income, expense } }`.
    Transaksi tanpa pos masuk `unbudgeted`. Seksi kosong dinamai "Lainnya";
  - murni `countActivePrograms(programs)`: status `planning` atau `running`.
- File baru `services/tenant/incomes.js`:
  - `fetchTenantIncomes(tenantId, { programId, from, to } = {})`;
  - `createTenantIncome(tenantId, { incomeDate, amount, category, sourceName, description, paymentMethod, referenceNumber, programId, budgetItemId })`;
  - `updateTenantIncome`;
  - `deleteTenantIncome(tenantId, incomeId, { memberId })`: hapus lunak, mengisi `deleted_at = now()` dan `deleted_by = memberId`.
  - Validasi: jumlah > 0, kategori dan sumber tidak kosong, `paymentMethod` ∈ `cash` / `bank_transfer` / `qris` / `other`.
- `services/tenant/finance.js`: `fetchTenantExpenses` ikut memilih `program_id` dan `budget_item_id`. `createTenantExpense` / `updateTenantExpense` menerima `programId` dan `budgetItemId` (opsional, `null` untuk melepas).
- Semua ekspor baru diekspor ulang lewat `tenantOperationalService.js`.
- Test:
  - `summarizeProgram` (dua seksi, transaksi tanpa pos, melebihi anggaran);
  - `countActivePrograms`;
  - validasi pemasukan;
  - alur demo: buat acara, tambah RAB, catat pemasukan dan pengeluaran, lalu ringkasan benar.
- Commit: `feat(panitia): PANITIA-1.5 service acara, anggaran, dan pemasukan`

## PANITIA-1.6 — Halaman Pemasukan dan tautan acara di Pengeluaran
- Halaman baru `pages/tenant/TenantIncomes.jsx` (semua jenis tenant):
  - daftar pemasukan, dengan filter bulan dan acara;
  - total di atas;
  - form tambah/ubah: tanggal, kategori (`template.incomeCategories`), sumber, jumlah, metode, no. referensi, keterangan;
  - **Acara** dan **Pos anggaran** (hanya pos `income` dari acara terpilih) tampil bila tenant punya acara;
  - hapus dengan konfirmasi;
  - hak tulis: `canRecordIncome && canTransact`;
  - query `?program=<id>&new=1` membuka form dengan acara terisi.
- `pages/Expenses.jsx` (mode tenant saja):
  - kategori dari `template.expenseCategories`;
  - isian opsional **Acara** dan **Pos anggaran** (hanya pos `expense`);
  - kolom/badge nama acara di daftar;
  - query `?program=<id>&new=1` sama seperti di atas.
  - Jalur lama (tanpa tenant) tidak diubah.
- Test:
  - Pemasukan: render daftar, simpan dengan acara dan pos, dan tombol tulis tersembunyi tanpa izin;
  - Pengeluaran: simpan dengan acara, sehingga `createTenantExpense` menerima `programId`.
- Commit: `feat(finance): PANITIA-1.6 halaman pemasukan dan tautan acara di pengeluaran`

## PANITIA-1.7 — Halaman Acara dan laporan per acara
- `pages/tenant/Programs.jsx` (daftar acara):
  - tab "Aktif" (perencanaan + berjalan), "Selesai", dan "Arsip";
  - kartu acara: nama, tanggal, ketua, badge status, ringkasan rencana vs realisasi pengeluaran (progress bar), dan saldo;
  - tombol "Buat Acara" untuk `canManagePrograms`. Form: nama, deskripsi, lokasi, tanggal mulai/selesai, ketua acara (pilih dari anggota approved), dan status.
- `pages/tenant/ProgramDetail.jsx` (detail acara):
  - **Header:** nama, status, tanggal, lokasi, ketua. Pengelola melihat tombol Ubah, Ubah Status, dan Hapus. Gagal hapus menampilkan pesan dari service.
  - **Tab Ringkasan:**
    - kartu Rencana Pemasukan, Realisasi Pemasukan, Rencana Pengeluaran, Realisasi Pengeluaran, dan Saldo (realisasi pemasukan − realisasi pengeluaran);
    - tabel per seksi: rencana, realisasi, selisih, dan persen. Baris yang melebihi anggaran ditandai merah;
    - baris "Di luar anggaran" untuk transaksi tanpa pos.
  - **Tab Anggaran (RAB):**
    - tabel dikelompokkan Pemasukan/Pengeluaran lalu seksi, dengan kolom item, jumlah, satuan, harga satuan, total, dan realisasi;
    - tambah/ubah/hapus baris untuk `canManageBudget`;
    - total per kelompok.
  - **Tab Transaksi:**
    - pemasukan dan pengeluaran acara, urut tanggal, dengan badge jenis dan nama pos;
    - tombol "Catat Pemasukan" ke `/t/:id/incomes?program=<id>&new=1` dan "Catat Pengeluaran" ke `/t/:id/expenses?program=<id>&new=1`.
  - **Ekspor:**
    - "Unduh CSV" lewat `papaparse`: bagian RAB vs realisasi, lalu daftar transaksi;
    - "Cetak" lewat `window.print()` dengan gaya cetak yang menyembunyikan navigasi.
  - Anggota tanpa izin tulis melihat semua tab dalam mode baca.
- Test:
  - daftar acara dengan filter tab;
  - detail menampilkan ringkasan yang benar dari data demo;
  - tombol tulis tersembunyi untuk anggota biasa;
  - ekspor CSV memanggil `Papa.unparse`.
- Commit: `feat(panitia): PANITIA-1.7 halaman acara, anggaran, dan laporan per acara`

## PANITIA-1.8 — Rute, navigasi, dashboard, dan status langganan
- `App.jsx`, di bawah `/t/:tenantId` (lazy + `Suspense`, pola rute lain):
  - `programs` dan `programs/:programId` dengan `TenantAccessGuard require="isMember"`;
  - `incomes` dengan `require="canViewReports"`.
- `components/tenant/TenantShell.jsx`:
  - tenant dengan `features.hasPrograms`:
    - link kedua (desktop dan bottom nav mobile) menjadi "Acara" ke `/programs`, menggantikan tagihan. Iuran panitia datang di PANITIA-2;
    - link Unit disembunyikan bila `features.hasUnits === false`;
    - label link `events` memakai `template.eventsLabel` (default "Acara");
  - semua jenis tenant: link "Pemasukan" ke `/incomes` untuk `canViewReports`, di sebelah Pengeluaran.
- Dashboard: komponen baru `components/dashboard/PanitiaDashboard.jsx`, dipakai `TenantDashboard.jsx` untuk tenant `hasPrograms`, menggantikan Staff/CitizenDashboard. Banner setup tetap.
  - Isinya:
    - kartu acara aktif (nama, tanggal, status, progress realisasi vs rencana pengeluaran, saldo) dengan tautan ke detail;
    - aksi cepat sesuai izin: Buat Acara, Catat Pemasukan, Catat Pengeluaran;
    - bila belum ada acara: ajakan "Buat Acara Pertama" untuk pengelola, atau "Belum ada acara" untuk anggota.
- `pages/account/SubscriptionStatus.jsx`: untuk `panitia`, pemakaian ditampilkan sebagai "{n} acara aktif" (`countActivePrograms`), bukan jumlah unit.
- `pages/account/ChoosePlan.jsx`: untuk `panitia`, tampilkan "Harga paket Kepanitiaan (per acara aktif) segera tersedia" dan nonaktifkan checkout. Jangan memakai harga RT/RW sebagai cadangan.
- Test:
  - `TenantShell` panitia menampilkan Acara dan Pemasukan, tanpa Unit dan tanpa tagihan; RT/RW tetap seperti sekarang ditambah Pemasukan;
  - `PanitiaDashboard` dengan dan tanpa acara;
  - status langganan panitia menampilkan acara aktif.
- Commit: `feat(panitia): PANITIA-1.8 navigasi, dashboard, dan status langganan kepanitiaan`

---

## Di luar lingkup
- Iuran panitia (tagihan per anggota tanpa unit), dokumen acara di R2, dan LPJ siap cetak. Semuanya di **PANITIA-2**.
- Harga per acara aktif (**PANITIA-HARGA**).
- Penghapusan kode Kelas.

## Definition of Done
- `docs/handoff/PANITIA-1-report.md` berisi hash commit tiap task.
- `npx vitest run`, `npm run lint`, dan `npm run build` hijau, atau dicatat tidak bisa dijalankan.
- Claude: review, lalu menerapkan 1.2 ke dev (enum lebih dulu, lalu migration kedua dengan test sebagai penjaga), lalu push ke `main` atas izin user.
