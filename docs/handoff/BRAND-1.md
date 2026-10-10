# BRAND-1 — Branding global RuangWarga, Palm Village jadi brand tenant

**Kerjakan setelah SEC-3F.** Baca `docs/handoff/README.md`, AGENT.md, dan `BACKLOG.md` (keputusan user tentang Palm Village) dulu.
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. Tanpa migration.
🚫 Jangan sentuh `api/n8n.js`, jalur n8n di `dataService.js` (kecuali blok demo di BRAND-1.6), maupun `supabase/functions/*`.
Jangan ganti class `.pv-*`, prefix `PV-QRIS`, nama workflow n8n, atau migration lama.

## Keputusan yang mengikat
- Lapisan global (`/`, login, `/account/*`, `/platform/*`, `/listing/*`, PWA, favicon) = brand **RuangWarga**.
- Palm Village **tetap tenant**: logo, peta, dan namanya hanya tampil di dalam `/t/:tenantId` miliknya, diambil dari data tenant.
- Warna tetap Forest `#1a3d2e` / Gold `#d4af37` (AGENT.md §8.4). Font wordmark = Inter (sudah dipakai aplikasi).

## Aset (sudah disiapkan Claude dari desain user)
`docs/handoff/assets/brand/` — lihat `preview.png`.
- `svg/rw-mark.svg` (latar terang), `svg/rw-mark-on-dark.svg` (latar gelap), `svg/rw-mark-simple*.svg` (versi favicon, tanpa garis putus-putus — terbaca di 16–32 px), `svg/rw-tile*.svg` (ikon aplikasi).
- `png/`: `pwa-512x512.png`, `pwa-192x192.png`, `pwa-maskable-512x512.png`, `pwa-maskable-192x192.png` (simbol di zona aman 80%), `apple-touch-icon-180x180.png`, `favicon-32x32.png`, `favicon-64x64.png`, `logo-horizontal(-on-dark).png`, `rw-mark-1024.png`.
- `source/`: desain asli user (referensi saja, jangan dipakai di aplikasi).
**Jangan** mengedit/menggambar ulang aset; salin apa adanya.

---

## BRAND-1.1 — Pasang aset global
- Salin 7 PNG ikon dari `assets/brand/png/` ke `client/public/` **menimpa** file bernama sama (nama file tidak berubah, jadi `vite.config.js` icons tidak perlu diubah).
- Salin `rw-mark.svg`, `rw-mark-on-dark.svg`, `rw-mark-simple.svg` ke `client/public/brand/`.
- Pindahkan aset Palm Village ke `client/public/tenants/palm-village/`: `logo.png`, `logo.jpeg`, `Mapsite Palm Village.png`, `Mapsite Palm Village.jpeg`, `Site Plan Update 2.pdf`, `Site-Plan-Palm-Village.pdf` (`git mv`). Perbarui path di `pages/Houses.jsx` (±65-66).
- `client/index.html`: hapus `<link rel="icon" ... href="/logo.png">`; tambahkan `<link rel="icon" type="image/svg+xml" href="/brand/rw-mark-simple.svg">` di atas link PNG yang ada.
- `client/vite.config.js` manifest: `name: 'RuangWarga'`, `short_name: 'RuangWarga'`, `description` netral (mis. "Platform pengelolaan RT/RW, kos-kosan, arisan, dan kelas."). Warna tetap. Pastikan aset baru masuk `includeAssets`/precache bila pola file di config memerlukannya.

## BRAND-1.2 — Komponen `BrandLogo`
`client/src/components/BrandLogo.jsx`: simbol (`/brand/rw-mark.svg` atau `rw-mark-on-dark.svg`) + wordmark teks HTML **"Ruang"+"Warga"** (Inter, `font-bold`, `tracking-tight`; "Ruang" `text-forest-800` atau putih di varian gelap, "Warga" `text-gold-500`).
Props: `variant` (`'light' | 'dark'`), `size` (`'sm' | 'md' | 'lg'`), `showWordmark` (default `true`). `alt`/aria label "RuangWarga". Tanpa gambar raster wordmark.
Ganti semua pemakaian `/logo.png` di lapisan global: `components/Footer.jsx` (±11), `pages/Home.jsx` (±53, ±390), `pages/Login.jsx` (±259), dan `components/Header.jsx` (±274, ±517) — untuk Header lihat BRAND-1.3.

