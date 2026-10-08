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
Jawaban: (diisi Claude/user)
