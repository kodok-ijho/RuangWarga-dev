# Laporan Eksekusi DEBT-1: Kuitansi Jujur, Pemisahan Data Mock, & Modularisasi Service Tenant

> **Batch:** DEBT-1  
> **Branch:** `claude/eloquent-tesla-f0ddcr`  
> **Tanggal:** 11 Oktober 2026  
> **Status:** Selesai (Semua Task DEBT-1.1 – DEBT-1.4 Terpenuhi & Terverifikasi)

---

## 1. Ringkasan Eksekusi & Commit Hash

Semua task dikerjakan secara berurutan dengan 1 commit terpisah per task:

| Task ID | Commit Hash | Pesan Commit | Keterangan |
|---|---|---|---|
| **DEBT-1.1** | `7d91455` | `feat(receipt): DEBT-1.1 kuitansi jadi service sendiri dan tombol email dibatasi demo` | Ekstrak `receiptService.js`, isolasi tanpa mockData, signature baru multi-tenant, tombol email dibatasi `IS_DEMO` & ekstrak `ReceiptActions`. |
| **DEBT-1.2** | `a035a39` | `feat(billing): DEBT-1.2 gunakan sumber tunggal calculateQrisFee untuk demo langganan dan listing` | Sumber tunggal `calculateQrisFee` di `SubscriptionCheckout.jsx` (demo) dan `publicListingService.js`. |
| **DEBT-1.3** | `c48f8bf` | `refactor(mock): DEBT-1.3 pisahkan data mock ke dynamic import di luar bundle utama` | Dynamic import `mockData` di `tenantOperationalService`, `publicListingService`, dan `Login.jsx`. Data mock keluar dari chunk utama `index-*.js`. |
| **DEBT-1.4** | `d2f0211` | `refactor(tenant): DEBT-1.4 modularisasi tenantOperationalService per domain` | Modularisasi `tenantOperationalService` ke 8 modul `services/tenant/`, barrel export 61 fungsi/konstanta, bebas circular dependency. |

---

## 2. Audit Pemakaian `mockData` di `PaymentMatrix.jsx` & `PaymentVerification.jsx` (DEBT-1.3)

Audit komprehensif tanpa perubahan kode terhadap seluruh impor dan pemanggilan fungsi/data dari `mockData` yang tersisa:

### A. `PaymentMatrix.jsx`

| File : Baris | Nama Fungsi / Data | Penjagaan | Dampak di Produksi Bila Tidak Dijaga |
|---|---|---|---|
| `PaymentMatrix.jsx:319` | `getPaymentForBill` | `IS_DEMO` konstanta (`if (IS_DEMO) return ...`) | Aman di produksi; tidak pernah dieksekusi saat `IS_DEMO=false`. |
| `PaymentMatrix.jsx:391` | `getUnitById` | `IS_DEMO` konstanta (`return IS_DEMO ? getUnitById(unitId) : null`) | Aman di produksi; mengembalikan `null` di mode produksi. |
| `PaymentMatrix.jsx:609` | `getPaymentForBill` | `IS_DEMO` konstanta (`if (IS_DEMO) return myBills.map(...)`) | Aman di produksi; produksi memfilter `productionPayments`. |
| `PaymentMatrix.jsx:674` | `recordResidentPayment` | `IS_DEMO` konstanta (`if (IS_DEMO) ...`) | Aman di produksi; produksi memanggil alur pembayaran via API/gateway. |
| `PaymentMatrix.jsx:762` | `recordManualPayment` | `IS_DEMO` konstanta (`if (IS_DEMO) ...`) | Aman di produksi; produksi memanggil API `createCashPayment` / `submitManualPayment`. |
| `PaymentMatrix.jsx:1443` | `recordManualPayment` | `IS_DEMO \|\| qrisCheckoutData.demo` | Aman di produksi; produksi memverifikasi via `verifyQrisPayment` gateway. |
| `PaymentMatrix.jsx:1452` | `recordResidentPayment` | `IS_DEMO \|\| qrisCheckoutData.demo` | Aman di produksi; produksi memverifikasi via gateway. |
| `PaymentMatrix.jsx:1566` | `getPaymentForBill` | **TIDAK DIJAGA** (`propPayment \|\| (status === 'paid' ? getPaymentForBill(bill.id) : null)`) | **Risiko:** Jika sel berstatus `'paid'` namun `cell.payment` bernilai null/undefined, fungsi akan mencari ke in-memory mock. Bila ada ID tagihan riil yang bertabrakan dengan ID mock, cell akan menampilkan rincian pembayaran palsu dari mock data. |
| `PaymentMatrix.jsx:2431` | `getUnitById` | `IS_DEMO` konstanta (`unit \|\| (IS_DEMO && bill?.unit_id ? getUnitById(bill.unit_id) : null)`) | Aman di produksi; mengembalikan `null` jika unit tidak ditemukan di mode produksi. |
| `PaymentMatrix.jsx:2531` | `verifyPayment` | `IS_DEMO` konstanta (`if (IS_DEMO) ...`) | Aman di produksi; produksi memanggil `approveManualPayment` API. |
| `PaymentMatrix.jsx:2552` | `rejectPayment` | `IS_DEMO` konstanta (`if (IS_DEMO) ...`) | Aman di produksi; produksi memanggil `rejectManualPayment` API. |
| `PaymentMatrix.jsx:2622` | `cancelPayment` | `IS_DEMO` konstanta (`if (IS_DEMO) ...`) | Aman di produksi; produksi memanggil `portalApiPost('/payments/cancel', ...)`. |
| `PaymentMatrix.jsx:2663` | `revisePayment` | `IS_DEMO` konstanta (`if (IS_DEMO) ...`) | Aman di produksi; produksi mengembalikan toast info revisi belum didukung. |
| `PaymentMatrix.jsx:3019` | `sendEmailReceipt` | `IS_DEMO` konstanta (hanya dirender & dipanggil dalam blok `ReceiptActions` saat `isDemo=true`) | Aman di produksi; tombol kirim email tidak dirender di lingkungan produksi. |

