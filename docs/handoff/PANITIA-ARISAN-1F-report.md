# PANITIA-ARISAN-1F Report — Perbaikan Susulan PANITIA-2, PANITIA-3, PANITIA-HARGA, ARISAN-1

Executor: Antigravity (agy). Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.

---

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan Berdasarkan Git Diff Sebenarnya |
|---|---|---|---|
| F.1 | `86d44bb`<br>`b73021c` | done | `pages/arisan/ArisanDraw.jsx`: daftar "Ikut kocok" dibangun dari `candidates` (`has_won = false`) dicocokkan dengan tagihan putaran `roundBills` per `member_id` yang berstatus `paid`; kandidat belum lunas masuk "Tidak ikut"; pemenang putaran terdahulu tidak masuk kedua daftar; tombol Kocok hanya aktif jika daftar "Ikut" minimal 1; label slot dibaca dari `cand.slot?.label`; seluruh pembacaan hadiah menggunakan `total_pool_amount` (hero, hasil kocok, modal perayaan, riwayat, teks WA); slot pemenang dicari dari `eligible_snapshot` (`slot_label`), fallback `-`; waktu kocok diambil dari `drawn_at` respons RPC/putaran. `pages/arisan/ArisanMyContributions.jsx`: link "Riwayat Transparan" membuka `?tab=history`; hadiah & slot membaca `total_pool_amount` dan snapshot. `utils/waReminder.js`: judul teks share diubah menjadi "HASIL KOCOKAN ARISAN". Test di `ArisanDraw.test.js`, `ArisanMyContributions.test.js`, `waReminder.test.js`. |
| F.2 | `811f35c`<br>`1ce7c3f` | done | `services/tenant/arisan.js`: `fetchMyArisanBills` mengurutkan tagihan belum lunas (`unpaid`, `pending_verification`) berdasarkan `due_date` terdekat (ascending); tagihan lunas/batal tetap di bagian bawah. `components/dashboard/CitizenDashboard.jsx`: kartu "Semua Setoran Lunas" tidak tampil saat memuat atau error; jika error menampilkan "Gagal memuat setoran" + tombol "Coba lagi"; teks diperbaiki tanpa menjanjikan ikut kocok ("Semua setoran Anda sudah lunas."). `pages/arisan/ArisanRounds.jsx`: tombol "Ingatkan via WA" hanya muncul bila peserta memiliki nomor HP; "Salin pengingat semua" dibungkus `try/catch` dengan toast error jika clipboard ditolak; link verifikasi menggunakan `canVerifyPayments` dari `useTenantAccess()`; tagihan `cancelled` diberi badge "Dibatalkan" tanpa aksi dan tidak dihitung sebagai "Belum bayar". Test di `ArisanRounds.test.js`, `arisan.test.js`. |
| F.3 | `629b46e` | done | `services/tenant/programs.js`: `fetchProgramTransactions` menangkap kegagalan `fetchProgramDues` (`console.error` + array kosong + flag `duesError`), sehingga pemasukan dan pengeluaran tetap tampil. `pages/tenant/ProgramDetail.jsx`: menampilkan banner peringatan "Data iuran gagal dimuat" jika `duesError` terjadi; tombol "Ingatkan via WA" hanya tampil untuk yang berwenang (`canGenerateBilling \|\| canRecordCash \|\| canVerifyPayments`); "Anggota Ditagih" membaca `summary.dues?.count ?? 0`; default tanggal jatuh tempo menggunakan `getLocalDateString()` (bukan UTC). `services/tenant/programDues.js`: error code `23505` diterjemahkan menjadi pesan ramah "Sebagian anggota sudah punya iuran aktif untuk acara ini. Muat ulang lalu coba lagi."; fungsi ubah nominal (`updateProgramDuesAmount`) dan batalkan (`cancelProgramDues`) mengunci klausa `.eq('status', 'unpaid')` saat update dengan cek baris terpengaruh (melempar pesan jika 0 baris). `services/tenant/payments.js`: mode demo `submitMemberTransfer` untuk iuran acara mengubah status tagihan di store menjadi `pending_verification`. `components/payments/MemberBillPayModal.jsx`: total tagihan yang ditampilkan menjumlahkan `amount + late_fee`. Test di `ProgramDetail.test.jsx`, `MemberBillPayModal.test.jsx`, `programDues.test.js`, `programs.test.js`. |
| F.4 | `d3f2c77` | done | `utils/date.js`: fungsi baru `formatDateWIB(value, opts)` menggunakan `Intl.DateTimeFormat` dengan zona `Asia/Jakarta`; tanggal kalender murni `YYYY-MM-DD` dibaca tanpa distorsi zona waktu. `pages/tenant/ProgramLpj.jsx`: default kota pengesahan `''` (bukan Jakarta); kolom tabel pengeluaran "Penerima" diganti "Kategori" (`exp.category`); seluruh penanggalan LPJ menggunakan `formatDateWIB`. `pages/tenant/ProgramDetail.jsx`: tombol "Buka" dokumen membuka tab sinkron (`window.open('', '_blank')`) sebelum `await getProgramDocumentUrl`, fallback `window.location.assign`, dengan penanganan error tertutup jika gagal; input file hanya menerima ekstensi `.pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp`; penanggalan dokumen memakai `formatDateWIB`. `services/tenant/programDocuments.js`: nama file > 200 karakter ditolak sebelum diunggah; `deleteProgramDocument` memverifikasi data terhapus dengan `.select('id')` dan melempar error jika 0 baris. Test di `date.test.js`, `programDocuments.test.js`, `ProgramLpj.test.jsx`, `ProgramDetail.test.jsx`. |
| F.5 | `29f875a`<br>`01b2410` | done | `services/tenant/programs.js`: `getProgramAccessState` mengembalikan `unlimited` untuk `tenantType !== 'panitia'` (termasuk saat `tenantType` null/undefined); `formatProgramAccessLabel` menggunakan `formatDateWIB`. `pages/tenant/TenantIncomes.jsx` & `pages/Expenses.jsx`: penanganan query `?program=<id>&new=1` menunggu daftar acara selesai termuat (`programsLoaded`); jika acara tidak `writable`, form tidak dibuka dan muncul toast penjelasan; `Expenses.jsx` memuat daftar acara mandiri tanpa menunggu `fetchExpenses`; penanganan error hapus pengeluaran menampilkan `err.message` server. `pages/account/SubscriptionStatus.jsx`: penanganan error memuat acara panitia menampilkan pesan "Gagal memuat acara." + "Coba lagi"; riwayat pembayaran kosong panitia tidak memuat teks "trial". `context/TenantContext.jsx`: tenant demo `panitia` baru berstatus `active`. `services/tenant/programs.js`: jatah gratis 1 bulan demo hanya diklaim sekali per tenant via set `demoFreeTrialClaimedTenants`. Harga: tampilan tarif memakai `formatRupiah(PANITIA_PRICING.pricePerProgram)` dari `config/panitiaPricing.js` di `SubscriptionStatus.jsx`, `ChoosePlan.jsx`, dan `ProgramDetail.jsx`. Test di `programs.test.js`, `TenantIncomes.test.jsx`, `Expenses.test.jsx`, `SubscriptionStatus.test.jsx`, `ChoosePlan.test.jsx`, `ProgramDetail.test.jsx`. |

