# ARISAN-1 Report — Kocokan Transparan, Setoran Per Putaran, Bayar Sendiri, Jabatan Arisan

Executor: Antigravity (agy). Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.

---

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan Berdasarkan Diff Sebenarnya |
|---|---|---|---|
| ARISAN-1.1 | `6ce9680` | done | Salin migration `supabase/migrations/202610220004_arisan_transparent_draw.sql` persis dari `docs/handoff/assets/ARISAN-1/arisan_transparent_draw.sql` dengan `cp`. Menambahkan kolom `eligible_snapshot` dan `excluded_snapshot` pada `arisan_rounds`, trigger `prevent_arisan_round_tampering` untuk memastikan hasil kocokan bersifat permanen/final, fungsi RPC `draw_arisan_winner` baru yang hanya mengundi peserta dengan setoran lunas dan menetapkan hadiah = total setoran lunas, serta `check_arisan_round_readiness` yang mencocokkan `round_id`. Menulis test matriks komprehensif A1–A6 di `supabase/tests/arisan_transparent_draw_matrix.sql`. |
| ARISAN-1.2 | `57c39e0` | done | `client/src/services/tenant/arisan.js`: `fetchArisanRounds` mengembalikan `eligible_snapshot`, `excluded_snapshot`, dan operator pengocok (`operator:drawn_by(full_name)`); `fetchArisanRoundBills` mencocokkan hanya `metadata->>round_id` dengan relasi `member:tenant_members(id, full_name, phone)` dan data pembayaran terbaru; menambahkan fungsi `fetchMyArisanBills(tenantId, memberId)` dengan filter `metadata->>type = 'arisan_contribution'`; fungsi helper murni `getRoundContributionSummary(bills)`. `client/src/utils/waReminder.js`: menambahkan builder pesan WA `buildArisanReminderMessage` dan builder teks hasil kocokan transparan `buildArisanDrawShareText`. Menambahkan ekspor baru ke `tenantOperationalService.exports.test.js` (128 → 130 ekspor). Test di `arisan.test.js` dan `waReminder.test.js`. |
| ARISAN-1.3 | `ddeccce` | done | `client/src/pages/arisan/ArisanRounds.jsx`: memperbarui modal "Rincian Iuran" dengan statistik ringkasan (`getRoundContributionSummary`), badge status peserta (Lunas / Menunggu verifikasi / Belum bayar), tombol "Ingatkan via WA" (`buildArisanReminderMessage`), tautan verifikasi pembayaran bagi bendahara/admin, tombol "Salin pengingat semua yang belum bayar", serta catatan transparansi bahwa peserta yang belum lunas tidak ikut undian. Pengujian komponen asli di `client/src/pages/arisan/ArisanRounds.test.js`. |
| ARISAN-1.4 | `ad56e0f` | done | `client/src/pages/arisan/ArisanDraw.jsx`: tampilan pengocokan transparan dengan klasifikasi daftar "Ikut kocok (setoran lunas)" dan "Tidak ikut (belum lunas)", tombol kocok aktif jika ≥1 peserta lunas, modal konfirmasi hasil kocok final, kartu hasil transparan lengkap (pemenang, slot, total hadiah, waktu pengundian WIB, operator pengocok, rincian peserta), tombol "Bagikan ke WhatsApp" dan "Salin teks", serta tab "Riwayat Transparan" dengan collapsible snapshot peserta ikut/tidak ikut dan fallback untuk putaran terdahulu. Pengujian komponen asli di `client/src/pages/arisan/ArisanDraw.test.js`. |
| ARISAN-1.5 | `0be6b90` | done | Halaman baru `client/src/pages/arisan/ArisanMyContributions.jsx` dan rute `arisan/my` (`TenantAccessGuard require="isMember"`) di `client/src/App.jsx` untuk peserta melihat riwayat setoran, badge status, kartu hasil kocokan terakhir, serta tombol "Bayar" yang membuka `MemberBillPayModal`. Navigasi desktop dan drawer di `client/src/components/tenant/TenantShell.jsx` menampilkan tautan "Setoran Saya" khusus tenant `arisan`. Kartu "Setoran Arisan" di `client/src/components/dashboard/CitizenDashboard.jsx` menampilkan setoran belum lunas terdekat + tombol Bayar, menggantikan tautan ke `payment-matrix`. Unit test di `ArisanMyContributions.test.js` dan `TenantShell.test.jsx`. |
| ARISAN-1.6 | `4ccf4a1` | done | `client/src/services/tenant/rbac.js`: menambahkan konfigurasi `ROLE_TEMPLATES.arisan` dengan 2 jabatan: Ketua Arisan (izin `run_special_action`, `generate_billing`, `manage_billing_cash`, `manage_billing_transfer`, `manage_members`, `manage_announcements`, `view_reports`, `manage_settings`) dan Bendahara Arisan (izin `generate_billing`, `manage_billing_cash`, `manage_billing_transfer`, `view_reports`, `manage_expenses`). `client/src/pages/roles/ManageRoles.jsx`: tombol dan konfirmasi menerapkan template menampilkan label "Arisan". Unit test di `rbac.test.js` dan `ManageRoles.test.jsx`. |
| Test Fix | `11a836f` | done | `client/src/services/tenantOperationalService.test.js`: sinkronisasi jumlah tagihan putaran demo pada `fetchArisanRoundBills` dari 2 menjadi 3 (paid, unpaid, pending_verification) yang ditambahkan pada ARISAN-1.2. |