---

### B. `PaymentVerification.jsx`

| File : Baris | Nama Fungsi / Data | Penjagaan | Dampak di Produksi Bila Tidak Dijaga |
|---|---|---|---|
| `PaymentVerification.jsx:222` | `getPendingPayments` | `IS_DEMO` konstanta (`if (IS_DEMO) { ... }`) | Aman di produksi; produksi memanggil query Supabase `fetchPayments`. |
| `PaymentVerification.jsx:224` | `mockPayments` | `IS_DEMO` konstanta (`setPayments(mockPayments)`) | Aman di produksi; produksi menggunakan data dari database Supabase. |
| `PaymentVerification.jsx:227` | `mockSettings` | `IS_DEMO` konstanta | Aman di produksi; produksi memuat dari `fetchSettings`. |
| `PaymentVerification.jsx:297` | `getUnitById` | **TIDAK DIJAGA** (`units.find(...) \|\| getUnitById(unitId)`) | **Risiko:** Bila unit operasional di produksi tidak ditemukan di database (mis. relasi terhapus/inkonsisten), helper otomatis melakukan fallback ke unit dummy Palm Village (`Blok A No. 1`), menampilkan informasi alamat palsu. |
| `PaymentVerification.jsx:301` | `getProfileById` | **TIDAK DIJAGA** (`residents.find(...) \|\| getProfileById(residentId)`) | **Risiko:** Bila ID profil pembayar di database tidak ditemukan, helper fallback ke profil warga dummy Palm Village (mis. `Pak Hendra`), menampilkan identitas yang salah pada detail verifikasi. |
| `PaymentVerification.jsx:367` | `verifyPayment` | `IS_DEMO` konstanta (`if (IS_DEMO) verifyPayment(...)`) | Aman di produksi; produksi memanggil `approveManualPayment` API. |
| `PaymentVerification.jsx:405` | `rejectPayment` | `IS_DEMO` konstanta (`if (IS_DEMO) rejectPayment(...)`) | Aman di produksi; produksi memanggil `rejectManualPayment` API. |
| `PaymentVerification.jsx:496` | `mockIPLBills` | `IS_DEMO` konstanta (`if (IS_DEMO) { ... }`) | Aman di produksi; produksi menggunakan relasi database `_bill.period`. |
| `PaymentVerification.jsx:919` | `mockIPLBills` | `IS_DEMO` konstanta (`selectedPayment.status === 'verified' && IS_DEMO`) | Aman di produksi; tombol aksi download kuitansi demo hanya aktif di demo. |
| `PaymentVerification.jsx:927` | `getIPLSchemaById` | `IS_DEMO` konstanta (`selectedPayment.status === 'verified' && IS_DEMO`) | Aman di produksi. |
| `PaymentVerification.jsx:940` | `mockIPLBills` | `IS_DEMO` konstanta (`selectedPayment.status === 'verified' && IS_DEMO`) | Aman di produksi. |
| `PaymentVerification.jsx:943` | `sendEmailReceipt` | `IS_DEMO` konstanta (`selectedPayment.status === 'verified' && IS_DEMO`) | Aman di produksi; tombol kirim email verifikasi tidak muncul di produksi. |

> **Rekomendasi untuk Batch Berikut:** Hapus fallback tanpa pengaman pada `PaymentMatrix.jsx:1566` (ganti jadi `cell.payment || null`), serta `PaymentVerification.jsx:297` & `PaymentVerification.jsx:301` (ganti jadi `null` bila tidak di demo).

