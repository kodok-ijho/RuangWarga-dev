# KOS-5 — "Tagih tanpa capek": pengingat, tunggakan, denda, notifikasi push

Status: ✅ **Disetujui user 2026-10-27** ("Mulai laksanakan"). Keputusan desain sudah disepakati 2026-10-27:
- kanal pengingat **A** (WhatsApp satu ketuk + peringatan di portal) dan **B** (push PWA);
- model denda 1–4 + aturan pendukung.

Bagian dari tahap 1 audit (`AUDIT-KOS-SAAS.md`). Urutan berikutnya: C kwitansi (KOS-6), lalu periode bayar 1/3/6/12 bulan (KOS-7).
Menyentuh tagihan, schema, Edge Function, dan secret. Pembayaran sewa tetap manual (bukan QRIS). n8n tidak disentuh.

## Requirement
### Denda keterlambatan
1. Aturan Kontrak Sewa (Pengaturan kos) mendapat **aturan denda** default `settings.late_fee_rule`:
   - `{ "type": "none" }` (default);
   - `{ "type": "once", "amount": 50000 }`;
   - `{ "type": "daily", "amount": 10000, "max": 200000 }` (`max` wajib > 0);
   - `{ "type": "percent", "percent": 5 }` (0 < persen ≤ 100, dihitung sekali dari nominal sewa tagihan tanpa add-on, dibulatkan ke bawah ke rupiah).

   Semuanya punya `grace_days` 0–7: masa toleransi setelah jatuh tempo.
2. Aturan **disalin ke kontrak** saat dibuat (`kos_contracts.late_fee_rule`), bisa diubah di form kontrak sebelum disimpan. Kontrak lama: `none`. Mengubah Pengaturan tidak mengubah kontrak berjalan.
3. Setiap malam, untuk tagihan kontrak berstatus `unpaid` yang sudah lewat `due_date + grace_days` (WIB):
   - `once` / `percent`: `late_fee` = nilai denda (sekali);
   - `daily`: `late_fee = LEAST(amount × hari_terlambat_setelah_toleransi, max)`.
   - Tagihan `pending_verification`, `paid`, `cancelled` **tidak** dihitung ulang, sehingga denda berhenti bertambah begitu bukti bayar diunggah. Bila bukti ditolak dan tagihan kembali `unpaid`, perhitungan berlanjut dari tanggal sebenarnya.
   - Idempoten: menjalankan dua kali di hari yang sama tidak mengubah hasil.
4. **Hapus denda** per tagihan oleh owner / `generate_billing` lewat RPC: `late_fee = 0`, `metadata.late_fee_waived = true`, penghapus, waktu, alasan. Tagihan yang dihapus dendanya tidak dihitung lagi.
5. Total yang harus dibayar = `amount + late_fee` di semua tampilan (matriks, detail, portal penyewa, pesan WA).

### Pengingat & tunggakan
6. Setiap malam sistem membuat **antrean pengingat** untuk tagihan kontrak yang belum lunas (`unpaid`) pada tahap: **H-3**, **H0** (hari jatuh tempo), **H+3**, **H+7**. Satu baris per tagihan per tahap (unik); dilewati bila tagihan sudah tidak `unpaid`.
7. **Halaman "Pengingat Hari Ini"** (owner / izin tagihan):
   - daftar pengingat `pending` hari ini;
   - ketuk satu baris → buka WA ke nomor penyewa dengan pesan siap kirim (nama, kamar, periode, total termasuk denda, jatuh tempo, rekening dari pengaturan) → tandai `sent` (siapa, kapan);
   - bisa juga "Lewati";
   - penyewa tanpa nomor ditandai jelas.
8. **Halaman "Tunggakan"**: per penyewa, total tunggakan (sewa + denda), jumlah tagihan, tagihan tertua, kelompok umur **0–7 / 8–30 / >30 hari**; ringkasan total per kelompok. Tautan ke detail tagihan dan tombol WA.
9. **Portal penyewa**: banner pada tagihan miliknya, misalnya "Tagihan Oktober jatuh tempo 3 hari lagi", "Jatuh tempo hari ini", atau "Terlambat 5 hari, denda Rp50.000".

### Notifikasi push (PWA)
10. Penyewa (dan pemilik) bisa **mengaktifkan notifikasi** di perangkatnya (tombol opt-in; izin browser). Langganan disimpan per pengguna per perangkat; bisa dimatikan.
11. Setelah antrean pengingat dibuat, sistem mengirim push ke penyewa terkait untuk tahap yang sama (H-3/H0/H+3/H+7), sekali per tagihan per tahap. Pemilik menerima satu ringkasan harian: "5 pengingat perlu dikirim, total tunggakan Rp X".
12. Langganan yang ditolak layanan push (410/404) dihapus otomatis. Gagal push tidak mengganggu penagihan.

