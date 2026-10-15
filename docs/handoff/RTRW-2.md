# RTRW-2: Kelola warga, unit, dan pengaturan tenant di Supabase

Status: **disetujui user 2026-10-15** ("perdalam RT/RW dulu"), termasuk task 2.6 Jabatan Pengurus.
Sumber: `AUDIT-RTRW.md` F6, F10, F11, dan F12. Keputusan user 2026-10-15: **penghuni dicatat per unit**.

## Requirement
1. **Anggota** (`tenant_members`) adalah warga yang punya akun dan bergabung lewat kode undangan. Tabel ini tidak diubah.
   - Pengurus dengan izin owner, `manage_members`, atau `manage_tenant_users` bisa:
     - mengubah nama, HP, unit, dan status tinggal anggota;
     - mengubah peran lewat halaman Atur Peran yang sudah ada;
     - **mengeluarkan** anggota (DELETE; `payments.member_id` otomatis menjadi NULL).
   - Owner tidak bisa dikeluarkan. Aturan ini sudah dijaga trigger `guard_tenant_member_write` dan RLS.
   - Tombol "Tambah Warga" diganti **"Undang Warga"**, yang menampilkan kode atau tautan undangan beserta tombol salin.
2. **Penghuni per unit**: setiap `tenant_units` menyimpan data penghuni di `metadata.occupant`, yaitu `{ name, phone, occupancy_status, note }`, untuk warga yang tidak atau belum punya akun.
   - Halaman baru **Unit/Rumah** di `/t/:tenantId/units` untuk pengurus (owner atau `manage_settings`, sesuai RLS `tenant_units`). Isinya:
     - daftar unit, data penghuninya, dan anggota yang tertaut ke unit itu;
     - tambah dan edit unit beserta penghuninya;
     - menonaktifkan unit (`status = 'inactive'`). Unit hanya **boleh dihapus** bila belum punya tagihan.
     - **impor CSV** dengan kolom `label, nama_penghuni, hp, status_tinggal`. Mode upsert berdasarkan label (case-insensitive dan di-trim): label baru dibuat, label yang sudah ada diperbarui data penghuninya.
   - Tagihan IPL tetap per unit, tanpa perubahan.
3. **Pengaturan tenant** dipindah ke `/t/:tenantId/settings` dan **sepenuhnya Supabase**:
   - Isinya: nama, alamat, kontak, `due_day`, `ipl_components`, rekening (sudah ada), dan kode undangan.
   - Akses untuk owner atau `manage_settings`.
   - Tidak ada lagi `fetchSettings`/`updateSettings` n8n dari konteks tenant.
   - Halaman global `/settings` (Portal Warga lama) **tidak diubah**.
4. **Navigasi tetap di dalam tenant** (F10):
   - Link "Kelola Unit" di `StaffDashboard` (`/houses`) diarahkan ke `/t/:id/units`.
   - "Pengaturan Komunitas" di `TenantShell` (dua tempat) diarahkan ke `/t/:id/settings`.
   - Kartu acara `/events/*` tidak dirender di konteks tenant. Acara sudah disembunyikan di RTRW-1.2, jadi cukup pastikan saja.
5. **Jabatan pengurus** (RTRW-2.6):
   - Menu "Jabatan & Hak Akses" ke halaman `/t/:id/roles` yang sudah ada (ManageRoles), untuk owner atau `manage_tenant_users`.
   - Tombol "Atur Jabatan" per anggota ke `/t/:id/members/:id/role` (AssignMemberRole), dan label jabatan di daftar warga.
   - Tombol "Gunakan Template Jabatan RT/RW" yang membuat jabatan berikut bila belum ada (berdasarkan nama, case-insensitive):
     | Jabatan | Izin |
     |---|---|
     | Ketua RT/RW | manage_members, manage_settings, generate_billing, manage_billing_cash, manage_billing_transfer, manage_expenses, view_reports |
     | Sekretaris | manage_members, view_reports, post_listing |
     | Bendahara | generate_billing, manage_billing_cash, manage_billing_transfer, manage_expenses, view_reports |
     | Koordinator Blok | manage_billing_cash, view_reports |
   - `manage_tenant_users` (atur jabatan) tetap hanya dimiliki owner/Admin.
   - Label izin dalam Bahasa Indonesia yang mudah dipahami.
6. **SetupWizard** (F11):
   - Menyimpan settings dengan **merge** ke settings yang ada. `logo_url`, `legacy_qris_enabled`, dan kunci lain tidak hilang.
   - Menjalankan wizard ulang **tidak membuat unit ganda**: label yang sudah ada (case-insensitive dan di-trim) dilewati.
7. Semua fitur di atas tetap jalan di mode demo, dan isolasi tenant dijaga RLS. **Tidak ada migration.**

## Plan
| Task | Isi |
|---|---|
| RTRW-2.1 | Service (`client/src/services/tenant/members.js` dan `settings.js`):<br>• unit: `createTenantUnit`, `updateTenantUnit` (merge `metadata.occupant`), `setTenantUnitStatus`, `deleteTenantUnit` (tolak bila ada `billing_items`), `importTenantUnitsCSV` (upsert by label);<br>• anggota: `updateTenantMember`, `removeTenantMember`;<br>• settings: `updateTenantProfileAndSettings` di-merge di server-side query (ambil settings lama, lalu gabungkan).<br>Semuanya dengan test unit. |
| RTRW-2.2 | Halaman Warga (`/t/:id/residents`): edit dan keluarkan anggota lewat service baru, "Undang Warga", serta menghapus pemanggilan `createResident`/`updateResident`/`deleteResident`/`importResidentsCSV` (n8n) di konteks tenant. Impor CSV dipindah ke halaman Unit. |
| RTRW-2.3 | Halaman baru Unit (`/t/:id/units`) dan rute di `App.jsx` dengan `TenantAccessGuard`/`TenantPermissionGuard` (`manage_settings`). Link "Kelola Unit" diarahkan ke halaman ini. |
| RTRW-2.4 | Halaman Pengaturan tenant (`/t/:id/settings`), dibuat dengan memecah bagian tenant dari `Settings.jsx` atau membuat komponen baru. Link "Pengaturan Komunitas" diarahkan ke halaman ini. |
| RTRW-2.5 | SetupWizard: merge settings dan dedupe unit. |
| RTRW-2.6 | Jabatan pengurus: menu, tombol Atur Jabatan, label jabatan, template jabatan RT/RW, dan label izin Bahasa Indonesia. |

Setiap task berjalan dalam satu panggilan agy dan satu commit, lalu QA dengan `VITE_DEMO_MODE=false npx vitest run`, `npm run build`, dan `npm run lint`. Setelah itu push ke production, lalu uji manual oleh user.

## Kriteria diterima
- Tidak ada pemanggilan n8n (`portalApiPost`) dari halaman `/t/:tenantId/residents`, `/units`, dan `/settings`.
- Pengurus bisa mengedit atau mengeluarkan anggota, mengelola unit dan penghuni, serta mengimpor CSV unit.
- Warga biasa tidak melihat tombol kelola.
- Wizard yang dijalankan ulang tidak menggandakan unit dan tidak menghapus `logo_url`.
