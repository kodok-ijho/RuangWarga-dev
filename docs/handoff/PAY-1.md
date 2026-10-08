# PAY-1 — Migrasi gateway pembayaran ke DOKU

**Status: belum aktif.** Dikerjakan setelah SEC-2 lolos review. Baca `docs/handoff/README.md` dan AGENT.md §9 dulu.

## Keputusan user
- **DOKU saja.** Mayar dan Midtrans dibuang seluruhnya.
- **Cakupan batch ini hanya uang yang tenant bayar ke platform**: langganan (`subscription_payments`) dan iklan listing (`listing_payments`), lewat akun merchant DOKU milik platform.
- **DI LUAR cakupan:** pembayaran warga ke tenant (`payments`, iuran/sewa). Itu tetap `bank_transfer`/`cash` ke rekening tenant sendiri — jangan diubah di batch ini. Platform tidak menampung dana tenant, jadi tidak ada payout/disbursement.
- Alur QRIS warga Palm Village lewat n8n **dibiarkan apa adanya**; jangan disentuh.

### ⚠️ DUA MERCHANT DOKU BERBEDA — jangan tertukar
- Kredensial DOKU yang ada di **env n8n** (`DOKU_CLIENT_ID`, `DOKU_PRIVATE_KEY`, `DOKU_MERCHANT_ID`, dst.) adalah **milik Palm Village**, untuk iuran warganya, settle ke rekening Palm Village. **Dilarang dipakai untuk pendapatan platform.**
- Batch ini memakai **merchant DOKU baru milik platform**. Semua secret-nya diberi awalan **`DOKU_PLATFORM_`** supaya mustahil tertukar:
  `DOKU_PLATFORM_BASE_URL`, `DOKU_PLATFORM_CLIENT_ID`, `DOKU_PLATFORM_CLIENT_SECRET`,
  `DOKU_PLATFORM_MERCHANT_ID`, `DOKU_PLATFORM_TERMINAL_ID`, `DOKU_PLATFORM_POSTAL_CODE`,
  `DOKU_PLATFORM_PRIVATE_KEY`, `DOKU_PLATFORM_CHANNEL_ID`, `DOKU_PLATFORM_WEBHOOK_SECRET`.
- Jangan membaca env tanpa awalan itu di Edge Function mana pun.

## Referensi: SNAP DOKU yang SUDAH TERBUKTI JALAN

Jangan menebak protokolnya. Pola di bawah disalin dari workflow n8n produksi
`PV API - Payments QRIS Create DOKU Production` (aktif, dipakai Palm Village).

### 1. Ambil B2B access token
- `POST {DOKU_BASE_URL}/authorization/v1/access-token/b2b`
- Header: `X-CLIENT-KEY: {DOKU_CLIENT_ID}`, `X-TIMESTAMP: {ts}`, `X-SIGNATURE: {sig}`
- `sig` = **RSA-SHA256** (RSASSA-PKCS1-v1_5), tanda tangan dari string `` `${clientId}|${ts}` ``, hasil **base64**, pakai `DOKU_PRIVATE_KEY`.
- Body: `{"grantType":"client_credentials"}`
- Ambil `accessToken` dari respons.

### 2. Buat QRIS
- `basePath` = `/snap-adapter/b2b/v1.0/qr/qr-mpm-generate`
- `POST {DOKU_BASE_URL}{basePath}`
- Body (JSON, **minified** — hash harus dihitung dari string yang persis dikirim):
  ```json
  { "partnerReferenceNo": "<order id>",
    "amount": { "value": "<total>.00", "currency": "IDR" },
    "merchantId": "<DOKU_MERCHANT_ID>",
    "terminalId": "<DOKU_TERMINAL_ID>",
    "additionalInfo": { "postalCode": "<DOKU_POSTAL_CODE>", "feeType": "1" } }
  ```
- `stringToSign` = `` `POST:${basePath}:${token}:${bodyHash}:${ts}` ``
  di mana `bodyHash` = **SHA-256 hex lowercase** dari body minified.
- `X-SIGNATURE` = **HMAC-SHA512** dengan kunci `DOKU_CLIENT_SECRET` atas `stringToSign`, hasil **base64**.
- Header: `Authorization: Bearer {token}`, `X-PARTNER-ID: {clientId}`, `X-EXTERNAL-ID: {requestId}` (unik per request), `X-TIMESTAMP: {ts}`, `X-SIGNATURE`, `CHANNEL-ID: {DOKU_CHANNEL_ID|H2H}`
- Sukses bila `responseCode === '2004700'` **dan** `qrContent` ada. Ambil `referenceNo` + `qrContent`.

