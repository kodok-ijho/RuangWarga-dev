# KOS-2 — Kontrak sewa master & tagihan bulanan berulang per tanggal masuk

Status: ✅ **Arah disetujui user 2026-10-24**: kontrak master di tabel baru, periode sewa mengikuti tanggal masuk. Migration (2.1, 2.2) hanya ditulis executor; Claude yang dry-run dan menerapkannya ke Supabase dev setelah review.

Dasar: uji user di ruangwarga-dev 2026-10-23, tenant "Kos Melati Harmoni", halaman `/t/:id/payment-matrix` → tombol **Kontrak & Tagihan Kamar**.

## Temuan
1. Memilih kamar "(Terisi)" tidak mengisi penyewa. `components/CreateBillingModal.jsx` → `handleUnitChange()`/`loadOptions()` tidak pernah `setMemberId`, padahal `tenant_units.metadata.tenant_member_id` sudah ada.
2. Kontrak hanya tersimpan di `tenant_units.metadata` (`contract_start`/`contract_end`). Tidak ada riwayat kontrak, harga per penyewa, atau periode sewa.
3. `auto_generate_kos_billing()` (definisi terakhir di `202610080001_harden_definer_function_grants.sql`) melewati kamar tanpa `contract_end`, dan hanya jalan sebulan sekali (`billing_issue_day`). Periode selalu bulan kalender, bukan tanggal masuk penyewa.
4. `assignRoomContract` (`services/tenant/billing.js`) menulis `tenant_units` dan `billing_items` langsung dari browser, tidak atomik.
5. Teks tombol tampil `Simpan Tagihan &amp; Kontrak`.

## Aturan inti (dari user 2026-10-24 — wajib dijaga di database, bukan hanya di UI)
- **Kontrak = pengikat penyewa dan kamar.** Selama kontrak `active`, kamar itu atas nama penyewa tersebut dan berstatus **terisi**.
- **Satu kamar maksimal satu kontrak `active`.** Kamar boleh tanpa kontrak aktif, dan artinya kamar **kosong**.
- Jadi status kamar kos **diturunkan dari kontrak**:
  - Ada kontrak `active` → `tenant_units.status = 'occupied'`, `metadata.tenant_member_id` = penyewa kontrak.
  - Tidak ada kontrak aktif → `'vacant'`, kecuali kamar `inactive` (dinonaktifkan pengelola). Kamar `inactive` tidak boleh punya kontrak aktif.
  - Tidak ada jalur lain yang boleh mengubah kamar kos menjadi `occupied` atau `vacant`, baik approval anggota, toggle manual, maupun update langsung dari browser.
- Penyewa (`member_id`) juga maksimal punya satu kontrak `active` per tenant.

## Model baru: kontrak master
Satu **kontrak** = satu penyewa × satu kamar, berisi harga, tanggal masuk, dan tanggal akhir (opsional). Tagihan bulanan diturunkan dari kontrak.

Contoh (dari user): **Dhani**, kamar 2, masuk **19 Okt 2026**, tenggat bayar 10 hari.

| Periode (label) | Masa sewa | Tagihan terbit | Jatuh tempo |
|---|---|---|---|
| 2026-10 | 19 Okt – 18 Nov 2026 | 19 Okt | 29 Okt |
| 2026-11 | 19 Nov – 18 Des 2026 | 19 Nov | 29 Nov |
| 2026-12 | 19 Des 2026 – 18 Jan 2027 | 19 Des | 29 Des |

Rumus periode ke-n (n = 0, 1, 2, …), dihitung **selalu dari `start_date`** (bukan berantai), supaya tanggal 29–31 tidak bergeser permanen:
- `service_start = start_date + n bulan` (Postgres otomatis clamp: 31 Jan + 1 bulan = 28 Feb, + 2 bulan = 31 Mar)
- `service_end = start_date + (n+1) bulan − 1 hari`
- `period = to_char(service_start, 'YYYY-MM')` → kolom matriks
- `due_date = service_start + grace_days`

