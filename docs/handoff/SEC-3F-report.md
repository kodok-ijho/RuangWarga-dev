# SEC-3F Report — Perkuat Kode Undangan

| Task | Commit | Status | Catatan |
|---|---|---|---|
| SEC-3F.1 | 6235831 | done | `generateInviteCode(tenantName)` di `client/src/services/tenantOperationalService.js`: menggunakan `crypto.getRandomValues` dengan 8 karakter dari alfabet 32 simbol `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (2^40 kombinasi, tanpa huruf/angka ambigu I, O, 0, 1). Format: `RW-<maks 4 huruf nama>-<XXXX>-<XXXX>` (uppercase). Unit test di `tenantOperationalService.test.js` memverifikasi regex, panjang karakter, kebersihan karakter ambigu, dan 1.000 panggilan tanpa duplikat (collision-free). `Math.random` tidak lagi digunakan sama sekali untuk kode undangan (H1). |
| SEC-3F.2 | 7a8d6d1 | done | Helper baru `saveInviteCodeWithRetry(tenantId, tenantName, maxRetries = 3)` di `tenantOperationalService.js`. Diintegrasikan ke 4 onboarding wizard (`SetupWizard.jsx`, `KosSetupWizard.jsx`, `ArisanSetupWizard.jsx`, `KelasSetupWizard.jsx`): kode disimpan ke `tenant_invites` terlebih dahulu sebelum menandai `onboarding_completed: true` di settings. Bila bentrok unique constraint (`23505`), helper otomatis men-generate kode baru dan mencoba ulang hingga 3x; bila tetap gagal, proses berhenti melempar error dan tenant tidak ditandai selesai (H2). Kode yang ditampilkan di UI (`setGeneratedInviteCode`) adalah kode yang benar-benar tersimpan. Unit test memverifikasi sukses langsung, retry sekali lalu sukses, dan melempar error setelah 3x gagal. |

## Output Verifikasi
- **vitest:** 36 test files lulus, **639 tests passed** (0 failed).
- **build:** OK (`npm run build` di `client/` selesai membuat bundle produksi `dist/` dalam 30.00s, Service Worker & PWA manifest generated).
- **lint:** OK (`npm run lint` di `client/` exit code 0).
- **grep checks:**
  - `grep -n "Math.random" client/src/services/tenantOperationalService.js` → **kosong** (0 match).
- **Batasan Terjaga:**
  - Tanpa migration baru.
  - Tidak ada perubahan di `supabase/functions/*`, `api/n8n.js`, atau jalur n8n di `dataService.js`.
