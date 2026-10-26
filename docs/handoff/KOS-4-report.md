# KOS-4 — Laporan

## 4.1 — Database (`f9f4b6d`, perbaikan Claude `af30c5c`)
- Migration `202610260002_kos_contract_fees.sql`:
  - kolom `kos_contracts.additional_fees`;
  - `create_kos_contract` 11 argumen (`p_additional_fees`, divalidasi: maks. 10 item, nama tidak kosong maks. 60 karakter, nominal ≥ 0);
  - nominal tagihan = sewa + biaya tambahan, dengan `metadata.line_items`. Bulan pertama prorata memprorata total, lalu baris Sewa = total − biaya prorata, sehingga jumlah rincian selalu sama dengan total;
  - `generate_kos_contract_bills` ikut menambahkan biaya dan rincian.
- Perbaikan Claude saat dry-run:
  - variabel biaya `RECORD` → `JSONB`, karena `jsonb_typeof(record)` error;
  - Uji 3 menjalankan generator sebelum periode berikutnya jatuh tempo.
- Test `supabase/tests/kos_contract_fees.sql`.

## 4.2 — Frontend
- `TenantSettings.jsx`: tenant kos memakai bagian **Aturan Kontrak Sewa**:
  - harga default;
  - tenggat bayar `rent_grace_days`;
  - siklus default;
  - durasi default;
  - biaya tambahan.

  Jatuh tempo tetap, sakelar terbit otomatis, tanggal terbit, riwayat, dan komponen IPL disembunyikan untuk kos. RT/RW tidak berubah.
- `CreateBillingModal.jsx`: prefill dari aturan kontrak; biaya tambahan sebagai centang per kontrak; pratinjau total per periode.
- `billing.js`: `createKosContract` mengirim `p_additional_fees`; mode demo menghitung rincian yang sama.
- `PaymentMatrix.jsx`: rincian `line_items` tampil di detail tagihan.
- `KosSetupWizard.jsx`: isian jatuh tempo diganti tenggat bayar (`rent_grace_days`). Claude menghapus fallback yang membaca `due_day` lama sebagai jumlah hari tenggat ("tanggal 1" bukan "1 hari").
- agy berhenti karena batas waktu sebelum commit; Claude memverifikasi lalu meng-commit.

## Verifikasi
- Dry-run dev: migration + `kos_contract_fees.sql` + `kos_contracts.sql` + `kos_contract_billing.sql` + `kos_contract_prorata.sql` + `listing_auto_vacancy.sql` → `DRYRUN_OK`.
- Lint bersih, build sukses, vitest 102 file 1394/1394 di `TZ=UTC` dan `TZ=Asia/Jakarta`.