## Keputusan
- K1. Kontrak default **bulanan berjalan terus** (`end_date` NULL). Kontrak tetap dipilih sebagai **jumlah bulan** (mis. 6/12), sehingga `end_date = start_date + N bulan − 1 hari` dan selalu selaras dengan periode. Tidak ada prorata.
- K2. Tagihan periode pertama dibuat **saat kontrak disimpan**. Periode berikutnya terbit otomatis **pada hari `service_start`** (H-0).
- K3. **Tenggat bayar** = `tenants.settings.rent_grace_days`, default **10** hari. Bisa diubah per kontrak (`grace_days`).
- K4. Tagihan berhenti saat **Checkout Kamar**: kontrak menjadi `ended`, `end_date` = tanggal checkout. Tagihan periode yang sudah terbit tetap ada (tidak dibatalkan atau di-refund otomatis). Tidak ada periode baru yang dimulai setelah `end_date`.
- K5. Perubahan harga sewa berlaku **mulai periode berikutnya** yang belum terbit. Tagihan yang sudah terbit tidak berubah.
- K6. Penagihan kontrak berjalan **setiap hari** untuk semua kontrak aktif, tidak bergantung pada `billing_issue_day`. Tenant `read_only`/`suspended` dilewati. Toggle `auto_billing_enabled` tetap mengatur IPL RT/RW, bukan kontrak kos: kontrak itu sendiri adalah persetujuan penagihan.
- K7. Karena kamar hanya terisi lewat kontrak, **menyetujui pendaftar kos yang memilih kamar = membuat kontraknya**. Di halaman persetujuan, tombol Setujui membuka form kontrak (kamar & penyewa terkunci, isi harga, tanggal masuk, durasi). Approval tanpa kontrak tetap boleh ("Setujui tanpa kamar"): anggota menjadi approved tanpa kamar, dan kamar tetap kosong.
- K8. Kontrak yang sudah berakhir **tidak bisa dihidupkan lagi**. Penyewa yang kembali dibuatkan kontrak baru, supaya riwayat tetap utuh.

