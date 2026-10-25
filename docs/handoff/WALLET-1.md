# WALLET-1 — Dompet RuangWarga

Status: ✅ **Rancangan dan 4 keputusan disetujui user 2026-10-25.** Task rinci ditulis saat DOKU platform siap. Bergantung pada DOKU platform aktif (§ 7 `PLAN.md`, PAY-3).

Dasar: keputusan user 2026-10-25 — "Pisahkan saldo DOKU dengan dompet RuangWarga. RuangWarga mesti punya dompet untuk perpanjang subscribe atau pasang iklan."

## Dua hal yang terpisah (jangan tertukar)
| | Saldo merchant DOKU platform | Dompet RuangWarga |
|---|---|---|
| Milik | Pemilik platform (user) | Tiap tenant (kos/RT/RW/kontrakan) |
| Isi | Uang hasil pembayaran QRIS, dicairkan DOKU ke rekening platform | Kredit layanan RuangWarga (angka di database) |
| Dikelola di | Dashboard DOKU | Aplikasi RuangWarga |
| Aplikasi menyentuhnya? | Tidak. Aplikasi hanya membuat QRIS dan menerima notifikasi | Ya, buku besar sendiri |

Isi dompet = **pembayaran QRIS ke merchant DOKU platform**. Uangnya masuk saldo DOKU platform seperti pembayaran langganan biasa; yang bertambah di aplikasi hanya kredit dompet tenant.

Pembayaran warga ke tenant (iuran, sewa kos, arisan) **tidak** lewat dompet dan tidak lewat QRIS.

## Requirement
1. **Satu dompet per tenant.** Dibuat otomatis saat dibutuhkan. Dilihat dan dipakai oleh owner tenant dan pemegang izin pengelola langganan.
2. **Isi saldo (top-up) via QRIS DOKU platform.** Pilihan nominal + nominal bebas dengan batas minimum. Biaya QRIS 0,75% ditambahkan di atas nominal (keputusan 2026-10-10). Saldo bertambah **hanya** setelah notifikasi DOKU terverifikasi; idempoten (notifikasi ganda tidak menambah dua kali).
3. **Bayar dari dompet:**
   - perpanjang langganan aplikasi;
   - pasang/perpanjang iklan (kamar, UMKM);
   - akses acara (PANITIA-BAYAR) bila nanti aktif.
   Bayar dari dompet tidak kena biaya QRIS lagi. Saldo tidak boleh minus; dua pembayaran bersamaan tidak boleh lolos dua-duanya bila saldo hanya cukup satu.
4. **Pembayaran QRIS langsung tetap tersedia.** Dompet adalah pilihan tambahan, bukan pengganti.
5. **Otomatis dari dompet (opsional, default mati):**
   - perpanjang langganan otomatis saat jatuh tempo bila saldo cukup;
   - iklan kamar otomatis tayang saat kamar kosong (LIST-AUTO-2) bila saldo cukup; bila kurang, jadi draf + notifikasi "isi saldo".
6. **Riwayat transaksi** (isi, pakai, penyesuaian) dengan saldo berjalan, bisa diunduh.
7. **Penyesuaian manual oleh platform admin** (kompensasi/koreksi) wajib alasan dan tercatat.
8. **Aturan saldo** (ditampilkan di halaman dompet): hanya untuk layanan RuangWarga, **tidak bisa diuangkan, tidak bisa dipindah** ke tenant lain. Dengan begitu dompet adalah kredit layanan tertutup, bukan uang elektronik umum.

## Rancangan teknis (ringkas)
- Tabel `wallet_accounts` (per tenant, saldo tersimpan) dan `wallet_transactions` (buku besar: jenis `topup` / `spend` / `adjust`, nominal bertanda, saldo sesudah, referensi ke pembayaran/iklan/langganan, `idempotency_key` unik).
- Semua mutasi lewat fungsi `SECURITY DEFINER` dengan `SELECT … FOR UPDATE` pada akun; DML langsung dicabut dari klien; RLS baca per tenant.
- Top-up memakai alur QRIS PAY-1 dengan awalan referensi `TOP-` pada penerima notifikasi tunggal PAY-3.
- Dashboard Platform: top-up dicatat sebagai uang diterima; pendapatan diakui saat saldo **dipakai**.

## Keputusan yang perlu user
1. Nominal isi saldo: usul **Rp50.000 / Rp100.000 / Rp250.000** + bebas, minimum **Rp20.000**.
2. Masa berlaku saldo: usul **tidak kedaluwarsa**.
3. Siapa yang boleh isi dan pakai: usul **owner tenant + pemegang izin pengelola langganan**.
4. Bonus isi saldo (mis. isi Rp250.000 dapat bonus): usul **tidak dulu**.

## Urutan dengan pekerjaan lain
LIST-UI-1 → LIST-AUTO-1 (draf otomatis + iklan tutup saat terisi + sisa masa tidak hangus) → penyiapan DOKU platform + PAY-3 → **WALLET-1** → LIST-AUTO-2 (iklan otomatis bayar dari dompet) dan perpanjang langganan otomatis.

Task rinci (schema, fungsi, Edge Function top-up, UI dompet) ditulis setelah rancangan ini disetujui.
