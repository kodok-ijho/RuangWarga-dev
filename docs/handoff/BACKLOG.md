# Backlog (belum untuk dikerjakan executor)

Urutan rencana: **SEC-1 ✅ → SEC-2 (aktif) → PAY-1 (DOKU) → BRAND-1 → SEC-3 → DEBT-1 → N8N-RETIRE**. Batch baru diterbitkan Claude setelah review batch sebelumnya.

## Keputusan user yang mengikat
- Palm Village **tetap tenant**. Branding-nya (nama, logo, warna, peta) hanya dari data tenant dan hanya tampil di `/t/:tenantId`. Lapisan global (login, beranda, `/account`, `/platform`, `/listing`, PWA) netral "RuangWarga".
- **Payment gateway: DOKU saja.** Mayar & Midtrans dibuang. Satu akun merchant DOKU milik platform untuk semua pembayaran (langganan, iklan, dan iuran warga); uang tenant masuk ke rekening platform lalu ditransfer manual ke tenant. Tidak ada kredensial DOKU per-tenant.
- Penamaan internal **dibiarkan dulu**: class `.pv-*`, nama workflow n8n "PV API", prefix order `PV-QRIS`. n8n akan dipensiunkan nanti.

## PAY-1 — Migrasi gateway ke DOKU (batch berikutnya)
Lihat `docs/handoff/PAY-1.md` (ditulis bersamaan dengan keputusan ini). Ringkas: modul SNAP DOKU bersama di `supabase/functions/_shared/doku.ts`, tulis ulang 4 Edge Function pembayaran, buang sisa Mayar/Midtrans.

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
