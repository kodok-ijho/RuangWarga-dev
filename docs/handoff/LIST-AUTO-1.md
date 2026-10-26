# LIST-AUTO-1 — Iklan otomatis saat kamar kosong (tahap 1: draf)

Status: ✅ **Selesai, terpasang di dev 2026-10-26** (`20261026134747 listing_auto_vacancy`). Disetujui user 2026-10-25 (opsi A + dua aturan gratis). Menyentuh schema dan kolom masa tayang iklan; **tidak** mengubah alur bayar iklan (`create-listing-payment`, `activate_listing_payment`) atau harga.
Tahap 2 (LIST-AUTO-2: tayang otomatis bayar dari Dompet) menunggu WALLET-1.

## Requirement
1. **Pengaturan kos** (owner / `manage_settings`): sakelar **"Iklankan otomatis saat kamar kosong"** (default mati), disertai **nomor WhatsApp iklan** (wajib diisi sebelum sakelar bisa dinyalakan) dan **tipe default** Putra/Putri/Campur. Disimpan di `tenants.settings`: `auto_listing_on_vacant` (bool), `listing_contact_phone`, `listing_default_category`.
2. **Per kamar** boleh dikecualikan: `tenant_units.metadata.auto_listing_disabled = true`.
3. **Kamar menjadi kosong** (status `occupied` → `vacant`, terjadi lewat checkout/akhir kontrak) dan sakelar menyala, kamar tidak dikecualikan:
   - bila kamar punya iklan yang **ditutup karena terisi dan masih punya sisa masa tayang** → iklan itu **tayang lagi** dengan sisa masa tersebut, gratis (aturan 2);
   - selain itu, bila kamar belum punya iklan `active`/`pending_payment` → buat **draf iklan** `pending_payment` berisi: judul `<label kamar> – <nama kos>`, harga `default_rent_price`/`rent_price` kamar, fasilitas kamar, foto dari iklan terakhir kamar itu (bila ada), kategori dan nomor dari pengaturan, `posted_by` = member owner. Draf menunggu pemilik membayar lewat alur yang sudah ada.
4. **Kamar menjadi terisi** (`vacant` → `occupied`), **selalu**, tanpa melihat sakelar (aturan 1):
   - iklan kamar yang `active` → `rented_or_sold`, simpan sisa masa tayang (`expires_at - now()`) ke `paused_remaining_seconds`;
   - draf `pending_payment` yang dibuat otomatis (`auto_created = true`) dan belum punya pembayaran `paid` → dihapus.
5. Sisa masa tayang yang tersimpan tetap bisa dipakai manual: tombol **"Tayangkan lagi (sisa N hari)"** di Iklan Saya bila kamar kosong (RPC, bukan update langsung dari browser).
6. **Kolom `facilities`** di iklan (perbaikan catatan LIST-UI-1): katalog publik membaca fasilitas dari iklan, bukan dari `tenant_units` yang tidak terbaca pengunjung anonim.

## Aturan executor
- Branch saat ini. Satu task = satu commit (sebut ID). **Jangan push.** Jangan jalankan SQL ke Supabase (Claude yang dry-run dan menerapkan).
- Jangan ubah migration lama, `activate_listing_payment`, Edge Function, `dataService.js`, `apiClient.js`, `api/`, `legacy-backend/`, `.env*`. Jangan install package.
- Setelah tiap task: `cd client && npm run lint && npm run build && VITE_DEMO_MODE=false npx vitest run` (lolos di `TZ=UTC` dan `TZ=Asia/Jakarta`).

