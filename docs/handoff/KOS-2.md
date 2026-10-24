# KOS-2 — Penyewa otomatis per kamar & tagihan sewa bulanan berulang

Status: ⏳ **Menunggu persetujuan user** (menyentuh fungsi tagihan di database → wajib disetujui sebelum 2.3 dikerjakan).

Dasar: uji user di ruangwarga-dev 2026-10-23, tenant "Kos Melati Harmoni", halaman `/t/:id/payment-matrix` → tombol **Kontrak & Tagihan Kamar**.

## Temuan
1. Memilih kamar berstatus "(Terisi)" tidak mengisi penyewa. Dropdown tetap "-- Belum Terdaftar / Mandiri --".
   - `components/CreateBillingModal.jsx` → `handleUnitChange()` dan `loadOptions()` hanya mengisi harga & tanggal kontrak, tidak pernah `setMemberId`.
   - Datanya sudah ada: `tenant_units.metadata.tenant_member_id` (diisi `202610210005_kos_room_occupancy_on_approval.sql`), atau `tenant_members.unit_id` + `status = 'approved'`.
2. Form memaksa isi **Mulai Kontrak** dan **Selesai Kontrak**.
   - Penyebab di database: `auto_generate_kos_billing()` (definisi terakhir di `202610080001_harden_definer_function_grants.sql`) **melewati kamar yang tidak punya `contract_start` DAN `contract_end`**. Jadi tanpa tanggal akhir, tagihan otomatis tidak pernah terbit.
3. Teks tombol tampil `Simpan Tagihan &amp; Kontrak` (entity HTML di dalam string JSX).

## Pola acuan: PortalWarga (IPL)
Penghuni tertaut ke unit, matriks menampilkan semua unit × 12 bulan dari data unit + penghuni, nominal dari pengaturan. Admin tidak membuat tagihan per bulan. Kos meniru ini: **kontrak = langganan bulanan terbuka**, berhenti hanya saat **Checkout Kamar**.

## Keputusan (default usulan Claude — user boleh ubah sebelum mulai)
- K1. Kontrak kos default **bulanan tanpa tanggal akhir**. Yang wajib diisi hanya **Tanggal Masuk** (default hari ini). Tanggal akhir opsional (untuk kontrak tetap, mis. 6/12 bulan).
- K2. Tagihan bulan masuk diterbitkan saat kontrak dibuat (perilaku `assignRoomContract` sekarang), nominal penuh — **tanpa prorata**.
- K3. Bulan berikutnya diterbitkan oleh cron yang sudah ada (BILL-AUTO-1) selama kamar `occupied` dan `contract_end` kosong atau ≥ periode.
- K4. Tagihan berhenti saat **Checkout Kamar** (RPC `checkout_kos_room` sudah menghapus `contract_start/contract_end/tenant_member_id`). Tidak ada tombol "hentikan" baru.
- K5. Tanggal jatuh tempo bulanan = `settings.billing_due_day` / `due_day` (perilaku sekarang).

## Task
| Task | Isi | Kriteria selesai |
|---|---|---|
| KOS-2.1 (frontend) | `components/CreateBillingModal.jsx`: (a) saat kamar dipilih atau `initialUnitId` dimuat, isi `memberId` dari `unit.metadata.tenant_member_id`; bila kosong, cari di `members` yang `unit_id` = kamar itu. (b) Kamar `occupied` dengan penyewa tertaut → tampilkan nama penyewa **read-only** (bukan dropdown) + teks kecil "Penyewa terdaftar di kamar ini". (c) Kamar `vacant` → dropdown hanya berisi anggota approved yang **belum** punya kamar. (d) Perbaiki teks tombol jadi `Simpan Tagihan & Kontrak`. | Test vitest baru: pilih kamar terisi → nama penyewa tampil otomatis; pilih kamar kosong → dropdown aktif. |
| KOS-2.2 (frontend) | Masih di `CreateBillingModal.jsx` (+ `assignRoomContract` di `services/tenantOperationalService.js` / `services/tenant/billing.js` bila perlu): blok kontrak diganti **"Mulai Sewa"** (wajib, default hari ini) + pilihan **Durasi**: `Bulanan (berjalan terus)` [default] / `Tetap sampai tanggal…` (baru di sini input tanggal akhir muncul). Validasi tanggal akhir hanya jika durasi tetap. Kirim `contractEnd: null` untuk bulanan. Keterangan: "Tagihan terbit otomatis tiap bulan sampai kamar di-checkout." | Build & test lulus; kontrak bulanan tersimpan tanpa `contract_end`. |
| KOS-2.3 (migration — **butuh persetujuan user**) | Migration baru `supabase/migrations/2026102X0001_kos_open_ended_contract.sql`: `CREATE OR REPLACE FUNCTION public.auto_generate_kos_billing` — salin definisi terakhir **utuh**, ubah HANYA syarat kontrak menjadi: `contract_start` wajib, `contract_end` boleh NULL (NULL = berjalan terus). Pertahankan guard otorisasi, cek `read_only`, idempotensi, `SECURITY DEFINER`, `search_path`, dan grant/revoke persis seperti sekarang. Sertakan test SQL di `supabase/tests/`: kamar tanpa `contract_end` ditagih; kamar dengan `contract_end` < periode tidak ditagih; jalankan 2× → tidak ganda; kamar `vacant` tidak ditagih. | File migration + test ditulis. **Jangan dijalankan ke Supabase** — Claude yang dry-run & terapkan ke dev. |
| KOS-2.4 (frontend) | Matriks Sewa (`pages/PaymentMatrix.jsx`): baris kamar menampilkan nama penyewa dari kamar (bukan "— Belum Ada Penyewa —" bila sudah tertaut), dan badge kecil **"Bulanan"** / **"s.d. <tanggal>"**. Jangan ubah logika pembayaran/verifikasi. | Test render matriks dengan kamar terisi & kosong. |

Urutan: 2.1 → 2.2 → 2.4 → 2.3.

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit (sebut ID task), push setelah setiap commit. Jangan push ke `main`.
- Ikuti `docs/handoff/README.md` dan `AGENT.md`. Path relatif ke `client/src/` kecuali disebut lain.
- Setelah tiap task: `cd client && npx vitest run && npm run build`.
- Dukung mode demo (mockData) dan Supabase. Ikuti konvensi `pv-*`, palet forest/gold, React Query, cek RBAC, isolasi per tenant.
- 🚫 Jangan mengubah `services/dataService.js`, `services/apiClient.js`, `api/`, `legacy-backend/`, `.env*`, n8n, atau migration lama. Jangan menjalankan SQL ke Supabase.
- Keputusan tidak jelas → tulis di `questions.md`, lewati, lanjut task lain.
- Tulis `docs/handoff/KOS-2-report.md` di akhir.
