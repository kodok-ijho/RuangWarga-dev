# KOS-1 Report — Alur Penyewa dan Data Kamar Kos

Executor: Antigravity (agy). Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`.

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan |
|---|---|---|---|
| KOS-1.1 | 9abb292 | done | Nomor kamar opsional untuk kos (`isKos`), wajib untuk `rt_rw`. Ekstraksi fungsi pembantu `getJoinUnitLabel`, `isUnitRequiredForJoin`, `validateJoinForm` di `client/src/utils/joinForm.js`. Input "Nomor / Blok Rumah" disesuaikan dengan template unit label. Unit test di `joinForm.test.js` dan `JoinTenant.test.jsx`. |
| KOS-1.2 | 3421588 | done | Helper `getOccupancyOptions(tenantType)` di `client/src/services/dataHelpers.js`. Kos hanya menampilkan opsi `kos_penghuni` ("Penyewa / Penghuni Kos"), `kos_keluarga_pemilik` ("Keluarga Pemilik"), `kos_pengelola` ("Pengelola / Penjaga"). Nilai legacy `tetap`/`kontrak`/`kost` dipetakan otomatis via fallback label. Dropdown status tinggal di `Residents.jsx` diperbarui. Unit test di `dataHelpers.test.js`. |
| KOS-1.5 | 862dd36 | done | Helper `getMemberStatusBadge(status)` di `dataHelpers.js`. Banner pendaftar menunggu di atas tabel `Residents.jsx` dengan tombol "Tinjau Permohonan" ke `/t/:tenantId/approval`. Filter dan pengurutan status pendaftar (`approved` duluan, lalu `pending`, lalu `rejected`). Anggota `pending` menampilkan label status "Calon {template.memberLabel}" dan tombol aksi cepat "Tinjau & Setujui". Unit test di `dataHelpers.test.js` dan `Residents.tenant.test.jsx`. |
| KOS-1.3 | 2d15fd0 | done | Daftar fasilitas kos `KOS_FACILITIES` di `client/src/config/kosFacilities.js`. Form harga sewa default (`metadata.default_rent_price`) & pilihan fasilitas (`metadata.facilities`) pada modal tambah/edit kamar di `TenantUnits.jsx`. Tampilan harga per bulan & badge fasilitas di kartu/tabel kamar. Default status unit baru untuk kos & kelas adalah `vacant`. Penanganan `rentPrice` & `facilities` di `createTenantUnit` & `updateTenantUnit` (`members.js`). Form harga & catatan fasilitas di `KosSetupWizard.jsx`. Unit test di `members.test.js`, `KosSetupWizard.test.jsx`, dan `TenantUnits.test.jsx`. |
| KOS-1.4a | 8af0829 | done | Migration SQL `supabase/migrations/202610210004_my_join_requests.sql` membuat fungsi `public.get_my_join_requests()`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated, service_role`. Test SQL `supabase/tests/my_join_requests_matrix.sql` menguji privilege anon/authenticated/service_role, skenario user A (pending di tenant X, approved di tenant Y, rejected di tenant Z), dan isolasi terhadap user B. **Catatan:** Sesuai instruksi, file migration dan test HANYA dibuat dan **TIDAK dijalankan** ke database Supabase manapun. |
| KOS-1.4b | 6203ff1 | done | Fungsi `fetchMyJoinRequests()` di `client/src/services/tenant/members.js` (dengan safe fallback `[]` untuk demo mode & proteksi bila RPC belum ada di database). `TenantContext.jsx` memuat `joinRequests` saat login. Halaman `Home.jsx` dan `MyTenants.jsx` menampilkan kartu "Permohonan Bergabung" (nama tenant, icon, label unit, tanggal pengajuan, status & keterangan). Bila user belum memiliki tenant aktif dan memiliki permohonan, empty state berubah menjadi "Pendaftaran Anda sedang diperiksa" dan tombol aksi utama digantikan tautan sekunder "Ingin mengelola komunitas sendiri? Daftarkan tenant". Tombol selesai `JoinTenant.jsx` diarahkan menjadi "Lihat Status Pendaftaran". Unit test di `Home.navigation.test.jsx` dan `MyTenants.test.jsx`. |

