# DEBT-1 — Kuitansi jujur, data mock keluar dari bundle utama, pecah service tenant

Baca `docs/handoff/README.md`, AGENT.md, `BACKLOG.md`, dan `BRAND-1F-review.md` (L1, L2) dulu.
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit; test ikut di commit task-nya. Tanpa migration. Kerjakan berurutan; DEBT-1.4 paling akhir.

🚫 Jangan sentuh `api/n8n.js`, `supabase/`, `legacy-backend/`, maupun `services/dataService.js`.
🚫 Tarif `0.007` di `dataService.js`, `NonIplIncomes.jsx`, `PaymentMatrix.jsx` (±1723, ±1966), dan `components/payment/PaymentFlowModal.jsx` adalah tarif jalur QRIS warga lama (n8n Palm Village). **Jangan diubah.** Tarif 0,75% hanya untuk langganan & iklan platform.
Jangan ganti class `.pv-*`, nomor kuitansi `PV/IPL/…`, atau domain placeholder `@warga.palmvillage.local` (dipakai juga oleh workflow n8n live).

Fakta yang sudah dicek Claude:
- **Static import `services/mockData.js`** ada di 5 file:
  - `pages/Login.jsx` (`mockUnits`, hanya form daftar demo ±453 dan fallback label ±285);
  - `services/tenantOperationalService.js` (`mockUnits`, `mockProfiles` di ±577 dan ±2722);
  - `services/publicListingService.js` (`mockListingPricing` ±214, `mockPublicListings` ±239 di level modul);
  - `pages/PaymentMatrix.jsx` dan `pages/PaymentVerification.jsx` (banyak fungsi mock).
- Akibatnya data mock ("Ibu Ratna", dst.) ikut masuk chunk utama `dist/assets/index-*.js`.
- `tenantOperationalService.js` berukuran 3.775 baris dengan 61 export.

---

## DEBT-1.1 — Kuitansi jadi service sendiri, tombol email hanya di demo (L1, L2)

**`services/receiptService.js` (baru)**
- Pindahkan `escapeHtml`, `buildDigitalReceiptHtml`, dan `downloadDigitalReceipt` dari `mockData.js` ke sini. Hapus dari `mockData.js`.
- File ini **tidak boleh** meng-import `mockData.js`.
- Signature baru: `buildDigitalReceiptHtml({ bill, unit, owner, occupant, tenantName, billLabel, unitLabel, schemaName })`.
  - Nominal = `Number(bill?.amount) || 0`, tanpa fallback skema mock.
  - Baris "Skema IPL" diganti label "Jenis Tagihan" dengan nilai `schemaName || billLabel || 'Iuran'`.
  - Baris "Unit Rumah" diganti label `unitLabel || 'Unit'`.
  - Subjudul menjadi "Diterbitkan melalui RuangWarga".
  - Semua nilai teks tetap di-escape.

**Pemanggil**
- `PaymentMatrix.jsx` ±2945: kirim `billLabel` / `unitLabel` dari template yang sudah ada di komponen itu.
- `PaymentVerification.jsx` ±920 (demo): kirim `schemaName` dari skema mock (`getIPLSchemaById(unit?.ipl_schema_id)?.name`; boleh import dari `mockData` karena jalur demo).
- `PaymentMatrix.jsx` ±1093 (demo): `downloadDigitalReceipt(item?.payment || item)` mengirim objek yang salah bentuk.
  - Baca bentuk `selectedItem` di `components/payment/PaymentHistoryList.jsx` ±278.
  - Kirim `{ bill, unit, tenantName, billLabel, unitLabel }` yang benar.

**Tombol "📧 Kirim ke Email" (`PaymentMatrix.jsx` ±2951)**
- Render **hanya bila `IS_DEMO`**. Belum ada backend email, jadi di produksi tombol ini tidak boleh ada.
- Tombol unduh tetap tampil. Bila tombol email hilang, ubah grid dua kolom menjadi satu kolom.
- `PaymentVerification.jsx` sudah di dalam blok `IS_DEMO`, jadi biarkan.
- `sendEmailReceipt` tetap di `mockData.js` karena memang simulasi demo.

**Test**
- Pindahkan `services/receipt.test.js` menjadi `services/receiptService.test.js`.
- Tambah kasus:
  - nominal dari `bill.amount`;
  - `billLabel`/`unitLabel` tampil;
  - tidak ada teks "IPL Basic" bila `schemaName` kosong.
- Render `PaymentDetailModal`/area tombol di non-demo → tidak ada teks "Kirim ke Email". Bila merender modal terlalu berat, ekstrak tombol-tombol kuitansi menjadi komponen kecil `ReceiptActions` dan test komponen itu.

## DEBT-1.2 — Biaya QRIS demo langganan memakai sumber tunggal
- `pages/account/SubscriptionCheckout.jsx` ±45-58 (blok `isDemo`): pakai `calculateQrisFee(finalTotal)` dari `services/dokuProtocol.js`. Isi `baseAmount: finalTotal`, `qrisFee: fee`, `amount: total`.
- `services/publicListingService.js` ±506: ganti `Math.ceil(baseAmount * 0.0075)` dengan `calculateQrisFee` (hasil sama).
- Test: demo checkout Rp100.000 → fee 750, total 100.750.

