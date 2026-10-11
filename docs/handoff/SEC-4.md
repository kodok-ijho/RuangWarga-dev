# SEC-4 — Proteksi role bawaan & izinnya di level database

Baca `docs/handoff/README.md`, AGENT.md, dan `DEBT-1-review.md` (N3) dulu.
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. ⚠️ Batch ini berisi migration + RLS (sensitif): tulis file saja, **jangan** menjalankan ke Supabase. Claude yang menerapkan ke dev dan menjalankan test SQL.
🚫 n8n, `api/n8n.js`, `dataService.js`, `legacy-backend/`, Edge Function: tidak disentuh. Tidak ada perubahan frontend.

## Masalah (N3)
- Kode klien `services/tenant/rbac.js` melarang mengubah role bawaan. Ada dua role bawaan yang dibuat `handle_new_tenant` untuk setiap tenant:
  - "Admin" (`is_owner_role = true`), dengan semua izin;
  - "Warga/Anggota" (`is_base_role = true`), tanpa izin.
- Database hanya menjaga **DELETE** `tenant_roles`.
- Akibatnya siapa pun yang memegang `manage_tenant_users` bisa, lewat API langsung:
  - mengganti nama atau flag role bawaan;
  - menambah izin ke role "Warga/Anggota", sehingga **semua warga** mendapat izin itu (mis. `manage_billing_cash`);
  - membuat role baru dengan `is_owner_role = true` / `is_base_role = true`, sehingga role itu tidak bisa dihapus.
- Ini tidak lintas tenant, tetapi isolasi dan otorisasi wajib ditegakkan di DB (AGENT.md §6).

## Fakta skema dev (sudah dicek Claude)
- `tenant_roles`: `id, tenant_id, name, is_owner_role, is_base_role, created_at`; unique `(tenant_id, name)`; RLS aktif, tidak FORCE; owner tabel `postgres`.
- `tenant_role_permissions`: `tenant_role_id, permission_key`; PK keduanya; FK ke `tenant_roles` dan `permissions(key)` (10 key, termasuk `manage_tenant_users`).
- `is_tenant_owner(t)` = `tenants.owner_id = auth.uid()`. Flag `is_owner_role` **tidak** memberi hak apa pun di helper DB. `has_permission` membaca `tenant_role_permissions` lewat `tenant_members.tenant_role_id`.
- Di frontend, `context/TenantContext.jsx` ±263 memetakan role ber-`is_owner_role` menjadi `userRole = 'admin'`. Jadi role kustom ber-flag owner membuka tampilan admin. Ini alasan tambahan melarang flag itu di INSERT/UPDATE.
- `handle_new_tenant` dan `migrate_legacy_portal_warga` adalah `SECURITY DEFINER` milik `postgres`, jadi tidak terkena RLS (tabel tidak FORCE). Policy baru tidak mengganggu pembuatan role bawaan.

**Policy saat ini** (salin persis ke blok ROLLBACK):
```sql
-- tenant_roles_insert   (INSERT) WITH CHECK:
(is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_tenant_users'::text))
-- tenant_roles_update   (UPDATE) USING dan WITH CHECK: sama dengan di atas
-- tenant_roles_delete   (DELETE) USING: ((NOT (is_owner_role OR is_base_role)) AND (is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id, 'manage_tenant_users'::text)))   ← tidak diubah
-- tenant_role_permissions_modify (ALL) USING dan WITH CHECK:
(is_platform_admin() OR (tenant_role_id IN ( SELECT tenant_roles.id FROM tenant_roles WHERE (is_tenant_owner(tenant_roles.tenant_id) OR has_permission(tenant_roles.tenant_id, 'manage_tenant_users'::text)))))
```

**Keputusan sementara (konfirmasi user di `questions.md` bila executor ragu):** pemilik tenant (`owner_id`) **juga** tidak bisa mengubah role bawaan. Ini sama dengan perilaku klien sekarang. Hanya `is_platform_admin()` yang dikecualikan.

---

## SEC-4.1 — Migration `supabase/migrations/202610120001_protect_builtin_roles.sql`  ⚠️ sensitif
Pakai **`ALTER POLICY ... USING (...) WITH CHECK (...)`**; jangan `DROP POLICY` (konektor Claude memblokir kata DROP/DELETE). Semua helper ditulis dengan prefix `public.`.