## BRAND-1.3 — Logo tenant di dalam `/t/:tenantId`
- `Header.jsx`: bila berada di konteks tenant dan `activeTenant?.settings?.logo_url` ada → tampilkan logo tenant + nama tenant; bila tidak ada → `BrandLogo` mark saja + `activeTenant.name`. Di luar konteks tenant → `BrandLogo` penuh.
- Tenant demo/mock Palm Village (`context/TenantContext.jsx` ±27-40, `services/tenantOperationalService.js` ±93-109): tambahkan `settings.logo_url: '/tenants/palm-village/logo.png'`.
- `pages/Houses.jsx`: fallback slug `'palm-village'` tetap boleh, tapi path ke `/tenants/palm-village/...`.
- Catat di `BRAND-1-report.md`: saat tenant Palm Village dimigrasikan ke DB, `settings.logo_url` perlu diisi (Claude yang mengerjakan di DB).

## BRAND-1.4 — Teks "Palm Village" / "Portal Warga" yang terlihat pengguna
Ganti teks hardcode di file berikut menjadi netral ("RuangWarga", "komunitas", "perumahan") atau `activeTenant?.name` bila di dalam tenant:
`components/QrisCheckoutModal.jsx`, `components/finance/IncomeDetailDrawer.jsx`, `components/payment/PaymentFlowModal.jsx`, `components/Header.jsx` (mis. ±433 judul dokumentasi 17 Agustus → pakai nama tenant), `pages/platform/PlatformRevenue.jsx`, `pages/platform/PlatformTenantList.jsx`, `pages/public/UmkmListingDirectory.jsx` (halaman publik `/listing` — wajib netral, tanpa tenant context), `pages/UserApproval.jsx`, `pages/Settings.jsx`, `pages/Residents.jsx`, `pages/Login.jsx`, `pages/onboarding/SetupWizard.jsx`, `pages/onboarding/ChooseTenantType.jsx`, `context/TourContext.jsx` (±102 "Peta Denah Mapsite Palm Village" → pakai nama tenant / "Peta Denah").
**Jangan diubah:** email akun demo (`admin.viewer@palmvillage.id`, `admin@palmvillage.id`, `warga@palmvillage.id` di `AuthContext.jsx`/`Login.jsx`) — itu kredensial akun demo yang sudah ada; boleh mengganti teks petunjuk di sekitarnya saja. Komentar kode, slug `'palm-village'`, dan path `/tenants/palm-village/` juga boleh tetap.

## BRAND-1.5 — Data contoh generik
Nama tenant contoh yang bukan untuk demo Palm Village di `services/mockData.js`, `services/eventMockData.js`, `pages/platform/*` (data contoh) → nama generik (mis. "Perumahan Griya Asri", "Kos Melati"). Tenant demo Palm Village (BRAND-1.3) tetap bernama Palm Village karena memang tenant. Perbarui test yang bergantung pada string lama.

## BRAND-1.6 — QR demo yang bisa dibayar
`services/dataService.js` fungsi `createNonIplQrisPayment`, **hanya di dalam blok `if (IS_DEMO)`** (±1235-1246): `qr_content` saat ini berupa string QRIS DOKU yang tampak asli (berisi data merchant). Bila dipindai dan dibayar di mode demo, uang bisa masuk ke merchant sungguhan tanpa catatan. Ganti dengan string yang jelas bukan QRIS valid, mis. `DEMO-QRIS-TIDAK-UNTUK-PEMBAYARAN-${Date.now()}`. Cek fungsi demo QRIS lain di file yang sama dengan pola serupa dan perlakukan sama. **Jangan** ubah apa pun di luar blok `IS_DEMO`.

## BRAND-1.7 — Test & verifikasi
- Vitest: `BrandLogo` (varian light/dark, wordmark tampil/tersembunyi); Header di luar tenant → BrandLogo; di tenant dengan `logo_url` → logo tenant; tanpa `logo_url` → mark + nama tenant.
- `grep -rniE "palm ?village|portal warga" client/src client/index.html client/vite.config.js --include=*.jsx --include=*.js --include=*.html | grep -v "\.test\."` → sisa hanya: email demo, komentar, slug/path `palm-village`, data tenant demo Palm Village.
- `grep -rn "/logo.png" client/src client/index.html` → kosong.

---

## Definition of Done
- `BRAND-1-report.md` dengan hash commit yang benar.
- vitest, build, lint hijau; build menghasilkan manifest `name: "RuangWarga"`.
- Tidak ada perubahan di `api/n8n.js`, `supabase/`, dan di `dataService.js` selain blok `IS_DEMO` BRAND-1.6.
