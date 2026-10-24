# KOS-2 Report — Kontrak Sewa Master & Tagihan Bulanan Berulang Per Tanggal Masuk

Executor: Antigravity (agy). Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`.

## Ringkasan Eksekusi Task

| Task | Commit | Status | Catatan |
|---|---|---|---|
| KOS-2.1 | `e484d92` | done | Skema tabel `kos_contracts`, partial unique aktif per unit & per penyewa, trigger sinkronisasi status kamar kos (`AFTER INSERT/UPDATE OF status, unit_id, member_id`), trigger proteksi modifikasi manual status kamar di `tenant_units`, pencabutan sinkronisasi approval pendaftar lama, kolom `contract_id` + `service_start` + `service_end` di `billing_items`, RLS baca izin billing + penyewa kontrak dan tolak tulis browser (RPC only), serta backfill idempoten. File migrasi `supabase/migrations/202610240001_kos_contracts.sql` dan suite pengujian SQL `supabase/tests/kos_contracts.sql`. (Sesuai aturan, **TIDAK dijalankan** ke database Supabase). |
| KOS-2.2 | `87f1134` | done | Fungsi `SECURITY DEFINER` penagihan kos: `create_kos_contract` (validasi izin, cegah tumpang tindih kontrak, buat kontrak atomik, terbitkan tagihan periode pertama), `generate_kos_contract_bills` (mengejar periode tertinggal per tanggal masuk hingga hari ini / `end_date`), delegasi pembungkus kompatibilitas `auto_generate_kos_billing`, pengakhiran kontrak di `checkout_kos_room`, dan integrasi harian di `run_auto_billing`. File migrasi `supabase/migrations/202610240002_kos_contract_billing.sql` dan suite pengujian SQL `supabase/tests/kos_contract_billing.sql`. (Sesuai aturan, **TIDAK dijalankan** ke database Supabase). |
| KOS-2.3 | `af22bbb` | done | Service layer kontrak kos di `client/src/services/tenant/billing.js`: `createKosContract()`, `fetchKosContracts()`, `fetchActiveContractByUnit()`, dan fungsi pembantu murni `computeRentPeriods(startDate, graceDays, count)` sesuai formula masa sewa clamping Postgres (`start_date + n bulan`). Dukungan mode demo terisolasi di `mockData.js`. Unit test di `client/src/services/tenant/billingContracts.test.js`. |
| KOS-2.4 | `c975a40` | done | `CreateBillingModal.jsx` untuk tipe kos diubah menjadi form "Buat Kontrak Sewa": autofill penyewa saat memilih kamar terisi (read-only), pemilihan pendaftar approved untuk kamar kosong, harga sewa default, tanggal masuk, durasi bulanan terus-menerus vs N bulan tetap, tenggat bayar dari settings, pratinjau 3 periode sewa pertama via `computeRentPeriods`, dan tombol label "Simpan Kontrak". Unit test di `client/src/components/CreateBillingModal.test.jsx`. |
| KOS-2.8 | `aef1e47` | done | Penurunan status kamar dari kontrak aktif: `countOccupiedUnits` di `services/tenant/finance.js` menghitung kamar yang memiliki kontrak aktif (bukan sekadar anggota approved), `joinForm.js` hanya menampilkan kamar tanpa kontrak aktif, pembersihan update status kamar langsung dari browser di `assignRoomContract`. Kompatibilitas tampilan di `TenantUnits.jsx` dan `Houses.jsx`. Unit test di `services/tenant/finance.test.js` dan `utils/joinForm.test.js`. |
| KOS-2.5 | `69ddbd5` | done | Matriks pembayaran kos (`PaymentMatrix.jsx`): penyewa diambil dari kontrak aktif, badge status sewa ("Bulanan" / "s.d. <tanggal>"), sel menampilkan rentang masa sewa & jatuh tempo (`service_start` – `service_end`). Kamar tanpa kontrak berlabel "Kamar Kosong" dengan aksi "Buat Kontrak" dan integrasi iklan publik (tombol "Iklankan" / badge "Diiklankan" / "Menunggu bayar iklan") melalui komponen bersama `RoomListingAction.jsx`. Unit test di `PaymentMatrix.tenant.test.jsx`. |
| KOS-2.6 | `ef11bcb` | done | `CheckoutRoomModal.jsx`: menampilkan rincian kontrak sewa yang akan diakhiri, tanggal checkout (default hari ini WIB), dan daftar tagihan yang belum lunas sebagai peringatan non-blocking kepada pengelola sebelum konfirmasi checkout. Unit test di `components/CheckoutRoomModal.test.jsx`. |
| KOS-2.6b | `a66c2ce` | done | Alur tawaran iklan kamar kosong setelah checkout sukses: dialog konfirmasi "Kamar sekarang kosong. Iklankan sekarang?" dengan pilihan "Iklankan" (navigasi ke form pasang iklan publik dengan prefill kamar) dan "Nanti". Penambahan aksi dan badge status iklan publik pada kartu/tabel kamar di `pages/Houses.jsx`. Unit test di `components/CheckoutRoomModal.test.jsx` dan `pages/Houses.kos.test.jsx`. |
| KOS-2.7 | `86443b8` | done | Halaman persetujuan pendaftar kos (`TenantMemberApproval.jsx`): pendaftar dengan pilihan kamar menyediakan tombol "Setujui & Buat Kontrak" (membuka form kontrak dengan kamar & penyewa terkunci; eksekusi sekuensial aman approval + pembuatan kontrak) serta tombol alternatif "Setujui tanpa kamar" (anggota approved tanpa kamar, kamar tetap kosong). Jalur RT/RW tetap utuh. Unit test di `pages/tenant/TenantMemberApproval.test.jsx`. |
| Perapian & Tes | `372e293` & `4e09da1` | done | Perapian kompatibilitas kontrak, badge unit, dan stabilitas mock hooks React pada `client/src/pages/Houses.kos.test.jsx`. |

---

## Output Verifikasi

- **Vitest:** 97 files lulus, 1,265 tests passed, 0 failed (durasi seluruh suite ~388s).
- **Build (`npm run build`):** OK (Vite 5.4.21 production build sukses, 893 modules transformed, PWA precache 112 entries generated di `dist/sw.js`).
- **Lint (`npm run lint`):** OK (ESLint clean, 0 error, 0 warning).

---

## Perubahan Sensitif (Perlu Review Ekstra)

- `supabase/migrations/202610240001_kos_contracts.sql`:
  - Skema tabel baru `public.kos_contracts`.
  - Partial unique index: satu kontrak aktif per unit, satu kontrak aktif per penyewa di tenant.
  - RLS `kos_contracts`: baca hanya untuk role staf/pengelola billing atau penyewa itu sendiri; operasi write (INSERT/UPDATE/DELETE) di-REVOKE dari `anon` dan `authenticated` (hanya via RPC `SECURITY DEFINER`).
  - Trigger integritas status kamar `tenant_units` dan penonaktifan auto-occupancy lama.
  - Kolom baru `contract_id`, `service_start`, `service_end` di tabel `billing_items`.
- `supabase/migrations/202610240002_kos_contract_billing.sql`:
  - RPC fungsi finansial `SECURITY DEFINER` dengan `search_path = public`: `create_kos_contract`, `generate_kos_contract_bills`, `auto_generate_kos_billing`, `checkout_kos_room`, dan integrasi di `run_auto_billing`.
  - Permission guard ketat `has_permission(p_tenant_id, 'generate_billing')`.
- `supabase/tests/kos_contracts.sql` & `supabase/tests/kos_contract_billing.sql`:
  - Skrip pengujian SQL komprehensif mencakup isolasi tenant, penolakan ganda, clamping tanggal akhir bulan (contoh 31 Jan -> 28 Feb / 31 Mar), skenario tagihan tertinggal, dan kasus Dhani.

> [!NOTE]
> Sesuai aturan panduan `docs/handoff/README.md`, file SQL di `supabase/migrations/` dan `supabase/tests/` **TIDAK dijalankan** ke instance Supabase manapun oleh executor. Claude (Orchestrator) akan melakukan dry-run dan menerapkannya ke Supabase dev setelah proses review diff.

---

## Asumsi yang Diambil

1. **Kompatibilitas Backward:** Kolom metadata unit kos (`tenant_member_id`, `contract_start`, `contract_end`) tetap diperbarui oleh trigger/RPC demi menjaga kelancaran kode lama yang mungkin membaca metadata tersebut, sementara sumber kebenaran status hunian utama kini sepenuhnya ditentukan oleh keberadaan baris pada tabel `kos_contracts` berstatus `active`.
2. **Kamar Kosong Pasca Checkout:** Ketika checkout kamar diproses, kontrak aktif diakhiri (`status = 'ended'`), dan kamar otomatis kembali `vacant`. Tawaran mengiklankan kamar ke modul listing publik disajikan melalui modal interaktif yang mengarahkan langsung ke rute `/t/:tenantId/listings/post?unitId=:unitId` dengan hak akses `post_listing`.
3. **Penyewa Kembali:** Kontrak lama yang telah berakhir tidak diubah kembali menjadi aktif; penyewa lama yang menyewa kembali selalu dibuatkan entri kontrak baru dengan histori tersendiri.
