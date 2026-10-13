# RTRW-1 — Workspace tenant memakai izin tenant & hanya Supabase

**Kerjakan setelah review SEC-5 diterima.** Kedua batch menyentuh `PaymentMatrix.jsx`, `PaymentVerification.jsx`, dan `payments.js`.

Baca dulu: `docs/handoff/README.md`, AGENT.md, `AUDIT-RTRW.md` (F1–F5, F8, F9, F12), dan jawaban user di `questions.md` [AUDIT-RTRW].

Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. Tanpa migration.

🚫 Larangan:
- Jangan mengubah `services/dataService.js`, `services/apiClient.js`, `api/n8n.js`, `supabase/`, `legacy-backend/`.
- Halaman boleh **berhenti memanggil** fungsi n8n; isi fungsi n8n-nya sendiri tidak diubah.

## Keputusan user (2026-10-11)
1. Login RuangWarga = **Supabase saja**. Semua yang ada di bawah `/t/:tenantId` memakai izin tenant (RBAC v2 dari `TenantContext`), **bukan** `useAuth().role` (role n8n), dan **tidak memanggil n8n**.
2. **Acara & Pengumuman disembunyikan** di workspace tenant sampai RTRW-3.
3. Proyek Vercel `ruangwarga-dev` tidak punya env n8n, jadi proxy n8n selalu 503. Panggilan n8n dari tenant = fitur rusak, bukan sekadar risiko.

## Pemetaan izin (wajib dipakai konsisten)
`TenantContext` sudah menyediakan `isOwner`, `isPlatformAdmin`, `hasPermission(key)` (true otomatis untuk owner/platform admin), dan `subscriptionStatus`.

| Kebutuhan | Dulu (role n8n) | Sekarang (izin tenant) |
|---|---|---|
| verifikasi / catat bayar | `isBendaharaOrAbove`, `canViewPaymentVerification` | `manage_billing_cash` ATAU `manage_billing_transfer` |
| buat tagihan | — | `generate_billing` |
| pengeluaran (tulis) | `canViewExpenses`, `canEdit` | `manage_expenses` |
| laporan & lihat pengeluaran | `canViewFinancialReports` | `view_reports` ATAU `manage_expenses` |
| kelola warga | `canViewResidents` (tulis) | `manage_members` |
| staf (tampilan semua unit) | `isStaffRole` | salah satu dari: `manage_billing_cash`, `manage_billing_transfer`, `generate_billing`, `manage_expenses`, `manage_members`, `view_reports`, `manage_settings`, `manage_tenant_users` |
| boleh menulis | `canModifyData(role)` | `subscriptionStatus !== 'read_only'` dan izin yang relevan |

---

## RTRW-1.1 — Hook `useTenantAccess` + guard rute
- File baru `hooks/useTenantAccess.js`. Mengembalikan objek boolean dari tabel di atas:
  - `isMember`, `isStaff`, `canWrite`, `canVerifyPayments`, `canRecordCash`, `canRecordTransfer`, `canGenerateBilling`, `canManageExpenses`, `canViewReports`, `canManageMembers`;
  - plus `loading`.
  - Logika murni dipisah ke `services/tenantAccess.js` (fungsi `computeTenantAccess({ isOwner, isPlatformAdmin, permissions, subscriptionStatus, hasActiveTenant })`) agar bisa dites tanpa React.
- `App.jsx`: perluas `TenantPermissionGuard` menjadi `TenantAccessGuard({ require })`. `require` adalah nama properti dari `useTenantAccess` (mis. `'canVerifyPayments'`). Saat `loading` → `<PageLoader />`; tidak lolos → `Navigate` ke `/t/:tenantId/dashboard`.
- Ganti **semua** `RoleGuard` di bawah rute `/t/:tenantId`:

  | Rute | `require` |
  |---|---|
  | payment-verification | `canVerifyPayments` |
  | expenses | `canViewReports` (tulis tetap dicek di halaman dengan `canManageExpenses`) |
  | reports | `canViewReports` |
  | payment-matrix | `isMember` |
  | residents | `isMember` |
  | roles, members/:id/role | tetap seperti sekarang (`TenantPermissionGuard`) |

- Rute di luar `/t/` (legacy) **tidak diubah** di batch ini.
- Test: `computeTenantAccess` untuk owner, platform admin, warga biasa (role dasar), bendahara (`manage_billing_cash`), pembaca laporan (`view_reports`), dan tenant `read_only`.

## RTRW-1.2 — Navigasi & fitur yang disembunyikan
- `components/tenant/TenantShell.jsx`:
  - menu "Anggota" (desktop ±89, mobile ±113) → `${tenantBase}/residents`, `isActive` disesuaikan;
  - menu "Laporan" memakai `useTenantAccess().canViewReports`, bukan `canViewFinancialReports(role)`;
  - menu "Pengeluaran" hanya bila `canViewReports`.
- Rute `/t/:tenantId/announcements`, `/t/:tenantId/events`, dan `/t/:tenantId/events/:eventId` → `Navigate` ke `/t/:tenantId/dashboard`. Komentar `// Disembunyikan sampai RTRW-3`.
- `components/dashboard/CitizenDashboard.jsx`: sembunyikan blok/link pengumuman (±33-34, ±102, ±192-230) dan jangan memanggil `getAnnouncementsByTenant`.
- Cari link lain ke `/announcements`, `/events` di dalam komponen tenant (`components/dashboard/*`, `components/tenant/*`) dan sembunyikan dengan cara yang sama.
- Test render: TenantShell tidak memuat link `/residents` tanpa prefix `/t/`; dashboard warga tidak memuat link pengumuman.

