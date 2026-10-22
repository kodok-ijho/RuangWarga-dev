# PANITIA-2 — Iuran panitia per acara

Status: ✅ **Disetujui user 2026-10-22** (urutan kerja: PANITIA-2 → PANITIA-3 → PANITIA-HARGA → ARISAN-1, review di akhir). Termasuk migration PANITIA-2.1.

Dasar:
- `PANITIA-requirement.md` (keputusan 4: iuran panitia ditagih lewat aplikasi);
- jawaban user 2026-10-22: **nominal sama untuk semua anggota** per acara, dan masih bisa diubah per orang sebelum dibayar.

## Kondisi sekarang (hasil penelusuran Claude)
- Database sudah mendukung tagihan per anggota tanpa unit:
  - `billing_items.unit_id` boleh NULL;
  - trigger `guard_payment_insert` menerima pembayaran anggota bila `bill.member_id = NEW.member_id` (transfer + `pending_verification`);
  - `trg_sync_bill_status_after_payment` mengubah tagihan menjadi `pending_verification` saat pembayaran diajukan;
  - `verifyTenantPayment` (`services/tenant/payments.js` ±248) menandai tagihan `paid`.
- Belum ada halaman anggota yang menampilkan tagihan tanpa unit:
  - `fetchTenantBillMatrix` hanya per unit dan per periode tahun fiskal;
  - "Tagihan Saya" di `PaymentMatrix.jsx` mencari tagihan lewat `unit_id` anggota.
- `submitTenantPayment(tenantId, { billId, method, amount, proofFile, note, memberId, isStaff })` (`payments.js` ±401) sudah bisa dipakai untuk bayar transfer (anggota) dan tunai (staf).
- `PaymentVerification.jsx` tidak rusak untuk tagihan tanpa unit, tetapi kolom unit tampil "-".

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit, push setelah setiap commit. Jangan push ke `main`.
- Ikuti `docs/handoff/README.md`, `AGENT.md`, dan `PANITIA-1-review.md` § "Catatan untuk executor". Path relatif ke `client/src/` kecuali disebut lain.
- 🚫 Jangan mengubah:
  - `services/dataService.js`, `services/apiClient.js`;
  - `api/`, `legacy-backend/`, `.env*`;
  - migration lama;
  - `pages/NonIplIncomes.jsx`.
- Jangan menjalankan SQL ke Supabase, dan jangan men-deploy Edge Function.
- Setiap `select` / embed Supabase harus memakai nama kolom yang benar menurut migration. Contoh: `tenant_members.full_name` dan `phone`; status tagihan hanya `unpaid` / `pending_verification` / `paid` / `cancelled`.
- Dukung mode demo (store memori). Test baru mengimpor kode asli. Test yang memakai tanggal harus lulus di zona waktu mana pun.
- Ekspor baru lewat `tenantOperationalService.js` → perbarui `tenantOperationalService.exports.test.js`.
- ID demo: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.

---

## PANITIA-2.1 — Migration iuran acara
- Salin **persis** dengan `cp`: `docs/handoff/assets/PANITIA-2/program_dues.sql` → `supabase/migrations/202610220001_program_dues.sql`. Claude sudah dry-run (lulus).
- Test `supabase/tests/program_dues_matrix.sql` (pola dan aturan fixture sama dengan `supabase/tests/tenant_programs_matrix.sql`; tenant jenis `panitia`):
  - **D1.** Bendahara (`generate_billing` + `manage_billing_transfer`) menerbitkan iuran anggota M untuk acara P (`unit_id` NULL).
  - **D2.** Iuran kedua untuk M di P ditolak `unique_violation`.
  - **D3.** Iuran acara tanpa `member_id` ditolak `check_violation`.
  - **D4.** Iuran dengan acara tenant lain ditolak `foreign_key_violation`.
  - **D5.** M melihat tagihannya dan mengajukan pembayaran transfer (`pending_verification` + `proof_url`), sehingga tagihan menjadi `pending_verification`.
  - **D6.** Bendahara meng-update pembayaran menjadi `completed`, lalu tagihan menjadi `paid` (seperti `verifyTenantPayment`: update `payments`, lalu update `billing_items`). `verified_by` terisi id anggota bendahara.
  - **D7.** Setelah iuran berstatus `cancelled`, iuran baru untuk anggota yang sama boleh diterbitkan.
- Commit: `feat(panitia): PANITIA-2.1 migration iuran panitia per acara`

