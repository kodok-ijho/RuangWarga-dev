# KOS-1F Report — Tampilan Dashboard Penyewa Kos

Executor: Antigravity (agy). Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`.

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan Berdasarkan Diff Sebenarnya |
|---|---|---|---|
| KOS-1F.1 | 57862ef | done | `components/TrialCountdownBanner.jsx`: status `trial` hanya di-render bila `isTenantAdmin` (anggota lain `return null`). Untuk status `read_only` / kedaluwarsa tetap tampil untuk semua anggota, dengan teks khusus non-admin: *"Layanan sedang dalam mode baca-saja. Pembayaran baru untuk sementara belum bisa dicatat. Hubungi pengelola."* tanpa tombol. Test baru di `components/TrialCountdownBanner.test.jsx`. |
| KOS-1F.2 | 7745adc | done | Fungsi murni `formatUnitName(unitLabel, label)` di `services/dataHelpers.js`: jika `label` sudah diawali `unitLabel` (case-insensitive & trim), kembalikan `label` saja; selain itu `${unitLabel} ${label}`; jika kosong kembalikan `''`. Diterapkan di `ResidentBillingHero.jsx` (2 tempat), `ResidentDetailDrawer.jsx`, dan `ResidentCard.jsx`. Test di `services/dataHelpers.test.js`. |
| KOS-1F.3 | 0a1fe8c | done | `components/dashboard/CitizenDashboard.jsx`: teks tombol pembayaran cepat menampilkan *"Rincian & QRIS"* bila `isLegacyQrisEnabled(activeTenant)` bernilai true; selain itu menampilkan *"Rincian & cara bayar"*. Prop `activeTenant` diteruskan dari `TenantDashboard.jsx` dengan fallback ke `TenantContext`. Test render untuk kedua kondisi di `components/dashboard/dashboard.test.jsx`. |
| KOS-1F.4 | e467853 | done | `context/TenantContext.jsx`: query `tenant_members` mengambil `id`, `full_name`, `unit_id`; menyediakan `activeMember` (`{ id, full_name, unit_id, is_base_role }`) dan `isBaseRole` di context (owner murni tanpa baris anggota menghasilkan `activeMember = null`). Fungsi baru `displayRoleName({ isOwner, isBaseRole, roleName, template })` di `services/dataHelpers.js`. Diterapkan di `TenantDashboard.jsx` dan `TenantShell.jsx`. Sapaan `TenantDashboard.jsx` memakai nama depan dari `activeMember?.full_name`, lalu `profile?.full_name`, lalu email. Test di `dataHelpers.test.js` dan `TenantDashboard.test.jsx`. |
| KOS-1F.5 | 7dcf76b | done | Fungsi murni `countOccupiedUnits(units, members, tenantType)` di `services/tenant/finance.js`. Untuk `rt_rw`: unit terisi bila `status === 'active' || u.is_occupied`. Untuk `kos`/`kelas`/`arisan`: unit terisi bila `status === 'occupied'` ATAU ada anggota `approved` dengan `unit_id` tersebut; unit berstatus `inactive` diabaikan (tidak dihitung sebagai terisi maupun kosong); `vacant` = unit non-inactive dikurangi yang terisi. Dipakai di `fetchTenantDashboardData` (mode demo & Supabase) dengan parameter `tenantType`. Ekspor penjaga di `tenantOperationalService.exports.test.js` diperbarui (86 → 87). Test di `services/tenant/finance.test.js`. |
| KOS-1F.6a | 6bb8480 | done | Migration SQL `supabase/migrations/202610210005_kos_room_occupancy_on_approval.sql` disalin persis apa adanya dari dokumen: trigger `sync_kos_room_occupancy` pada `tenant_members` mengupdate kamar kos yang `vacant`/`active` menjadi `occupied` dan mencatat `metadata.tenant_member_id` saat anggota disetujui, serta backfill data lama. Test SQL `supabase/tests/kos_room_occupancy_matrix.sql` menguji kelima kasus (persetujuan kamar vacant, kamar occupied tidak tertimpa, kamar inactive tidak berubah, tenant rt_rw tidak berubah, alur checkout_kos_room lalu persetujuan ulang). **Catatan:** Sesuai instruksi, migration TIDAK dijalankan ke database Supabase mana pun oleh executor. |
| KOS-1F.6b | a7713f5 | done | `pages/tenant/TenantMemberApproval.jsx`: setelah menyetujui anggota kos yang memilih kamar, menampilkan modal konfirmasi sukses: *"{nama} disetujui. {Kamar} kini tercatat terisi. Atur kontrak sewa agar tagihan bulanan terbit."* beserta tombol *"Atur Kontrak"* ke `/t/:tenantId/payment-matrix`. `pages/tenant/TenantUnits.jsx`: kamar `occupied` khusus kos tanpa `metadata.contract_start` menampilkan badge kecil *"Belum ada kontrak"* di tabel desktop dan kartu mobile. Test di `pages/tenant/TenantUnits.test.jsx`. |

---

## Output Verifikasi

### 1. Vitest Suite Keseluruhan (`npx vitest run`)
- **Total Test Files:** 78 passed (78 files)
- **Total Tests:** 1080 passed (0 failed, 0 skipped)
- **Durasi Eksekusi:** ~205 detik (pada CPU ARM Android / Termux)

### 2. ESLint (`npm run lint`)
- **Status:** Lolos bersih (0 errors, 0 warnings, exit code 0).

### 3. Production Build (`npm run build`)
- **Status:** Berhasil dibangun tanpa error (durasi 34.50 detik).
- **PWA Service Worker:** Ter-generate di `dist/sw.js` (precache 105 entries, 6401.78 KiB).

---

## Hal yang Belum / Tidak Dijalankan

1. **Migration SQL KOS-1F.6a (`202610210005_kos_room_occupancy_on_approval.sql`):**
   - Sesuai instruksi user dan pembagian peran di `AGENT.md`, file migration dan file test SQL matrix telah dibuat di repository, namun **TIDAK dijalankan** ke database Supabase mana pun dan Supabase CLI tidak dijalankan di environment ini.
   - Penerapan migration dan pengujian SQL matrix di database dev didelegasikan kepada Orchestrator (Claude) / User.
2. **Batasan Repository:**
   - Tidak ada push ke branch `main`.
   - Tidak ada modifikasi pada `api/`, `legacy-backend/`, atau `.env*`.
