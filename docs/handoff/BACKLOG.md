# Backlog (belum untuk dikerjakan executor)

Urutan rencana: **SEC-1 ✅ → SEC-2 (aktif) → PAY-1 (DOKU) → BRAND-1 → SEC-3 → DEBT-1 → N8N-RETIRE**. Batch baru diterbitkan Claude setelah review batch sebelumnya.

## Keputusan user yang mengikat
- Palm Village **tetap tenant**. Branding-nya (nama, logo, warna, peta) hanya dari data tenant dan hanya tampil di `/t/:tenantId`. Lapisan global (login, beranda, `/account`, `/platform`, `/listing`, PWA) netral "RuangWarga".
- **Payment gateway: DOKU saja.** Mayar & Midtrans dibuang.
- **Dua jenis uang dipisah tegas:**
  - *Tenant bayar ke platform* (langganan + iklan listing) → QRIS lewat akun merchant **DOKU milik platform**. Ini pendapatan platform sendiri.
  - *Warga bayar ke tenant* (iuran/sewa/kontribusi) → **rekening milik tenant sendiri**, metode `bank_transfer`/`cash` + unggah bukti + verifikasi admin tenant. Platform **tidak** menampung dana tenant.
- Konsekuensi: **tidak ada** batch payout/disbursement, tidak ada buku utang per tenant, tidak ada kredensial DOKU per-tenant. Platform tidak pernah memegang uang milik tenant.
- Pengecualian: Palm Village sudah memakai QRIS DOKU lewat n8n dengan merchant platform. Dibiarkan apa adanya (grandfathered) sampai N8N-RETIRE; perlu dikonfirmasi apakah merchant DOKU itu memang milik pihak yang sama dengan kas RT Palm Village.
- Kalau nanti ada tenant yang minta QRIS otomatis: tenant mendaftar merchant DOKU sendiri, kredensial disimpan terenkripsi per tenant. Ditambahkan belakangan, tidak membongkar arsitektur ini.
- Penamaan internal **dibiarkan dulu**: class `.pv-*`, nama workflow n8n "PV API", prefix order `PV-QRIS`. n8n akan dipensiunkan nanti.

## PAY-1 — Migrasi gateway ke DOKU (batch berikutnya)
Lihat `docs/handoff/PAY-1.md` (ditulis bersamaan dengan keputusan ini). Ringkas: modul SNAP DOKU bersama di `supabase/functions/_shared/doku.ts`, tulis ulang 4 Edge Function pembayaran, buang sisa Mayar/Midtrans.

## PAY-2 — Rekening tenant: isi & tampilkan ke warga
**Celah yang ditemukan saat review alur uang:** jalur yang dipilih mengharuskan warga transfer ke rekening tenant, tapi aplikasi belum bisa menyimpan maupun menampilkan rekening itu.
- `settings.bank_account` (bank_name / account_number / account_holder) hanya ada di bentuk data mock `tenantOperationalService.js`; di mode nyata tidak ada UI yang menulisnya.
- `components/payment/PaymentFlowModal.jsx:226` hanya menulis "Transfer ke rekening pengelola/bendahara" tanpa nomor rekening.
- `pages/NonIplIncomes.jsx:505-508` menampilkan rekening Palm Village hardcode.
Perlu: form rekening di pengaturan tenant (permission `manage_settings`), tampilkan rekening tenant aktif di layar bayar warga, hapus hardcode. Tanpa ini tenant baru tidak bisa memungut iuran sama sekali.

## BRAND-1 — Netralkan branding yang terlihat pengguna
- PWA manifest `client/vite.config.js` (`name`, `short_name`, `description`) → RuangWarga.
- Teks hardcode "Palm Village" di: `pages/Login.jsx`, `components/Header.jsx`, `components/QrisCheckoutModal.jsx`, `pages/onboarding/SetupWizard.jsx`, `pages/onboarding/ChooseTenantType.jsx`, `pages/Residents.jsx`, `pages/NonIplIncomes.jsx`, `pages/UserApproval.jsx`, `context/TourContext.jsx`, `context/AuthContext.jsx`, `context/TenantContext.jsx`, `components/payment/PaymentFlowModal.jsx`, `pages/platform/*`.
- Nama/logo/peta tenant diambil dari data tenant; aset Palm Village dipindah dari aset global.
- Favicon/logo global → aset RuangWarga (**butuh file dari user**).
- Data mock (`services/mockData.js`, `services/eventMockData.js`) memakai tenant contoh generik.

## SEC-3 — n8n & webhook DOKU (dikerjakan Claude via MCP, dengan persetujuan user)
- Workflow "PV API - Payments QRIS DOKU Webhook": tambah verifikasi signature DOKU, ganti `getAll payments` dengan filter by reference, hapus ID bill hardcode.
- "PV ADMIN - Cleanup All Transactions" (aktif): nonaktifkan atau lindungi.
- `api/n8n.js`: batasi ke allowlist path.

## DEBT-1 — Utang teknis
- Pecah `client/src/services/tenantOperationalService.js` (±3.3k baris) per domain.
- Pensiunkan `client/src/services/dataService.js` (legacy single-tenant, dipakai 16 file).
- Keluarkan `mockData.js` dari bundle production (dynamic import saat demo).

## N8N-RETIRE — (menunggu keputusan user)
- Pindahkan workflow "PV API" ke Edge Functions / RPC Supabase, lalu matikan proxy `api/n8n.js`.
