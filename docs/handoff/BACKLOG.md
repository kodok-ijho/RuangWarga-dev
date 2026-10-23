# Backlog (belum untuk dikerjakan executor)

Urutan rencana: **SEC-1 ✅ → SEC-2 ✅ (sudah di dev) → PAY-2 ✅ → PAY-2F ✅ → PAY-1 + PAY-1F ✅ (di dev; deploy menunggu akun DOKU) → SEC-3 ✅ → SEC-3F ✅ → BRAND-1 ✅ → BRAND-1F ✅ → DEBT-1 ✅ → DEBT-1F ✅ → SEC-4 ✅ (di dev) → fase B: AUDIT-RTRW ✅ → SEC-5 ✅ (di dev) → RTRW-1 ✅ → RTRW-1F ✅ → STOR-1 ✅ (R2, di dev) → JOIN-1F/GATE-1F/NAV-1/UI-1F ✅ → RTRW-2 ✅ → RTRW-3 ✅ → AUDIT-VERTIKAL ✅ (`AUDIT-VERTIKAL.md`) → VERT-1 ✅ (`VERT-1-review.md`) → VERT-2 ✅ (terpasang di dev, `VERT-2-review.md`) → KOS-1 ✅ (`KOS-1-review.md`, 1.4a terpasang di dev) → KOS-1F ✅ (`KOS-1F-review.md`, 1F.6a terpasang di dev) → PANITIA-1 ✅ (`PANITIA-1-review.md`, migration terpasang di dev) → PANITIA-1F ✅ (`PANITIA-1F-review.md`) → PANITIA-2 ✅ (`PANITIA-2-review.md`, terpasang di dev) → PANITIA-3 ✅ (`PANITIA-3-review.md`, terpasang di dev + Edge Function storage di-deploy) → PANITIA-HARGA ✅ (`PANITIA-HARGA-review.md`, terpasang di dev) → ARISAN-1 ✅ (`ARISAN-1-review.md`, terpasang di dev) → PANITIA-ARISAN-1F ✅ (`PANITIA-ARISAN-1F-review.md`) → PANITIA-ARISAN-2F (perapian kecil, sedang dikerjakan) → PAY-3 / PANITIA-BAYAR (DOKU platform; menunggu secret DOKU dan persetujuan user) → dashboard Platform**. Batch baru diterbitkan Claude setelah review batch sebelumnya.

## Keputusan user yang mengikat
- Palm Village **tetap tenant**. Branding-nya (nama, logo, warna, peta) hanya dari data tenant dan hanya tampil di `/t/:tenantId`. Lapisan global (login, beranda, `/account`, `/platform`, `/listing`, PWA) netral "RuangWarga".
- **Payment gateway: DOKU saja.** Mayar & Midtrans dibuang.
- **Dua jenis uang dipisah tegas:**
  - *Tenant bayar ke platform* (langganan + iklan listing) → QRIS lewat **merchant DOKU BARU milik platform**, terpisah dari merchant DOKU mana pun yang dipakai tenant.
  - *Warga bayar ke tenant* (iuran/sewa/kontribusi) → **rekening milik tenant sendiri**, metode `bank_transfer`/`cash` + unggah bukti + verifikasi admin tenant. Platform **tidak** menampung dana tenant.
- Konsekuensi: **tidak ada** batch payout/disbursement, tidak ada buku utang per tenant, tidak ada kredensial DOKU per-tenant. Platform tidak pernah memegang uang milik tenant.
- **DUA MERCHANT DOKU YANG BERBEDA — jangan tertukar:**
  - Merchant DOKU yang sekarang ada di env n8n (`DOKU_CLIENT_ID`, `DOKU_PRIVATE_KEY`, dst.) adalah **milik Palm Village**, untuk iuran warganya. Settle ke rekening Palm Village. Dibiarkan apa adanya. **Jangan pernah dipakai untuk pendapatan platform.**
  - Merchant DOKU **baru milik platform**, khusus langganan SaaS + iklan listing. Kredensialnya disimpan di Supabase Edge Function secrets dengan awalan `DOKU_PLATFORM_*` supaya mustahil tertukar dengan punya Palm Village.
  - Jadi Palm Village adalah contoh pertama pola "tenant pakai merchant DOKU sendiri".
