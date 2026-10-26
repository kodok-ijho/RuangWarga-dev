# LIST-AUTO-1 — Laporan

## AUTO-1.1 — Database (`a93c28a`, `760e3c4`)
- Migration `202610260001_listing_auto_vacancy.sql`:
  - kolom `public_listings.facilities`, `auto_created`, `paused_remaining_seconds` (maks. 31 hari), dengan backfill fasilitas dari kamar;
  - trigger `handle_kos_unit_vacancy_listing` pada perubahan status kamar kos:
    - kamar terisi → iklan aktif ditutup (`rented_or_sold`), sisa masa disimpan; draf otomatis tanpa pembayaran dihapus;
    - kamar kosong + sakelar menyala → iklan lama dengan sisa masa tayang lagi; kalau tidak ada, dibuat draf `pending_payment`.
    - Kegagalan membuat draf tidak menggagalkan checkout.
  - RPC `resume_listing_remaining` (owner / `post_listing`, kamar tidak terisi).
  - Guard `guard_listing_auto_columns`: klien tidak bisa mengubah `auto_created` dan `paused_remaining_seconds` (celah iklan gratis yang ditemukan saat review).
- Test `supabase/tests/listing_auto_vacancy.sql`.

## AUTO-1.2 — Frontend
- Pengaturan kos (`TenantSettings.jsx`): sakelar iklan otomatis, nomor WhatsApp iklan (wajib valid), tipe default. Pengaturan digabung, kunci lain tidak hilang.
- Detail kamar (`Houses.jsx`): "Kecualikan dari iklan otomatis" (`metadata.auto_listing_disabled`, digabung).
- `PostListing.jsx` menyimpan `facilities`. Katalog memakai `listing.facilities` dan tidak membaca `tenant_units` bila sudah terisi.
- `MyListings.jsx`: label "Draf otomatis"; "Sisa N hari" + "Tayangkan lagi" (RPC). Mode demo didukung.
- agy berhenti karena batas waktu sebelum commit; Claude memverifikasi lalu meng-commit.

## Verifikasi
- Dry-run di dev (BEGIN … ROLLBACK): migration + `listing_auto_vacancy.sql` + `kos_contracts.sql` + `kos_contract_billing.sql` + `kos_contract_prorata.sql` → `DRYRUN_OK`.
- `npm run lint` bersih, `npm run build` sukses, vitest 102 file 1381/1381 di `TZ=UTC` dan `TZ=Asia/Jakarta`.
