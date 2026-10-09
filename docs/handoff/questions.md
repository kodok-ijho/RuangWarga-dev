# Pertanyaan Terbuka

Executor menulis pertanyaan di sini (jangan menebak). Orchestrator/user menjawab di bawahnya.

Format:
```
## [SEC-1.x] Judul singkat
Konteks: ...
Pilihan yang dipertimbangkan: ...
Jawaban: (diisi Claude/user)
```

---

## [SEC-1.4] Spesifikasi Event & Status Webhook Mayar
Konteks: Pada Edge Functions webhook (`verify-subscription-payment` dan `verify-listing-payment`), sistem mengecek event dan status untuk mengaktivasi pembayaran hanya ketika transaksi sukses.
Pilihan yang dipertimbangkan: Saat ini diimplementasikan allowlist fleksibel di bagian atas file:
- `SUCCESS_EVENTS = ["payment.received", "payment.settled", "payment.success", "payment_received", "payment_settled", "payment_success"]`
- `SUCCESS_STATUSES = ["paid", "settled", "success", "SUCCESS"]`
Apakah ada nama string event khusus lainnya dari webhook dashboard Mayar yang perlu dimasukkan atau dikunci?
Jawaban (Claude): Pertahankan allowlist sebagai konstanta, tapi aturan aktivasi diperketat di SEC-2.3: status WAJIB sukses, event harus kosong atau ada di allowlist, amount wajib ada & sama. Nama event final menunggu user mengirim **contoh payload webhook asli** dari dashboard Mayar (fitur test webhook) — setelah itu allowlist dikunci ke nilai persis tersebut di batch berikutnya.

## [PAY-1] Biaya QRIS 0,7% untuk langganan platform & iklan listing
Konteks: Alur QRIS warga yang sudah jalan (n8n DOKU) membebankan MDR 0,7% ke pembayar:
`fee = ceil(base * 0.007)`, `total = base + fee`.
Pilihan: (a) dibebankan ke tenant — tenant bayar Rp X + 0,7%; (b) ditanggung platform — tenant bayar tepat Rp X, margin platform berkurang 0,7%.
Catatan: hanya berlaku untuk langganan & iklan. Iuran warga tidak lewat QRIS platform (keputusan user: ke rekening tenant sendiri).
Jawaban (user): (belum dijawab — default sementara: (a), dan UI wajib menampilkan rincian biaya)

## [PAY-1] Format DOKU_PLATFORM_PRIVATE_KEY
Konteks: Web Crypto di Deno hanya bisa mengimpor kunci privat PKCS#8 (`-----BEGIN PRIVATE KEY-----`).
Pilihan: kalau kunci dari DOKU berformat PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`), perlu dikonversi: `openssl pkcs8 -topk8 -nocrypt -in doku.pem -out doku-pkcs8.pem`.
Jawaban (user): (belum dijawab — cek baris pertama file kunci dari dashboard DOKU merchant PLATFORM yang baru, bukan punya Palm Village)

## [PAY-1] Path endpoint status/query QRIS SNAP DOKU
Konteks: Webhook tidak boleh dipercaya; sebelum aktivasi, status harus dikonfirmasi ulang ke DOKU.
Pilihan: ambil path dari dokumentasi DOKU, atau dari workflow n8n `PV API - Payments QRIS Status DOKU Production`.
Jawaban (Claude/user): (belum — Claude bisa membaca workflow n8n-nya saat review PAY-1)

## [SEC-2 review / F6] Apakah pasang iklan listing gratis 30 hari pertama?
Konteks: `createListing()` membuat listing langsung `active` dengan masa tayang 30 hari, tanpa bayar. Pembayaran saat ini hanya untuk perpanjangan dan featured. Trigger SEC-2.1 sudah membatasi maksimal 30 hari, jadi tidak bisa disalahgunakan lebih dari itu — tapi tetap gratis.
Pilihan: (a) memang gratis 30 hari pertama, bayar untuk perpanjang/featured — tidak perlu perubahan; (b) iklan wajib bayar dulu — listing dibuat dalam status belum tayang dan baru aktif setelah pembayaran DOKU lunas (dikerjakan bersama PAY-1).
Jawaban (user): (belum dijawab)

