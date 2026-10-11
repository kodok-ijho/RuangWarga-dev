# SEC-4 Report — Proteksi Role Bawaan & Izinnya di Level Database

| Task | Commit | Status | Catatan |
|---|---|---|---|
| SEC-4.1 | 22dfbe4 | done | File migrasi `supabase/migrations/202610120001_protect_builtin_roles.sql` dibuat menggunakan `ALTER POLICY` (tanpa kata `DROP`). Melarang INSERT/UPDATE role dengan `is_owner_role` atau `is_base_role`, membatasi hak UPDATE authenticated hanya pada kolom `(name)`, dan memperketat `tenant_role_permissions_modify` agar izin role bawaan tidak dapat dimodifikasi non-platform-admin. Blok ROLLBACK lengkap tanpa kata `DROP`. |
| SEC-4.2 | ea85721 | done | File matriks uji RLS `supabase/tests/builtin_roles_matrix.sql` mencakup seluruh skenario T1–T9 dalam satu blok `DO`. Menguji perlindungan terhadap aksi manager, owner, dan warga biasa via pergantian JWT `set_config`. Sama sekali tidak memuat kata `DELETE`. Diakhiri dengan `RAISE EXCEPTION 'SEC-4 PASSED'` untuk rollback transaksi otomatis. |

---

## 1. Diff Migration SEC-4.1 (AGENT.md §8.3)

