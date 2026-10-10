# Backlog (belum untuk dikerjakan executor)

Urutan rencana: **SEC-1 ✅ → SEC-2 ✅ (sudah di dev) → PAY-2 ✅ → PAY-2F ✅ → PAY-1 (review: perlu perbaikan) → PAY-1F (aktif) → SEC-3 → BRAND-1 → DEBT-1**. Batch baru diterbitkan Claude setelah review batch sebelumnya.

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
- Penamaan internal **dibiarkan**: class `.pv-*`, nama workflow n8n "PV API", prefix order `PV-QRIS`.

## PAY-2 — Rekening tenant: isi & tampilkan ke warga  ← berikutnya setelah SEC-2
Dokumen task lengkap: `docs/handoff/PAY-2.md`. Tanpa ini tenant baru tidak bisa memungut iuran sama sekali, karena warganya tidak tahu harus transfer ke mana.

## PAY-1 — Langganan & iklan lewat DOKU platform
Dokumen task lengkap: `docs/handoff/PAY-1.md`. Ringkas: modul SNAP DOKU bersama di `supabase/functions/_shared/doku.ts`, tulis ulang 4 Edge Function langganan/iklan pakai merchant `DOKU_PLATFORM_*`, buang sisa Mayar/Midtrans. Termasuk PAY-1.7: **iklan wajib bayar dulu** (listing baru `pending_payment`, baru tayang setelah lunas) + pulihkan policy SELECT `public_listings` yang hilang di dev (F9).

## Catatan operasional (Claude)
- ⏸️ **Merchant DOKU platform masih dalam pengajuan** (user, 2026-10-10). Sampai akun & kredensial `DOKU_PLATFORM_*` ada: Edge Function pembayaran **tidak di-deploy**, tidak ada uji sandbox. Pekerjaan kode (PAY-1F) tetap jalan; batch lain (SEC-3, BRAND-1, DEBT-1) boleh dikerjakan sambil menunggu.
- Saat tenant Palm Village dimigrasikan ke DB (`migrate_legacy_portal_warga`), pasang `settings.legacy_qris_enabled = true` — lihat `PAY-2F-review.md`. Tanpa flag ini QRIS warga Palm Village tidak tampil.

## SEC-3 — Rahasiakan `invite_code` + audit rekening
- F12 (review PAY-2): pindahkan `invite_code` dari `tenants.settings` ke tabel terpisah yang hanya terbaca owner / `manage_members` / platform admin. Halaman join tetap memakai RPC `get_invite_details`. Butuh migration + penyesuaian alur join.
- Catat setiap perubahan `settings.bank_account` (siapa, kapan, nilai lama/baru) dan tampilkan ke owner tenant.

## BRAND-1 — Netralkan branding yang terlihat pengguna
- PWA manifest `client/vite.config.js` (`name`, `short_name`, `description`) → RuangWarga.
- Teks hardcode "Palm Village" di: `pages/Login.jsx`, `components/Header.jsx`, `components/QrisCheckoutModal.jsx`, `pages/onboarding/SetupWizard.jsx`, `pages/onboarding/ChooseTenantType.jsx`, `pages/Residents.jsx`, `pages/NonIplIncomes.jsx`, `pages/UserApproval.jsx`, `context/TourContext.jsx`, `context/AuthContext.jsx`, `context/TenantContext.jsx`, `components/payment/PaymentFlowModal.jsx`, `pages/platform/*`.
- Nama/logo/peta tenant diambil dari data tenant; aset Palm Village dipindah dari aset global.
- Favicon/logo global → aset RuangWarga (**butuh file dari user**).
- Data mock (`services/mockData.js`, `services/eventMockData.js`) memakai tenant contoh generik.

## DEBT-1 — Utang teknis
- Pecah `client/src/services/tenantOperationalService.js` (±3.3k baris) per domain.
- `client/src/services/dataService.js` (legacy single-tenant, dipakai 16 file): **jangan dipensiunkan dulu.** File ini memanggil endpoint n8n lewat `api/n8n.js` untuk alur Palm Village. Paling jauh: rapikan tanpa mengubah perilaku, dan jangan putus jalur n8n-nya.
- Keluarkan `mockData.js` dari bundle production (dynamic import saat demo).

## Risiko yang DIKETAHUI tapi SENGAJA TIDAK DIKERJAKAN
Ditemukan saat review SEC-1, dicatat supaya tidak hilang. Semua menyangkut n8n yang
dilarang disentuh, jadi **bukan pekerjaan di repo ini**. Keputusan penanganannya ada
di pemilik Portal Warga live (repo lain), bukan di batch RuangWarga.
- Workflow `PV API - Payments QRIS DOKU Webhook` (aktif, kredensial service role): `authentication: none`, tanpa verifikasi signature DOKU. Siapa pun yang tahu URL-nya bisa mengirim notifikasi palsu dan menandai pembayaran `completed`. Juga mengambil SELURUH baris tabel `payments` tiap request, dan memuat beberapa ID tagihan hardcode.
- Workflow `PV ADMIN - Cleanup All Transactions` aktif.
- `api/n8n.js` di repo ini meneruskan request apa pun ke n8n memakai basic auth server, tanpa allowlist path. **Jangan diubah tanpa persetujuan eksplisit user**, karena bisa memutus alur Palm Village.
