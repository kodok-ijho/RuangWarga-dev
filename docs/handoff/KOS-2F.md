# KOS-2F — Perbaikan setelah review KOS-2

Status: **menunggu persetujuan user** (menyentuh tagihan, RLS, dan fungsi database).
Dasar: `KOS-2-review.md` (K1–K8). Migration `202610240001` dan `202610240002` **belum terpasang di mana pun**, jadi diperbaiki langsung di file yang sama, tanpa file migration baru.

## Aturan executor
- Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`. Satu task = satu commit (sebut ID task). **Jangan push** (Claude yang push setelah review).
- 🚫 Jangan menjalankan SQL ke Supabase. Jangan mengubah migration lain, `.env*`, `legacy-backend/`, `api/`, n8n, Edge Function, `dataService.js`. Jangan install package.
- Setelah tiap task: `cd client && npm run lint && npm run build`. Setelah 2F.3: `VITE_DEMO_MODE=false npx vitest run` di `TZ=UTC` dan `TZ=Asia/Jakarta`.
- Tulis `docs/handoff/KOS-2F-report.md` dari `git diff` dan output asli.

## 2F.1 — Fungsi penagihan (file `supabase/migrations/202610240002_kos_contract_billing.sql`)
- **K1:** `generate_kos_contract_bills` hanya untuk internal.
  - `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role` saja.
  - Pemanggilan dari fungsi `SECURITY DEFINER` lain (`create_kos_contract` tidak memakainya; `auto_generate_kos_billing` dan `run_auto_billing` memakainya) tetap jalan.
- **K2:** `auto_generate_kos_billing` memulihkan cek izin versi lama, sebelum delegasi:
  - format `p_period` wajib `^\d{4}-\d{2}$`;
  - bila `auth.role() <> 'service_role'`: `p_tenant_id` NULL hanya boleh untuk `is_platform_admin()`; selain itu wajib `is_platform_admin() OR is_tenant_owner(p_tenant_id) OR has_permission(p_tenant_id, 'generate_billing')`, atau `RAISE … ERRCODE '42501'`.
  - GRANT ke `authenticated` tetap.
- **K4:** blok kos di `run_auto_billing` hanya menulis `billing_auto_runs` bila `v_created > 0` atau `v_error IS NOT NULL`. Blok IPL tidak berubah.
- **K7:** `checkout_kos_room`: `end_date = GREATEST(start_date, LEAST(COALESCE(end_date, v_checkout_dt), v_checkout_dt))`.
- **K9 (usulan Claude, ikut persetujuan user):** `create_kos_contract` menolak `p_start_date` lebih dari **12 bulan ke belakang** atau **3 bulan ke depan** dari hari ini WIB, dengan pesan jelas. Tujuannya mencegah salah ketik tahun yang membuat run harian menerbitkan belasan tagihan susulan sekaligus.
- Test di `supabase/tests/kos_contract_billing.sql` (tambahkan, jangan hapus yang ada):
  - `authenticated` memanggil `generate_kos_contract_bills` → `permission denied` (42501);
  - warga biasa dan pengguna tenant lain memanggil `auto_generate_kos_billing(periode, tenant)` → 42501;
  - `auto_generate_kos_billing(periode, NULL)` oleh owner bukan platform admin → 42501;
  - `run_auto_billing` dua kali di hari yang sama, run kedua tanpa tagihan baru → tidak menambah baris `billing_auto_runs` untuk tenant kos itu;
  - checkout dengan tanggal sebelum `start_date` → sukses, `end_date = start_date`;
  - `create_kos_contract` dengan `start_date` 13 bulan lalu atau 4 bulan ke depan → ditolak.
- Commit: `fix(kos): KOS-2F.1 izin fungsi penagihan kontrak dan perapian checkout`

## 2F.2 — Backfill tanpa tagihan ganda (file `supabase/migrations/202610240001_kos_contracts.sql`)
- **K3:** setelah 7.1, tambahkan langkah **7.1b** yang menautkan tagihan model lama ke kontrak hasil backfill:
  - targetnya kontrak dengan `notes = 'Backfill dari metadata unit KOS-2.1'`;
  - untuk periode ke-n (rumus sama dengan `generate_kos_contract_bills`: `service_start = start_date + n bulan`) selama `service_start <= hari ini WIB` dan `<= end_date` (bila ada);
  - tagihan yang ditautkan: `billing_items` dengan `unit_id` sama, `contract_id IS NULL`, `status <> 'cancelled'`, jenis sewa (`metadata->>'bill_type'` dan `metadata->>'billing_type'` masing-masing NULL atau `'rent'`), dan `period = to_char(service_start, 'YYYY-MM')`;
  - set `contract_id`, `service_start`, `service_end`;
  - maksimal satu tagihan per periode (`DISTINCT ON`, `created_at` paling awal), supaya unique `uq_billing_items_contract_period` tidak bentrok.
- **K6:** trigger penjaga menjadi `BEFORE INSERT OR UPDATE OF status ON tenant_units`:
  - INSERT kamar kos berstatus `occupied` ditolak (kecuali flag sinkron `on`);
  - tangani `OLD` NULL saat INSERT.
- Test di `supabase/tests/kos_contracts.sql`:
  - **skenario INDI KOS:** kamar `occupied`, `contract_start` = tanggal 1 bulan lalu, tagihan lama periode itu `pending_verification` tanpa `contract_id`, lalu jalankan backfill. Hasilnya: tagihan lama tertaut ke kontrak, dan `generate_kos_contract_bills(hari ini, tenant)` **tidak** membuat tagihan untuk periode itu;
  - tagihan lama `cancelled` atau berjenis non-sewa tidak ikut ditautkan;
  - INSERT kamar kos `occupied` langsung → ditolak.
- Commit: `fix(kos): KOS-2F.2 backfill menautkan tagihan lama dan guard insert kamar`

## 2F.3 — Frontend
- **K5:** status terisi/kosong kamar kos dibaca dari `tenant_units.status === 'occupied'` (disinkron database). Data kontrak hanya **menambah** informasi (harga, badge "Bulanan"/"s.d.", masa sewa), bukan satu-satunya sumber.
  - `services/tenant/finance.js` `countOccupiedUnits` (kos): terisi = `status === 'occupied'` **atau** punya kontrak aktif di daftar. Daftar kontrak kosong (`[]`) tidak boleh membuat semua kamar terhitung kosong.
  - Periksa pola yang sama di `pages/PaymentMatrix.jsx` (label "Kamar Kosong"), `pages/Houses.jsx`, `pages/tenant/TenantUnits.jsx`, dan `utils/joinForm.js`, lalu terapkan aturan yang sama.
  - Test: kontrak `[]` + kamar `occupied` → terhitung terisi; kamar `vacant` tanpa kontrak → kosong.
- **K8:** `assignRoomContract` (`services/tenant/billing.js`) menjadi pembungkus tipis `createKosContract` di kedua mode, tanpa tulis langsung ke `tenant_units`/`billing_items`. Sesuaikan test yang ada.
- Commit: `fix(kos): KOS-2F.3 status kamar dari unit tersinkron dan assignRoomContract lewat RPC`

## Setelah executor selesai (Claude)
Review, lalu dry-run kedua migration + kedua file test di dev (BEGIN … ROLLBACK). Setelah itu migration diterapkan **dengan persetujuan user**, dan hasilnya dicek: unit 73 INDI KOS punya kontrak aktif, tagihan Oktober tertaut, dan tidak ada tagihan ganda.