---

## Output Verifikasi

### 1. Vitest Suite KOS-1 (10 test files, 77 passed, 0 failed)
- `src/utils/joinForm.test.js` (8 passed)
- `src/pages/public/JoinTenant.test.jsx` (6 passed)
- `src/services/dataHelpers.test.js` (9 passed)
- `src/pages/Residents.tenant.test.jsx` (6 passed)
- `src/services/tenant/members.test.js` (26 passed)
- `src/pages/onboarding/KosSetupWizard.test.jsx` (6 passed)
- `src/pages/tenant/TenantUnits.test.jsx` (7 passed)
- `src/pages/Home.navigation.test.jsx` (6 passed)
- `src/pages/account/MyTenants.test.jsx` (1 passed)
- `src/pages/Home.test.jsx` (2 passed)

### 2. ESLint
- `cd client && npm run lint` → **Clean (0 errors, 0 warnings, exit code 0)**.

### 3. Vite Build
- `cd client && npm run build` → **Selesai sukses tanpa error (33.36s)**, PWA workbox berhasil di-generate (`dist/sw.js`).

---

## Status Eksekusi Database & Hal yang Belum / Tidak Dijalankan

Sesuai instruksi khusus dari user dan panduan `docs/handoff/README.md`:
1. **Migration SQL KOS-1.4a (`202610210004_my_join_requests.sql`) TIDAK dijalankan ke database Supabase dev/live:**
   - Executor hanya menulis file migration di `supabase/migrations/` dan test SQL matrix di `supabase/tests/`.
   - Penerapan migration ke Supabase dev project serta eksekusi test runner SQL diserahkan ke Orchestrator (Claude) / User.
2. **Supabase CLI tidak digunakan di lokal environment ini** sesuai instruksi.
3. **Frontend KOS-1.4b dirancang resilient / backward-compatible:**
   - Bila migration KOS-1.4a belum diterapkan di database Supabase dev, `fetchMyJoinRequests()` menangkap error RPC dan mengembalikan fallback array kosong `[]`, sehingga aplikasi frontend tetap berjalan normal tanpa crash.

---

## File yang Diubah dan Dibuat

### File Baru:
- `client/src/utils/joinForm.js`
- `client/src/utils/joinForm.test.js`
- `client/src/config/kosFacilities.js`
- `client/src/pages/account/MyTenants.test.jsx`
- `supabase/migrations/202610210004_my_join_requests.sql`
- `supabase/tests/my_join_requests_matrix.sql`
- `docs/handoff/KOS-1-report.md`

### File yang Dimodifikasi:
- `client/src/context/TenantContext.jsx`
- `client/src/pages/Home.jsx`
- `client/src/pages/Home.navigation.test.jsx`
- `client/src/pages/Residents.jsx`
- `client/src/pages/Residents.tenant.test.jsx`
- `client/src/pages/account/MyTenants.jsx`
- `client/src/pages/onboarding/KosSetupWizard.jsx`
- `client/src/pages/onboarding/KosSetupWizard.test.jsx`
- `client/src/pages/public/JoinTenant.jsx`
- `client/src/pages/public/JoinTenant.test.jsx`
- `client/src/pages/tenant/TenantUnits.jsx`
- `client/src/pages/tenant/TenantUnits.test.jsx`
- `client/src/services/dataHelpers.js`
- `client/src/services/dataHelpers.test.js`
- `client/src/services/tenant/members.js`
- `client/src/services/tenant/members.test.js`

### Tidak Disentuh (Sesuai Batasan):
- `supabase/` (selain 2 file baru di KOS-1.4a)
- `api/`
- `legacy-backend/`
- `client/src/services/dataService.js`
- `client/src/services/apiClient.js`
- `.env*`
- branch `main`
