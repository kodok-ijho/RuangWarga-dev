# BRAND-1F — Perbaikan hasil review BRAND-1

Baca `docs/handoff/README.md`, AGENT.md, dan `BRAND-1-review.md` (K1–K5) dulu.
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit; test ikut di commit task-nya. Tanpa migration.
🚫 Jangan sentuh `api/n8n.js`, `supabase/`, `legacy-backend/`, maupun `services/dataService.js`.
Jangan ganti class `.pv-*`, nomor kuitansi `PV/IPL/…`, atau aset di `client/public/brand/`.

---

## BRAND-1F.1 — Logo tenant di workspace & brand di `/account`, `/platform` (K1, K4, K5-Header)

**Helper `isSafeLogoUrl`**
- File baru `client/src/utils/brand.js` berisi fungsi murni `isSafeLogoUrl(url)`.
- `true` hanya bila `url` berupa string dan:
  - diawali `/` tetapi bukan `//`; atau
  - diawali `https://`.
- Selain itu `false`, termasuk `http://`, `data:`, `javascript:`, `//host`, string kosong, dan non-string.

**`components/Header.jsx`**
- Pakai `isSafeLogoUrl(activeTenant?.settings?.logo_url)` sebagai syarat menampilkan logo tenant.
- Rapikan duplikasi: blok judul (nama tenant, versi, badge Demo/View Only, `communityLabel`) cukup ditulis **sekali**; yang bercabang hanya gambarnya (logo tenant atau `BrandLogo` mark).
- Lakukan hal yang sama di menu mobile (±558).
- Perilaku tiga kasus yang sudah dites jangan berubah.

**`components/tenant/TenantShell.jsx` (kotak identitas tenant ±141-146)**
- Bila `isSafeLogoUrl(activeTenant?.settings?.logo_url)`: tampilkan
  `<img src={…} alt={activeTenant.name} className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-cover border border-slate-200 shrink-0" />`.
- Bila tidak: `template.icon` seperti sekarang.
- Nama tenant, badge, dan tombol kembali tidak berubah.

**`components/account/AccountLayout.jsx` (±37-50)**
- Ganti kotak teks "RW" + teks "RuangWarga" dengan `<BrandLogo size="md" />`.
- Subjudul "Platform Akun" tetap.

**`pages/platform/PlatformLayout.jsx` (±103-115, latar gelap `bg-slate-900`)**
- Ganti emoji 🛡️ + teks "RuangWarga" dengan `<BrandLogo variant="dark" size="md" />`.
- Badge "Platform Owner" tetap.

**Test**
- `isSafeLogoUrl`: semua kasus di atas.
- `TenantShell`, gaya `Header.test.jsx` (renderToString + mock hook):
  - `logo_url: '/tenants/palm-village/logo.png'` → ada `<img>` dengan src itu;
  - `logo_url: 'javascript:alert(1)'` dan `'http://evil.test/x.png'` → tidak ada `<img>` tersebut, emoji template tampil.
- `Header`: `logo_url` tidak aman → jatuh ke `BrandLogo` mark + nama tenant.

## BRAND-1F.2 — Kuitansi memakai nama tenant (K2 + bug `currentTenant`)

**`services/mockData.js`**
- Pecah `downloadDigitalReceipt` menjadi dua:
  - fungsi murni `buildDigitalReceiptHtml({ bill, unit, owner, occupant, tenantName })` yang mengembalikan string HTML;
  - `downloadDigitalReceipt(args)` yang memanggil builder lalu membuat Blob seperti sekarang.
- Judul `🌴 PALM VILLAGE` → nama tenant dari `tenantName`, fallback `'RuangWarga'`, tanpa emoji. Subjudul tetap "RuangWarga & Manajemen IPL Digital".
- Tambahkan helper lokal `escapeHtml` (`& < > " '`). Pakai untuk `tenantName`, nama warga (`targetName`), blok/unit, periode, nama skema, dan metode. `formatRupiah` dan nomor kuitansi tidak perlu.

**Pemanggil**
- `pages/PaymentMatrix.jsx` ±2944: kirim `tenantName: activeTenant?.name`. Komponen ini sudah memakai `useTenant()` di ±82.
- `pages/PaymentVerification.jsx`:
  - ±151: ganti `currentTenant` menjadi `activeTenant`, karena `currentTenant` tidak ada di `TenantContext`. Akibatnya sekarang tenant aktif selalu diabaikan. Urutannya menjadi `params.tenantId || activeTenant?.id || userTenants?.[0]?.id || null`.
  - ±920: kirim `tenantName: activeTenant?.name`.
- `PaymentMatrix.jsx` ±1093 (demo) **jangan diubah** di batch ini; sudah dicatat untuk DEBT-1.

**Test** (`buildDigitalReceiptHtml`)
- Dengan `tenantName: 'Griya Asri'` → HTML memuat `Griya Asri` dan tidak memuat `PALM VILLAGE`.
- Tanpa `tenantName` → memuat `RuangWarga`.
- `tenantName: '<img src=x onerror=alert(1)>'` dan nama warga dengan `<script>` → muncul ter-escape (`&lt;img`), tag mentah tidak ada.

## BRAND-1F.3 — Rekening wizard Kelas & nit (K3, K5)

**Rekening wizard Kelas**
- `services/tenantOperationalService.js`: tambah fungsi murni `pickBankAccountForForm(settings)`.
  - Mengembalikan `settings?.bank_account` bila berupa objek;
  - bila tidak, `settings?.bank_info` bila berupa objek;
  - bila tidak, `null`.
- `pages/onboarding/KelasSetupWizard.jsx`: pakai fungsi ini di **dua** tempat (inisialisasi state ±104 dan pemuatan data ±144).
  - Setelahnya, `grep -n "bank_info" client/src/pages/onboarding/KelasSetupWizard.jsx` harus kosong.
- `KelasSetupWizard.test.js`: ganti 3 test di blok "Standardisasi Rekening Bank (BRAND-1.8)" dengan test yang memanggil `pickBankAccountForForm` asli. Kasus:
  - `bank_account` diutamakan walau `bank_info` ada;
  - fallback ke `bank_info`;
  - `null` untuk settings kosong, `undefined`, atau nilai non-objek.

**Nit**
- `tenantOperationalService.js` ±244: hapus `/**` ganda.
- `pages/Login.jsx`: halaman kembali punya satu `<h1>`. Bungkus `BrandLogo` dengan `<h1>` atau tambah `<h1 className="sr-only">Masuk ke RuangWarga</h1>`, tanpa mengubah tampilan.

---

## Definition of Done
- `BRAND-1F-report.md` dengan hash commit yang benar.
- `npx vitest run`, `npm run build`, dan `npm run lint` hijau.
- `grep -rniE "palm ?village" client/src/services/mockData.js | grep -iv "palmvillage\.id\|palmvillage\.local"` → tidak ada sisa di kuitansi; sisa lain di file itu hanya data tenant demo.
- Tidak ada perubahan di `api/`, `supabase/`, `legacy-backend/`, maupun `services/dataService.js`.