### 3. Format timestamp (wajib persis)
`new Date().toISOString().split('.')[0] + 'Z'` → `2026-10-09T03:15:00Z` (tanpa milidetik).

### 4. Env / secrets (Supabase Edge Function secrets, JANGAN di repo)
Pakai awalan `DOKU_PLATFORM_*` seperti daftar di bagian "DUA MERCHANT DOKU BERBEDA" di atas.
Nama tanpa awalan (`DOKU_CLIENT_ID`, dst.) milik Palm Village di n8n — jangan dibaca di sini.

### 5. Biaya QRIS
Workflow lama membebankan MDR 0,7% ke pembayar:
`fee = Math.ceil(base * 0.007)`, `total = base + fee`. Lihat pertanyaan terbuka di bawah.

---

## Task

### PAY-1.1 — Modul SNAP DOKU bersama  ⚠️ sensitif
File baru: `supabase/functions/_shared/doku.ts`. Deno pakai **Web Crypto** (`crypto.subtle`), bukan `node:crypto`.

Ekspor:
- `dokuTimestamp(): string` — format §3.
- `signRsaSha256(data: string, pemPrivateKey: string): Promise<string>` — `importKey('pkcs8', …, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['sign'])` lalu `sign`, hasil base64.
  **PENTING:** Web Crypto hanya menerima **PKCS#8** (`-----BEGIN PRIVATE KEY-----`). Jika env berisi PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`), lempar error jelas yang menyuruh konversi (`openssl pkcs8 -topk8 -nocrypt`) — **jangan** coba parse sendiri. Tangani juga `\n` yang ter-escape (env sering menyimpan `\\n`), seperti yang dilakukan workflow n8n.
- `hmacSha512Base64(data: string, secret: string): Promise<string>`
- `sha256HexLower(data: string): Promise<string>`
- `getB2BToken(cfg): Promise<string>` — §1, dengan cache in-memory sampai mendekati kedaluwarsa (token DOKU berumur ~15 menit; simpan `expiresAt` dan pakai ulang).
- `createQris({ partnerReferenceNo, amount, requestId }): Promise<{ referenceNo, qrContent, raw }>` — §2.
- `queryQrisStatus({ originalPartnerReferenceNo | originalReferenceNo })` — panggil endpoint status/inquiry SNAP DOKU. **Path persisnya belum diverifikasi** — ambil dari dokumentasi DOKU atau dari workflow n8n `PV API - Payments QRIS Status DOKU Production`; kalau tetap tidak yakin, tulis di `questions.md` dan biarkan fungsi melempar `Error('not configured')`.
- `readDokuConfig()` — baca semua env; **jika ada yang kosong, lempar error** (jangan fallback ke simulasi, jangan nilai default selain `DOKU_CHANNEL_ID='H2H'` dan `DOKU_BASE_URL='https://api.doku.com'`).

Jangan pernah mencetak private key, client secret, atau token ke log.

Acceptance: `deno check supabase/functions/_shared/doku.ts` lolos (kalau `deno` tak tersedia, catat di report).

### PAY-1.2 — `create-subscription-payment` & `create-listing-payment` pakai DOKU  ⚠️ sensitif
Ganti seluruh bagian Mayar dengan `_shared/doku.ts`:
- Hitung `base` seperti sekarang (harga dari `block_pricing` / `listing_pricing`; **tetap tanpa fallback harga hardcode** — hasil SEC-1.4 dipertahankan).
- Tambah biaya QRIS sesuai keputusan di "Pertanyaan terbuka" di bawah.
- `partnerReferenceNo` = order id unik; simpan ke kolom referensi yang sudah ada (`subscription_payments.payment_gateway_ref`, `listing_payments.qris_ref`) bersama `referenceNo` DOKU.
- Simpan `qrContent` (string QRIS) supaya frontend bisa merender QR; `payment_url` tidak lagi dipakai DOKU — kalau kolomnya masih ada, isi `null` atau rute internal yang menampilkan QR.
- Gagal panggil DOKU → set payment `status='failed'`, balas **502**. Hapus seluruh jalur simulasi & `ALLOW_SIMULATED_PAYMENTS` (DOKU wajib terkonfigurasi).
- Jangan kirim nomor HP palsu.