---

## Daftar Commit Lengkap pada Branch

1. `86d44bb5afce47bfa35d319d97ddb06a8f3070d7` — `fix(arisan): F.1 layar kocok sesuai aturan server`
2. `811f35c84de3bee9a5e3e71cb2f5df6bd58b2a9e` — `fix(arisan): F.2 setoran dan pengingat arisan`
3. `629b46ef7f9d5c7d8c62ce7ca914943ae0f0cf3d` — `fix(panitia): F.3 iuran acara lebih tahan galat`
4. `d3f2c77890286ef397c62889ce8093740abe8527` — `fix(panitia): F.4 dokumen dan LPJ (WIB, buka di iOS, validasi)`
5. `29f875aa186e0cf3e78b860d8ec76d238bb65831` — `fix(panitia): F.5 masa aktif acara (deep link, WIB, demo)`
6. `b73021cd22a3caedeba0bf4e251938f466382e4d` — `fix(arisan): F.1 layar kocok sesuai aturan server`
7. `1ce7c3fcbdec268fd43a4bd0a6927405b95a348f` — `fix(arisan): F.2 setoran dan pengingat arisan`
8. `01b24106e9746a85412f7c39dbced03dd382b739` — `fix(panitia): F.5 masa aktif acara (deep link, WIB, demo)`

---

## Daftar File yang Dimodifikasi (Persis Berdasarkan Git Diff `7fd5a5c..HEAD`)