## Task
| Task | Isi | Kriteria selesai |
|---|---|---|
| KOS-2.1 (migration schema) | File baru `supabase/migrations/202610240001_kos_contracts.sql`: (a) tabel `public.kos_contracts`: `id`, `tenant_id` FK, `unit_id` FK `tenant_units`, `member_id` FK `tenant_members` NULL, `tenant_name` text (wajib bila `member_id` NULL), `rent_price numeric(12,2) >= 0`, `start_date date`, `end_date date NULL` (CHECK `end_date >= start_date`), `grace_days int` default 10 (0–28), `status` (`active`/`ended`/`cancelled`), `ended_at`, `end_reason`, `notes`, `created_by`, `created_at`, `updated_at`. (b) Unique parsial: **satu kontrak `active` per `unit_id`** dan **satu kontrak `active` per `(tenant_id, member_id)`** (bila `member_id` tidak NULL). (b2) Trigger `AFTER INSERT/UPDATE OF status, unit_id, member_id ON kos_contracts` yang menyinkronkan kamar sesuai **Aturan inti** (occupied + `tenant_member_id` saat aktif; vacant + hapus `tenant_member_id`/`contract_*` saat tidak ada kontrak aktif). Trigger `BEFORE UPDATE ON tenant_units` untuk tenant kos yang **menolak** perubahan `status` ke/dari `occupied` yang tidak sesuai kontrak aktif, kecuali dari trigger sinkron (pakai flag `set_config('ruangwarga.kos_contract_sync', 'on', true)`). Tolak kontrak aktif di kamar `inactive`. (b3) Ganti `sync_kos_room_occupancy()` (dari `202610210005`): approval **tidak lagi** mengubah status kamar. Hapus trigger lama atau ubah fungsinya menjadi no-op untuk kos. (c) Kolom baru di `billing_items`: `contract_id uuid` FK `kos_contracts` NULL, `service_start date`, `service_end date`. Unique parsial `(contract_id, service_start) WHERE status <> 'cancelled'`. (d) RLS `kos_contracts`: baca = pemegang izin billing yang sama dengan `billing_items` (tiru policy-nya) + penyewa membaca kontraknya sendiri; tulis hanya lewat RPC (REVOKE INSERT/UPDATE/DELETE dari `anon`/`authenticated`). (e) Backfill idempoten, lihat **Detail backfill** di bawah tabel. | File + test SQL di `supabase/tests/kos_contracts.sql`: dua kontrak aktif di kamar sama ditolak; penyewa yang sama di dua kamar ditolak; kontrak aktif → kamar occupied; kontrak ended → kamar vacant; update manual kamar ke `occupied` tanpa kontrak ditolak; approval anggota tidak mengubah kamar. **Jangan dijalankan ke Supabase.** |
| KOS-2.2 (migration fungsi) | File baru `supabase/migrations/202610240002_kos_contract_billing.sql`, semua `SECURITY DEFINER`, `search_path` tetap, grant/revoke seperti fungsi billing yang ada: (a) `create_kos_contract(p_tenant_id, p_unit_id, p_member_id, p_tenant_name, p_rent_price, p_start_date, p_months int NULL, p_grace_days int NULL, p_notes)`: cek `has_permission(..., 'generate_billing')`, tolak bila kamar sudah punya kontrak aktif, insert kontrak, set kamar `occupied` + `metadata.tenant_member_id` (kompatibilitas), terbitkan tagihan periode pertama. Atomik. (b) `generate_kos_contract_bills(p_today date default WIB hari ini, p_tenant_id uuid NULL)`: untuk tiap kontrak aktif, terbitkan **semua periode yang `service_start <= p_today` dan belum ada tagihannya** (mengejar ketertinggalan), berhenti di `end_date`. Isi `period`, `service_start`, `service_end`, `due_date`, `amount = rent_price`, `member_id`, `contract_id`, `metadata.bill_type = 'rent'`, `metadata.auto_generated = true`. Idempoten. (c) `auto_generate_kos_billing(p_period, p_tenant_id)`: pertahankan signature, isinya mendelegasikan ke (b) supaya pemanggil lama tetap jalan. (d) `checkout_kos_room`: tambah langkah mengakhiri kontrak aktif kamar itu (`status = 'ended'`, `end_date`, `ended_at`). Logika lama tetap. (e) `run_auto_billing`: tambah pemanggilan (b) setiap hari untuk semua tenant `kos`, terpisah dari blok IPL yang berbasis `billing_issue_day`. Test SQL: contoh Dhani (19 Okt → due 29 Okt; 19 Nov → due 29 Nov), anchor 31 Jan (28 Feb, 31 Mar), dijalankan 2× tidak ganda, mengejar 3 bulan tertinggal, kontrak `ended` berhenti, kontrak 6 bulan berhenti di bulan ke-6, tenant `read_only` dilewati, user tanpa izin ditolak. | File + test. **Jangan dijalankan ke Supabase.** |
| KOS-2.3 (service) | `services/tenant/billing.js`: `createKosContract()` memanggil RPC `create_kos_contract` (ganti tulis-langsung di `assignRoomContract`; ekspor lama boleh tetap sebagai pembungkus), `fetchKosContracts(tenantId)`, `fetchActiveContractByUnit(tenantId, unitId)`. Helper murni `computeRentPeriods(startDate, graceDays, count)` dengan rumus di atas (dipakai UI & demo). Mode demo di `mockData`. | Test unit `computeRentPeriods` (contoh Dhani, 31 Jan, akhir tahun) + test service demo. |
| KOS-2.4 (form kontrak) | `components/CreateBillingModal.jsx` untuk kos menjadi **"Buat Kontrak Sewa"**: (a) pilih kamar → penyewa terisi otomatis dari kontrak aktif atau `metadata.tenant_member_id`. Kamar terisi = nama penyewa **read-only**. Kamar kosong = dropdown anggota approved yang belum punya kamar, atau input nama penyewa manual. (b) Harga terisi dari `default_rent_price` (boleh diubah). (c) **Tanggal masuk** (default hari ini). (d) Durasi: `Bulanan (berjalan terus)` [default] / `Tetap N bulan`. (e) Tenggat bayar (default dari pengaturan). (f) **Pratinjau 3 periode pertama** (masa sewa + jatuh tempo) memakai `computeRentPeriods`. (g) Perbaiki teks tombol jadi `Simpan Kontrak`. Tagihan non-sewa (deposit/denda) tetap lewat form tagihan manual yang ada. | Test: pilih kamar terisi → penyewa otomatis; pratinjau Dhani benar; kontrak bulanan terkirim tanpa `end_date`. |
| KOS-2.5 (matriks) | `pages/PaymentMatrix.jsx` (kos saja): nama penyewa dari kontrak aktif, badge **"Bulanan"** / **"s.d. <tanggal>"**, sel menampilkan/tooltip masa sewa & jatuh tempo (`service_start`–`service_end`). Kamar tanpa kontrak aktif: label **"Kamar Kosong"**, dengan dua aksi untuk pengelola: **Buat Kontrak** (buka modal 2.4 dengan kamar terpilih; bila ada `previous_tenant_member_id`, penyewa itu jadi pilihan pertama) dan **Iklankan** → `/t/:id/listings/post?unitId=<id>`. Bila kamar sudah punya iklan aktif/`pending_payment`, ganti tombol Iklankan dengan badge **"Diiklankan"** / **"Menunggu bayar iklan"** yang menuju Iklan Saya. Aksi hanya tampil untuk pemegang izin terkait (billing / `post_listing`). Jangan ubah logika pembayaran/verifikasi. | Test render: kamar dengan kontrak, tanpa kontrak, kontrak berakhir. |
| KOS-2.6 (checkout) | `components/CheckoutRoomModal.jsx`: tampilkan kontrak yang akan diakhiri, tanggal checkout (default hari ini), dan daftar tagihan yang belum lunas sebagai peringatan (tidak memblokir). | Test render peringatan tunggakan. |
| KOS-2.6b (tawaran iklan) | Setelah **Checkout Kamar** berhasil, tampilkan konfirmasi "Kamar <label> sekarang kosong. Iklankan sekarang?" dengan tombol **Iklankan** (→ `/t/:id/listings/post?unitId=<id>`) dan **Nanti**. Pakai modal/toast yang ada, bukan `window.confirm`. Di halaman Kamar (`pages/Houses.jsx`), kartu kamar kosong juga menampilkan aksi Iklankan / badge "Diiklankan" yang sama seperti 2.5 (komponen dipakai bersama). | Test: checkout → tawaran muncul; kamar dengan iklan aktif → badge, bukan tombol. |
| KOS-2.7 (approval) | `pages/tenant/TenantMemberApproval.jsx` (kos saja): pendaftar yang memilih kamar → tombol **"Setujui & Buat Kontrak"** membuka form 2.4 dengan kamar & penyewa terkunci. Approval + kontrak dijalankan berurutan; bila kontrak gagal (mis. kamar sudah ada kontrak aktif), tampilkan error dan jangan approve. Tombol kedua **"Setujui tanpa kamar"**. RT/RW tidak berubah. | Test kedua jalur. |
| KOS-2.8 (status turunan di UI) | Semua tampilan kos membaca terisi/kosong dari kontrak aktif: `services/tenant/finance.js` `countOccupiedUnits` (kos: terisi = punya kontrak aktif, **bukan** "ada anggota approved"), `pages/Houses.jsx`, `pages/tenant/TenantUnits.jsx`, `utils/joinForm.js` (form daftar hanya menampilkan kamar tanpa kontrak aktif). `services/tenant/billing.js` `assignRoomContract`: hapus update langsung `tenant_units.status` dari browser. Kelas/arisan tidak berubah. | Test `countOccupiedUnits` kos berdasarkan kontrak; build lulus. |

