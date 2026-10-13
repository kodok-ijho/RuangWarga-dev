# BRAND-1F Review (Claude, 2026-10-10)

Commit yang direview: `cfb1dee..0005cbd` (3 commit task + 1 laporan). Hash di laporan cocok ✅.

| Cek | Hasil |
|---|---|
| `npx vitest run` | **672 test lulus** (41 file) |
| `npm run build` / `npm run lint` | ok / exit 0; manifest `"name":"RuangWarga"` |
| Batasan file | Tidak ada perubahan di `api/`, `supabase/`, `legacy-backend/`, `dataService.js` ✅ |
| 1F.1 K1/K4/K5 | `isSafeLogoUrl` sesuai spesifikasi dan teruji. `TenantShell` menampilkan logo tenant bila aman, kalau tidak emoji template. `Header` tidak lagi menduplikasi blok judul. `/account` memakai `BrandLogo` (dicek visual di mode demo ✅). `/platform` memakai `BrandLogo variant="dark"`. |
| 1F.2 K2 + bug | `buildDigitalReceiptHtml` murni, judul dari nama tenant (fallback RuangWarga), semua field teks di-escape dan teruji dengan payload `<script>`/`<img onerror>`. `PaymentVerification` kini memakai `activeTenant` ✅ |
| 1F.3 K3/K5 | `pickBankAccountForForm` dipakai di 2 tempat; `bank_info` hilang dari wizard; test memanggil fungsi asli; `/**` ganda hilang; `<h1 class="sr-only">` di Login ✅ |
| Grep DoD | Sisa "Palm Village" di `mockData.js` hanya `location_hint` data tenant demo ✅ |

Catatan cek visual: halaman `/t/:tenantId` dan `/platform` tidak bisa dirender penuh di container Claude. Mode demo superadmin tetap memuat data lewat jaringan yang diblokir di sini. Perilakunya tercakup test `TenantShell.test.jsx` dan `Header.test.jsx`.

## Catatan kecil (tidak perlu batch sendiri)
- `isSafeLogoUrl` sengaja masih mengizinkan `https://` ke host mana pun, sesuai spesifikasi. Pelacakan IP lewat logo eksternal masih mungkin. Saat fitur unggah logo dibuat, batasi ke domain Supabase Storage proyek.
- JSDoc yatim "Generator dokumen Kuitansi Digital" di `mockData.js` ±1623. Akan ikut hilang saat kuitansi dipindah di DEBT-1.1.

## Temuan baru di luar lingkup (bug lama, masuk DEBT-1.1)
- **L1 — Tombol "📧 Kirim ke Email" berbohong di produksi (SEDANG).**
  - `PaymentMatrix.jsx` ±2951 tampil untuk semua tenant, tidak dibatasi `IS_DEMO`.
  - Tombol memanggil `sendEmailReceipt` dari `mockData.js`. Fungsi itu hanya `setTimeout` lalu mengembalikan "berhasil dikirim ke email …", dengan alamat palsu `warga.A1@palmvillage.id` bila warga tak punya email.
  - Akibatnya admin mengira kuitansi terkirim padahal tidak ada email yang dikirim. Belum ada backend email.
- **L2 — Kuitansi produksi memakai skema IPL mock (RENDAH).**
  - Nominal fallback dan baris "Skema IPL" diambil dari `getIPLSchemaById` mock.
  - Untuk tenant non-demo isinya selalu "IPL Basic", juga di tenant Kos/Kelas/Arisan.

## Hasil
BRAND-1F **diterima**. Branding selesai. Lanjut **DEBT-1** (`DEBT-1.md`).
