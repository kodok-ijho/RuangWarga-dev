# Checklist & Audit Referensi Migrasi RBAC v1 ke RBAC v2 (Task T12.1)

Dokumen ini memetakan seluruh referensi eksplisit ke `tenant_members.role` dan nilai role v1 (`'admin'`, `'bendahara'`, `'pengurus'`, `'anggota'`) di seluruh codebase `RuangWarga-dev` pada branch `main`.

---

## 1. Ringkasan Desain RBAC v2 (Acuan: Req §3.2, Spec §2.1)

### 1.1 Model Wewenang 4 Tingkat Bersarang (*Full Containment*)
$$\text{Super Admin} \supset \text{Admin (Owner)} \supset \text{Pengelola (Staff)} \supset \text{Warga/Anggota}$$

### 1.2 10 Kunci Permission Tetap Platform (`permissions`)
| Permission Key | Label Default | Deskripsi Fungsional |
|---|---|---|
| `manage_billing_cash` | Catat Pembayaran Tunai | Mencatat pembayaran tunai langsung |
| `manage_billing_transfer` | Catat & Verifikasi Transfer | Mencatat & memverifikasi bukti transfer |
| `generate_billing` | Terbitkan Tagihan | Generate tagihan berkala (IPL/sewa/kontribusi/iuran) |
| `manage_members` | Kelola Anggota | CRUD anggota, approve/reject pendaftaran, impor CSV |
| `manage_settings` | Kelola Pengaturan | Edit konfigurasi tenant (komponen IPL, harga sewa, dll) |
| `manage_expenses` | Kelola Pengeluaran | CRUD pengeluaran (`expenses`) |
| `view_reports` | Lihat Laporan | Akses laporan keuangan (read-only) |
| `run_special_action` | Jalankan Aksi Khusus | Kocok arisan, checkout kamar kos, mulai siklus baru |
| `post_listing` | Pasang Iklan | Posting listing publik (kamar kosong / UMKM) |
| `manage_tenant_users` | Kelola User & Audit | CRUD akun/akses user tenant, ubah penugasan role, audit log |

### 1.3 Pemetaan Migrasi Role v1 ke Role v2
| Role v1 (Lama) | Kondisi | Hasil di v2 | Permission Diberikan |
|---|---|---|---|
| `'admin'` | `user_id = tenants.owner_id` | `tenant_roles` bawaan "Admin" (`is_owner_role=true`), `is_owner=true` pada `tenant_members` | Seluruh 10 permission |
| `'bendahara'` | Anggota bertugas keuangan | `tenant_roles` kustom "Bendahara" (`is_owner_role=false, is_base_role=false`) | `manage_billing_cash`, `manage_billing_transfer`, `manage_expenses`, `view_reports` |
| `'pengurus'` | Staf/koordinator lapangan | `tenant_roles` kustom "Pengurus" (`is_owner_role=false, is_base_role=false`) | `manage_billing_transfer`, `manage_members`, `view_reports` |
| `'anggota'` | Warga/Penyewa/Peserta | `tenant_roles` bawaan "Warga/Anggota" (`is_base_role=true`), `is_owner=false` | Tanpa permission (0 keys) |

---

## 2. Inventaris File Database (Migrations & RLS) Terdampak

### 2.1 File Skema & Definisi
| File | Elemen Lama | Tindakan di Phase 12 |
|---|---|---|
| `supabase/migrations/202609130004_create_generic_operational_schema.sql` | `tenant_members.role VARCHAR(50) CHECK IN ('admin', 'bendahara', 'pengurus', 'anggota')` | Di-alter di migration baru `202609170001_...`: tambah `tenant_role_id` & `is_owner`. Kolom `role` dipertahankan sementara, baru di-drop di T12.11. |
| `supabase/migrations/202609130005_create_rls_helpers_and_triggers.sql` | Fungsi `is_tenant_admin(t_id)` mengecek `role = 'admin'` | Dibuatkan fungsi baru `has_permission()` dan `is_tenant_owner()`. `is_tenant_admin()` dijadikan alias sementara ke `is_tenant_owner() OR has_permission(..., 'manage_settings')`. |
| `supabase/migrations/202609130006_create_handle_new_tenant_trigger.sql` | Trigger `handle_new_tenant()` meng-insert `role = 'admin'` | Diperbarui: otomatis membuat 2 role bawaan ("Admin" dengan 10 permission, "Warga/Anggota" tanpa permission), meng-assign owner ke role "Admin" dengan `is_owner = true`. |