## AUTO-1.1 — Database (migration baru `supabase/migrations/202610260001_listing_auto_vacancy.sql`, test baru `supabase/tests/listing_auto_vacancy.sql`)
- `public_listings`: tambah `facilities JSONB NOT NULL DEFAULT '[]'`, `auto_created BOOLEAN NOT NULL DEFAULT false`, `paused_remaining_seconds INTEGER` (NULL atau > 0). Backfill `facilities` dari `tenant_units.metadata->'facilities'` untuk iklan yang punya `unit_id` (hanya bila berupa array).
- Fungsi trigger `SECURITY DEFINER` `handle_kos_unit_vacancy_listing()` + trigger `AFTER UPDATE OF status ON tenant_units` (hanya tenant `type = 'kos'`, hanya bila status benar-benar berubah) sesuai requirement 3 dan 4. Karena fungsi berjalan sebagai pemilik (`is_billing_privileged()` benar), ia boleh mengisi `expires_at` dan status; pastikan tidak bisa dipanggil langsung klien (REVOKE dari `PUBLIC, anon, authenticated`). Gagal membuat draf (mis. nomor kosong) **tidak boleh** menggagalkan checkout: lewati dengan aman.
- RPC `resume_listing_remaining(p_listing_id UUID)` `SECURITY DEFINER`: izin owner / `post_listing` pada tenant iklan; iklan `rented_or_sold` dengan `paused_remaining_seconds > 0`; kamar terkait (bila ada) tidak `occupied`; lalu `status = 'active'`, `expires_at = now() + sisa`, kosongkan sisa. GRANT ke `authenticated`.
- Test (gaya `supabase/tests/kos_contract_billing.sql`: fixture `auth.users` sebelum `tenant_members`; enum langganan hanya `trial/active/read_only`; 42501 = `insufficient_privilege`; kontrak dibuat lewat `create_kos_contract` dan dikosongkan lewat `checkout_kos_room`, tanggal dalam batas K9):
  - sakelar mati: checkout → tidak ada draf;
  - sakelar nyala + nomor: checkout → satu draf `pending_payment`, `auto_created`, judul/harga/fasilitas benar; checkout berulang tidak membuat draf ganda;
  - iklan `active` (disiapkan sebagai privileged) lalu kontrak baru dibuat → iklan `rented_or_sold`, sisa tersimpan; checkout dengan sakelar nyala → iklan `active` lagi dengan `expires_at ≈ now() + sisa`;
  - kamar terisi → draf otomatis tanpa pembayaran terhapus;
  - kamar dikecualikan → tidak ada draf;
  - `resume_listing_remaining` oleh warga biasa → 42501; oleh owner saat kamar terisi → ditolak; saat kosong → sukses.
- Commit: `feat(listing): LIST-AUTO-1.1 draf iklan otomatis saat kamar kosong dan tutup saat terisi`

## AUTO-1.2 — Frontend
- Pengaturan kos (cari halaman pengaturan tenant kos yang ada): sakelar + nomor WhatsApp iklan + tipe default, simpan lewat service pengaturan yang ada; sakelar nonaktif sampai nomor valid (pakai `normalizePhoneNumber`). Hanya owner / `manage_settings`.
- Detail kamar (`pages/Houses.jsx` / modal detail kamar kos): sakelar kecil "Kecualikan dari iklan otomatis" (`metadata.auto_listing_disabled`).
- `pages/tenant/PostListing.jsx`: simpan fasilitas terpilih ke kolom `facilities`.
- `services/publicListingService.js`: pakai `listing.facilities` lebih dulu (sudah), hentikan baca `tenant_units` untuk pengunjung publik bila `facilities` terisi.
- `pages/tenant/MyListings.jsx`: label "Draf otomatis" untuk `auto_created`, tombol bayar memakai alur yang sudah ada; iklan `rented_or_sold` dengan sisa masa → teks "Sisa N hari" + tombol "Tayangkan lagi" (RPC `resume_listing_remaining`). Mode demo ikut.
- Test vitest untuk tiap poin.
- Commit: `feat(listing): LIST-AUTO-1.2 pengaturan iklan otomatis dan tayangkan lagi sisa masa`

## Setelah executor (Claude)
Review, dry-run migration + test baru + test kos lama (regresi) di dev, terapkan ke dev, catat riwayat migration.
