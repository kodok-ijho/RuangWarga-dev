# PANITIA-HARGA Report — Masa Aktif Per Acara

Executor: Antigravity (agy). Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.

---

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan Berdasarkan Diff Sebenarnya |
|---|---|---|---|
| HARGA.1 | `b9615a0` | done | Salin migration `supabase/migrations/202610220003_program_access.sql` persis dari `docs/handoff/assets/PANITIA-HARGA/program_access.sql` dengan `cp`. Menambahkan kolom `access_until` (timestamptz) dan `is_free_trial` (boolean) pada tabel `tenant_programs`. Membuat fungsi trigger `set_program_access_defaults()` untuk otomatis memberikan uji coba gratis 1 bulan pada acara pertama tenant `panitia` dan menetapkan subscription tenant `panitia` berstatus `active` tanpa batas waktu. Menambahkan fungsi `extend_program_access` (security definer untuk `service_role`), fungsi helper RLS `program_is_writable(program_id)`, serta RLS policy ketat yang mengunci INSERT/UPDATE/DELETE transaksi (pemasukan, pengeluaran, tagihan iuran acara, dan pembayaran) jika acara tidak aktif/kadaluarsa. Menulis test matriks komprehensif H1–H10 di `supabase/tests/program_access_matrix.sql`. |
| HARGA.2 | `a27d3dd` | done | `client/src/config/panitiaPricing.js`: mendefinisikan `PANITIA_PRICING` ({ freeTrialMonths: 1, pricePerProgram: 25000, periodMonths: 12 }). `client/src/services/tenant/programs.js`: menambahkan field `access_until` dan `is_free_trial` (beserta alias camelCase) pada `fetchPrograms`, `fetchProgram`, dan `fetchProgramsOverview`; menambahkan fungsi murni `getProgramAccessState(program, { tenantType, now })` dengan 5 state (`unlimited`, `free_trial`, `active`, `expired`, `inactive`) dan flag `writable`; fungsi murni `formatProgramAccessLabel(stateObj)` dalam format tanggal Indonesia/WIB; penyesuaian fallback demo mode untuk menetapkan acara pertama gratis 1 bulan dan acara berikutnya `inactive`. Menambahkan ekspor ke `client/src/services/tenantOperationalService.exports.test.js` (125 → 128 ekspor) dan test independen zona waktu di `client/src/services/tenant/programs.test.js`. |
| HARGA.3 | `e649b37` | done | Tampilan kartu acara di `Programs.jsx` dan `PanitiaDashboard.jsx` serta header `ProgramDetail.jsx` menampilkan badge masa aktif sesuai `formatProgramAccessLabel` (hijau aktif, biru free trial, abu-abu belum aktif, merah kadaluarsa). Jika `!writable`: di `ProgramDetail.jsx` menonaktifkan tombol transaksi (Catat Pemasukan, Catat Pengeluaran, Terbitkan Iuran, Catat Tunai, Ubah Nominal, Ingatkan via WA) dengan tooltip penjelasan; di `PanitiaDashboard.jsx` dan banner `ProgramDetail.jsx` menonaktifkan tombol Bayar Iuran Saya; di `TenantIncomes.jsx` dan `Expenses.jsx` menonaktifkan pilihan acara yang tidak aktif dan menolak navigasi `?program=<id>&new=1` dengan toast peringatan. Unit test di `ProgramDetail.test.jsx` dan `TenantIncomes.test.jsx`. |
| HARGA.4 | `558a304` | done | `client/src/pages/tenant/ProgramDetail.jsx`: menambahkan panel khusus pengelola (`canManagePrograms`) menampilkan status masa aktif acara, tanggal, harga Rp25.000 / 12 bulan, dan tombol nonaktif "Aktifkan / Perpanjang" dengan keterangan "Pembayaran QRIS segera tersedia". `client/src/pages/account/ChoosePlan.jsx`: menjelaskan model harga kepanitiaan tanpa langganan bulanan organisasi (acara pertama gratis 1 bulan, Rp25.000/acara/12 bulan, baca-saja jika lewat masa aktif, tanpa kalkulator blok). `client/src/pages/account/SubscriptionStatus.jsx`: menampilkan status "Organisasi aktif (tanpa batas waktu)" dan daftar acara beserta badge masa aktif. `client/src/components/TrialCountdownBanner.jsx`: tidak dirender untuk tenant `panitia` (langganan organisasi tidak pernah memicu banner read-only masa percobaan). Unit test di `ChoosePlan.test.jsx`, `SubscriptionStatus.test.jsx`, `TrialCountdownBanner.test.jsx`, dan `ProgramDetail.test.jsx`. |
| Test Config | `037c299` | done | `client/vite.config.js`: menambahkan konfigurasi `testTimeout: 20000` pada konfigurasi Vitest untuk mencegah flakiness timeout saat menjalankan 92 test files penuh secara bersamaan pada lingkungan terbatas. |