## PANITIA-2.2 — Service iuran
- `services/tenant/payments.js`: fungsi baru `submitMemberTransfer(tenantId, { billId, proofFile, note, memberId })`. Ini pembungkus `submitTenantPayment` dengan `method: 'bank_transfer'`, `isStaff: false`. Bukti wajib (JPG/PNG/WebP/PDF ≤ 5 MB). Dipakai juga oleh ARISAN-1.
- File baru `services/tenant/programDues.js`:
  - `fetchProgramDues(tenantId, programId)`:
    - `billing_items` dengan `program_id` = acara, embed `member:tenant_members(id, full_name, phone)`;
    - urut nama anggota;
    - setiap item membawa `payments` terbaru (status, metode, `paid_at`).
  - `createProgramDues(tenantId, programId, { amount, dueDate, memberIds, note, programName })`:
    - validasi `amount > 0`, `dueDate` (`YYYY-MM-DD`), dan `memberIds` tidak kosong;
    - lewati anggota yang sudah punya iuran aktif di acara itu;
    - insert dengan `member_id`, `unit_id: null`, `program_id`, `period` = `YYYY-MM` dari `dueDate`, `due_date`, `status: 'unpaid'`, dan `metadata: { bill_type: 'program_dues', program_id, program_name, note }`;
    - kembalikan `{ created, skipped }`.
  - `updateProgramDuesAmount(tenantId, billId, amount)`: hanya bila status `unpaid`.
  - `cancelProgramDues(tenantId, billId)`: hanya bila `unpaid`, menjadi `cancelled`.
  - `recordProgramDuesCash(tenantId, billId, { note })`: `submitTenantPayment` dengan `method: 'cash'`, `isStaff: true`.
  - `fetchMyProgramDues(tenantId, memberId)`: iuran milik anggota (semua acara), embed `program:tenant_programs(id, name)`. Urutan: belum lunas dulu, lalu terbaru.
  - murni `summarizeProgramDues(bills)` → `{ count, billed, collected, pending, unpaidCount }`. Iuran yang `cancelled` tidak dihitung; `collected` = jumlah tagihan `paid`.
- `services/tenant/programs.js`:
  - `summarizeProgram(budgetItems, incomes, expenses, dues = [])`: tambah field `dues` (hasil `summarizeProgramDues`), dan `actual.income` ditambah `dues.collected`. Iuran tidak masuk `planned` (rencana tetap dari RAB) maupun `unbudgeted`.
  - `fetchProgramsOverview`: tambah query ke-5 (iuran per acara: `billing_items` dengan `program_id` tidak null dan status bukan `cancelled`).
  - `fetchProgramTransactions`: ikut mengembalikan `dues`.
- `utils/waReminder.js`: `buildProgramDuesReminderMessage({ memberName, programName, amount, dueDate, bankAccount, tenantName, appUrl })`. Pola teks mengikuti `buildBillReminderMessage`.
- Test:
  - `summarizeProgramDues`;
  - `summarizeProgram` dengan iuran (`actual.income` bertambah hanya dari yang lunas);
  - validasi `createProgramDues`;
  - alur demo: terbitkan 3 iuran, 1 dilewati karena sudah ada, lalu bayar tunai, lalu ringkasan;
  - `buildProgramDuesReminderMessage`;
  - `submitMemberTransfer` menolak tanpa bukti.
- Commit: `feat(panitia): PANITIA-2.2 service iuran panitia`

## PANITIA-2.3 — Tab Iuran di detail acara (pengelola)
- `pages/tenant/ProgramDetail.jsx`: tab baru **"Iuran"** di antara Transaksi dan tombol ekspor.
  - **Ringkasan:** jumlah anggota ditagih, total ditagih, terkumpul, menunggu verifikasi, belum bayar.
  - **Tabel anggota:** nama, nominal, jatuh tempo, dan badge status (Belum bayar / Menunggu verifikasi / Lunas / Dibatalkan). Aksi per baris:
    - "Catat Tunai": `canRecordCash`, status `unpaid`;
    - "Ingatkan via WA": `buildProgramDuesReminderMessage` + `buildWaLink`, status `unpaid`; tanpa nomor HP tetap membuka `wa.me/?text=`;
    - "Ubah Nominal": `canGenerateBilling`, status `unpaid`;
    - "Batalkan": `canGenerateBilling`, status `unpaid`, dengan konfirmasi;
    - "Verifikasi": tautan ke halaman verifikasi pembayaran untuk status `pending_verification` (`canVerifyPayments`).
  - **Tombol "Terbitkan Iuran"** (`canGenerateBilling`) membuka form:
    - nominal per anggota dan jatuh tempo;
    - daftar centang anggota `approved` (default semua yang belum punya iuran di acara ini; owner ikut tercentang dan boleh dihilangkan);
    - catatan opsional;
    - toast "{created} iuran diterbitkan, {skipped} sudah ada".
  - **Rekening penerima:** baca dari settings tenant (helper rekening PAY-2 yang sudah dipakai halaman lain). Bila belum ada, tampilkan peringatan "Isi rekening penerima di Pengaturan agar anggota bisa transfer".
  - Semua tombol tulis tersembunyi saat `!canTransact`.
