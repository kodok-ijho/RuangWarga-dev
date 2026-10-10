# SEC-3F — Perkuat kode undangan

Baca `docs/handoff/SEC-3-review.md` (H1, H2). Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. Tanpa migration, tanpa menyentuh `supabase/functions`, `api/n8n.js`, jalur n8n `dataService.js`.

## SEC-3F.1 — Kode undangan acak yang kuat (H1)
`client/src/services/tenantOperationalService.js` `generateInviteCode(tenantName)`:
- Bagian acak **8 karakter** dari alfabet tanpa huruf/angka mirip: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 simbol → 2^40 kombinasi).
- Pakai `crypto.getRandomValues` (tersedia di browser & Vitest/jsdom), **bukan** `Math.random()`.
- Format: `RW-<maks 4 huruf nama>-<XXXX>-<XXXX>` (mudah dibacakan). Tetap uppercase.
- Test: panjang & format regex, hanya karakter dari alfabet, 1.000 panggilan tanpa duplikat.

## SEC-3F.2 — Simpan kode sebelum menandai onboarding selesai (H2)
4 wizard (`SetupWizard.jsx`, `KosSetupWizard.jsx`, `ArisanSetupWizard.jsx`, `KelasSetupWizard.jsx`):
- Panggil `saveTenantInviteCode` **sebelum** `updateTenantProfileAndSettings(... onboarding_completed: true ...)`.
- Bila gagal karena bentrok (Postgres `23505`), buat kode baru lalu coba lagi, maksimal 3 kali; bila tetap gagal, tampilkan error dan **jangan** tandai onboarding selesai.
- Kode yang ditampilkan ke pengguna (`setGeneratedInviteCode`) = kode yang benar-benar tersimpan.
- Hindari duplikasi: buat satu helper bersama (mis. `saveInviteCodeWithRetry(tenantId, tenantName)` di `tenantOperationalService.js`) yang dipakai keempat wizard. Test helper: sukses langsung; bentrok sekali lalu sukses; bentrok 3× → melempar error.

## Definition of Done
- `SEC-3F-report.md` dengan hash commit yang benar.
- vitest, build, lint hijau. `grep -n "Math.random" client/src/services/tenantOperationalService.js` tidak lagi dipakai untuk kode undangan.