## DEBT-1.3 — Data mock keluar dari chunk utama
Ubah static import `mockData` menjadi `await import('./mockData')` (atau path relatif yang sesuai) **di dalam cabang demo**. Pola ini sudah dipakai di `tenantOperationalService.js` ±779.
- `services/tenantOperationalService.js`: hapus import di baris 10.
  - `fetchTenantUnits` ±577: dynamic import di cabang demo.
  - `resolveCitizenObligationAndUnit` (±2707) **tetap sinkron**. Tambah parameter opsional `demoProfiles = []` dan `demoUnits = []`, lalu pakai keduanya di cabang `isDemo` menggantikan `mockProfiles`/`mockUnits`.
  - Pemanggil demo satu-satunya, `fetchTenantDashboardData` ±2859 (fungsi `async`, cabang `isDemoOrMock`), mengisi parameter itu dari `await import('./mockData')`. Pemanggil ±2941 (`isDemo: false`) tidak berubah.
  - Test di `components/payment/payment.test.jsx` yang memakai `isDemo: true` boleh ditambah argumen `demoProfiles`/`demoUnits`; **asersinya tidak boleh diubah**.
- `services/publicListingService.js`: `inMemoryListings` jangan diisi di level modul. Buat fungsi `async getInMemoryListings()` yang mengisi sekali (lazy) dari dynamic import. `mockListingPricing` juga di-load di cabang demo.
- `pages/Login.jsx`:
  - daftar unit form daftar demo dimuat ke state lewat dynamic import saat `IS_DEMO_MODE` (mis. `useEffect`);
  - fallback label ±285 memakai state yang sama;
  - tampilan demo tidak berubah.
- `PaymentMatrix.jsx` dan `PaymentVerification.jsx` **jangan diubah** di task ini.
- **Audit (wajib, tanpa mengubah kode):** di `DEBT-1-report.md` buat tabel setiap pemakaian fungsi/data dari `mockData` yang tersisa di `PaymentMatrix.jsx` dan `PaymentVerification.jsx`. Kolom:
  - `file:baris`;
  - nama;
  - penjagaan: `IS_DEMO` konstanta / kondisi runtime / tidak dijaga;
  - dampak di produksi bila tidak dijaga.
  Claude memutuskan perbaikannya di batch berikut.
- Verifikasi setelah `npm run build`:
  - `grep -l "Ibu Ratna" dist/assets/index-*.js` → kosong;
  - catat di laporan nama chunk yang sekarang berisi data mock.
- Test yang memakai data mock tetap lulus. Bila ada test yang bergantung pada inisialisasi level modul, sesuaikan cara test-nya, bukan perilakunya.

## DEBT-1.4 — Pecah `tenantOperationalService.js` per domain (pindah saja, tanpa ubah logika)

**Langkah 1, sebelum memindah apa pun**
Buat `services/tenantOperationalService.exports.test.js` yang mengimpor modul dan mencocokkan `Object.keys(mod).sort()` dengan daftar tetap (hasil cetak saat ini, 61 nama). Test ini menjadi penjaga.

**Langkah 2 — pindahkan isi ke folder `services/tenant/`**

| File | Isi (baris saat ini, ± setelah DEBT-1.3) |
|---|---|
| `shared.js` | import supabase, `IS_DEMO`, dan helper internal (non-export) yang dipakai ≥2 modul. Tidak meng-import modul lain di folder ini. |
| `settings.js` | 27–568: kode undangan, `fetchTenantDetails`, `updateTenantProfileAndSettings`, rekening, `isLegacyQrisEnabled`, audit |
| `members.js` | 569–922: unit, `getInviteDetails`, join, anggota |
| `billing.js` | 923–1569 + `generateKelasSppBilling` (±3443): preview, billing items, kontrak & tagihan kos |
| `payments.js` | 1570–2164: matriks tagihan, pembayaran (submit/verify/reject/update) |
| `finance.js` | 2165–2983: pengeluaran, keuangan bulanan, saldo berjalan, kewajiban warga, dashboard |
| `arisan.js` | 2984–3442 |
| `rbac.js` | 3447–akhir |

**Aturan**
- Isi fungsi, teks, dan komentar **tidak berubah**. Hanya letaknya dan import yang berubah.
- State level modul (cache, array in-memory) hanya ada di satu modul.
- Tidak boleh ada import melingkar. Bila modul A butuh fungsi modul B, import langsung dari B; `shared.js` tidak boleh meng-import siapa pun di folder ini.

**Langkah 3**
- `tenantOperationalService.js` menjadi barrel: hanya `export * from './tenant/…'` (plus komentar header).
- 24 file pemakai dan semua test **tidak diubah** import-nya.
- Test penjaga ekspor dan seluruh suite harus lulus tanpa mengubah asersi test lama.

**Laporan**
- Jumlah baris tiap file baru.
- Konfirmasi tidak ada import melingkar (mis. `npx madge --circular src/services/tenant` lewat `npx` tanpa menambah dependency; bila tidak bisa, jelaskan cara cek lain).

---

## Definition of Done
- `DEBT-1-report.md`: hash commit benar, tabel audit DEBT-1.3, chunk mock, jumlah baris DEBT-1.4.
- `npx vitest run`, `npm run build`, dan `npm run lint` hijau. Jumlah test ≥ 672 + test baru.
- `grep -rn "mockData" client/src/services/receiptService.js` → kosong.
- `grep -l "Ibu Ratna" client/dist/assets/index-*.js` → kosong.
- Tidak ada perubahan di `api/`, `supabase/`, `legacy-backend/`, maupun `services/dataService.js`.