1. `tenant_roles_insert` WITH CHECK:
   `public.is_platform_admin() OR (NOT is_owner_role AND NOT is_base_role AND (public.is_tenant_owner(tenant_id) OR public.has_permission(tenant_id, 'manage_tenant_users')))`
2. `tenant_roles_update` USING **dan** WITH CHECK: ekspresi yang sama dengan nomor 1.
3. Hak kolom: klien hanya boleh mengganti nama role (`rbac.js` memang hanya meng-update `name`).
   ```sql
   REVOKE UPDATE ON public.tenant_roles FROM anon, authenticated;
   GRANT UPDATE (name) ON public.tenant_roles TO authenticated;
   ```
4. `tenant_role_permissions_modify` USING **dan** WITH CHECK:
   ```sql
   public.is_platform_admin()
   OR tenant_role_id IN (
     SELECT tr.id FROM public.tenant_roles tr
     WHERE NOT tr.is_owner_role AND NOT tr.is_base_role
       AND (public.is_tenant_owner(tr.tenant_id) OR public.has_permission(tr.tenant_id, 'manage_tenant_users'))
   )
   ```
5. `tenant_roles_delete` dan policy SELECT **tidak diubah**.
6. Blok `-- ROLLBACK:` berisi `ALTER POLICY` kembali ke ekspresi lama di atas, plus `GRANT UPDATE ON public.tenant_roles TO authenticated;`.

## SEC-4.2 — Test `supabase/tests/builtin_roles_matrix.sql`
Gaya `tenant_invites_matrix.sql`: satu blok `DO`, data uji lewat insert `auth.users` + `tenants` (trigger membuat 2 role + izin Admin), ganti peran dengan `set_config('role','authenticated',true)` + `request.jwt.claim.sub`. Akhiri dengan `RAISE EXCEPTION 'SEC-4 PASSED'` agar semua di-rollback.

**Hindari kata `DELETE` di file test** (konektor Claude akan memblokir). Cabang DELETE pada `tenant_role_permissions_modify` memakai ekspresi USING yang sama dengan UPDATE, jadi cukup diuji lewat UPDATE.

Setup (sebagai postgres):
- user `owner` + tenant;
- role kustom "Pengelola" dengan izin `manage_tenant_users`;
- user `manager` menjadi member `approved` dengan role "Pengelola";
- user `warga` menjadi member `approved` dengan role "Warga/Anggota".

Kasus:

| ID | Sebagai | Aksi | Harapan |
|---|---|---|---|
| T1 | manager | `UPDATE tenant_roles SET name='X'` pada role Admin | 0 baris (`GET DIAGNOSTICS ... ROW_COUNT`) |
| T2 | manager | `INSERT tenant_role_permissions` (role Warga/Anggota, `manage_billing_cash`) | error 42501 |
| T3 | manager | `UPDATE tenant_role_permissions SET permission_key='view_reports'` pada baris milik role Admin | 0 baris |
| T4 | manager | `INSERT tenant_roles` dengan `is_base_role = true`, lalu dengan `is_owner_role = true` | error 42501 (keduanya) |
| T5 | manager | `UPDATE tenant_roles SET is_owner_role = true` pada role "Pengelola" | error 42501 (hak kolom) |
| T6 | manager | buat role kustom baru → tambah izin `view_reports` → ganti nama | berhasil |
| T7 | owner | ulangi T1 dan T2 | 0 baris / 42501 (keputusan sementara) |
| T8 | warga | `has_permission(tenant, 'manage_billing_cash')` setelah T2 gagal | `false` |
| T9 | user baru (authenticated) | insert tenant baru | tenant itu punya 2 role bawaan dan role Admin punya 10 izin (jalur trigger tidak terganggu) |

## Definition of Done
- `SEC-4-report.md` dengan hash commit benar dan diff migration lengkap ditempel (AGENT.md §8.3).
- Tidak ada `DROP` di migration; tidak ada `DELETE` di file test.
- `npx vitest run`, `npm run build`, dan `npm run lint` tetap hijau (tidak ada perubahan frontend).
- Claude menerapkan migration ke dev, menjalankan `builtin_roles_matrix.sql`, dan mengecek advisor.
