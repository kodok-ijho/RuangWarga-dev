# KOS-3 — Siklus tagihan prorata (opsional per kontrak)

Status: **disetujui user 2026-10-25** ("langsung kerjakan"). Menyentuh tagihan dan schema; migration baru diterapkan ke dev setelah dry-run lolos.

## Requirement (keputusan user)
- **Default tetap "ikut tanggal masuk"** (`billing_cycle = 'start_date'`, perilaku KOS-2 sekarang): tagihan tiap tanggal masuk, anchor dari `start_date`, clamp akhir bulan.
- **Prorata hanya pilihan** saat membuat kontrak (`billing_cycle = 'month_start_prorata'`):
  - bulan pertama: masa sewa `start_date` s.d. akhir bulan itu; nominal = `floor(rent × hari_terpakai / hari_dalam_bulan / 1000) × 1000` (dibulatkan **ke bawah** ke ribuan);
  - bulan berikutnya: tanggal 1 s.d. akhir bulan, nominal penuh;
  - masuk tanggal 1 → dinormalkan menjadi `'start_date'` (tanpa prorata);
  - durasi tetap `p_months = N`: bulan pertama prorata + N bulan kalender penuh; `end_date` = hari terakhir bulan ke-N setelah bulan masuk;
  - checkout: tanpa prorata keluar dan tanpa refund (perilaku `checkout_kos_room` tidak berubah).
- Siklus tidak bisa diubah setelah kontrak dibuat (tidak ada RPC ubah). Kontrak lama tetap `'start_date'`.
- Pembayaran kos tidak lewat QRIS (manual, diverifikasi pengurus). Tidak ada perubahan alur pembayaran.

Contoh: masuk 19 Okt 2026, Rp1.500.000, prorata → Okt 19–31 = 13/31 → Rp629.000 (jatuh tempo 19 Okt + grace); Nov 1–30 Rp1.500.000; dst.

## Aturan executor
- Branch saat ini. Satu task = satu commit (sebut ID). Jangan push. Jangan jalankan SQL ke Supabase.
- Jangan ubah migration yang sudah ada (`202610240001`, `202610240002` sudah terpasang di dev). Jangan sentuh `.env*`, `legacy-backend/`, `api/`, n8n, Edge Function, `dataService.js`. Jangan install package.
- Setelah tiap task: `cd client && npm run lint && npm run build`. Setelah 3.2: vitest di `TZ=UTC` dan `TZ=Asia/Jakarta` (`VITE_DEMO_MODE=false`).

## 3.1 — Database (migration baru `supabase/migrations/202610250001_kos_contract_prorata.sql`, test baru `supabase/tests/kos_contract_prorata.sql`)
- `kos_contracts.billing_cycle TEXT NOT NULL DEFAULT 'start_date' CHECK (billing_cycle IN ('start_date','month_start_prorata'))`.
- `create_kos_contract`: tambah parameter terakhir `p_billing_cycle TEXT DEFAULT 'start_date'`. Karena signature berubah: `DROP FUNCTION public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT)` lalu buat versi 10 argumen dengan isi versi `202610240002` (semua cek izin, K9, validasi) + logika prorata; REVOKE dari `PUBLIC, anon`, GRANT ke `authenticated, service_role`. Nilai di luar dua pilihan → ditolak dengan pesan jelas. Simpan `billing_cycle` di kontrak dan kembalikan di JSON hasil. Tagihan pertama prorata menyimpan `metadata.prorata = true`, `prorata_days`, `days_in_month`.
- `generate_kos_contract_bills` (signature sama, `CREATE OR REPLACE`, salin dari `202610240002` lalu ubah): untuk kontrak `month_start_prorata`, periode ke-n (n ≥ 1) `service_start = date_trunc('month', start_date) + n bulan`, `service_end` = akhir bulan itu (clamp `end_date`), nominal penuh. Kontrak `start_date` tidak berubah. Pertahankan idempotensi, catch-up, skip read_only, dan GRANT hanya `service_role`.
- Test (gaya `kos_contract_billing.sql`, fixture `auth.users` wajib ada sebelum `tenant_members`, tangkap error 42501 sebagai `insufficient_privilege`, tanggal relatif hari ini WIB atau dalam batas K9):
  - default tanpa parameter → `billing_cycle = 'start_date'`, perilaku lama;
  - prorata masuk tgl 19 bulan 31 hari, Rp1.500.000 → tagihan pertama Rp629.000, `service_end` akhir bulan; generator bulan berikutnya → service 1 s.d. akhir bulan, Rp1.500.000; dijalankan dua kali tidak ganda;
  - prorata masuk tanggal 1 → tersimpan `'start_date'`, nominal penuh;
  - prorata durasi 2 bulan → `end_date` akhir bulan ke-2 setelah bulan masuk, tidak ada tagihan setelahnya;
  - nilai siklus tidak valid → ditolak.
- Commit: `feat(kos): KOS-3.1 siklus tagihan prorata opsional di kontrak`

## 3.2 — Frontend
- `client/src/services/tenant/billing.js` `createKosContract`: terima `billingCycle` (default `'start_date'`), kirim `p_billing_cycle`. Mode demo: hitung tagihan pertama dengan aturan sama dan simpan `billing_cycle` di kontrak mock.
- `client/src/components/CreateBillingModal.jsx` (form kontrak kos): pilihan "Siklus tagihan" — **"Ikut tanggal masuk"** (terpilih default) dan "Awal bulan (bulan pertama prorata)". Saat prorata dipilih dan tanggal masuk bukan tanggal 1, tampilkan pratinjau nominal bulan pertama (mis. "Okt 19–31: Rp629.000"). Gaya `pv-*`, palet forest/gold.
- Tampilkan badge kecil "Prorata" di samping badge "Bulanan"/"s.d." untuk kontrak `month_start_prorata` (`PaymentMatrix.jsx`, `TenantUnits.jsx`), tanpa mengubah aturan status terisi.
- Test vitest: helper hitung prorata (13/31 × 1.500.000 → 629.000; tanggal 1 → penuh), dan `createKosContract` mengirim `p_billing_cycle`.
- Commit: `feat(kos): KOS-3.2 pilihan siklus prorata di form kontrak`

## Setelah executor (Claude)
Review, dry-run migration + test di dev (BEGIN … ROLLBACK), terapkan ke dev, catat riwayat, cek bahwa kontrak yang ada tetap `'start_date'`.
