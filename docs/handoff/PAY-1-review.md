# PAY-1 Review (Claude, 2026-10-10)

Commit yang direview: `8689fe9..78f641e` (PAY-1.1–1.7 + penyesuaian 0,75% + laporan).

## Verifikasi ulang
| Cek | Hasil |
|---|---|
| `npx vitest run` | 36 file / **623 test lulus** |
| `npm run build` / `npm run lint` | ok / exit 0 |
| n8n: `api/n8n.js` | tidak berubah ✅ |
| n8n: `dataService.js` | hanya cabang Midtrans dihapus; perilaku `doku` & path n8n sama ✅ |
| Hash commit di `PAY-1-report.md` | ❌ **tidak cocok** dengan commit sebenarnya (mis. laporan `4551d3a`, aktual `8689fe9`). Laporan wajib memakai hash yang ada di branch. |

## Yang sudah benar
- `_shared/doku.ts`: hanya PKCS#8, secret tidak pernah di-log, fee `ceil(base × 0,0075)`, `timingSafeEqual`, error fail-closed, token B2B di-cache.
- Webhook: hanya POST, secret fail-closed, **status dicek ulang ke DOKU** sebelum aktivasi, cari record lewat filter (bukan select seluruh tabel), RPC gagal → 409.
- Fallback QR palsu Mayar & harga hardcode (F7) dihapus. Simulasi pembayaran dihapus.
- PAY-1.7: desain trigger (`pending_payment`, larang ubah `type` setelah bayar), policy SELECT F9, test T6–T9 — arahnya benar.

## Temuan — PAY-1 BELUM boleh di-deploy

### G1 — Pembayaran langganan tidak pernah bisa jalan (TINGGI, sebagian sudah ada sebelum PAY-1)
Skema `subscription_payments` di DB: `id, subscription_id, amount, qris_ref, payment_url, status, paid_at, metadata, ...`, status CHECK `('pending','paid','failed','expired')`.
Tapi kode memakai kolom/nilai yang **tidak ada**:
- `create-subscription-payment` insert `period_id`, `payment_method` → insert gagal → checkout selalu 500.
- `activate_tenant_subscription` (DB) membaca `v_payment.period_id`, menulis `payment_gateway_ref` dan `status='settled'` → error kolom + melanggar CHECK.
- Webhook mencari `payment_gateway_ref`; frontend (`SubscriptionCheckout.jsx`, `PlatformRevenue.jsx`) menunggu `'settled'`.
Kesalahan dokumen juga dari Claude: `PAY-1.md` menyebut kolom `payment_gateway_ref` tanpa mengecek skema.
**Keputusan:** sesuaikan skema ke kode (tambah kolom + izinkan `settled`), lihat PAY-1F.1.

### G2 — Pemeriksaan hak akses memakai kolom yang tidak ada (TINGGI, sudah ada sebelum PAY-1)
Kedua `create-*-payment` membaca `tenant_members.role`. Kolom itu tidak ada sejak RBAC v2 → `memberRow` null → **hanya platform admin** yang bisa membayar; owner tenant & pemasang iklan selalu 403.

### G3 — Blok langganan diubah SEBELUM dibayar (TINGGI, sudah ada sebelum PAY-1)
`create-subscription-payment` menghapus semua `tenant_subscription_blocks` lalu insert ulang **sebelum pembayaran**, dengan kolom yang salah (`pricing_id`, `block_count`; yang benar `block_size`, `quantity`, `price_snapshot`) dan error insert diabaikan. Akibat: checkout yang tidak dibayar menghapus kapasitas tenant. Blok harus diterapkan **di aktivasi**, setelah lunas.

### G4 — Pembayaran asli akan ditolak "amount mismatch" (TINGGI)
- Webhook `select("id, amount, status, ...")` **tanpa `metadata`**, jadi `expectedTotal` jatuh ke `amount` (harga dasar) ≠ yang dibayar (dasar + 0,75%) → 409 untuk setiap pembayaran sah.
- `create-*-payment` menimpa `metadata` pada update kedua sehingga `qris_fee_amount`/`qris_total_amount` hilang.
- Nominal diambil dari **payload webhook** (tidak terpercaya) dan pengecekan dilewati bila payload tidak membawa nominal. Harus dari respons query DOKU dan wajib ada.

### G5 — Notifikasi DOKU asli akan selalu 401 (TINGGI)
Webhook mencocokkan header `x-webhook-secret` / `x-signature` / `authorization` dengan secret kita. DOKU tidak mengirim secret kita; `X-SIGNATURE` DOKU adalah tanda tangan RSA milik DOKU. Karena status sudah dicek ulang ke DOKU, cukup pakai **token di URL notifikasi** (`?token=...`) yang kita daftarkan sendiri di dashboard DOKU.

### G6 — Status lunas terlalu longgar (SEDANG)
`SUCCESS_DOKU_STATUSES = ["00","SUCCESS","SETTLEMENT","PAID"]` dari `latestTransactionStatus || transactionStatus || status`. Untuk SNAP QRIS query, lunas = `responseCode` diawali `200` **dan** `latestTransactionStatus === "00"`. Hanya itu.

### G7 — Setiap listing baru gagal disimpan (TINGGI)
`public_listings.expires_at` di DB **NOT NULL**. Trigger PAY-1.7 dan `createListing()` mengisi `NULL` → insert selalu gagal. Test T6 akan menangkap ini, tapi test SQL tidak pernah dijalankan ke database.

### G8 — Kecil
- `check_listing_expirations()` kini hanya untuk service_role/platform admin, sementara `publicListingService.checkListingExpirations()` memanggilnya sebagai user. Fungsi frontend itu tidak dipakai komponen mana pun → hapus fungsinya (dan test-nya), jangan longgarkan guard.
- `DOKU_PLATFORM_BASE_URL` default ke **production** bila kosong. Jadikan wajib (fail-closed) supaya uji sandbox tidak salah sasaran.

## Status apply ke dev
Migration `202610100001` & `202610100002` **belum** diterapkan Claude karena G7 akan langsung merusak pembuatan listing. Diterapkan setelah PAY-1F.

## Hasil
PAY-1 **belum diterima**. Perbaikan di `PAY-1F.md`. Edge Function belum boleh di-deploy.