---

## 3. Verifikasi Chunk MockData & Eliminasi Data Mock dari Bundle Utama

Setelah static import diubah menjadi dynamic import pada cabang demo di `tenantOperationalService`, `publicListingService`, dan `Login.jsx`:

1. **Pemeriksaan Chunk Utama (`index-*.js`):**
   ```bash
   $ grep -l "Ibu Ratna" client/dist/assets/index-*.js
   (output kosong / exit code 1)
   ```
2. **Chunk Terisolasi Data Mock:**
   Seluruh data mock ("Ibu Ratna", `mockUnits`, `mockResidents`, `mockIPLBills`, dsb.) kini berada secara eksklusif di dalam lazy chunk:
   - **Nama Chunk:** `client/dist/assets/mockData-CtbIoGfl.js` (Ukuran: 32.53 kB │ gzip: 9.66 kB).
   - Ukuran bundle utama `index-*.js` turun dari **255.87 kB** menjadi **223.58 kB** (penghematan ~32 kB pada first load).

3. **Verifikasi `receiptService.js`:**
   ```bash
   $ grep -rn "mockData" client/src/services/receiptService.js
   (output kosong / exit code 1)
   ```

---

## 4. Modularisasi `tenantOperationalService` per Domain (DEBT-1.4)

File monolitik `tenantOperationalService.js` (3.781 baris) telah dipecah menjadi 8 modul domain di `client/src/services/tenant/`, dan file utama diubah menjadi barrel export murni.

### A. Rincian Jumlah Baris Modul Baru

| File | Domain Tanggung Jawab | Jumlah Baris |
|---|---|:---:|
| `client/src/services/tenant/shared.js` | Re-export `supabase` dan `IS_DEMO` internal | 11 |
| `client/src/services/tenant/settings.js` | Pengaturan tenant, rekening bank, kode undangan unik, audit log | 544 |
| `client/src/services/tenant/members.js` | Manajemen unit, pendaftaran & approval anggota, cache demo units | 363 |
| `client/src/services/tenant/billing.js` | Perhitungan preview, tagihan berkala, kontrak & tagihan kos, SPP kelas | 660 |
| `client/src/services/tenant/payments.js` | Matriks tagihan, pencatatan, verifikasi, penolakan, revisi, & update pembayaran | 602 |
| `client/src/services/tenant/finance.js` | Pengeluaran kas, keuangan bulanan, saldo berjalan, kewajiban warga, dashboard | 853 |
| `client/src/services/tenant/arisan.js` | Putaran arisan, peserta, billing putaran, pengocokan pemenang, siklus baru | 460 |
| `client/src/services/tenant/rbac.js` | Izin platform (`PLATFORM_PERMISSIONS`), custom roles CRUD, penugasan peran | 349 |
| `client/src/services/tenantOperationalService.js` | **Barrel Export Murni** | 17 |
| **Total Keseluruhan** | | **3.859** |

### B. Konfirmasi Bebas Siklus / Circular Dependency

Pemeriksaan dependensi melingkar menggunakan `madge`:
```bash
$ npx --yes madge --circular src/services/tenant
- Finding files
Processed 15 files (3.3s) 

✔ No circular dependency found!
```
Topologi impor antar-modul bersifat Strictly Acyclic (DAG):
- `shared.js` tidak mengimpor modul apa pun di folder `tenant/`.
- `settings`, `members`, `arisan`, dan `rbac` hanya mengimpor dari `shared`.
- `billing` mengimpor dari `shared`, `settings`, dan `members`.
- `payments` mengimpor dari `shared` dan `members`.
- `finance` mengimpor dari `shared`, `members`, dan `payments`.

### C. Penjaga Ekspor (Exports Guard Test)

File test `client/src/services/tenantOperationalService.exports.test.js` memvalidasi bahwa seluruh **61 fungsi dan konstanta publik** tetap diekspor persis tanpa pengurangan:
- `INVITE_CODE_ALPHABET`, `PLATFORM_PERMISSIONS`
- 59 fungsi operasional (CRUD settings, members, units, billing, payments, expenses, arisan, roles).

---

## 5. Status Verifikasi Suite & Build

- **Vitest Suite:** 42 test files passed, **679 tests passed** (target DoD ≥ 672 test terpenuhi).
- **ESLint:** Lolos tanpa error atau warning (`npm run lint` exit code 0).
- **Vite Build:** Lolos tanpa error (`npm run build` exit code 0).
- **Integritas Sistem:** Tidak ada perubahan pada `api/n8n.js`, `supabase/`, `legacy-backend/`, maupun tarif QRIS live n8n lama `0.007` di `dataService.js`.