```diff
diff --git a/supabase/migrations/202610120001_protect_builtin_roles.sql b/supabase/migrations/202610120001_protect_builtin_roles.sql
new file mode 100644
index 0000000..150f3a1
--- /dev/null
+++ b/supabase/migrations/202610120001_protect_builtin_roles.sql
@@ -0,0 +1,138 @@
+-- Migration: Proteksi Role Bawaan dan Izinnya di Level Database
+-- Task: SEC-4.1 (Ref: docs/handoff/SEC-4.md, DEBT-1-review.md N3)
+-- Date: 2026-10-12
+--
+-- 1. Mengubah policy tenant_roles_insert dan tenant_roles_update agar melarang pembuatan
+--    atau pengubahan role dengan is_owner_role = true atau is_base_role = true oleh non-platform-admin.
+-- 2. Membatasi hak UPDATE tabel tenant_roles ke kolom (name) saja untuk authenticated.
+-- 3. Mengubah policy tenant_role_permissions_modify agar baris izin untuk role bawaan
+--    (is_owner_role = true atau is_base_role = true) tidak dapat dimodifikasi oleh non-platform-admin.
+-- Catatan: Menggunakan ALTER POLICY (bukan menghapus policy) agar kompatibel dengan konektor Claude.
+
+BEGIN;
+
+-- ==============================================================================
+-- 1. PROTEKSI tenant_roles_insert
+-- ==============================================================================
+
+ALTER POLICY "tenant_roles_insert" ON public.tenant_roles
+  WITH CHECK (
+    public.is_platform_admin()
+    OR (
+      NOT is_owner_role
+      AND NOT is_base_role
+      AND (
+        public.is_tenant_owner(tenant_id)
+        OR public.has_permission(tenant_id, 'manage_tenant_users')
+      )
+    )
+  );
+
+-- ==============================================================================
+-- 2. PROTEKSI tenant_roles_update
+-- ==============================================================================
+
+ALTER POLICY "tenant_roles_update" ON public.tenant_roles
+  USING (
+    public.is_platform_admin()
+    OR (
+      NOT is_owner_role
+      AND NOT is_base_role
+      AND (
+        public.is_tenant_owner(tenant_id)
+        OR public.has_permission(tenant_id, 'manage_tenant_users')
+      )
+    )
+  )
+  WITH CHECK (
+    public.is_platform_admin()
+    OR (
+      NOT is_owner_role
+      AND NOT is_base_role
+      AND (
+        public.is_tenant_owner(tenant_id)
+        OR public.has_permission(tenant_id, 'manage_tenant_users')
+      )
+    )
+  );
+
+-- ==============================================================================
+-- 3. BATASI HAK UPDATE PADA KOLOM (name) SAJA
+-- ==============================================================================
+
+REVOKE UPDATE ON public.tenant_roles FROM anon, authenticated;
+GRANT UPDATE (name) ON public.tenant_roles TO authenticated;
+
+-- ==============================================================================
+-- 4. PROTEKSI tenant_role_permissions_modify
+-- ==============================================================================
+
+ALTER POLICY "tenant_role_permissions_modify" ON public.tenant_role_permissions
+  USING (
+    public.is_platform_admin()
+    OR tenant_role_id IN (
+      SELECT tr.id FROM public.tenant_roles tr
+      WHERE NOT tr.is_owner_role
+        AND NOT tr.is_base_role
+        AND (
+          public.is_tenant_owner(tr.tenant_id)
+          OR public.has_permission(tr.tenant_id, 'manage_tenant_users')
+        )
+    )
+  )
+  WITH CHECK (
+    public.is_platform_admin()
+    OR tenant_role_id IN (
+      SELECT tr.id FROM public.tenant_roles tr
+      WHERE NOT tr.is_owner_role
+        AND NOT tr.is_base_role
+        AND (
+          public.is_tenant_owner(tr.tenant_id)
+          OR public.has_permission(tr.tenant_id, 'manage_tenant_users')
+        )
+    )
+  );
+
+COMMIT;
+
+-- ==============================================================================
+-- ROLLBACK:
+-- ==============================================================================
+-- ALTER POLICY "tenant_roles_insert" ON public.tenant_roles
+--   WITH CHECK (
+--     public.is_platform_admin()
+--     OR public.is_tenant_owner(tenant_id)
+--     OR public.has_permission(tenant_id, 'manage_tenant_users'::text)
+--   );
+--
+-- ALTER POLICY "tenant_roles_update" ON public.tenant_roles
+--   USING (
+--     public.is_platform_admin()
+--     OR public.is_tenant_owner(tenant_id)
+--     OR public.has_permission(tenant_id, 'manage_tenant_users'::text)
+--   )
+--   WITH CHECK (
+--     public.is_platform_admin()
+--     OR public.is_tenant_owner(tenant_id)
+--     OR public.has_permission(tenant_id, 'manage_tenant_users'::text)
+--   );
+--
+-- GRANT UPDATE ON public.tenant_roles TO authenticated;
+--
+-- ALTER POLICY "tenant_role_permissions_modify" ON public.tenant_role_permissions
+--   USING (
+--     public.is_platform_admin()
+--     OR tenant_role_id IN (
+--       SELECT tr.id FROM public.tenant_roles tr
+--       WHERE public.is_tenant_owner(tr.tenant_id)
+--          OR public.has_permission(tr.tenant_id, 'manage_tenant_users'::text)
+--     )
+--   )
+--   WITH CHECK (
+--     public.is_platform_admin()
+--     OR tenant_role_id IN (
+--       SELECT tr.id FROM public.tenant_roles tr
+--       WHERE public.is_tenant_owner(tr.tenant_id)
+--          OR public.has_permission(tr.tenant_id, 'manage_tenant_users'::text)
+--     )
+--   );
```

---

## 2. Verifikasi Batasan Kata Terlarang (Banned Words)

Konektor Claude memblokir kata tertentu pada eksekusi DB. Verifikasi kedua file:
- **Cek DROP pada file migration & test:**
  ```bash
  grep -in "drop" supabase/migrations/202610120001_protect_builtin_roles.sql supabase/tests/builtin_roles_matrix.sql
  # Hasil: kosong (exit 1 / 0 match)
  ```
- **Cek DELETE pada file test:**
  ```bash
  grep -in "delete" supabase/tests/builtin_roles_matrix.sql
  # Hasil: kosong (exit 1 / 0 match)
  ```

---

## 3. Hasil Pengujian & Build

- **vitest:** 44 test files lulus, **692 tests passed** (0 failed).
- **build:** OK (`npm run build` berhasil menghasilkan bundle produksi).
- **lint:** OK (`npm run lint` selesai dengan 0 error dan 0 warning).
- **Batasan Terjaga:**
  - Tidak ada perubahan kode frontend (`client/src/`).
  - Tidak ada perubahan pada `api/n8n.js`, `supabase/functions/`, `services/dataService.js`, maupun `legacy-backend/`.
  - Migrasi tidak dijalankan ke database Supabase dev/prod secara langsung oleh Executor (siap diterapkan dan diuji oleh Claude Orchestrator).
