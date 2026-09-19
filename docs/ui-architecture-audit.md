# UI/UX Architecture Audit — RuangWarga Multi-Tenant SaaS
> Dokumen resmi hasil audit Phase 0 (TASK-001 – TASK-005).
> Tanggal Audit: 19 September 2026
> Acuan: `specification.md` (Platform UI/UX Specification) & `requirement.md` (UI/UX Requirements)

---

## 1. TASK-001: Pemetaan Lapisan Aplikasi (Application Layers)

Berdasarkan `specification.md` §19 dan `requirement.md` §1, hierarki produk adalah:
```text
User → Account → Tenant → Workspace
```

Struktur 4 lapisan aplikasi yang teridentifikasi dalam repository:

| Lapisan | Rute | Karakteristik Visual & Konteks | Status Saat Ini |
|---|---|---|---|
| **Global / Account** | `/account/*` (`/account/tenants`, `/account/add-tenant`, `/account/subscription`, `/account/choose-plan`) | **Wajib netral tenant**. Menggunakan nama global "RuangWarga" dan konsep generik ("Komunitas Saya", "Kelola Layanan"). Tidak boleh mengadopsi warna/logo tenant. | **Sebagian bocor**: Belum ada `AccountLayout` khusus; `MyTenants.jsx` masih memakai warna `forest-800` & `gold-400` dari Palm Village. |
| **Tenant Workspace** | `/t/:tenantId/*` (`dashboard`, `members`, `billing`, `expenses`, `reports`, `settings`) | **Konteks tenant aktif**. Tenant branding (nama, logo, warna aksen, istilah spesifik seperti Warga/Penyewa/Siswa) diizinkan dan terisolasi di sini. | **Belum seragam**: Sebagian rute dirender tanpa shell bersama (`TenantShell`), navigasi terpecah antara desktop header dan mobile bottom nav hardcoded. |
| **Platform Owner** | `/platform/*` (`tenants`, `pricing`, `revenue`) | **Khusus super-admin platform**. Bersih, data-dense, netral, visual internal SaaS. | **Sudah memiliki shell**: Memakai `PlatformLayout.jsx` dengan guard `is_platform_admin()`. |
| **Public / Directory** | `/listing/*` (`/listing/kos`, `/listing/umkm`), `/join/:inviteCode` | **Terbuka publik tanpa login**. Netral platform RuangWarga. | **Sudah netral**: Berjalan tanpa dependensi ke context tenant privat. |

---

## 2. TASK-002: Identifikasi Kebocoran Tenant (Tenant Leakage Audit)

Audit mendalam terhadap kode frontend menemukan kebocoran identitas Palm Village pada level global/komponen generik:

1. **Hardcoded Logo & Nama Palm Village**:
   - `client/src/components/Header.jsx`: Logo default menggunakan `/logo.png` (Palm Village logo) dan ada teks fallback di beberapa drawer.
   - `client/src/components/QrisCheckoutModal.jsx`: Subtitle default hardcoded `'PORTAL WARGA PALM VILLAGE'` dan QR string payload mengandung `'PAGUYUBAN PALM VILLAGE'`.
   - `client/src/pages/Houses.jsx`: Teks judul, download, dan modal hardcoded `'Mapsite Palm Village'`.
   - `client/src/pages/NonIplIncomes.jsx`: Opsi transfer bank `'Bank BCA: 123-456-7890 (a/n Paguyuban Palm Village)'` dan QRIS hardcoded `'📱 QRIS Palm Village'`.

2. **Warna Palm Village Dipakai Sebagai Global Brand**:
   - `client/tailwind.config.js`: Warna `forest` (`#1a3d2e`) dan `gold` (`#d4af37`) didokumentasikan dan diatur sebagai warna utama sistem.
   - `client/src/index.css`: Komponen dasar `.pv-card`, `.pv-btn-primary`, `.pv-focus-ring`, dan `.text-title-page` mengikat warna `gold-500` dan `forest-950`.
   - `client/src/components/ui/Button.jsx`: Varian `primary` hardcoded `bg-gold-500 text-forest-950` dan `secondary` hardcoded `bg-forest-800`.
   - `client/src/pages/account/MyTenants.jsx`: Tombol CTA memakai `bg-forest-800 text-gold-400`.

3. **Terminologi IPL / Hunian Dipakai Secara Global**:
   - `client/src/components/ui/BottomNav.jsx`: Label navigasi mobile hardcoded `'Home'`, `'IPL'`, `'Warga'`, `'Menu'` tanpa memperhatikan tipe tenant (Kos/Arisan/Kelas).
   - Beberapa komponen notifikasi dan tour masih mengasumsikan tipe perumahan.

---

## 3. TASK-003: Audit Design Tokens & Sentralisasi

### Token Eksisting vs Token Sasaran

