# NOTIF-1: Ingatkan tagihan via WhatsApp (manual, gratis)

Status: **disetujui user 2026-10-20**. Frontend saja, tanpa schema dan tanpa API berbayar. WA otomatis lewat API berbayar sudah diurungkan (lihat BACKLOG).

## Keputusan
- Satu tombol **"Ingatkan via WA"** per baris unit di Matriks Pembayaran (`/t/:id/payment-matrix`, `client/src/pages/PaymentMatrix.jsx`). Tidak ada tombol "ingatkan semua", karena itu akan membuka banyak tab WhatsApp.
- Pesan merangkum **semua tagihan unit itu yang belum lunas** (`status = 'unpaid'`) dengan periode sampai bulan berjalan. Tagihan untuk bulan mendatang tidak ikut.
- Tombol hanya tampil untuk pengurus pemegang izin tagihan atau verifikasi (`canGenerateBilling`, `canVerifyPayments`, `canRecordCash`, atau `canRecordTransfer`; owner otomatis termasuk). Warga biasa tidak melihatnya.
- Nomor HP diambil dari `tenant_members.phone` penghuni. Bila kosong, dipakai `tenant_units.metadata.occupant.phone`. Nomor dinormalkan ke format `62…`. Bila tidak ada nomor, link `wa.me/?text=…` tetap dibuka supaya pengurus bisa memilih kontak sendiri.

## Isi pesan
```
Halo {nama},

Pengingat tagihan {billLabel} {unitLabel} {label unit}:
- Oktober 2026: Rp150.000 (jatuh tempo 10 Okt 2026)
Total: Rp150.000

Pembayaran bisa ditransfer ke {bank} {nomor rekening} a.n. {pemilik}, lalu unggah bukti bayar di aplikasi: {origin}/t/{tenantId}

Terima kasih.
Pengurus {nama tenant}
```
Bila rekening tenant belum diisi, baris transfer diganti dengan "Konfirmasi pembayaran di aplikasi: {link}". Nominal per baris = `amount + late_fee`.

## Task
| Task | Isi |
|---|---|
| NOTIF-1.1 ✅ | Helper `client/src/utils/waReminder.js` (normalisasi nomor, susun pesan, buat link `wa.me`) dengan test unit. Tombol di `PaymentMatrix.jsx` dan test. |
| NOTIF-1.2 ✅ | Perbaikan jatuh tempo Kos di Pengaturan Komunitas. Untuk tenant `kos`, field jatuh tempo membaca `billing_due_day ?? due_day` dan menyimpan keduanya, karena tagihan sewa (`auto_generate_kos_billing`, preview) memakai `billing_due_day` lebih dulu. |