---

## Daftar File yang Dibuat / Dimodifikasi per Commit

### HARGA.1 (`b9615a0`)
- `supabase/migrations/202610220003_program_access.sql` *(baru)*
- `supabase/tests/program_access_matrix.sql` *(baru)*

### HARGA.2 (`a27d3dd`)
- `client/src/config/panitiaPricing.js` *(baru)*
- `client/src/services/tenant/programs.js`
- `client/src/services/tenant/programs.test.js`
- `client/src/services/tenantOperationalService.exports.test.js`

### HARGA.3 (`e649b37`)
- `client/src/components/dashboard/PanitiaDashboard.jsx`
- `client/src/pages/Expenses.jsx`
- `client/src/pages/tenant/ProgramDetail.jsx`
- `client/src/pages/tenant/ProgramDetail.test.jsx`
- `client/src/pages/tenant/Programs.jsx`
- `client/src/pages/tenant/TenantIncomes.jsx`
- `client/src/pages/tenant/TenantIncomes.test.jsx`

### HARGA.4 (`558a304`)
- `client/src/components/TrialCountdownBanner.jsx`
- `client/src/components/TrialCountdownBanner.test.jsx`
- `client/src/pages/account/ChoosePlan.jsx`
- `client/src/pages/account/ChoosePlan.test.jsx`
- `client/src/pages/account/SubscriptionStatus.jsx`
- `client/src/pages/account/SubscriptionStatus.test.jsx`
- `client/src/pages/tenant/ProgramDetail.jsx`
- `client/src/pages/tenant/ProgramDetail.test.jsx`

### Test Config (`037c299`)
- `client/vite.config.js`

---

## Output Verifikasi

### 1. Vitest Suite Keseluruhan (`cd client && npx vitest run`)

Baris ringkasan vitest disalin apa adanya:
```
 Test Files  92 passed (92)
      Tests  1207 passed (1207)
   Start at  14:59:39
   Duration  296.34s (transform 186.21s, setup 0ms, collect 831.95s, tests 106.61s, environment 741.30s, prepare 127.78s)
```

### 2. ESLint (`cd client && npm run lint`)

```
> ruangwarga@1.0.1 lint
> eslint src
```
Hasil: Lolos bersih tanpa error dan tanpa warning (exit code 0).

### 3. Production Build (`cd client && npm run build`)

```
vite v5.4.21 building for production...
✓ 891 modules transformed.
dist/assets/ProgramDetail-BXT6XVel.js              71.29 kB │ gzip:  13.62 kB
...
✓ built in 37.24s

PWA v1.3.0
mode      generateSW
precache  109 entries (6620.75 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```
Hasil: Build produksi Vite sukses tanpa error (exit code 0).

---

## Item yang Gagal atau Tidak Dijalankan
- **Tidak ada yang gagal**: Seluruh task HARGA.1 sampai HARGA.4 selesai, seluruh 92 file test (1207 tests) lolos 100%, ESLint bersih, dan build produksi berhasil.
- **Dikecualikan sesuai aturan**: Migration SQL tidak dijalankan ke Supabase live dan Edge Function tidak di-deploy (bagian ini merupakan kewenangan Orchestrator/Claude setelah review).