Sebanyak 35 file diubah, seluruhnya berada di folder `client/`:
- `client/src/components/dashboard/CitizenDashboard.jsx` (F.2)
- `client/src/components/payments/MemberBillPayModal.jsx` (F.3)
- `client/src/components/payments/MemberBillPayModal.test.jsx` (F.3)
- `client/src/context/TenantContext.jsx` (F.5)
- `client/src/pages/Expenses.jsx` (F.5)
- `client/src/pages/Expenses.test.jsx` (F.5)
- `client/src/pages/account/ChoosePlan.jsx` (F.5)
- `client/src/pages/account/ChoosePlan.test.jsx` (F.5)
- `client/src/pages/account/SubscriptionStatus.jsx` (F.5)
- `client/src/pages/account/SubscriptionStatus.test.jsx` (F.5)
- `client/src/pages/arisan/ArisanDraw.jsx` (F.1)
- `client/src/pages/arisan/ArisanDraw.test.js` (F.1)
- `client/src/pages/arisan/ArisanMyContributions.jsx` (F.1)
- `client/src/pages/arisan/ArisanMyContributions.test.js` (F.1)
- `client/src/pages/arisan/ArisanRounds.jsx` (F.2)
- `client/src/pages/arisan/ArisanRounds.test.js` (F.2)
- `client/src/pages/tenant/ProgramDetail.jsx` (F.3, F.4, F.5)
- `client/src/pages/tenant/ProgramDetail.test.jsx` (F.3, F.4, F.5)
- `client/src/pages/tenant/ProgramLpj.jsx` (F.4)
- `client/src/pages/tenant/ProgramLpj.test.jsx` (F.4)
- `client/src/pages/tenant/TenantIncomes.jsx` (F.5)
- `client/src/pages/tenant/TenantIncomes.test.jsx` (F.5)
- `client/src/services/tenant/arisan.js` (F.2)
- `client/src/services/tenant/arisan.test.js` (F.2)
- `client/src/services/tenant/payments.js` (F.3)
- `client/src/services/tenant/programDocuments.js` (F.4)
- `client/src/services/tenant/programDocuments.test.js` (F.4)
- `client/src/services/tenant/programDues.js` (F.3)
- `client/src/services/tenant/programDues.test.js` (F.3)
- `client/src/services/tenant/programs.js` (F.3, F.5)
- `client/src/services/tenant/programs.test.js` (F.3, F.5)
- `client/src/utils/date.js` (F.4)
- `client/src/utils/date.test.js` (F.4)
- `client/src/utils/waReminder.js` (F.1)
- `client/src/utils/waReminder.test.js` (F.1)

### File di Luar Dokumen Spesifikasi Awal & Alasannya:
1. `client/src/services/tenant/payments.js`:
   *Alasan:* Diperlukan untuk mengimplementasikan spesifikasi task F.3: *"mode demo submitMemberTransfer untuk iuran acara: iuran di store demo menjadi pending_verification"*.
2. `client/src/pages/account/ChoosePlan.jsx` & `client/src/pages/account/ChoosePlan.test.jsx`:
   *Alasan:* Diperlukan untuk mengimplementasikan spesifikasi harga task F.5: *"Harga: tampilan 'Rp25.000' memakai formatRupiah(PANITIA_PRICING.pricePerProgram) dari config/panitiaPricing.js"*.

---

## Output Verifikasi

### 1. Vitest (TZ=UTC)
```
 Test Files  93 passed (93)
      Tests  1228 passed (1228)
   Start at  23:17:49
   Duration  347.77s (transform 215.37s, setup 0ms, collect 908.94s, tests 137.80s, environment 878.22s, prepare 161.67s)
```

### 2. Vitest (TZ=Asia/Jakarta)
```
 Test Files  93 passed (93)
      Tests  1228 passed (1228)
   Start at  06:35:04
   Duration  494.56s (transform 263.86s, setup 0ms, collect 1257.66s, tests 191.13s, environment 1314.75s, prepare 167.30s)
```

### 3. ESLint (`npm run lint`)
```
> ruangwarga@1.0.1 lint
> eslint src
```
Hasil: Bersih (exit code 0, 0 error, 0 warning).

### 4. Build Vite (`npm run build`)
```
> ruangwarga@1.0.1 build
> vite build

vite v5.4.21 building for production...
✓ 892 modules transformed.
✓ built in 38.70s

PWA v1.3.0
mode      generateSW
precache  111 entries (6661.05 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```
Hasil: Sukses (exit code 0).

---

## Yang Gagal atau Tidak Dijalankan
- **Tidak ada task yang gagal:** Semua sub-task F.1 s/d F.5 selesai dan seluruh tes lulus di kedua zona waktu.
- **Tidak ada migration / Edge Function / SQL yang diubah atau dijalankan:** Sesuai batasan frontend batch PANITIA-ARISAN-1F, folder `supabase/migrations/` dan `supabase/functions/` sama sekali tidak disentuh.
