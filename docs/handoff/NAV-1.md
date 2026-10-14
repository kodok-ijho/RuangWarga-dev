# NAV-1: Warga langsung ke dashboard tenant-nya

Status: keputusan user 2026-10-14 sudah ada ("arahkan, jangan blokir"; multi-tenant tetap memilih).

## Requirement
- **Anggota biasa** adalah user yang di semua tenant-nya bukan owner dan tidak punya izin staf (`STAFF_PERMISSIONS` di `client/src/services/tenantAccess.js`), dan bukan platform admin.
- Anggota biasa yang tergabung (approved) di **tepat 1 tenant**: setelah login, saat pertama kali membuka `/`, diarahkan otomatis ke `/t/<tenantId>/dashboard`.
- Pengalihan hanya terjadi **sekali per sesi browser**. Kalau user sengaja kembali ke `/` (mis. lewat "Portal Akun"), halaman daftar tetap bisa dibuka dan tidak terpental-pental.
- User dengan **lebih dari 1 tenant**, owner, staf, atau platform admin: tidak diarahkan. Halaman "Layanan & Tenant Anda" tetap seperti sekarang.
- Anggota biasa **tidak diblokir** membuat tenant, karena warga adalah calon pelanggan:
  - Tombol besar "Daftarkan Tenant Baru" di halaman utama disembunyikan untuk anggota biasa, dan diganti tautan kecil "Punya kos, arisan, atau kelas sendiri? Buka layanan sendiri →" ke `/onboarding/choose-type`.
  - Menu akun di `TenantShell` mendapat item "Buka Layanan Sendiri" ke `/onboarding/choose-type` untuk semua user.
- Tidak ada perubahan database, RLS, atau backend.

## Plan
- Fungsi murni `isRegularMemberOnly({ userTenants, isPlatformAdmin })` dan `getAutoRedirectTenantId(...)` (mengembalikan id tenant bila memenuhi syarat, selain itu `null`).
- `Home.jsx`: efek yang menunggu `loading` tenant selesai, lalu memanggil `navigate(..., { replace: true })` bila ada id dan flag sesi `rw_auto_tenant_redirect_done` belum diset. Flag diset sebelum navigate. Akses `sessionStorage` dibungkus try/catch.
- `TenantShell.jsx`: tambah `DropdownItem` "Buka Layanan Sendiri".

## Task (1 task = agy)
NAV-1.1: implementasi dan test (fungsi murni, efek redirect, tampilan tombol, item menu). QA: `VITE_DEMO_MODE=false npx vitest run`, `npm run build`, `npm run lint`.