## Rancangan teknis
- **Tabel baru:**
  - `rent_reminders`: `tenant_id`, `bill_id`, `member_id`, `stage`, `remind_date`, `status` `pending/sent/skipped`, `sent_by`, `sent_at`, `push_sent_at`, unik `(bill_id, stage)`; RLS baca owner/izin tagihan + penyewa untuk miliknya; tulis hanya lewat RPC.
  - `push_subscriptions`: `user_id`, `endpoint` unik, `p256dh`, `auth`, `user_agent`, `created_at`, `last_success_at`; RLS hanya pemilik baris.
- **Fungsi harian** `run_kos_collections(p_today date)` (SECURITY DEFINER, hanya `service_role`/postgres), dipanggil di akhir `run_auto_billing` (cron yang sudah ada `ruangwarga-auto-billing`, 00:05 WIB): hitung denda → buat antrean pengingat.
- **RPC:**
  - `waive_late_fee(bill_id, reason)`;
  - `mark_rent_reminder(reminder_id, status)`;
  - `get_kos_arrears(tenant_id)`;
  - `save_push_subscription(...)` / `delete_push_subscription(endpoint)`.
- **Push:** Edge Function baru `send-rent-push` (Deno, Web Push VAPID). Dipanggil setiap pagi oleh pg_cron + `pg_net` (06:00 WIB) dengan service role.
  - Membaca `rent_reminders` hari ini yang `push_sent_at IS NULL`, mengirim, lalu mengisi `push_sent_at`.
  - Secret `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` disimpan sebagai secret Edge Function (bukan repo).
  - Public key juga di env klien `VITE_VAPID_PUBLIC_KEY` (Vercel).
- **Service worker:** handler `push` dan `notificationclick` ditambahkan lewat `importScripts` pada konfigurasi `VitePWA` (generateSW tetap).
- `protect_billing_columns` (SEC-2) tetap: `late_fee` hanya berubah lewat fungsi privileged.

## Task (urut)
| Task | Isi | Executor |
|---|---|---|
| 5.1 | Migration + test SQL: `late_fee_rule` di kontrak dan `create_kos_contract` (salin dari settings bila parameter tidak dikirim), `run_kos_collections` (denda + antrean), `waive_late_fee`, `mark_rent_reminder`, `get_kos_arrears`, panggilan dari `run_auto_billing` | agy |
| 5.2 | Frontend: aturan denda di Aturan Kontrak Sewa dan form kontrak; total = sewa + denda di semua tampilan; hapus denda; halaman Pengingat Hari Ini (WA satu ketuk); halaman Tunggakan; banner portal penyewa; menu | agy |
| 5.3 | Push: tabel + RPC langganan; tombol aktifkan notifikasi; handler service worker; Edge Function `send-rent-push`; jadwal pg_cron + pg_net | agy |
| 5.4 | Claude: dry-run dan terapkan migration ke dev; buat kunci VAPID (tidak masuk repo), set secret Edge Function dan env Vercel dev; deploy `send-rent-push`; uji kirim ke perangkat user | Claude, dengan izin user pada langkah secret/deploy |

## Kriteria selesai
- Test SQL lolos di dry-run dev bersama semua test kos dan listing yang ada.
- Vitest lolos di `TZ=UTC` dan `TZ=Asia/Jakarta`; lint dan build bersih.
- Uji manual di dev:
  - tagihan lewat jatuh tempo mendapat denda sesuai aturan;
  - pengingat muncul dan terbuka di WA;
  - push diterima di HP user.

## Progres (Claude, 2026-10-27)
- 5.1 `1352327` + perbaikan test `7b25edb`; 5.2a `cf3f79c`, `99b7093`; 5.2b `1d71d33`; 5.3a `9dc7557`; 5.3b `62a21f6`.
- Dry-run dev: kedua migration + `kos_collections.sql` + `push_notifications.sql` + semua test kos/listing → `DRYRUN_OK`.
- Vitest 107 file 1466/1466 (`TZ=UTC` dan `TZ=Asia/Jakarta`), lint dan build bersih; `dist/sw.js` memuat `importScripts("push-sw.js")`.
- Terpasang di dev: `20261027163431 kos_collections`, `20261027163435 push_notifications`; jadwal `ruangwarga-rent-push` 23:00 UTC (06:00 WIB). Uji `run_kos_collections` hari ini: 0 denda, 0 pengingat (belum ada tagihan pada tahapnya).
- 2026-10-28, disetujui user:
  - kunci VAPID dibuat di server;
  - secret Edge Function `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RENT_PUSH_CRON_SECRET` disetel;
  - secret Vault `rent_push_cron_secret` dan `rent_push_function_url` dibuat;
  - `send-rent-push` di-deploy (`--no-verify-jwt`).
- Uji:
  - tanpa secret → 401;
  - lewat jalur cron (pg_net + Vault) → 200 `{sent:0, failed:0, removed:0, summaries:1}`. Belum ada langganan perangkat. Pengingat H-3 Toro (jatuh tempo 31 Okt) sudah terbentuk otomatis malam itu.
- Sisa:
  - user menyetel `VITE_VAPID_PUBLIC_KEY` di Vercel dev;
  - push ke `main`;
  - uji langganan di HP user.