- Kalau nanti ada tenant yang minta QRIS otomatis: tenant mendaftar merchant DOKU sendiri, kredensial disimpan terenkripsi per tenant. Ditambahkan belakangan, tidak membongkar arsitektur ini.
- 🚫 **n8n DILARANG DISENTUH — ini aturan keras.** Instance n8n (`n8n-icyxwmjq.runner.web.id`) dan seluruh workflow di dalamnya masih dipakai **Portal Warga yang sudah LIVE di repo lain**. Mengubah workflow, menonaktifkan, mengganti kredensial, atau mengubah path webhook di sana bisa mematikan aplikasi produksi milik orang lain.
  - Tidak boleh: mengubah/menghapus/menonaktifkan workflow, mengubah kredensial atau env n8n, mengubah path webhook.
  - Boleh: **membaca saja** (lihat definisi workflow sebagai referensi, mis. untuk mencontek protokol SNAP DOKU).
  - Berlaku untuk Claude maupun Antigravity. Tidak ada batch n8n di roadmap ini.
- **Tidak ada rencana memensiunkan n8n** di repo ini. RuangWarga membangun jalur barunya sendiri (Supabase Edge Functions) **berdampingan** dengan n8n, tanpa mengganggunya.
- **Arah backend RuangWarga: Supabase saja** (user, 2026-10-11). Semua jalur baru dan hasil migrasi memakai Supabase (RLS, RPC, Edge Functions); pemanggilan n8n baru dianggap regresi. n8n tetap hidup untuk Portal Warga dan tidak disentuh.
- **File (bukti bayar, nota) disimpan di Cloudflare R2** bucket privat, akses lewat Edge Function `storage-upload` / `storage-sign-url` (STOR-1, user 2026-10-12). Opsi Google Drive dengan link publik ditolak.
- **Warga tidak diblokir membuat tenant**; anggota biasa diarahkan ke dashboard tenant-nya (NAV-1, user 2026-10-14).
- **Kelas diganti Kepanitiaan & Acara** (user, 2026-10-21): satu tenant = organisasi dengan banyak acara; pengeluaran langsung dicatat bendahara; pemasukan dicatat manual plus iuran panitia ditagih; harga per acara aktif. Lihat `PANITIA-requirement.md`.
- **Harga Kepanitiaan** (user, 2026-10-22): acara pertama gratis 1 bulan, lalu Rp25.000 per acara per 12 bulan; acara ke-2 dst langsung bayar; lewat masa = baca-saja (bisa diperpanjang); tenant Kepanitiaan tanpa uji coba tenant; pembayaran menunggu DOKU platform. Lihat `PANITIA-HARGA.md`.
- **Kocok arisan** (user, 2026-10-22): peserta yang setoran putarannya belum lunas tidak ikut kocok; hasil kocok final dan tercatat permanen.
- **Peserta arisan** = anggota `approved` yang memegang slot (`tenant_members.unit_id`); ketua/owner tanpa slot tidak otomatis ikut (user, 2026-10-21, VERT-2.2).
- Penamaan internal **dibiarkan**: class `.pv-*`, nama workflow n8n "PV API", prefix order `PV-QRIS`.

## PAY-2 — Rekening tenant: isi & tampilkan ke warga  ← berikutnya setelah SEC-2
Dokumen task lengkap: `docs/handoff/PAY-2.md`. Tanpa ini tenant baru tidak bisa memungut iuran sama sekali, karena warganya tidak tahu harus transfer ke mana.

## PAY-1 — Langganan & iklan lewat DOKU platform
Dokumen task lengkap: `docs/handoff/PAY-1.md`. Ringkas: modul SNAP DOKU bersama di `supabase/functions/_shared/doku.ts`, tulis ulang 4 Edge Function langganan/iklan pakai merchant `DOKU_PLATFORM_*`, buang sisa Mayar/Midtrans. Termasuk PAY-1.7: **iklan wajib bayar dulu** (listing baru `pending_payment`, baru tayang setelah lunas) + pulihkan policy SELECT `public_listings` yang hilang di dev (F9).

