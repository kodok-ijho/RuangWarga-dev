# Audit Vertikal RT/RW (Claude, 2026-10-11)

Cakupan: semua yang dialami tenant **RT/RW baru** (bukan Palm Village, `legacy_qris_enabled` tidak di-set) di workspace `/t/:tenantId`, mode produksi (`IS_DEMO = false`).

Metode:
- Pembacaan kode, dibantu 2 agen pemetaan; temuan kunci dicek ulang Claude ke file:baris.
- Pencocokan otomatis semua `.from('tabel')` di frontend dengan skema Supabase dev (alat di scratchpad Claude).
- Uji eksploit nyata di Supabase dev dengan blok `DO` yang selalu di-rollback. Data dev saat ini kosong (0 tenant).

Status: **belum siap dipakai tenant RT/RW baru.** Ada celah keamanan kritis di database (berlaku untuk semua vertikal), dan sebagian besar halaman RT/RW masih bergantung pada login dan backend n8n Palm Village.

---

## A. Keamanan database — terbukti di dev (berlaku untuk SEMUA vertikal)

| ID | Tingkat | Temuan | Bukti (rollback) |
|---|---|---|---|
| S1 | **KRITIS** | Siapa pun yang login bisa memasukkan dirinya ke tenant mana pun sebagai anggota `approved`, tanpa kode undangan. Policy `tenant_members_insert_self` hanya mengecek `user_id = auth.uid()`. Setelah itu ia membaca seluruh data tenant (anggota, tagihan, pembayaran, pengeluaran). `tenant_id` terbuka di `public_listings` (publik) dan di `get_invite_details`. | Orang luar: `INSERT_OK`, lalu melihat 5 baris anggota |
| S2 | **KRITIS** | Anggota bisa mengubah baris keanggotaannya sendiri: `tenant_role_id` (jadi Admin) dan `is_owner`. Policy `tenant_members_update_when_active` mengizinkan `user_id = auth.uid()` dan tidak ada penjaga kolom. | Warga: rows=1, lalu `has_permission(...,'manage_billing_cash') = true` |
| S3 | **KRITIS** | Role dari tenant **lain** bisa dipasang. Warga membuat tenant sendiri (diizinkan), lalu memasang role Admin tenant barunya itu di tenant korban, dan mendapat semua izin di sana. Celah ini lolos dari perlindungan SEC-4. | `victim_cash_perm = true` |
| S4 | **KRITIS** | Pemegang `manage_settings` bisa mengubah `tenants.owner_id` ke dirinya (mengambil alih tenant), mengubah `type`, dan menyalakan `settings.legacy_qris_enabled`. Flag itu mengarahkan QRIS warga ke merchant DOKU **milik Palm Village**. | rows=1, owner berganti, `type = kos`, flag `true` |
| S5 | TINGGI | Warga bisa membuat baris `payments` berstatus `completed` dengan nominal berapa pun untuk tagihannya sendiri. Policy `payments_insert_member` / `payments_insert_when_active` tidak membatasi status, nominal, maupun metode. | Diuji dengan Rp1: `INSERT_OK` |
| S6 | SEDANG | Bucket `payment-proofs` **tidak ada**, sehingga upload bukti transfer selalu gagal diam-diam dan pembayaran tetap dibuat tanpa bukti (`payments.js` ±451-475). Kode juga memakai `getPublicUrl`, jadi bukti transfer akan publik kalau bucket dibuat publik. | `storage.buckets` hanya berisi `expense-receipts` |
| S7 | SEDANG | Tagihan IPL bisa ganda. Tidak ada unique index; pencegahan hanya di klien (cek lalu insert), dan bila cek gagal, error ditelan (`billing.js` ±218-231). | `pg_indexes` billing_items |

Catatan: `tenant_role_permissions` / `tenant_roles` sudah dijaga sejak SEC-4. Kebocoran SELECT antar-tenant tidak ditemukan selama status keanggotaan sah; S1 adalah jalan masuknya.

## B. Fungsi RT/RW yang rusak / bercampur backend

