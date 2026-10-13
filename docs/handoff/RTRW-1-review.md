# RTRW-1 Review (Claude, 2026-10-11)

Commit yang direview: `3d66052..1c7bbbb` (4 commit task + 1 laporan). Hash di laporan cocok ✅.

| Cek | Hasil |
|---|---|
| `npx vitest run` | **716 test lulus** (47 file) |
| `npm run build` / `npm run lint` | ok / exit 0 |
| Batasan file | Tidak ada perubahan di `dataService.js`, `apiClient.js`, `api/`, `supabase/`, `legacy-backend/` ✅ |
| `RoleGuard` di blok `/t/:tenantId` | Dicek Claude pada baris 288–472: **0** ✅ |
| 1.1 | `computeTenantAccess` (murni) + `useTenantAccess` sesuai tabel pemetaan; `TenantAccessGuard` dengan fallback ke dashboard tenant ✅ |
| 1.2 | Menu "Anggota" → `/t/:id/residents`; Pengeluaran & Laporan hanya bila `canViewReports`; rute Acara/Pengumuman → dashboard; widget & tombol pengumuman disembunyikan ✅ |
| 1.3 | PaymentMatrix: izin tenant; catat tunai/transfer, verifikasi, tolak, edit, dan batal membawa `tenantId`. Cash dicatat `completed` lalu trigger SEC-5 menandai tagihan `paid`. `CLEANUP_ALL` tidak dirender **dan** ditolak di handler. Modal detail memakai `fetchTenantPayments`. Fetch tidak berjalan sebelum `activeTenantId` siap ✅ — **lihat T1** |
| 1.4 | Verifikasi tanpa `fetchSettings`; Laporan tanpa n8n (non-IPL dari Supabase, termasuk agregasi tahunan); Pengeluaran tanpa acara n8n, scope dipaksa `general`; `currentTenant` → `activeTenant` ✅ |

Sisa pemanggilan n8n di PaymentMatrix (`createQrisPayment`, `verifyQrisPayment`) hanya tercapai bila `legacy_qris_enabled = true` (Palm Village). Ini sesuai keputusan: QRIS lama ditunda sampai rencana migrasi Palm Village. Proxy n8n di `ruangwarga-dev` juga 503, jadi QRIS lama tidak berfungsi di sana.

## Temuan

### T1 — "Perbaiki transaksi" melaporkan LUNAS padahal tidak (SEDANG, kebenaran)
Lokasi: `PaymentMatrix.jsx` ±2577 dan ±2672-2690. Checkbox `markCompleted` default-nya `true`.
- Di mode tenant, `updatePayment({ tenantId })` diteruskan ke `updateTenantPayment`, yang **mengabaikan `status` dan `file`** (`payments.js` ±535).
- Toast tetap berbunyi "status tagihan menjadi LUNAS!", padahal pembayaran masih `pending_verification` dan tagihan belum lunas.
- Akibatnya pengurus mengira sudah memverifikasi.

### T2 — Test RTRW-1.3/1.4 tidak menguji perilaku (SEDANG, kualitas test)
- `vite.config.js` `test` tidak mengatur environment, jadi default-nya `node` tanpa DOM, dan `@testing-library/react` tidak terpasang.
- **`rtrw14.tenant.test.jsx`:** memakai `renderToString`, yang **tidak menjalankan `useEffect`**. Semua pemuatan data ada di effect, sehingga asersi "fetchSettings / fetchNonIplIncomes / fetchEvents tidak dipanggil" akan tetap lulus **dengan kode lama**.
- **`PaymentMatrix.tenant.test.jsx`:** tiga test memanggil sendiri spy `createCashPayment` / `approveManualPayment` / `rejectManualPayment` dengan `tenantId`, lalu mengecek spy itu. Komponen tidak pernah diuji. Hanya test tombol "Reset" yang bermakna.
- Laporan menyebut ini sebagai verifikasi. Claude sudah mengecek kode secara manual dan cabang-cabangnya benar, tetapi tanpa test yang sungguhan regresi berikutnya tidak akan tertangkap.

### T3 — Guard memakai izin tenant aktif, bukan tenant di URL (RENDAH)
`TenantAccessGuard` menilai `useTenantAccess()` milik `activeTenantId`. Saat pengguna membuka `/t/B/...` sementara tenant aktif masih A, guard sesaat memakai izin di A sampai `TenantShell` mengganti tenant aktif. Data tetap dijaga RLS, jadi dampaknya hanya UI sekilas. Perbaikan: tampilkan loader selama `tenantId` di URL ≠ `activeTenantId`.

## Hasil
RTRW-1 **diterima dengan perbaikan kecil** → **RTRW-1F** (T1–T3). Setelah itu RTRW-2.