- Tab Ringkasan: baris "Iuran panitia" (terkumpul dari total ditagih).
- Ekspor CSV dan cetak: bagian Iuran (nama, nominal, status).
- Test:
  - tab Iuran menampilkan status anggota;
  - form menerbitkan memanggil `createProgramDues` dengan anggota terpilih;
  - tombol tulis tersembunyi untuk anggota biasa;
  - tombol WA membentuk link `wa.me`.
- Commit: `feat(panitia): PANITIA-2.3 tab iuran di detail acara`

## PANITIA-2.4 — Iuran Saya (anggota)
- Komponen baru `components/payments/MemberBillPayModal.jsx` (dipakai ulang ARISAN-1). Props: `{ tenantId, bill, title, onClose, onPaid }`.
  - Tampilkan nominal, jatuh tempo, rekening penerima tenant beserta tombol salin nomor rekening, unggah bukti (JPG/PNG/WebP/PDF ≤ 5 MB), dan catatan.
  - Kirim lewat `submitMemberTransfer` dengan `memberId` = `activeMember.id`. Tombol kirim dikunci selama proses.
  - Bila rekening tenant kosong: "Pengelola belum mengisi rekening penerima. Hubungi bendahara."
- `components/dashboard/PanitiaDashboard.jsx`: kartu **"Iuran Saya"** untuk semua anggota yang punya iuran (`fetchMyProgramDues`).
  - Per acara: nama acara, nominal, status.
  - Tombol "Bayar" (status `unpaid`) membuka `MemberBillPayModal`.
  - Status `pending_verification` → "Menunggu verifikasi bendahara". Status `paid` → "Lunas".
- `ProgramDetail`: bila anggota yang login punya iuran di acara itu, tampilkan banner kecil status iurannya dengan tombol Bayar.
- Test:
  - kartu Iuran Saya tampil dengan 1 iuran `unpaid`;
  - modal menolak kirim tanpa bukti;
  - kirim memanggil `submitMemberTransfer` dengan `memberId`.
- Commit: `feat(panitia): PANITIA-2.4 iuran saya dan bayar iuran anggota`

## PANITIA-2.5 — Verifikasi pembayaran untuk iuran tanpa unit
- `pages/PaymentVerification.jsx`: untuk tagihan dengan `metadata.bill_type === 'program_dues'` (atau `program_id` terisi), kolom unit menampilkan "Iuran: {program_name}", bukan "-". Label "Blok" tidak tampil untuk baris itu.
- Pastikan `fetchTenantPayments` ikut membawa `program_id` / `metadata` tagihan yang dibutuhkan. Jangan mengubah perilaku untuk tagihan RT/RW atau Kos.
- `components/tenant/TenantShell.jsx`: untuk tenant `hasPrograms`, tambah link "Verifikasi" ke rute verifikasi pembayaran yang sudah ada, untuk `canVerifyPayments` (desktop dan drawer). Bottom nav tidak diubah.
- Test:
  - baris verifikasi iuran menampilkan nama acara;
  - baris RT/RW tetap "Blok …";
  - link Verifikasi tampil untuk bendahara panitia.
- Commit: `feat(panitia): PANITIA-2.5 verifikasi pembayaran iuran acara`

## Definition of Done
- `docs/handoff/PANITIA-2-report.md` berisi hash commit tiap task, nama file persis, dan ringkasan vitest yang disalin apa adanya.
- `npx vitest run` (seluruh suite), `npm run lint`, dan `npm run build` hijau.
- Claude: review, lalu menerapkan migration 2.1 ke dev, lalu lapor ke user.