| ID | Tingkat | Temuan |
|---|---|---|
| F1 | **BLOKER** | **Dua sistem login tidak tersambung.**<br>• Tombol login utama membuat sesi **Supabase** (`Login.jsx` ±347-364), yang dipakai `TenantContext` dan semua data multi-tenant.<br>• `role` di `useAuth()` hanya berasal dari login **n8n** Palm Village (`AuthContext.jsx` ±553).<br>• `RoleGuard` (`App.jsx` ±83-89) dan cek `isStaffRole`/`canModifyData` di halaman memakai `role` itu.<br>• Akibatnya pengguna tenant baru (login Supabase, `role = null`) **dilempar ke `/`** dari Matriks IPL, Verifikasi, Pengeluaran, Laporan, Warga, dan Acara. |
| F2 | **TINGGI** | **PaymentMatrix menulis ke n8n Palm Village dengan ID Supabase.** Yang terdampak:<br>• catat tunai/transfer oleh pengurus (`createCashPayment` ±803/812 dan `submitManualPayment` ±826, tanpa `tenantId`);<br>• modal detail: verifikasi, tolak, edit, batal (±2533/2554/2587/2624) dan `fetchPaymentByBillId` (±2390);<br>• tombol **"Reset & Hapus Semua Transaksi"** (`CLEANUP_ALL` ke n8n, ±881, muncul untuk bendahara/admin legacy).<br>ID unit Supabase (bigint) bisa bertabrakan dengan ID unit Palm Village, jadi edit/batal berisiko mengenai **pembayaran Palm Village**; ini belum bisa dipastikan karena workflow n8n tidak ada di repo. |
| F3 | TINGGI | Pembayaran oleh warga: setelah insert `payments`, klien meng-update `billing_items` (`payments.js` ±515). Warga tidak punya izin, jadi update menyentuh 0 baris **tanpa error**. Tagihan tetap "belum bayar" dan warga bisa mengirim ulang (dobel). |
| F4 | TINGGI | **Laporan** memakai pemasukan non-IPL dari n8n (`/incomes/list`) dan **mengalahkan** data Supabase bila n8n mengembalikan baris (`Reports.jsx` ±219, ±248). Daftar acara juga dari n8n. |
| F5 | SEDANG | **Pengeluaran** memuat acara dan hak akses acara dari n8n (`Expenses.jsx` ±119-120), dan hasilnya memengaruhi `canEdit`. Field `scope`/`event_id` hilang saat disimpan ke Supabase. |
| F6 | SEDANG | **Warga (Residents):** membaca dari Supabase, tetapi menulis (tambah, edit, hapus, impor CSV) ke n8n `/residents/*` dengan UUID Supabase dan `token` yang selalu `undefined` (`Residents.jsx` ±57). Fitur kelola warga tidak berfungsi. |
| F7 | SEDANG | **Acara & Keuangan Acara** sepenuhnya n8n Palm Village, termasuk daftar pengguna Palm Village (`/users/list`). Tidak ada tabel acara di DB multi-tenant. |
| F8 | SEDANG | **Pengumuman** hanya membaca localStorage dan tidak ada fitur menulis. Bagi tenant nyata halamannya selalu kosong. Tidak ada tabel. |
| F9 | RENDAH | **Verifikasi Pembayaran** membaca pengaturan QRIS dari n8n (`fetchSettings`, ±247). Hanya memengaruhi dropdown metode. |
| F10 | SEDANG | Navigasi keluar dari scope tenant:<br>• `TenantShell` "Anggota" → `/residents` dan "Pengaturan" → `/settings` (`Settings.jsx` memanggil n8n);<br>• dashboard → `/houses` (n8n `upsertUnit`);<br>• kartu acara → `/events/:id`. |
| F11 | SEDANG | **SetupWizard** menimpa seluruh `settings` (`logo_url`, `legacy_qris_enabled` hilang), dan menjalankannya ulang menyisipkan unit ganda. |
| F12 | RENDAH | `currentTenant` (tidak ada di `TenantContext`) masih dibaca di `Expenses.jsx` ±64, `Residents.jsx` ±58, `Announcements.jsx` ±11. |

Halaman yang sudah sepenuhnya Supabase: TenantDashboard, SetupWizard (selain F11), TenantMemberApproval, ManageRoles, AssignMemberRole.

## C. Lain-lain
- `PlatformPricingConfig.jsx` ±65 mengurutkan `block_pricing` dengan kolom `duration_months` yang tidak ada → error saat dimuat. Masuk fase dashboard platform.
- `dataService.js` ±1116 dan ±1328 memuat URL fallback Supabase lain yang di-hardcode. Kemungkinan itu proyek Supabase produksi Palm Village, dipakai bila `VITE_SUPABASE_URL` kosong saat build. `dataService.js` tidak boleh disentuh tanpa izin user → keputusan user.
- Identitas Palm Village: `migrate_legacy_portal_warga` menyalin `profiles.id` lama ke `tenant_members.user_id`, padahal ID itu bukan `auth.users.id`. Saat Palm Village dimigrasi, perlu langkah penautan akun (mis. lewat email) agar warganya bisa login dengan Supabase.

---

## Rencana batch (usulan)

1. **SEC-5** — perbaikan database S1–S7 (migration, trigger penjaga, RPC join, bucket privat, unique index) + penyesuaian frontend minimal. **Tidak bergantung keputusan user, bisa langsung.**
2. **RTRW-1** — login & akses:
   - workspace `/t/:tenantId` memakai izin tenant (RBAC v2), bukan `role` n8n;
   - `PaymentMatrix`, `PaymentVerification`, `Reports`, `Expenses` sepenuhnya Supabase;
   - tombol `CLEANUP_ALL` dan semua tulis n8n dihapus dari konteks tenant (F1–F5, F9, F12).
3. **RTRW-2** — kelola warga & unit di Supabase (F6), navigasi tetap dalam tenant (F10), SetupWizard (F11).
4. **RTRW-3** — Pengumuman & Acara dengan tabel baru multi-tenant (F7, F8). Sampai saat itu menunya disembunyikan untuk tenant non-Palm Village.

Keputusan yang dibutuhkan dari user sebelum RTRW-1: lihat ringkasan di chat / `questions.md`.
