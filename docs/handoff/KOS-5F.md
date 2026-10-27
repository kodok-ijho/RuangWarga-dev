# KOS-5F — Notifikasi push hanya untuk pemilik dan staf

Status: ✅ **Disetujui user 2026-10-28** ("Ok lakukan itu").

## Alasan
Notifikasi push selalu dikendalikan pemilik HP: browser dan OS mewajibkan izin penerima, dan penerima selalu bisa mematikannya. Karena itu push ke penghuni tidak bisa diandalkan untuk menagih. Saluran ke penghuni yang tetap dipakai:
- pengingat WhatsApp satu ketuk dari nomor pemilik;
- peringatan di portal penyewa.

Push dipakai untuk **pemilik dan staf**, yang perlu diingatkan untuk bertindak.

## Requirement
1. Kartu/tombol "Aktifkan notifikasi" hanya tampil untuk pengguna yang di salah satu tenant kos adalah **owner** atau punya izin `generate_billing`, `manage_billing_cash`, atau `manage_billing_transfer`. Dihapus dari portal penyewa.
2. Push ke penghuni dihentikan. `send-rent-push` tidak lagi mengirim per-pengingat ke penyewa.
3. **Ringkasan pagi** (06:00 WIB) ke owner + pemegang `generate_billing`: "N pengingat sewa perlu dikirim hari ini, total tunggakan Rp X" → `/t/<tenant>/reminders`. Sekali per tenant per hari (tetap memakai `push_daily_summaries`).
4. **Bukti bayar baru:** saat `payments` tenant kos berstatus `pending_verification` (insert baru, atau update dari status lain ke `pending_verification` untuk revisi), kirim push segera ke owner + pemegang `manage_billing_cash` / `manage_billing_transfer`.
   - Isi: "<nama penyewa> (<kamar>) mengunggah bukti bayar <periode> Rp X, perlu diverifikasi".
   - Tujuan: `/t/<tenant>/payment-verification`.
5. Pengirim push tidak pernah mengirim ke pengguna yang bukan owner/staf tenant itu, walaupun ia punya langganan.

## Rancangan
- Migration baru `202610280001_owner_push_events.sql`: fungsi trigger `notify_payment_submitted_push()` `SECURITY DEFINER` + trigger `AFTER INSERT OR UPDATE OF status ON payments`. Hanya tenant `kos`, hanya transisi ke `pending_verification`.
  - Memanggil `net.http_post` ke URL Vault `rent_push_function_url` dengan header `x-cron-secret` dari Vault dan body `{"event":"payment_submitted","payment_id":"…"}`.
  - Kegagalan apa pun (secret belum ada, pg_net error) ditangkap dan **tidak** menggagalkan unggah bukti.
  - REVOKE eksekusi dari klien.
- `send-rent-push`:
  - body kosong / `{"event":"daily_summary"}` → ringkasan pagi;
  - `{"event":"payment_submitted","payment_id"}` → push bukti bayar.
  - Penerima ditentukan di server dari `tenants.owner_id` + `tenant_members` (approved) yang perannya memiliki izin terkait (`tenant_role_permissions`).
  - Bagian kirim-ke-penyewa dihapus. Kolom `rent_reminders.push_sent_at` dibiarkan (tidak dipakai lagi).
- Klien: tampilkan `PushNotificationCard` hanya untuk owner/staf (requirement 1); hapus dari `ResidentIplOverview`.

## Setelah executor (Claude)
- dry-run lalu terapkan migration ke dev;
- deploy ulang `send-rent-push`;
- push ke `main` atas izin user;
- uji di HP user.
