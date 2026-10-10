# SEC-3F Review (Claude, 2026-10-10)

Commit yang direview: `6235831..cac4499`. Hash di laporan cocok ✅.

| Cek | Hasil |
|---|---|
| `npx vitest run` | **639 test lulus** |
| `npm run build` / `npm run lint` | ok / exit 0 |
| SEC-3F.1 kode undangan | ✅ `crypto.getRandomValues`, 8 karakter dari 32 simbol (2^40); 256 habis dibagi 32 → distribusi seragam. Tanpa `Math.random`. |
| SEC-3F.2 urutan & retry | ✅ Keempat wizard menyimpan kode **sebelum** menandai setup selesai (`onboarding_completed` / `is_setup_completed` di Kelas); retry hanya untuk bentrok unik; kode yang ditampilkan = kode tersimpan. |

## Status DB dev
`202610110004_lock_subscription_activation` sudah dijalankan user di SQL Editor. Dicek Claude: `activate_tenant_subscription` dan `activate_listing_payment` memakai `FOR UPDATE`, EXECUTE hanya `service_role`. **Semua migration SEC-3 kini terpasang di dev.**

## Temuan baru (di luar lingkup SEC-3F) → `BRAND-1.8`
- **J1 — Rekening tenant Kelas tidak terbaca (SEDANG).** `KelasSetupWizard.jsx` menyimpan rekening di `settings.bank_info`, sedangkan alur bayar warga (PAY-2: `getTenantBankAccount`), halaman Pengaturan, dan audit (SEC-3.3) memakai `settings.bank_account`. Warga tenant Kelas akan melihat "rekening belum tersedia" walau admin sudah mengisinya saat setup, dan perubahannya tidak teraudit.
- **J2 — Wizard melewati validasi rekening (RENDAH).** Keempat wizard menyimpan nomor rekening hanya dengan `trim()`, tanpa aturan PAY-2.1 (hanya angka, 6–20 digit, buang spasi/strip).

## Hasil
SEC-3F **diterima**. Lanjut BRAND-1 (sudah ditambah task 1.8 untuk J1/J2).