### 2.2 Kebijakan RLS (Row Level Security) yang Harus Di-refactor (T12.7 & T12.8)
| Tabel | Kebijakan RLS Lama | Logika Lama | Logika Baru (RBAC v2) |
|---|---|---|---|
| `tenants` | `tenants_update` | `is_platform_admin() OR owner_id = auth.uid() OR is_tenant_admin(id)` | `is_platform_admin() OR is_tenant_owner(id) OR has_permission(id, 'manage_settings')` |
| `tenant_units` | `tenant_units_insert_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_settings')` |
| `tenant_units` | `tenant_units_update_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_settings')` |
| `tenant_units` | `tenant_units_delete` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_settings')` |
| `tenant_members` | `tenant_members_update_when_active` | `is_platform_admin() OR user_id = auth.uid() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR user_id = auth.uid() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_members') OR has_permission(tenant_id, 'manage_tenant_users')` |
| `tenant_members` | `tenant_members_delete_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_members') OR has_permission(tenant_id, 'manage_tenant_users')` |
| `billing_items` | `billing_items_insert_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'generate_billing')` |
| `billing_items` | `billing_items_update_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'generate_billing') OR has_permission(tenant_id, 'manage_billing_cash') OR has_permission(tenant_id, 'manage_billing_transfer')` |
| `payments` | `payments_insert_when_active` | Member / `is_tenant_admin(tenant_id)` | Anggota sendiri / `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_billing_cash') OR has_permission(tenant_id, 'manage_billing_transfer')` |
| `payments` | `payments_update_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_billing_transfer')` (verifikasi) |
| `expenses` | `expenses_insert_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_expenses')` |
| `expenses` | `expenses_update_when_active` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_expenses')` |
| `arisan_rounds` | `arisan_rounds_insert/update` | `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'run_special_action')` |
| `arisan_participants` | `arisan_participants_insert/delete`| `is_platform_admin() OR is_tenant_admin(tenant_id)` | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'run_special_action')` |
| `public_listings` | `public_listings_insert/update/delete` | `role = 'admin'` eksplisit di query subselect | `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'post_listing')` |
| `tenant_roles` | Policy Baru (T12.2) | Belum ada | `SELECT`: Anggota tenant tsb / platform admin. `INSERT/UPDATE`: `is_platform_admin() OR is_tenant_owner() OR has_permission(..., 'manage_tenant_users')`. `DELETE`: Non-base/owner roles AND (`is_platform_admin() OR is_tenant_owner()`). |
| `tenant_role_permissions` | Policy Baru (T12.2) | Belum ada | Mengikuti kepemilikan/pengelolaan `tenant_roles`. |

### 2.3 Stored Procedures & RPCs
| File | Fungsi | Logika Lama | Penyesuaian v2 |
|---|---|---|---|
| `supabase/migrations/202609140006_auto_generate_kos_billing.sql` | `auto_generate_kos_billing` | `is_tenant_admin(p_tenant_id)` | `is_platform_admin() OR is_tenant_owner(p_tenant_id) OR has_permission(p_tenant_id, 'generate_billing')` |
| `supabase/migrations/202609140007_checkout_kos_room.sql` | `checkout_kos_room` | `is_tenant_admin(p_tenant_id)` | `is_platform_admin() OR is_tenant_owner(p_tenant_id) OR has_permission(p_tenant_id, 'run_special_action')` |
| `supabase/migrations/202609140010_draw_arisan_winner.sql` | `draw_arisan_winner` | `is_tenant_admin(p_tenant_id)` | `is_platform_admin() OR is_tenant_owner(p_tenant_id) OR has_permission(p_tenant_id, 'run_special_action')` |
| `supabase/migrations/202609140011_start_new_arisan_cycle.sql` | `start_new_arisan_cycle` | `is_tenant_admin(p_tenant_id)` | `is_platform_admin() OR is_tenant_owner(p_tenant_id) OR has_permission(p_tenant_id, 'run_special_action')` |

---

## 3. Inventaris Edge Functions Terdampak

| File | Baris | Logika Lama | Penyesuaian v2 |
|---|---|---|---|
| `supabase/functions/create-subscription-payment/index.ts` | 66, 73 | `["admin", "bendahara"].includes(memberRow.role)` | **FR-35**: Hanya Admin (owner) & Super Admin yang boleh kelola subscription platform (`is_tenant_owner` / `is_owner = true` / `tenants.owner_id = user.id` / `is_platform_admin`). |
| `supabase/functions/create-listing-payment/index.ts` | 80, 86 | `memberRow.role === "admin"` | `is_platform_admin` / `is_tenant_owner` / `has_permission(tenantId, 'post_listing')`. |
| `supabase/functions/auto-generate-kos-bills/index.ts` | 96, 100 | `.in("role", ["admin", "bendahara", "pengurus"])` | Periksa permission `generate_billing` atau dipanggil dengan service role. |

---

## 4. Inventaris Frontend Terdampak

### 4.1 State & Konteks Inti
| File | Kode Terkait Role | Penyesuaian v2 |
|---|---|---|
| `client/src/context/TenantContext.jsx` | `role: 'admin'`, `m.role`, `userRole = activeTenant?.role \|\| 'anggota'`, `isTenantAdmin` | Tambah resolusi `tenant_role_id`, `roleName`, `isOwner`, daftar `permissions: string[]`, dan fungsi `hasPermission(key)`. |
| `client/src/hooks/useTenant.js` | Re-export dari `TenantContext` | Teruskan helper baru `hasPermission`, `isOwner`, `permissions`. |
| `client/src/services/dataHelpers.js` | `canManageResidents`, `canManageSettings`, `canManageUsers`, `canViewPaymentVerification`, `roleLabel`, `roleColor` | Adaptasi helper agar menerima permission set atau fallback ke parameter role legacy. |

### 4.2 Layanan Operasional Frontend
| File | Fungsi | Penyesuaian v2 |
|---|---|---|
| `client/src/services/tenantOperationalService.js` | `requestJoinTenant` (default `role: 'anggota'`) | Tetapkan `role: 'anggota'` (kompatibilitas) dan lookup default role id "Warga/Anggota". |
| `client/src/services/tenantOperationalService.js` | `fetchPendingTenantMembers`, `fetchTenantMembers` | Sertakan relasi `tenant_roles:tenant_role_id (id, name, is_owner_role, is_base_role)` dan `is_owner`. |
| `client/src/services/tenantOperationalService.js` | `approveTenantMember` (opsi `role`) | Tambah parameter `tenantRoleId`, update `tenant_role_id`. |
| `client/src/services/tenantOperationalService.js` | CRUD Role Baru | Tambahkan fungsi: `fetchTenantRoles(tenantId)`, `createTenantRole(tenantId, { name, permissions })`, `updateTenantRole(roleId, { name, permissions })`, `deleteTenantRole(roleId)`, `assignMemberRole(memberId, tenantRoleId)`. |

### 4.3 Halaman & Komponen UI
| File | Komponen | Penyesuaian v2 |
|---|---|---|
| `client/src/pages/tenant/TenantDashboard.jsx` | `userRole`, `isStaff = isTenantAdmin \|\| userRole === 'bendahara' ...` | Gunakan `isOwner \|\| hasPermission('...')` dan tampilkan `activeRoleName`. Tambahkan tombol navigasi "Kelola Role & Akses" bagi yang punya permission `manage_tenant_users` atau `isOwner`. |
| `client/src/pages/tenant/TenantMemberApproval.jsx` | Dropdown hardcoded (`anggota`, `pengurus`, `bendahara`, `admin`) | Load dinamis dari `fetchTenantRoles(tenantId)`. Simpan `tenant_role_id`. |
| `client/src/App.jsx` | `RoleGuard` & Route definitions | Tambahkan route `/t/:tenantId/roles` (`ManageRoles.jsx`) dan `/t/:tenantId/members/:id/role` (`AssignMemberRole.jsx`). Dukung guard berbasis `hasPermission`. |
| `client/src/components/Header.jsx` | Badge role & menu navigasi staf | Gunakan `hasPermission(...)` dan `roleName` dinamis. |
| `client/src/pages/roles/ManageRoles.jsx` | **Halaman Baru (T12.9)** | CRUD custom role, proteksi role bawaan (disabled delete/edit), centang 10 permission. |
| `client/src/pages/roles/AssignMemberRole.jsx` | **Halaman Baru (T12.9)** | Pilih anggota dan assign satu role aktif per tenant. |

---

## 5. Inventaris Test Suite Terdampak

| File Test | Aspek yang Diuji | Catatan Penyesuaian |
|---|---|---|
| `client/src/config/tenantTemplates.test.js` | `roleLabel` | Pastikan fallback ke label generik / custom name tetap valid. |
| `client/src/hooks/useSubscriptionGate.test.js` | `evaluateSubscriptionGate` | Pastikan gate kompatibel dengan permission checks. |
| `client/src/services/tenantOperationalService.test.js` | Anggota, approval, dashboard | Tambahkan pengujian untuk `fetchTenantRoles`, `createTenantRole`, `assignMemberRole`. |
| `client/src/services/rbacV2Regression.test.js` | **File Test Baru (T12.12)** | Pengujian lengkap untuk FR-31 s/d FR-40. |

---

## 6. Urutan Eksekusi Task Phase 12

1. **T12.1** -- Checklist audit referensi RBAC v1 ke v2 (Dokumen ini) ✅.
2. **T12.2** -- Migration SQL skema RBAC v2 (`permissions`, `tenant_roles`, `tenant_role_permissions`).
3. **T12.3** -- Migration ALTER `tenant_members` (tambah `tenant_role_id`, `is_owner`, pertahankan `role` sementara).
4. **T12.4** -- Data migration: buat role bawaan ("Admin", "Warga/Anggota") & map role lama ("Bendahara", "Pengurus") per tenant.
5. **T12.5** -- Data migration: isi `tenant_role_id` & `is_owner` pada `tenant_members` existing.
6. **T12.6** -- Helper SQL `has_permission()` dan `is_tenant_owner()`, pertahankan `is_tenant_admin()` sebagai alias transisi.
7. **T12.7** -- Refactor RLS policies satu per satu untuk memakai `has_permission()`, jalankan test suite setiap perubahan.
8. **T12.8** -- Verifikasi dan pastikan `OR is_platform_admin()` ada di setiap RLS policy tenant (FR-40).
9. **T12.9** -- Halaman `ManageRoles.jsx` dan `AssignMemberRole.jsx`.
10. **T12.10** -- Integrasi frontend RBAC v2 (`TenantContext`, `tenantOperationalService`, `Header`, `TenantMemberApproval`, `TenantDashboard`).
11. **T12.11** -- Migration final: `DROP COLUMN role` pada `tenant_members` dan deprecate alias `is_tenant_admin()`.
12. **T12.12** -- Regression test menyeluruh (248 baseline tests + skenario RBAC v2 baru).