Urutan: 2.1 → 2.2 → 2.3 → 2.4 → 2.8 → 2.5 → 2.6 → 2.6b → 2.7.

Catatan iklan: status iklan per kamar dibaca dari `public_listings` (`unit_id`, `status`) lewat `services/publicListingService.js`. Jangan mengubah alur pembayaran iklan (PAY-1.7). Menu "Iklan" di navbar dan tampilan katalog dikerjakan terpisah di `LIST-UI-1.md`.

### Detail backfill (KOS-2.1 e)
- Kamar `occupied` dengan `metadata.contract_start` → satu kontrak `active` (harga dari `rent_price`/`default_rent_price`, `end_date` dari `contract_end`, member dari `tenant_member_id`).
- Kamar `occupied` **tanpa** `contract_start` → sesuai Aturan inti, kamar ini **kosong**. Ubah ke `vacant`. Pindahkan `tenant_member_id` ke `metadata.previous_tenant_member_id` supaya pengelola bisa membuatkan kontrak untuk orang yang sama dengan cepat. Tagihan lama tidak disentuh.
- Setelah backfill, tidak boleh ada kamar kos `occupied` tanpa kontrak aktif. Tambahkan assert di test SQL. Frontend dikerjakan dan dites dengan mode demo; uji Supabase dilakukan setelah Claude menerapkan migration ke dev.

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit (sebut ID task), push setelah setiap commit. Jangan push ke `main`.
- Ikuti `docs/handoff/README.md` dan `AGENT.md`. Path relatif ke `client/src/` kecuali disebut lain.
- Setelah tiap task: `cd client && npx vitest run && npm run build`.
- Dukung mode demo (mockData) dan Supabase. Ikuti konvensi `pv-*`, palet forest/gold, React Query, cek RBAC, isolasi per tenant. Tanggal memakai zona WIB.
- 🚫 Jangan mengubah `services/dataService.js`, `services/apiClient.js`, `api/`, `legacy-backend/`, `.env*`, n8n, Edge Function pembayaran, atau migration lama (fungsi lama diubah lewat `CREATE OR REPLACE` di migration baru). Jangan menjalankan SQL ke Supabase. Jangan install package baru.
- Keputusan tidak jelas → tulis di `questions.md`, lewati, lanjut task lain.
- Tulis `docs/handoff/KOS-2-report.md` di akhir.
