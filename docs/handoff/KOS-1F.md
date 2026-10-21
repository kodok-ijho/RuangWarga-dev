# KOS-1F — Tampilan dashboard penyewa Kos

Dasar: uji user di ruangwarga-dev 2026-10-21, login sebagai penyewa "Toro" (Kos Melati Harmoni) yang sudah disetujui. Masuk langsung ke dashboard penyewa sudah benar (NAV-1). Yang perlu dirapikan ada di tampilan.

Frontend saja, tanpa migration.

## Temuan
1. **Banner trial tampil untuk penyewa.** `components/TrialCountdownBanner.jsx` menampilkan "Masa percobaan gratis Anda sedang berjalan … Pilih paket kapasitas unit" ke semua anggota. Hanya tombolnya yang dibatasi `isTenantAdmin`. Bagi penyewa, pesan ini membingungkan.
2. **"Kamar Kamar VIP".** Label unit diawali `template.unitLabel` padahal nama kamarnya sudah memuat kata "Kamar". Terjadi di:
   - `components/dashboard/ResidentBillingHero.jsx` ±40, ±95;
   - `components/residents/ResidentDetailDrawer.jsx` ±61;
   - `components/residents/ResidentCard.jsx` ±69.
3. **"Bayar Sewa · Rincian & QRIS".** Teks di `components/dashboard/CitizenDashboard.jsx` ±73 menyebut QRIS, padahal QRIS hanya ada untuk tenant dengan `isLegacyQrisEnabled`.
4. **Jabatan tampil "Warga/Anggota" dan "-".** Role dasar di database bernama "Warga/Anggota" untuk semua jenis tenant.
   - Dashboard (`pages/tenant/TenantDashboard.jsx` ±158-160) menampilkannya apa adanya.
   - Header (`components/tenant/TenantShell.jsx` ±183) memakai `roleLabel(role, …)` dengan `role` lama (n8n) yang kosong, sehingga tampil "-".
5. **Sapaan memakai nama akun Google** ("dyudhiantoro"), bukan nama yang diisi saat mendaftar ("Toro"). Sumbernya `TenantDashboard.jsx` ±83: `profile?.full_name`.

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit, push setelah setiap commit. Jangan push ke `main`.
- Path relatif ke `client/src/`. Jangan mengubah `supabase/`, `api/`, `legacy-backend/`, `dataService.js`, `apiClient.js`, `.env*`.
- Test baru mengimpor kode asli. **Jalankan seluruh suite** (`npx vitest run`) sebelum menulis laporan. Laporan ditulis dari diff yang sebenarnya.

## KOS-1F.1 — Banner trial hanya untuk pengelola (temuan 1)
- `TrialCountdownBanner.jsx`:
  - status **trial** → tampil hanya bila `isTenantAdmin`; anggota lain `return null`;
  - status **read_only** / kedaluwarsa → tetap tampil untuk semua. Untuk anggota non-admin, teksnya: "Layanan sedang dalam mode baca-saja. Pembayaran baru untuk sementara belum bisa dicatat. Hubungi pengelola." Tanpa tombol.
- Test: trial + admin → tampil; trial + non-admin → kosong; read_only + non-admin → tampil dengan teks anggota tanpa tombol.
- Commit: `fix(tenant): KOS-1F.1 banner trial hanya untuk pengelola`

## KOS-1F.2 — Nama unit tidak dobel (temuan 2)
- `services/dataHelpers.js`: `formatUnitName(unitLabel, label)`.
  - Bila `label` (di-trim, tidak peka huruf besar) sudah diawali `unitLabel`, kembalikan `label` saja; selain itu `${unitLabel} ${label}`.
  - Bila `label` kosong, kembalikan `''`.
- Pakai di keempat tempat temuan 2.
- Test: ("Kamar", "Kamar VIP") → "Kamar VIP"; ("Kamar", "101") → "Kamar 101"; ("Rumah", "Blok A/12") → "Rumah Blok A/12"; ("Kamar", "kamar 3") → "kamar 3".
- Commit: `fix(ui): KOS-1F.2 nama unit tidak mengulang label`

## KOS-1F.3 — Teks "Rincian & QRIS" (temuan 3)
- `CitizenDashboard.jsx` ±73: tampilkan "Rincian & QRIS" hanya bila `isLegacyQrisEnabled(activeTenant)`; selain itu "Rincian & cara bayar".
- Test render sederhana untuk kedua kondisi.
- Commit: `fix(dashboard): KOS-1F.3 teks bayar tidak menyebut QRIS bila tidak aktif`

## KOS-1F.4 — Nama jabatan dan sapaan (temuan 4 dan 5)
- `context/TenantContext.jsx`:
  - query keanggotaan (±185-200) juga mengambil `id`, `full_name`, `unit_id`;
  - sediakan `activeMember` (`{ id, full_name, unit_id, is_base_role }`) dan `isBaseRole` untuk tenant aktif. `is_base_role` diambil dari `tenant_roles` yang sudah di-select.
  - Owner tanpa baris anggota: `activeMember = null`.
- `services/dataHelpers.js`: `displayRoleName({ isOwner, isBaseRole, roleName, template })`:
  - owner → `template.adminLabel`;
  - role dasar → `template.memberLabel`;
  - selain itu `roleName`, atau "Anggota" bila kosong.
- Pakai di `TenantDashboard.jsx` (±158-160) dan `TenantShell.jsx` (±183, menggantikan `roleLabel(role, …)`). Kos: pemilik → "Pemilik Kos", penyewa → "Penyewa".
- Sapaan `TenantDashboard.jsx` ±83: nama depan dari `activeMember?.full_name`, lalu `profile?.full_name`, lalu email.
- Test: `displayRoleName` (owner, role dasar kos/rt_rw, role kustom "Bendahara"), dan sapaan memakai `activeMember.full_name`.
- Commit: `fix(tenant): KOS-1F.4 jabatan dan sapaan mengikuti data anggota`

## Definition of Done
- `docs/handoff/KOS-1F-report.md` berisi hash commit dan hasil **seluruh** suite.
- `npx vitest run`, `npm run lint`, `npm run build` hijau (atau dicatat tidak bisa dijalankan).
