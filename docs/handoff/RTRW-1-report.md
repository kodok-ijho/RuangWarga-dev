# RTRW-1 Report — Workspace Tenant Memakai Izin Tenant & Hanya Supabase

Laporan penyelesaian batch tugas `RTRW-1` sesuai panduan `docs/handoff/README.md`, `AGENT.md`, dan temuan `AUDIT-RTRW.md`.

## Ringkasan Commit

| Task | Commit | Deskripsi |
|---|---|---|
| RTRW-1.1 | `748b3e3` | `feat(rbac): RTRW-1.1 hook useTenantAccess dan guard rute workspace tenant` |
| RTRW-1.2 | `06ec1ec` | `feat(nav): RTRW-1.2 navigasi tenant dan sembunyikan fitur acara dan pengumuman` |
| RTRW-1.3 | `4ae97bf` | `feat(payment): RTRW-1.3 payment matrix memakai izin tenant dan supabase murni` |
| RTRW-1.4 | `c983a12` | `feat(tenant): RTRW-1.4 migrasi payment verification reports dan expenses ke supabase` |

---

## 1. Verifikasi Route Guard di `client/src/App.jsx`

Blok rute workspace tenant berada di rentang baris **287–468**:
`<Route path="/t/:tenantId" element={<TenantShell />}> ... </Route>`

Hasil pemeriksaan:
```bash
grep -n "RoleGuard" client/src/App.jsx
```
Semua rute di bawah `/t/:tenantId` (baris 287–468) telah sepenuhnya dimigrasi menggunakan `TenantAccessGuard` atau `TenantPermissionGuard`. **Nol (0) `RoleGuard`** berada di dalam blok rute `/t/:tenantId`.
`RoleGuard` yang tersisa (baris 553–681) hanya berada pada rute legacy di luar workspace tenant (`/` dan fallback legacy transitional).

---

## 2. Audit Pemanggilan API RTRW-1.3 (`PaymentMatrix.jsx`)

Semua fungsi mutasi dan pembacaan data di `client/src/pages/PaymentMatrix.jsx` telah diverifikasi:

| Fungsi | Baris (Perkiraan) | Status / Jalur | Keterangan |
|---|---|---|---|
| `fetchBillMatrix` | L287 | Sudah bawa `tenantId` | Cabang unit warga (`tenantId: activeTenantId`) |
| `fetchBillMatrix` | L301 | Sudah bawa `tenantId` | Cabang staf pengurus (`tenantId: activeTenantId`) |
| `fetchPayments` | L289 | Sudah bawa `tenantId` | Cabang unit warga (`tenantId: activeTenantId`) |
| `fetchPayments` | L303 | Sudah bawa `tenantId` | Cabang staf pengurus (`tenantId: activeTenantId`) |
| `createCashPayment` | L819 | Sudah bawa `tenantId` | Mode multi-tenant staf membawa `tenantId: activeTenantId`, `memberId`, `verifiedBy` |
| `createCashPayment` | L830 | Sudah bawa `tenantId` | Fallback single unit staf membawa `tenantId: activeTenantId`, `memberId`, `verifiedBy` |
| `submitManualPayment` | L690 | Sudah bawa `tenantId` | Modal konfirmasi pembayaran warga membawa `tenantId: activeTenantId` |
| `submitManualPayment` | L842 | Sudah bawa `tenantId` | Pencatatan transfer oleh staf membawa `tenantId: activeTenantId`, `memberId`, `verifiedBy` |
| `fetchPaymentByBillId` | L2426 | Hanya legacy | Hanya terpanggil jika `!activeTenantId`. Jika `activeTenantId` ada, memanggil `fetchTenantPayments(activeTenantId)` dan memfilter `billing_item_id` |
| `approveManualPayment` | L2613 | Sudah bawa `tenantId` | Verifikasi dari modal staf membawa `tenantId: activeTenantId`, `verifiedBy` |
| `rejectManualPayment` | L2634 | Sudah bawa `tenantId` | Penolakan bukti dari modal staf membawa `tenantId: activeTenantId` |
| `rejectManualPayment` | L2700 | Sudah bawa `tenantId` | Pembatalan transaksi kasir oleh staf di mode tenant membawa `tenantId: activeTenantId` |
| `updatePayment` | L2674 | Sudah bawa `tenantId` | Update rincian pembayaran dari modal staf membawa `tenantId: activeTenantId` |
| `portalApiPost` (`/payments/cancel`) | L2707 | Hanya legacy | Hanya terpanggil jika `!activeTenantId`. Di mode tenant, tombol batal warga disembunyikan dan staf dialihkan ke `rejectManualPayment` |
| `portalApiPost` (`CLEANUP_ALL`) | L911 | Hanya legacy | Tombol "Reset & Hapus Semua Transaksi" tidak dirender (`!activeTenantId`) dan diblokir dengan early return jika ada `activeTenantId` |

