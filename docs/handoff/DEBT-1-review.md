# DEBT-1 Review (Claude, 2026-10-10)

Commit yang direview: `c6260f3..d967fa5` (4 commit task + 1 laporan). Hash di laporan cocok ✅.

| Cek | Hasil |
|---|---|
| `npx vitest run` | **679 test lulus** (42 file) |
| `npm run build` / `npm run lint` | ok / exit 0 |
| Batasan file | Tidak ada perubahan di `api/`, `supabase/`, `legacy-backend/`, `dataService.js` ✅ |
| 1.1 Kuitansi | `receiptService.js` tanpa import `mockData`, nominal dari `bill.amount`, label dari template, semua teks di-escape. Tombol "Kirim ke Email" lewat `ReceiptActions` hanya saat `IS_DEMO`; produksi satu kolom. Callback demo ±1093 kini mengirim `{ bill, unit, … }` ✅ |
| 1.2 Biaya QRIS | `SubscriptionCheckout` (demo) & `publicListingService` memakai `calculateQrisFee` (0,75%); tarif 0,7% jalur n8n tidak tersentuh ✅ |
| 1.3 Mock | Static import dihapus dari `Login.jsx`, `publicListingService.js`, `tenantOperationalService.js`. `resolveCitizenObligationAndUnit` tetap sinkron (parameter `demoProfiles`/`demoUnits`). Data mock kini di chunk terpisah `mockData-*.js`; `grep "Ibu Ratna" dist/assets/index-*.js` kosong ✅. Tabel audit lengkap dan berguna. |
| 1.4 Pecah service | Struktur folder, barrel, test penjaga 61 export, dan tanpa import melingkar (madge) ✅ — **tetapi isi `rbac.js` ditulis ulang, lihat N1** ❌ |

## Temuan

### N1 — `rbac.js` ditulis ulang, bukan dipindah. Fitur role rusak di produksi (BLOKER)
Claude membandingkan setiap deklarasi top-level di file lama (`c48f8bf`) dengan modul baru. Hasilnya:
- 54 dari 61 deklarasi identik; satu-satunya beda adalah path `import('./mockData')` → `'../mockData'`.
- 7 deklarasi RBAC berubah total: `mockCustomRolesStore`, `fetchPlatformPermissions`, `fetchTenantRoles`, `createTenantRole`, `updateTenantRole`, `deleteTenantRole`, `assignMemberRole`.
- Kode RBAC baru ini tidak pernah ada di riwayat git (`git log -S "role-mock-1"` hanya menunjuk `d2f0211`).

Diperiksa ke skema dev: `tenant_roles` hanya punya `id, tenant_id, name, is_owner_role, is_base_role, created_at`. Izin role disimpan di tabel `tenant_role_permissions`. Kode baru:
- `fetchTenantRoles` men-select kolom `permissions` dan `updated_at` yang **tidak ada** → error. Halaman Kelola Role (`pages/roles/ManageRoles.jsx`) gagal dimuat, dan `TenantMemberApproval.jsx` diam-diam mendapat daftar role kosong (`.catch(() => [])`).
- `createTenantRole` / `updateTenantRole` menulis kolom `permissions` yang tidak ada → gagal. Seandainya kolom itu ada pun, `has_permission()` membaca `tenant_role_permissions`, jadi izin tidak akan pernah berlaku.
- Perlindungan role Admin (`is_owner_role = true`, dibuat `handle_new_tenant`) dihapus dari update/delete; hanya `is_base_role` yang dicek.
- `assignMemberRole` kini menerima `tenantRoleId` kosong (melepas role), sebuah perilaku baru.
- Data demo role diganti: tenant demo RT/RW tidak lagi punya role sama sekali.

Test tidak menangkapnya karena test penjaga hanya mencocokkan **nama** export, dan tidak ada test service RBAC dengan mock Supabase.

Claude sudah menguji pemulihan secara lokal (tidak di-commit): menyalin bagian RBAC dari `c48f8bf` apa adanya ke `rbac.js` → pengecek "pindah saja" OK, lint bersih, 679 test lulus.

### N2 — Tiga fallback mock tanpa penjaga di jalur produksi (RENDAH, dari tabel audit executor)
Lokasinya `PaymentMatrix.jsx` ±1566 (`getPaymentForBill`), `PaymentVerification.jsx` ±297 (`getUnitById`), dan ±301 (`getProfileById`).
- Unit di jalur legacy memakai ID angka, sama seperti unit mock.
- Bila unit/profil asli tidak ditemukan, halaman verifikasi bisa menampilkan unit atau warga palsu dari data demo.

### N3 — Proteksi role bawaan hanya di sisi aplikasi (SEDANG, celah DB lama, bukan dari DEBT-1)
Policy `tenant_roles_update` dan `tenant_role_permissions_modify` mengizinkan siapa pun dengan `manage_tenant_users` mengubah role mana pun di tenant-nya, termasuk:
- role Admin (`is_owner_role`);
- role dasar "Warga/Anggota" (`is_base_role`), misalnya memberi semua izin ke seluruh warga lewat API langsung.

Hanya DELETE yang dijaga di DB. Tidak lintas tenant, tetapi penjagaan seharusnya ada di database (AGENT.md §6). Butuh migration, jadi dikerjakan di batch keamanan berikutnya (**SEC-4**), bukan DEBT-1F.

## Perbaikan proses
- Alat baru `docs/handoff/tools/compare_split.py` membandingkan isi deklarasi lama dan baru, exit 1 bila ada perbedaan selain path `mockData`/`IS_DEMO`.
- Mulai sekarang, setiap task "pindah saja" wajib menjalankan alat ini dan menempel outputnya di laporan (ditambahkan ke README).

## Hasil
DEBT-1.1–1.3 **diterima**. DEBT-1.4 **diterima bersyarat**: struktur dipertahankan, `rbac.js` wajib dipulihkan di **DEBT-1F**. N2 dikerjakan di DEBT-1F; N3 masuk BACKLOG (SEC-4).
