# PANITIA-2 Report — Iuran Panitia per Acara

Executor: Antigravity (agy). Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.

---

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan Berdasarkan Diff Sebenarnya |
|---|---|---|---|
| PANITIA-2.1 | `2bb7077` | done | Salin migration `supabase/migrations/202610220001_program_dues.sql` persis dari `docs/handoff/assets/PANITIA-2/program_dues.sql` dengan `cp`. Membuat test SQL matrix `supabase/tests/program_dues_matrix.sql` mencakup seluruh skenario D1 s/d D7 (terbit iuran tanpa unit, tolak duplikat aktif, tolak tanpa member_id, tolak lintas-tenant, pengajuan bukti transfer menjadi pending_verification, verifikasi menjadi completed/paid, dan penerbitan ulang setelah status cancelled). |
| PANITIA-2.2 | `4ad3957` | done | Tambah fungsi `submitMemberTransfer` di `client/src/services/tenant/payments.js` dengan validasi ketat bukti file (JPG, PNG, WebP, PDF ≤ 5 MB). File baru `client/src/services/tenant/programDues.js` mengimplementasikan fungsi operasional `fetchProgramDues`, `createProgramDues` (validasi amount > 0, dueDate, memberIds, skip existing active dues), `updateProgramDuesAmount`, `cancelProgramDues`, `recordProgramDuesCash`, `fetchMyProgramDues`, dan pure helper `summarizeProgramDues` serta store in-memory demo. Memperbarui `summarizeProgram` di `programs.js` untuk menerima iuran acara (`actual.income` ditambah `dues.collected`), memperbarui `fetchProgramsOverview` (5 query paralel) dan `fetchProgramTransactions`. Membuat builder pesan WA `buildProgramDuesReminderMessage` di `client/src/utils/waReminder.js`. Menambahkan re-export ke `tenantOperationalService.js` dan sinkronisasi penjaga export di `tenantOperationalService.exports.test.js` (108 → 118 exports). Test komprehensif di `programDues.test.js`, `programs.test.js`, dan `waReminder.test.js`. |
| PANITIA-2.3 | `574996b` | done | `client/src/pages/tenant/ProgramDetail.jsx`: menambahkan tab baru **"Iuran"** dengan kartu metrik ringkasan (jumlah ditagih, total ditagih, terkumpul, menunggu verifikasi, belum bayar), tabel status per anggota beserta aksi kontekstual (Catat Tunai, Ingatkan via WA dengan wa.me link, Ubah Nominal, Batalkan dengan konfirmasi, dan tautan Verifikasi untuk pembayaran transfer), modal "Terbitkan Iuran" dengan seleksi anggota approved dan toast ringkasan, pembacaan nomor rekening dari settings tenant, integrasi baris Iuran di tab Ringkasan, serta seksi Iuran pada ekspor CSV dan tampilan cetak (`print:block`). Test di `client/src/pages/tenant/ProgramDetail.test.jsx`. |
| PANITIA-2.4 | `7e95b22` | done | Komponen baru `client/src/components/payments/MemberBillPayModal.jsx`: modal pembayaran iuran mandiri anggota dengan rincian rekening penerima, tombol salin nomor rekening, unggah bukti transfer dengan validasi format/ukuran file (JPG/PNG/WebP/PDF ≤ 5 MB), catatan opsional, tombol submit terkunci selama proses, memanggil `submitMemberTransfer`. `client/src/components/dashboard/PanitiaDashboard.jsx`: menambahkan kartu "Iuran Saya" untuk anggota login (`fetchMyProgramDues`) dengan rincian acara, status iuran (Belum bayar / Menunggu verifikasi / Lunas), dan tombol Bayar. `client/src/pages/tenant/ProgramDetail.jsx`: menampilkan banner status iuran pribadi anggota login di acara terkait dengan tombol Bayar bila belum lunas. Test di `MemberBillPayModal.test.jsx`, `PanitiaDashboard.test.jsx`, dan `ProgramDetail.test.jsx`. |
| PANITIA-2.5 | `b5027b5` | done | `client/src/services/tenant/payments.js`: `fetchTenantPayments` ikut membawa `program_id`, `metadata`, dan embed `program:tenant_programs(id, name)`; `submitTenantPayment` menyimpan metadata `bill_type`, `program_id`, dan `program_name`. `client/src/pages/PaymentVerification.jsx`: menambahkan helper `getPaymentUnitDisplay` di mana tagihan iuran panitia (`program_id` / `bill_type === 'program_dues'`) menampilkan teks `"Iuran: {program_name}"` tanpa kata "Blok" dan bukan "-"; label "Nomor Unit" di modal detail disesuaikan menjadi "Keterangan". `client/src/components/tenant/TenantShell.jsx`: untuk tenant yang memiliki fitur program (`hasPrograms`), menambahkan menu "Verifikasi" ke navigasi desktop dan mobile drawer untuk bendahara/admin (`canVerifyPayments`) mengarah ke rute verifikasi pembayaran; mobile bottom nav tetap dipertahankan. Test di `client/src/pages/PaymentVerification.test.jsx` dan `client/src/components/tenant/TenantShell.test.jsx`. |