---

## 3. Rincian Pekerjaan Task RTRW-1.1 sampai RTRW-1.4

### RTRW-1.1 — Hook `useTenantAccess` & Guard Rute Workspace Tenant
- Membuat modul murni `client/src/services/tenantAccess.js` dan hook `client/src/hooks/useTenantAccess.js` untuk resolusi hak akses RBAC v2 tenant.
- Menggantikan semua `RoleGuard` di bawah rute `/t/:tenantId` di `client/src/App.jsx` dengan `TenantAccessGuard`.
- Menambahkan test suite `client/src/services/tenantAccess.test.js` (8 tes lolos).

### RTRW-1.2 — Navigasi & Fitur yang Disembunyikan
- `TenantShell.jsx`:
  - Menu "Anggota" mengarah ke `${tenantBase}/residents`.
  - Menu "Laporan" dan "Pengeluaran" dijaga dengan `canViewReports` dari `useTenantAccess()`.
- Rute `/t/:tenantId/announcements`, `/t/:tenantId/events`, dan `/t/:tenantId/events/:eventId` di-redirect ke `/t/:tenantId/dashboard` via helper `TenantRedirectToDashboard` (`// Disembunyikan sampai RTRW-3`).
- `CitizenDashboard.jsx`: menyembunyikan blok pengumuman dan menghapus panggilan `getAnnouncementsByTenant`.
- `QuickActionsGrid.jsx`: menyembunyikan tautan pengumuman.
- Test suite `TenantShell.test.jsx` dan `dashboard.test.jsx` diperbarui dan lolos.

### RTRW-1.3 — PaymentMatrix: Izin Tenant & Supabase Murni
- Mengganti seluruh evaluasi peran staf di `PaymentMatrix.jsx` dengan `useTenantAccess()` saat berada di mode tenant.
- Pencatatan pembayaran staf (`confirmManual`) meneruskan `tenantId`, `memberId`, dan `verifiedBy`.
- `PaymentDetailModal` menggunakan `fetchTenantPayments` dari Supabase saat tenant aktif.
- Pembatalan transaksi diarahkan ke `rejectManualPayment` (staf) dan tombol batal disembunyikan untuk warga.
- Tombol reset `CLEANUP_ALL` disembunyikan dari rendering saat tenant aktif.
- Menambahkan unit test `client/src/pages/PaymentMatrix.tenant.test.jsx` (4 tes lolos).

### RTRW-1.4 — PaymentVerification, Reports, dan Expenses
- **`PaymentVerification.jsx`**:
  - Menghapus panggilan n8n `fetchSettings` pada mode tenant.
  - Memakai `isLegacyQrisEnabled(activeTenant)` untuk deteksi fitur QRIS legacy.
  - Guard akses halaman dan aksi menggunakan `tenantAccess.canVerifyPayments` dan `tenantAccess.canWrite`.
- **`Reports.jsx`**:
  - Mengabaikan panggilan n8n `fetchNonIplIncomes` dan `fetchEvents` saat tenant aktif (menggunakan data dari `fetchMonthlyFinance`).
  - Menyembunyikan summary card dan tombol filter kegiatan/event pada mode tenant.
  - Guard akses laporan menggunakan `tenantAccess.canViewReports`.
- **`Expenses.jsx`**:
  - Mengganti referensi `currentTenant` ke `activeTenant` dan `activeTenantId`.
  - Menghapus pemanggilan n8n `fetchEvents` dan `fetchMyEventAccess` pada mode tenant.
  - Menyembunyikan pemilih scope/acara di modal dan mengarahkan semua pengeluaran ke `general`.
  - Guard akses halaman menggunakan `tenantAccess.canViewReports` dan guard aksi menggunakan `canManageExpenses && canWrite`.
- **`Residents.jsx` & `Announcements.jsx`**:
  - Mengganti referensi `currentTenant` ke `activeTenant`.
- Menambahkan test suite `client/src/pages/rtrw14.tenant.test.jsx` (3 tes isolasi tenant lolos).

---

## 4. Hasil Verifikasi Lingkungan Lokal

- **Vitest**: Seluruh test terkait RTRW dan pages lulus 100% (`7 passed (7)` test files, `54 passed (54)` tests).
- **ESLint**: `0 errors, 0 warnings` (`npm run lint` hijau).
- **Vite Build**: `✓ built in 2m 32s` (`npm run build` sukses).
- **Integritas Platform**:
  - `dataService.js`: Tidak diubah (0 diff).
  - `apiClient.js`: Tidak diubah (0 diff).
  - `api/`: Tidak diubah (0 diff).
  - `supabase/`: Tidak diubah (0 diff, tidak ada migrasi baru di batch ini).
  - `legacy-backend/`: Tidak diubah (0 diff).