## Catatan operasional (Claude)
- ⏸️ **Merchant DOKU platform masih dalam pengajuan** (user, 2026-10-10). Sampai akun & kredensial `DOKU_PLATFORM_*` ada: Edge Function pembayaran **tidak di-deploy**, tidak ada uji sandbox. Pekerjaan kode (PAY-1F) tetap jalan; batch lain (SEC-3, BRAND-1, DEBT-1) boleh dikerjakan sambil menunggu.
- Saat tenant Palm Village dimigrasikan ke DB (`migrate_legacy_portal_warga`), pasang `settings.legacy_qris_enabled = true` — lihat `PAY-2F-review.md`. Tanpa flag ini QRIS warga Palm Village tidak tampil.
- Di migrasi yang sama, isi `settings.logo_url = '/tenants/palm-village/logo.png'` (BRAND-1). Tanpa ini workspace Palm Village memakai ikon generik.

## SEC-3 — Rahasiakan `invite_code` + audit rekening
- F12 (review PAY-2): pindahkan `invite_code` dari `tenants.settings` ke tabel terpisah yang hanya terbaca owner / `manage_members` / platform admin. Halaman join tetap memakai RPC `get_invite_details`. Butuh migration + penyesuaian alur join.
- Catat setiap perubahan `settings.bank_account` (siapa, kapan, nilai lama/baru) dan tampilkan ke owner tenant.

## BRAND-1 — Branding global RuangWarga
Selesai — `BRAND-1.md` + `BRAND-1F.md`, review `BRAND-1-review.md` dan `BRAND-1F-review.md`. Sisa: saat fitur unggah logo tenant dibuat, batasi `settings.logo_url` ke domain Supabase Storage proyek.

## DEBT-1 — Utang teknis
Selesai — `DEBT-1.md` + `DEBT-1F.md`, review `DEBT-1-review.md` dan `DEBT-1F-review.md`.
- `client/src/services/dataService.js` (legacy single-tenant): **jangan dipensiunkan.** File ini memanggil endpoint n8n lewat `api/n8n.js` untuk alur Palm Village. Paling jauh: rapikan tanpa mengubah perilaku, dan jangan putus jalur n8n-nya.
- Domain placeholder `@warga.palmvillage.local` **dibiarkan**. Tidak tampil ke pengguna dan juga dibuat oleh workflow n8n live `pv-api-residents-create`.

## SEC-4 — Proteksi role bawaan di database (N3, review DEBT-1) — ✅ selesai, terpasang di dev (`SEC-4-review.md`)
- Saat ini hanya DELETE `tenant_roles` yang menolak role Admin (`is_owner_role`) dan role dasar (`is_base_role`).
- UPDATE `tenant_roles` dan semua operasi `tenant_role_permissions` tidak menjaganya. Penjagaan itu hanya ada di kode klien `rbac.js`.
- Akibatnya pemegang `manage_tenant_users` bisa, lewat API langsung, mengubah nama atau izin role Admin, atau memberi izin ke role "Warga/Anggota" (semua warga).
- Rencana:
  - migration policy/trigger yang menolak perubahan role `is_owner_role` / `is_base_role` dan izinnya, kecuali `is_platform_admin()`;
  - test SQL matrix.
- Claude memverifikasi apakah role dasar memang tidak boleh diubah izinnya oleh owner tenant. Bila ada keraguan produk → `questions.md`.

## Fase B — Vertikal RT/RW (dari `AUDIT-RTRW.md`)
- **SEC-5** ✅ (aktif di dev, `SEC-5-review.md`): join lewat RPC berkode undangan, penjaga kolom `tenant_members`/`tenants`, integritas pembayaran + sinkron status tagihan, bucket privat `payment-proofs`, unique index tagihan IPL.
- **RTRW-1** ✅ (`RTRW-1-review.md`; perbaikan T1–T3 di `RTRW-1F.md` ✅, `RTRW-1F-report.md`): workspace `/t/` memakai izin tenant (bukan `role` n8n); PaymentMatrix/Verifikasi/Laporan/Pengeluaran sepenuhnya Supabase; hapus `CLEANUP_ALL` & tulis n8n dari konteks tenant; Acara & Pengumuman disembunyikan. Keputusan user sudah ada (`questions.md` [AUDIT-RTRW]).
- **RTRW-2**: kelola warga & unit di Supabase, navigasi tetap di `/t/:tenantId`, SetupWizard tidak menimpa settings/unit.
- **RTRW-3**: tabel & halaman Pengumuman + Acara multi-tenant.
- Catatan migrasi Palm Village (nanti): tautkan `tenant_members.user_id` hasil migrasi ke `auth.users` (via email), dedupe pembayaran lama sebelum index `uq_payments_open_per_bill`, isi `logo_url` + `legacy_qris_enabled`.
- Fase dashboard Platform: `PlatformPricingConfig.jsx` ±65 memakai kolom `block_pricing.duration_months` yang tidak ada.