### PAY-1.3 — `verify-subscription-payment` & `verify-listing-payment` jadi webhook DOKU  ⚠️ sensitif (uang platform)
Tulis ulang sebagai penerima notifikasi DOKU. Aturan **wajib** (menggantikan SEC-2.3 yang dibatalkan):
1. Hanya `POST`; tanpa header CORS `*`.
2. **Jangan percaya isi webhook.** Setelah mencocokkan record pembayaran, **panggil ulang `queryQrisStatus()` ke DOKU** dan aktivasi hanya jika DOKU sendiri menyatakan lunas. Ini pengaman utama; verifikasi tanda tangan di bawah adalah lapisan tambahan.
3. Verifikasi `X-SIGNATURE` notifikasi sesuai skema DOKU. Jika skemanya belum pasti dari dokumentasi → tulis di `questions.md`, dan sementara **wajibkan** header secret bersama (`DOKU_WEBHOOK_SECRET`, bandingkan constant-time) + langkah 2. Fail-closed bila secret belum diset (pola SEC-1.4 dipertahankan).
4. Status sukses DOKU: `latestTransactionStatus`/`transactionStatus` bernilai `'00'`, atau `SUCCESS`/`SETTLEMENT` (lihat workflow webhook n8n). Status lain → `200` "ignored", tanpa aktivasi.
5. Cocokkan nominal: `amount.value` dari DOKU harus sama dengan total yang tersimpan; beda → **409**, tanpa aktivasi.
6. Cari record lewat `originalPartnerReferenceNo` / `partnerReferenceNo` / `referenceNo` → kolom referensi yang disimpan di PAY-1.2. **Jangan** `select` seluruh tabel; filter di query. **Jangan** ada ID hardcode.
7. Setelah RPC aktivasi: jika `result?.success !== true` → **409** dengan pesan dari RPC, bukan 200.
8. Jangan bocorkan pesan error internal ke respons; cukup log.

### PAY-1.4 — Frontend: render QRIS DOKU
- `client/src/pages/account/SubscriptionCheckout.jsx`: tampilkan QR dari `qrContent` yang dikembalikan `create-subscription-payment`; polling status (hasil SEC-1.3) dipertahankan. Hapus teks/variabel Mayar.
- `client/src/components/QrisCheckoutModal.jsx`: hanya DOKU; hapus parameter/percabangan provider lain. Jangan kembalikan fallback QR palsu (hasil SEC-1.3 dipertahankan).
- `client/src/services/publicListingService.js`: alur bayar iklan pakai `qrContent` DOKU.
- Hapus referensi Mayar yang terlihat pengguna di `pages/Home.jsx`, `pages/account/ChoosePlan.jsx`, `pages/account/SubscriptionStatus.jsx`, `pages/platform/PlatformRevenue.jsx` → ganti "QRIS" atau "DOKU".
- Update test terkait.

### PAY-1.5 — Bersihkan sisa Mayar & Midtrans
- `grep -rn "mayar\|midtrans" -i client/src supabase api --include=*.js --include=*.jsx --include=*.ts --include=*.sql` → kosong (kecuali `supabase/migrations/*` lama yang **tidak boleh diubah**; migration yang sudah pernah jalan jangan disentuh — kalau ada komentar/nilai default Mayar di skema, perbaiki lewat migration **baru**).
- Hapus `MIDTRANS_*` dari `.env.server.example` / `.env.uat.server.example`, tambahkan daftar `DOKU_*` (nama variabel saja, **tanpa nilai**).
- `client/src/services/dataService.js`: `normalizeQrisProvider` cukup mengembalikan `'doku'`; hapus cabang Midtrans. Hati-hati, file ini legacy dan dipakai 16 file — jangan ubah hal lain.
- Perbarui `AGENT.md` §3 (baris Payment Gateway) → "DOKU QRIS (SNAP)".

### PAY-1.6 — Test
- `client/src/services/__tests__/` (atau pola yang dipakai repo): unit test untuk helper pembayaran yang murni (format timestamp, hitung biaya QRIS, pembentukan `stringToSign`). **Jangan** test yang memanggil DOKU sungguhan (AGENT.md §10.5).
- Kalau helper signing dipindah ke modul yang bisa diimpor Vitest, tambah test vektor: diberi kunci dummy + input tetap → tanda tangan konsisten.

---

## Pertanyaan terbuka (jawab sebelum PAY-1.2 dikerjakan)
Catat jawaban di `questions.md`.

1. **Biaya QRIS 0,7%** untuk langganan & iklan — dibebankan ke tenant (bayar Rp X + 0,7%) atau ditanggung platform (tenant bayar tepat Rp X)? *Default bila user tidak menjawab: dibebankan ke tenant, dan UI wajib menampilkan rinciannya.*
2. **Format `DOKU_PLATFORM_PRIVATE_KEY`** — PKCS#8 atau PKCS#1? (lihat PAY-1.1)
3. **Path endpoint status/query SNAP DOKU** — konfirmasi dari dokumentasi DOKU.

## Definition of Done
- `PAY-1-report.md` dengan hash commit tiap task.
- vitest, build, lint hijau.
- Edge Function **belum** di-deploy; deploy dilakukan setelah review Claude dan setelah semua secret `DOKU_*` diset.
