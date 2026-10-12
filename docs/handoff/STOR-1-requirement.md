# STOR-1 — Requirement: Penyimpanan file di Cloudflare R2

Status: **draft, menunggu persetujuan user** (2026-10-11)

## Latar belakang
- Project Supabase `Ruangwarga-dev` memakai paket Free: storage 1 GB dan egress 5 GB per bulan.
- Hasil cek pada 2026-10-11: bucket `payment-proofs` dan `expense-receipts` masih **kosong** (0 file), dan database berukuran 13 MB. Karena belum ada file, pindah sekarang tidak membutuhkan migrasi data.
- User memilih **Cloudflare R2**: 10 GB gratis per bulan dan egress gratis.
- Opsi Google Drive dengan akses "siapa pun yang punya link" **ditolak**. Link seperti itu tidak bisa dicabut per orang, sementara bukti bayar memuat data pribadi warga (nama dan nomor rekening).

## Tujuan
1. Semua file milik tenant, yaitu **bukti bayar warga** dan **nota pengeluaran**, disimpan di **satu bucket R2 privat**.
2. Database **hanya menyimpan path objek** (mis. `{tenant_id}/payments/{billing_item_id}/{file}`), bukan URL.
3. Frontend **tidak pernah** memegang kredensial R2 maupun URL permanen. Frontend hanya menerima **URL sementara** (presigned GET, berlaku maksimal 10 menit, default 5 menit), dan URL itu baru diterbitkan setelah izin pengguna dicek.
4. Aturan akses **sama persis** dengan policy Storage Supabase yang berlaku sekarang (lihat tabel di bawah).
5. Mode demo (`VITE_DEMO_MODE=true`) tetap berjalan tanpa R2.

## Aturan akses (harus sama dengan policy saat ini)
Sumber: `supabase/migrations/202610130004_payment_proofs_bucket.sql` dan `202609220003_harden_expense_receipts_storage_rls.sql`.

| Jenis file | Path canonical | Boleh upload | Boleh lihat |
|---|---|---|---|
| Bukti bayar (`payment_proof`) | `{tenant_uuid}/payments/{billing_item_uuid}/{nama_aman}` | Anggota tenant (`current_tenant_ids`), dan langganan tenant bukan `read_only` | Platform admin, **pengunggah sendiri**, owner tenant, atau pemilik izin `manage_billing_transfer` / `manage_billing_cash` |
| Nota pengeluaran (`expense_receipt`) | `{tenant_uuid}/expenses/{tahun}/{nama_aman}` | Platform admin, atau `manage_expenses` dengan langganan bukan `read_only` | Platform admin atau `manage_expenses` |

Ketentuan file:
- Ukuran maksimal **5 MB**.
- Tipe yang diizinkan: JPEG, PNG, WebP, PDF. Tipe **dicek dari isi file (magic bytes)**, bukan dari ekstensi atau `Content-Type` kiriman browser.
- Path disusun **di server**, bukan oleh browser. Nama file disanitasi.
- Tidak ada akses publik ke bucket. Domain `r2.dev` dan custom domain publik tidak diaktifkan.

## Di luar lingkup (non-goals)
- File Google Drive lama milik Palm Village (`metadata.drive_url`) dibiarkan apa adanya. **n8n tidak disentuh.**
- Logo tenant dan foto listing publik akan dibahas di batch terpisah bila diperlukan.
- Thumbnail atau transformasi gambar.
- Menghapus file lama atau file yatim.
- Menghapus bucket Supabase `payment-proofs` dan `expense-receipts`. Keduanya dibiarkan kosong dulu, lalu dihapus di batch lanjutan setelah R2 stabil.

## Prasyarat dari user (dikerjakan sendiri, rahasia jangan dikirim ke chat atau repo)
1. Buat akun Cloudflare dan aktifkan R2 (biasanya diminta kartu sebagai verifikasi).
2. Buat bucket **`ruangwarga-dev`** dengan location hint **Asia-Pacific (APAC)**. Jangan aktifkan Public Access.
3. Buat **R2 API Token** dengan izin *Object Read & Write* yang **dibatasi hanya ke bucket `ruangwarga-dev`**.
4. Di Supabase Dashboard → project `Ruangwarga-dev` → Edge Functions → Secrets, tambahkan:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (= `ruangwarga-dev`).
5. Atur CORS bucket: izinkan `GET` dan `HEAD` dari origin aplikasi, yaitu `http://localhost:5173` dan domain Vercel `ruangwarga-dev`.

## Kriteria diterima
- Warga bisa mengunggah bukti transfer, lalu melihat bukti miliknya sendiri.
- Bendahara atau owner bisa melihat bukti di Matriks IPL dan Verifikasi.
- Warga lain dan anggota tenant lain **ditolak** (HTTP 403).
- Pengurus dengan `manage_expenses` bisa mengunggah dan melihat nota. Warga biasa ditolak.
- File di atas 5 MB ditolak. File `.exe` yang diganti namanya menjadi `.jpg` ditolak.
- URL sementara tidak bisa dipakai lagi setelah kedaluwarsa.
- Tidak ada kredensial R2 di bundle frontend, di repo, atau di log.
- `npx vitest run`, `npm run build`, dan `npm run lint` hijau.