## Risiko yang DIKETAHUI tapi SENGAJA TIDAK DIKERJAKAN
Ditemukan saat review SEC-1, dicatat supaya tidak hilang. Semua menyangkut n8n yang
dilarang disentuh, jadi **bukan pekerjaan di repo ini**. Keputusan penanganannya ada
di pemilik Portal Warga live (repo lain), bukan di batch RuangWarga.
- Workflow `PV API - Payments QRIS DOKU Webhook` (aktif, kredensial service role): `authentication: none`, tanpa verifikasi signature DOKU. Siapa pun yang tahu URL-nya bisa mengirim notifikasi palsu dan menandai pembayaran `completed`. Juga mengambil SELURUH baris tabel `payments` tiap request, dan memuat beberapa ID tagihan hardcode.
- Workflow `PV ADMIN - Cleanup All Transactions` aktif.
- `api/n8n.js` di repo ini meneruskan request apa pun ke n8n memakai basic auth server, tanpa allowlist path. **Jangan diubah tanpa persetujuan eksplisit user**, karena bisa memutus alur Palm Village.

## Setelah STOR-1 (dari `STOR-1-report.md`)
- **EDGE-AUTH-1** ✅ (dicek 2026-10-23: semua fungsi sudah memakai `getUser(token)`) — catatan asli: `create-subscription-payment`, `create-listing-payment`, `check-listing-expirations`, `auto-generate-kos-bills` memanggil `auth.getUser()` tanpa token, sehingga selalu 401 bila di-deploy. Ubah ke `getUser(token)` seperti STOR-1F, sebelum fungsi-fungsi itu di-deploy.
- **AUDIT-VERIFY-1** (perlu persetujuan user, schema + pembayaran): isi `payments.verified_by = auth.uid()` di database saat status menjadi `completed`. Nama di `metadata.verified_by_name` berasal dari browser.
- **STOR-2**: hapus bucket Supabase lama `payment-proofs` / `expense-receipts` (kosong) beserta policy-nya. Uji manual penolakan file (di atas 5 MB / tipe palsu) dan nota pengeluaran ke R2.
- **Region Supabase**: project dev ada di Seoul (`ap-northeast-2`). Pertimbangkan project baru di Singapore sebelum ada tenant sungguhan.
- **Ide vertikal** (Kos, Kelas, Arisan, lintas vertikal, pendalaman RT/RW): `VERTIKAL-requirement.md`. Kelas digantikan Kepanitiaan (`PANITIA-requirement.md`).
- **KELAS-CLEANUP**: hapus kode Kelas yang tidak terpakai (wizard, cabang SPP, harga) setelah dipastikan tidak ada tenant Kelas di produksi.
- **NOTIF-1** (setelah RTRW-2, user 2026-10-18): tombol "Ingatkan via WA" (`wa.me`, gratis) untuk tagihan yang belum dibayar. WA otomatis lewat API berbayar **diurungkan** (biaya naik terus). Email otomatis menyusul (Edge Function + penyedia email).
- **LIST-1** (perlu persetujuan user; menyentuh aktivasi iklan setelah pembayaran DOKU dan status listing):
  - menu "Pasang Iklan" dan "Iklan Saya" untuk semua anggota;
  - **toggle moderasi iklan** per tenant. Mati: iklan warga langsung tayang setelah dibayar dan pengurus mendapat notifikasi di aplikasi. Nyala: iklan menunggu persetujuan pengurus (pemegang `post_listing`/owner) sebelum tayang.

- **BILL-AUTO-1** (disetujui user 2026-10-18, setelah RTRW-2.6): terbitkan tagihan otomatis harian lewat pg_cron. RT/RW: semua rumah aktif; Kos: kamar terisi. Tanggal terbit terpisah dari jatuh tempo. Lihat `BILL-AUTO-1.md`.