## RTRW-1.3 — PaymentMatrix: izin tenant + semua tulis ke Supabase
Di `pages/PaymentMatrix.jsx`, saat ada tenant aktif (`activeTenantId`):

**Izin**
- `isStaff`, `canWrite`, `canVerify`, dan semua pemakaian `isBendaharaOrAbove(role)` / `isStaffRole(role)` / `canModifyData(role)` (±118-119, ±718, ±951, ±1389, ±1938, ±3024) → dari `useTenantAccess()`.

**Pencatatan oleh pengurus** (`confirmManual` ±795-833)
- Kirim `tenantId: activeTenantId`, `memberId`, dan `verifiedBy` ke `createCashPayment` / `submitManualPayment`.
- Fungsi `dataService` itu sudah punya cabang `if (tenantId)` ke Supabase; jangan ubah `dataService`.

**Modal detail** (`PaymentDetailModal`)
- Ganti `fetchPaymentByBillId` (±2384-2410) dengan pencarian ke Supabase: `fetchTenantPayments(activeTenantId, …)` lalu filter `billing_item_id === bill.id`, ambil yang terbaru.
- Verifikasi / tolak / edit (±2533, ±2554, ±2587): kirim `tenantId: activeTenantId`.
- Batalkan (`portalApiPost('/payments/cancel')` ±2624) di mode tenant:
  - hanya untuk staf (`canVerifyPayments`), diimplementasikan sebagai `rejectManualPayment({ tenantId, payment_id, note: 'Dibatalkan oleh pengurus' })`;
  - untuk warga, tombol batal disembunyikan (pembatalan oleh warga menyusul lewat RPC).

**Lainnya**
- Tombol **"Reset & Hapus Semua Transaksi"** (`CLEANUP_ALL` ±870-890, tombol ±951): **jangan dirender** di mode tenant.
- `fetchBillMatrix` / `fetchPayments` (±279-295): bila `activeTenantId` belum siap, **jangan** memanggil (tampilkan loading). Jangan pernah jatuh ke jalur n8n.

**Verifikasi diri sebelum commit**
- Di file ini, setiap pemanggilan `portalApiPost`, `fetchPaymentByBillId`, `createCashPayment`, `submitManualPayment`, `approveManualPayment`, `rejectManualPayment`, `updatePayment`, `fetchBillMatrix`, `fetchPayments` yang bisa tercapai di mode tenant harus membawa `tenantId` atau berada di cabang `!activeTenantId`.
- Tulis daftarnya (file:baris → sudah bawa tenantId / hanya legacy) di laporan.
- **Test**: mock `services/apiClient` agar `portalApiPost` melempar error. Render bagian staf (catat tunai, verifikasi dari modal) dengan tenant aktif dan izin `manage_billing_cash`, lalu pastikan service tenant yang dipanggil, bukan `portalApiPost`. Bila render penuh terlalu berat, ekstrak handler menjadi fungsi murni dan test fungsi itu.

## RTRW-1.4 — PaymentVerification, Reports, Expenses
- **`pages/PaymentVerification.jsx`**
  - Cabang tenant (±241-262): hapus `fetchSettings(token)` (n8n). Pilihan QRIS di dropdown edit hanya bila `isLegacyQrisEnabled(activeTenant)`.
  - `canModifyData(role)` (±170) dan `isBendaharaOrAbove(role)` (±362) → `useTenantAccess` saat ada tenant.
- **`pages/Reports.jsx`**
  - Bila ada tenant: **jangan** memanggil `fetchNonIplIncomes` (n8n) maupun `fetchEvents` (n8n) (±202-207, ±235-240).
  - Pemasukan non-IPL hanya dari `finData.nonIplIncomes` (Supabase); bagian yang bergantung pada acara disembunyikan.
  - Pemuatan data dijaga `canViewReports` (±382), bukan `canViewFinancialReports(role)`.
- **`pages/Expenses.jsx`**
  - `currentTenant` (tidak ada di context) → `activeTenant` / `activeTenantId` (±64-65).
  - Bila ada tenant: jangan memanggil `fetchEvents` / `fetchMyEventAccess` (±119-120). Selektor scope/acara disembunyikan; semua pengeluaran `general`.
  - `canEdit`/`canWrite` → `canManageExpenses && canWrite`.
- **`pages/Residents.jsx`** ±57-58 dan **`pages/Announcements.jsx`** ±11: `currentTenant` → `activeTenant`. Fungsi tulis Residents menyusul di RTRW-2.
- Test per halaman: dengan tenant aktif, mock `dataService` n8n (`fetchSettings`, `fetchNonIplIncomes`, `fetchEvents`, `fetchMyEventAccess`) **tidak dipanggil**.

---

## Definition of Done
- `RTRW-1-report.md`: hash commit benar dan daftar pemanggilan di RTRW-1.3.
- `npx vitest run`, `npm run build`, dan `npm run lint` hijau.
- `grep -n "RoleGuard" client/src/App.jsx` → tidak ada lagi di dalam blok rute `/t/:tenantId` (sebutkan rentang barisnya di laporan).
- Tidak ada perubahan di `dataService.js`, `apiClient.js`, `api/`, `supabase/`, `legacy-backend/`.