---

## Daftar File yang Dibuat / Dimodifikasi per Commit

### PANITIA-2.1 (`2bb7077`)
- `supabase/migrations/202610220001_program_dues.sql` *(baru)*
- `supabase/tests/program_dues_matrix.sql` *(baru)*

### PANITIA-2.2 (`4ad3957`)
- `client/src/services/tenant/payments.js`
- `client/src/services/tenant/programDues.js` *(baru)*
- `client/src/services/tenant/programDues.test.js` *(baru)*
- `client/src/services/tenant/programs.js`
- `client/src/services/tenant/programs.test.js`
- `client/src/services/tenantOperationalService.exports.test.js`
- `client/src/services/tenantOperationalService.js`
- `client/src/utils/waReminder.js`
- `client/src/utils/waReminder.test.js`

### PANITIA-2.3 (`574996b`)
- `client/src/pages/tenant/ProgramDetail.jsx`
- `client/src/pages/tenant/ProgramDetail.test.jsx`

### PANITIA-2.4 (`7e95b22`)
- `client/src/components/dashboard/PanitiaDashboard.jsx`
- `client/src/components/dashboard/PanitiaDashboard.test.jsx`
- `client/src/components/payments/MemberBillPayModal.jsx` *(baru)*
- `client/src/components/payments/MemberBillPayModal.test.jsx` *(baru)*
- `client/src/pages/tenant/ProgramDetail.jsx`

### PANITIA-2.5 (`b5027b5`)
- `client/src/components/tenant/TenantShell.jsx`
- `client/src/components/tenant/TenantShell.test.jsx`
- `client/src/pages/PaymentVerification.jsx`
- `client/src/pages/PaymentVerification.test.jsx`
- `client/src/services/tenant/payments.js`

---

## Output Verifikasi

### 1. Vitest Suite Keseluruhan (`cd client && npx vitest run`)

Baris ringkasan vitest disalin apa adanya:
```
 Test Files  90 passed (90)
      Tests  1174 passed (1174)
   Start at  12:23:50
   Duration  280.38s (transform 189.34s, setup 0ms, collect 756.52s, tests 94.41s, environment 696.98s, prepare 115.82s)
```

### 2. ESLint (`cd client && npm run lint`)

```
> ruangwarga@1.0.1 lint
> eslint src
```
Hasil: Lolos bersih tanpa error dan tanpa warning (exit code 0).

### 3. Production Build (`cd client && npm run build`)

```
✓ built in 35.18s

PWA v1.3.0
mode      generateSW
precache  109 entries (6575.08 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```
Hasil: Build produksi Vite sukses tanpa error (exit code 0).

---

## Item yang Gagal atau Tidak Dijalankan
- **Tidak ada yang gagal**: Semua task PANITIA-2.1 sampai PANITIA-2.5 selesai, seluruh unit test lulus (1174/1174), lint bersih, dan build produksi berhasil.
- **Dikecualikan sesuai aturan**: SQL migration tidak dieksekusi langsung ke server Supabase dan Edge Function tidak di-deploy (sesuai peran Antigravity sebagai Executor di repo).
