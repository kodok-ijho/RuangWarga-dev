# KOS-4 — Aturan Kontrak Sewa sebagai master pengaturan kos

Status: ✅ **Disetujui user 2026-10-26** ("Ganti menggunakan aturan kontrak saja"). Menyentuh tagihan dan schema; migration diterapkan ke dev setelah dry-run lolos.

## Masalah
Halaman Pengaturan tenant kos masih memakai pengaturan tagihan gaya IPL. Pengaturan itu tidak berlaku untuk kontrak dan menyesatkan:
- tanggal jatuh tempo tetap;
- sakelar "Terbitkan tagihan otomatis" (tagihan kos tetap terbit tiap malam);
- tanggal terbit;
- komponen biaya IPL.

Selain itu ada dua celah:
- `additional_fees` dari wizard (parkir, laundry) tersimpan tetapi tidak pernah ditagih;
- tenggat bayar `rent_grace_days` tidak bisa diatur.

## Requirement
1. **Pengaturan → "Aturan Kontrak Sewa"** (tenant kos saja, owner / `manage_settings`). Master default untuk kontrak baru, disimpan di `tenants.settings`:
   - harga sewa default: `default_rent_price`;
   - tenggat bayar (hari setelah tanggal tagih, 0–28, default 10): `rent_grace_days`;
   - siklus default `start_date` (default) / `month_start_prorata`: `contract_default_cycle`;
   - durasi default: bulanan (kosong) atau N bulan: `contract_default_months`;
   - daftar biaya tambahan `{name, amount}`, maks. 10: `additional_fees`.

   Teks keterangan: "Tagihan sewa terbit otomatis setiap tanggal masuk penyewa sesuai kontrak."
2. Untuk tenant kos, **sembunyikan**:
   - tanggal jatuh tempo tetap;
   - sakelar terbit otomatis;
   - tanggal terbit;
   - riwayat penerbitan IPL;
   - komponen biaya IPL.

   Pengaturan RT/RW **tidak berubah**.
3. **Form kontrak** (`CreateBillingModal`) mengisi nilai awal dari master: harga (kamar dulu, lalu default), tenggat, siklus, durasi. Biaya tambahan tampil sebagai **centang per kontrak** (default tidak dicentang), nominal bisa disesuaikan sebelum disimpan.
4. **Biaya tambahan ikut ditagih** setiap periode bersama sewa:
   - nominal tagihan = sewa + jumlah biaya tambahan kontrak;
   - pada bulan pertama prorata, biaya tambahan ikut diprorata dengan rumus yang sama;
   - rincian disimpan di `metadata.line_items` (`[{name:'Sewa', amount}, {name:'Parkir Mobil', amount}]`).
   - Kontrak yang sudah ada: tanpa biaya tambahan, tagihan tidak berubah.
5. **Wizard kos** (`KosSetupWizard.jsx`) menyimpan `rent_grace_days` (bukan `due_day`). Kunci lama dibiarkan di data, tidak dibaca lagi untuk kos.
6. Pembayaran kos tetap manual (bukan QRIS). Alur verifikasi pembayaran tidak berubah.

## Aturan executor
- Branch saat ini. Satu task = satu commit (sebut ID). **Jangan push.** Jangan jalankan SQL ke Supabase.
- Jangan ubah migration lama, Edge Function, `dataService.js`, `apiClient.js`, `api/`, `legacy-backend/`, `.env*`. Jangan install package.
- Setelah tiap task: `cd client && npm run lint && npm run build && VITE_DEMO_MODE=false npx vitest run` (lolos `TZ=UTC` dan `TZ=Asia/Jakarta`).

## 4.1 — Database (migration baru `supabase/migrations/202610260002_kos_contract_fees.sql`, test baru `supabase/tests/kos_contract_fees.sql`)
- `kos_contracts.additional_fees JSONB NOT NULL DEFAULT '[]'`.
- `create_kos_contract`: tambah parameter terakhir `p_additional_fees JSONB DEFAULT '[]'`.
  - DROP versi 10 argumen, buat versi 11 argumen dari isi versi `202610250001` (semua cek izin, K9, prorata tetap).
  - Validasi: array, maks. 10 item, `name` teks tidak kosong (maks. 60 karakter), `amount` angka ≥ 0. Selain itu ditolak dengan pesan jelas.
  - Tagihan pertama memakai nominal sewa + biaya (prorata bila siklus prorata) dan `metadata.line_items`.
  - REVOKE `PUBLIC, anon`; GRANT `authenticated, service_role`.
- `generate_kos_contract_bills` (signature sama): nominal = `rent_price` + jumlah `additional_fees`; isi `line_items`. Pertahankan idempotensi, siklus prorata, skip `read_only`, GRANT hanya `service_role`.
- Test (gaya test kos yang ada: fixture `auth.users` dulu, enum langganan `trial/active/read_only`, 42501 = `insufficient_privilege`, tanggal dalam batas K9, generator dipanggil sebagai service_role/postgres):
  - kontrak tanpa biaya = perilaku lama;
  - kontrak + Parkir 100.000 → tagihan pertama sewa + 100.000 dengan `line_items` 2 baris; periode berikutnya sama;
  - prorata + biaya → keduanya diprorata, dibulatkan ke bawah ke ribuan sesuai aturan KOS-3;
  - biaya tidak valid (nama kosong, nominal negatif, > 10 item) → ditolak.
- Commit: `feat(kos): KOS-4.1 biaya tambahan per kontrak ikut ditagih`

## 4.2 — Frontend
- `pages/tenant/TenantSettings.jsx`: bagian "Aturan Kontrak Sewa" untuk kos (requirement 1–2), simpan lewat `updateTenantProfileAndSettings` (digabung, kunci lain tidak hilang).
- `components/CreateBillingModal.jsx`: prefill dari master; centang biaya tambahan; pratinjau total per periode (sewa + biaya, prorata bila dipilih); kirim `additionalFees` → `p_additional_fees` lewat `createKosContract` (`services/tenant/billing.js`, mode demo ikut).
- Tampilkan rincian `line_items` di detail tagihan kos bila ada (cari komponen detail tagihan di `PaymentMatrix.jsx`).
- `pages/onboarding/KosSetupWizard.jsx`: ganti isian jatuh tempo menjadi tenggat bayar (`rent_grace_days`).
- Test vitest untuk tiap poin; sesuaikan test lama.
- Lalu tulis `docs/handoff/KOS-4-report.md`.
- Commit: `feat(kos): KOS-4.2 Aturan Kontrak Sewa di pengaturan dan form kontrak`