---

## Daftar File yang Dibuat / Dimodifikasi per Commit

### ARISAN-1.1 (`6ce9680`)
- `supabase/migrations/202610220004_arisan_transparent_draw.sql` *(baru)*
- `supabase/tests/arisan_transparent_draw_matrix.sql` *(baru)*

### ARISAN-1.2 (`57c39e0`)
- `client/src/services/tenant/arisan.js`
- `client/src/services/tenant/arisan.test.js`
- `client/src/services/tenantOperationalService.exports.test.js`
- `client/src/utils/waReminder.js`
- `client/src/utils/waReminder.test.js`

### ARISAN-1.3 (`ddeccce`)
- `client/src/components/Modal.jsx`
- `client/src/pages/arisan/ArisanRounds.jsx`
- `client/src/pages/arisan/ArisanRounds.test.js`

### ARISAN-1.4 (`ad56e0f`)
- `client/src/pages/arisan/ArisanDraw.jsx`
- `client/src/pages/arisan/ArisanDraw.test.js`

### ARISAN-1.5 (`0be6b90`)
- `client/src/App.jsx`
- `client/src/components/dashboard/CitizenDashboard.jsx`
- `client/src/components/tenant/TenantShell.jsx`
- `client/src/components/tenant/TenantShell.test.jsx`
- `client/src/pages/arisan/ArisanMyContributions.jsx` *(baru)*
- `client/src/pages/arisan/ArisanMyContributions.test.js` *(baru)*

### ARISAN-1.6 (`4ccf4a1`)
- `client/src/pages/roles/ManageRoles.jsx`
- `client/src/pages/roles/ManageRoles.test.jsx`
- `client/src/services/tenant/rbac.js`
- `client/src/services/tenant/rbac.test.js`

### Test Fix (`11a836f`)
- `client/src/services/tenantOperationalService.test.js`

---

## Output Verifikasi

### 1. Vitest Suite Keseluruhan (`cd client && npx vitest run`)

Baris ringkasan vitest disalin apa adanya:
```
 Test Files  93 passed (93)
      Tests  1205 passed (1205)
   Start at  16:36:43
   Duration  329.09s (transform 184.94s, setup 0ms, collect 831.60s, tests 133.64s, environment 888.16s, prepare 122.98s)
```

### 2. Lint (`cd client && npm run lint`)

```
> ruangwarga@1.0.1 lint
> eslint src
```
Hasil: bersih tanpa warning atau error.

### 3. Build (`cd client && npm run build`)

```
> ruangwarga@1.0.1 build
> vite build

vite v5.4.21 building for production...
✓ 892 modules transformed.
✓ built in 37.63s

PWA v1.3.0
mode      generateSW
precache  110 entries (6655.28 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```
Hasil: build sukses penuh.

---

## Perubahan Sensitif (Perlu Review Ekstra)
- Migration SQL: `supabase/migrations/202610220004_arisan_transparent_draw.sql` (disalin persis byte-per-byte dari `docs/handoff/assets/ARISAN-1/arisan_transparent_draw.sql`).
- Test isolasi RLS & trigger kocokan: `supabase/tests/arisan_transparent_draw_matrix.sql`.
- RPC & trigger logic: penguncian update langsung pada status putaran arisan setelah undian selesai (`prevent_arisan_round_tampering`), pengecualian peserta yang belum melunasi setoran dari undian dan snapshot transparan.
- RBAC template arisan: `ROLE_TEMPLATES.arisan` di `services/tenant/rbac.js` mengizinkan `run_special_action` khusus untuk Ketua Arisan (untuk RPC kocok arisan).

---

## Catatan Tambahan
- Tidak ada file terlarang yang diubah (`dataService.js`, `apiClient.js`, `api/`, `legacy-backend/`, `.env*`, dsb tetap tidak tersentuh).
- Seluruh query dan embed Supabase menggunakan nama kolom aktual (`full_name`, `phone`).
- Seluruh 4 batch yang diminta (PANITIA-2, PANITIA-3, PANITIA-HARGA, ARISAN-1) telah selesai dikerjakan, diverifikasi dengan vitest, lint, dan build, serta commit dan push ke remote branch `claude/ruangwarga-remote-2-disconnect-m4oku0`.