| Kategori | Implementasi Eksisting | Sasaran Baru (`specification.md` §5 & REQ-005) |
|---|---|---|
| **Neutral Colors** | Tersebar (campuran `slate-*`, `gray-*`, `#f8faf9`) | Skala netral terpadu (`slate-50` s/d `slate-900`) sebagai 80–90% permukaan & teks |
| **Brand Colors** | `forest-800` & `gold-500` hardcoded global | Global RuangWarga: netral slate-900 / dark accent. Tenant theme: CSS variables (`--tenant-primary`, `--tenant-accent`) |
| **Semantic Colors** | `emerald-*`, `amber-*`, `rose-*`, `blue-*` | Tetap terlindungi; tenant colors **dilarang** meng-override semantic colors (REQ-006) |
| **Typography** | Inter & Playfair Display di root | Inter untuk 95% UI operasional; Playfair Display dibatasi hanya untuk editorial heading |
| **Radius** | `rounded-xl`, `rounded-2xl`, `rounded-full` tidak seragam | Skala terstandarisasi: 6px (sm), 8px (md), 12px (lg), 16px (xl), pills (full) untuk badges |
| **Elevation** | `.shadow-card`, `.shadow-elevated` agak tebal | Default no shadow; elevation hanya untuk modal, drawer, dropdown, floating actions |
| **Breakpoints** | Standar Tailwind (sm, md, lg, xl, 2xl) | Standar responsive targets: 360, 375, 390, 412, 768, 1024, 1280, 1440px |
| **Motion** | 300ms–500ms atau animasi bouncing | 150–220ms restrained ease-out; dukung `prefers-reduced-motion` |

---

## 4. TASK-004: Pemetaan Komponen Reusable Eksisting

| Komponen Eksisting | Lokasi | Status Reusabilitas | Rencana Tindakan |
|---|---|---|---|
| `Button` | `client/src/components/ui/Button.jsx` | Reusable, perlu varian neutral SaaS | Tambah varian `neutral` / perbaiki token tanpa merusak tes `primary` |
| `IconButton` | `client/src/components/ui/IconButton.jsx` | Baik | Pertahankan & pastikan focus ring netral |
| `Input` | `client/src/components/ui/Input.jsx` | Baik | Gunakan focus ring netral slate/brand |
| `Select` | `client/src/components/ui/Select.jsx` | Baik | Gunakan focus ring netral |
| `Card` | `client/src/components/ui/Card.jsx` | Baik | Kurangi shadow tebal, jadikan flat border default |
| `Section` | `client/src/components/ui/Section.jsx` | Baik | Pertahankan |
| `Badge` | `client/src/components/ui/Badge.jsx` | Baik | Pertahankan |
| `StatusBadge` | `client/src/components/ui/StatusBadge.jsx` | Sangat baik (Accessible icon+label) | Pertahankan |
| `PageHeader` | `client/src/components/ui/PageHeader.jsx` | Baik | Hilangkan font-display jika terlalu dominan |
| `Dialog` / `Modal` | `client/src/components/ui/Dialog.jsx` & `Modal.jsx` | Ada duplikasi Modal vs Dialog | Satukan antarmuka di `components/ui/` |
| `Drawer` | `client/src/components/ui/Drawer.jsx` | Baik | Pertahankan |
| `MobileList` | `client/src/components/ui/MobileList.jsx` | Baik | Pertahankan |
| `EmptyState` | `client/src/components/ui/EmptyState.jsx` | Baik | Pertahankan |
| `LoadingState` | `client/src/components/ui/LoadingState.jsx` | Sangat baik (Skeletons lengkap) | Pertahankan |
| *Missing Primitives* | - | Belum ada di `components/ui/` | Buat: `Textarea`, `Divider`, `Avatar`, `Tabs`, `Dropdown`, `DataList`, `BottomSheet` |

---

## 5. TASK-005: Konflik Arsitektur Eksisting vs Spesifikasi Baru

1. **Konflik Skema Warna Global**:
   - *Spesifikasi*: RuangWarga harus beridentitas netral SaaS; Palm Village tidak boleh mendikte warna global.
   - *Solusi*: Buat token `--rw-*` netral untuk Account dan Global UI. Scoping warna Palm Village (`forest`/`gold`) hanya saat aktif di tenant Palm Village atau template hunian fallback.
2. **Konflik Ketiadaan Shell Terstruktur untuk Account dan Tenant**:
   - *Spesifikasi*: `/account` memiliki Account Shell; `/t/:tenantId` memiliki Tenant Workspace Shell.
   - *Solusi*: Buat `AccountLayout.jsx` untuk seluruh rute `/account/*`, dan `TenantShell.jsx` untuk `/t/:tenantId/*`.
3. **Konflik Backward-Compatibility & Test Suite**:
   - Test suite saat ini memiliki 305 tes (termasuk verifikasi isolasi data, RBAC v2, arisan engine, dan primitive rendering).
   - *Solusi*: Seluruh refactoring UI/UX mempertahankan fungsionalitas, properti props, dan backward-compatible classes agar test suite 100% tetap hijau.
