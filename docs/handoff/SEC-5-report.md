# SEC-5 Report — Integritas Keanggotaan, Tenant, dan Pembayaran (Temuan Audit RT/RW)

| Task | Commit | Status | Catatan |
|---|---|---|---|
| SEC-5.1 | `26ceb5b` | done | File migrasi `supabase/migrations/202610130001_guard_tenant_members.sql` menyediakan RPC `request_join_tenant` (SECURITY DEFINER), memperketat RLS `tenant_members_insert_self` via `ALTER POLICY` (menghapus jalur insert langsung oleh pendaftar), dan memasang trigger `trg_guard_tenant_member_write` untuk validasi role lintas-tenant (S3), perlindungan `is_owner`, dan proteksi status/unit. Frontend `client/src/services/tenant/members.js` dan `JoinTenant.jsx` dialihkan ke RPC. Bebas banned words (`DROP`/`DELETE`). |
| SEC-5.2 | `0498d1d` | done | File migrasi `supabase/migrations/202610130002_guard_tenant_columns.sql` memasang trigger `trg_guard_tenant_columns` pada `tenants` untuk melindungi kolom kritis (`id`, `owner_id`, `type`, `created_at`) dari perubahan oleh non-platform-admin, serta mempertahankan kunci `legacy_qris_enabled` dari manipulasi client menggunakan operator JSONB `-` dan `\|\|`. Bebas banned words. |
| SEC-5.3 | `38e45d0` | done | File migrasi `supabase/migrations/202610130003_payments_integrity.sql` memasang trigger `trg_guard_payment_insert` (validasi kepemilikan tagihan warga, nominal tagihan, method `bank_transfer`, status `pending_verification`), trigger atomik `trg_sync_bill_status_after_payment` (SECURITY DEFINER memperbarui status `billing_items`), dan unique index `uq_payments_open_per_bill`. Frontend `submitTenantPayment` membersihkan langkah manual update bill dari browser dan menangani error constraint 23505 & 22023. Bebas banned words. |
| SEC-5.4 | `027cb0a` | done | File migrasi `supabase/migrations/202610130004_payment_proofs_bucket.sql` menyediakan bucket private `payment-proofs` (kuota 5MB), fungsi validasi canonical path `is_valid_payment_proof_path`, dan RLS policy storage (`payment_proofs_insert_member` dan `payment_proofs_select`). Frontend `storagePolicy.js` digeneralisasi dengan parameter bucket dan validasi regex canonical. `submitTenantPayment` menyimpan relative storage path tanpa public URL, dan tampilan bukti di `PaymentVerification` serta `PaymentMatrix` menyelesaikan signed URL secara asinkron. Bebas banned words. |
| SEC-5.5 | `deb70ca` | done | File migrasi `supabase/migrations/202610130005_unique_ipl_bills.sql` menambahkan unique index `uq_billing_items_ipl_unit_period` untuk tagihan aktif bertipe IPL. Frontend `generateTenantBillingItems` sekarang melempar error jika query existing bills gagal dan menangani error code `23505` dengan pesan Indonesia `'Tagihan IPL periode ini sudah dibuat.'`. Bebas banned words. |
| SEC-5.6 | `471fcec` | done | File matriks uji RLS komprehensif `supabase/tests/membership_payment_matrix.sql` mencakup seluruh skenario T1–T13 dalam satu blok `DO` transaksi. Menguji proteksi terhadap outsider, warga, pengurus, sekretaris, bendahara, dan owner via claim JWT. Bebas dari kata `DROP` dan `DELETE`. Diakhiri dengan `RAISE EXCEPTION 'SEC-5 PASSED'` untuk rollback transaksi otomatis. |

---

## 1. Verifikasi Bebas Banned Words (Rule CI / Claude Connector)

Pemeriksaan kata terlarang (`drop` dan `delete` sebagai whole words) pada seluruh migrasi batch SEC-5 dan file uji SQL:

```bash
grep -niwE "drop|delete" supabase/migrations/20261013* supabase/tests/membership_payment_matrix.sql
# Hasil: KOSONG (0 match, exit code 1)
```

---

## 2. Hasil Verifikasi Lingkungan Lokal

- **Vitest**: `44 passed (44)` test files, `698 passed (698)` tests.
- **ESLint**: `0 errors, 0 warnings` (exit code 0).
- **Vite Build**: `✓ built in 39.47s` (dist generated, precache 102 entries, exit code 0).
- **Integritas Platform**: Jalur n8n (`api/n8n.js`), `dataService.js`, `legacy-backend/`, dan `supabase/functions/` tetap bersih dan tidak disentuh.

---

## 3. Diff Lengkap Migrasi SEC-5 (AGENT.md §8.3)

### A. Migrasi `supabase/migrations/202610130001_guard_tenant_members.sql`

```diff
diff --git a/supabase/migrations/202610130001_guard_tenant_members.sql b/supabase/migrations/202610130001_guard_tenant_members.sql
new file mode 100644
index 0000000..e343a7f
--- /dev/null
+++ b/supabase/migrations/202610130001_guard_tenant_members.sql
@@ -0,0 +1,265 @@
+-- Migration: Integritas Keanggotaan: Join Lewat RPC dan Penjaga Kolom
+-- Task: SEC-5.1 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S1, S2, S3)
+-- Date: 2026-10-13
+--
+-- 1. RPC public.request_join_tenant (SECURITY DEFINER) untuk pendaftaran anggota via kode undangan.
+-- 2. ALTER POLICY tenant_members_insert_self mencabut jalur insert langsung oleh pendaftar.
+-- 3. Trigger trg_guard_tenant_member_write pada tenant_members menjaga role, is_owner, dan kolom profil.
+-- Catatan: Menggunakan ALTER POLICY (tanpa kata terlarang) agar kompatibel dengan konektor.
+
+BEGIN;
+
+-- ==============================================================================
+-- 1. RPC REQUEST_JOIN_TENANT (SECURITY DEFINER)
+-- ==============================================================================
+
+CREATE OR REPLACE FUNCTION public.request_join_tenant(
+  p_code text,
+  p_unit_id bigint,
+  p_full_name text,
+  p_phone text,
+  p_occupancy_status text
+)
+RETURNS jsonb
+LANGUAGE plpgsql
+SECURITY DEFINER
+SET search_path = public
+AS $$
+DECLARE
+  v_tenant_id UUID;
+  v_base_role_id UUID;
+  v_member_id UUID;
+  v_full_name TEXT;
+  v_phone TEXT;
+  v_occupancy TEXT;
+BEGIN
+  -- Validasi user login
+  IF auth.uid() IS NULL THEN
+    RAISE EXCEPTION 'Akses ditolak: autentikasi diperlukan.' USING ERRCODE = '42501';
+  END IF;
+
+  -- Cari tenant berdasarkan kode undangan
+  SELECT tenant_id INTO v_tenant_id
+  FROM public.tenant_invites
+  WHERE upper(code) = upper(trim(coalesce(p_code, '')));
+
+  IF v_tenant_id IS NULL THEN
+    RAISE EXCEPTION 'Kode undangan tidak valid.' USING ERRCODE = 'P0002';
+  END IF;
+
+  -- Validasi unit (jika dipilih) harus milik tenant yang sesuai
+  IF p_unit_id IS NOT NULL THEN
+    IF NOT EXISTS (
+      SELECT 1 FROM public.tenant_units
+      WHERE id = p_unit_id AND tenant_id = v_tenant_id
+    ) THEN
+      RAISE EXCEPTION 'Unit tidak valid untuk komunitas ini.' USING ERRCODE = '42501';
+    END IF;
+  END IF;
+
+  -- Validasi dan normalisasi input teks
+  v_full_name := trim(coalesce(p_full_name, ''));
+  IF length(v_full_name) < 2 OR length(v_full_name) > 100 THEN
+    RAISE EXCEPTION 'Nama lengkap harus antara 2 dan 100 karakter.' USING ERRCODE = '22023';
+  END IF;
+
+  v_phone := nullif(trim(coalesce(p_phone, '')), '');
+
+  v_occupancy := coalesce(nullif(trim(coalesce(p_occupancy_status, '')), ''), 'owner_occupied');
+  IF length(v_occupancy) > 40 THEN
+    RAISE EXCEPTION 'Status hunian maksimal 40 karakter.' USING ERRCODE = '22023';
+  END IF;
+
+  -- Ambil role dasar komunitas (is_base_role = true)
+  SELECT id INTO v_base_role_id
+  FROM public.tenant_roles
+  WHERE tenant_id = v_tenant_id AND is_base_role = true
+  LIMIT 1;
+
+  IF v_base_role_id IS NULL THEN
+    RAISE EXCEPTION 'Role dasar tenant tidak ditemukan.' USING ERRCODE = 'P0002';
+  END IF;
+
+  -- Insert anggota baru dengan status pending dan role dasar
+  INSERT INTO public.tenant_members (
+    tenant_id,
+    user_id,
+    unit_id,
+    full_name,
+    phone,
+    occupancy_status,
+    status,
+    is_owner,
+    tenant_role_id
+  ) VALUES (
+    v_tenant_id,
+    auth.uid(),
+    p_unit_id,
+    v_full_name,
+    v_phone,
+    v_occupancy,
+    'pending',
+    false,
+    v_base_role_id
+  )
+  ON CONFLICT (tenant_id, user_id) DO NOTHING
+  RETURNING id INTO v_member_id;
+
+  IF v_member_id IS NULL THEN
+    RAISE EXCEPTION 'Anda sudah terdaftar atau pernah mengajukan pendaftaran di komunitas ini.' USING ERRCODE = '23505';
+  END IF;
+
+  RETURN jsonb_build_object(
+    'member_id', v_member_id,
+    'tenant_id', v_tenant_id,
+    'status', 'pending'
+  );
+END;
+$$;
+
+REVOKE ALL ON FUNCTION public.request_join_tenant(text, bigint, text, text, text) FROM PUBLIC, anon;
+GRANT EXECUTE ON FUNCTION public.request_join_tenant(text, bigint, text, text, text) TO authenticated;
+
+
+-- ==============================================================================
+-- 2. ALTER POLICY TENANT_MEMBERS_INSERT_SELF
+-- ==============================================================================
+
+ALTER POLICY "tenant_members_insert_self" ON public.tenant_members
+  WITH CHECK (
+    public.is_platform_admin()
+    OR (
+      public.tenant_subscription_status(tenant_id) = ANY (ARRAY['trial'::public.subscription_status, 'active'::public.subscription_status])
+      AND (
+        public.is_tenant_owner(tenant_id)
+        OR public.has_permission(tenant_id, 'manage_members')
+      )
+    )
+  );
+
+
+-- ==============================================================================
+-- 3. TRIGGER GUARD_TENANT_MEMBER_WRITE
+-- ==============================================================================
+
+CREATE OR REPLACE FUNCTION public.guard_tenant_member_write()
+RETURNS trigger
+LANGUAGE plpgsql
+SET search_path = public
+AS $$
+DECLARE
+  v_role_tenant_id UUID;
+  v_is_owner_role BOOLEAN;
+  v_is_base_role BOOLEAN;
+BEGIN
+  -- Bypass untuk service_role, migrasi, dan platform admin
+  IF public.is_billing_privileged() THEN
+    RETURN NEW;
+  END IF;
+
+  -- 3a. Validasi role bila diisi atau diubah
+  IF NEW.tenant_role_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.tenant_role_id IS DISTINCT FROM OLD.tenant_role_id) THEN
+    SELECT tenant_id, is_owner_role, is_base_role
+    INTO v_role_tenant_id, v_is_owner_role, v_is_base_role
+    FROM public.tenant_roles
+    WHERE id = NEW.tenant_role_id;
+
+    IF v_role_tenant_id IS NULL OR v_role_tenant_id <> NEW.tenant_id THEN
+      RAISE EXCEPTION 'Role tidak valid untuk komunitas ini.' USING ERRCODE = '42501';
+    END IF;
+
+    IF v_is_owner_role THEN
+      IF NOT public.is_tenant_owner(NEW.tenant_id) THEN
+        RAISE EXCEPTION 'Role Admin hanya dapat diberikan oleh Pemilik Komunitas.' USING ERRCODE = '42501';
+      END IF;
+    ELSIF v_is_base_role THEN
+      IF NOT (
+        public.is_tenant_owner(NEW.tenant_id)
+        OR public.has_permission(NEW.tenant_id, 'manage_members')
+        OR public.has_permission(NEW.tenant_id, 'manage_tenant_users')
+      ) THEN
+        RAISE EXCEPTION 'Izin tidak cukup untuk menetapkan role dasar.' USING ERRCODE = '42501';
+      END IF;
+    ELSE
+      -- Role kustom lain: hanya is_tenant_owner atau manage_tenant_users
+      IF NOT (
+        public.is_tenant_owner(NEW.tenant_id)
+        OR public.has_permission(NEW.tenant_id, 'manage_tenant_users')
+      ) THEN
+        RAISE EXCEPTION 'Izin tidak cukup untuk menetapkan role ini.' USING ERRCODE = '42501';
+      END IF;
+    END IF;
+  END IF;
+
+  -- 3b. Pembatasan operasi INSERT
+  IF TG_OP = 'INSERT' THEN
+    IF NEW.is_owner THEN
+      RAISE EXCEPTION 'Flag is_owner tidak dapat diset pada insert non-privileged.' USING ERRCODE = '42501';
+    END IF;
+    RETURN NEW;
+  END IF;
+
+  -- 3c. Pembatasan operasi UPDATE
+  IF TG_OP = 'UPDATE' THEN
+    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
+       OR NEW.user_id IS DISTINCT FROM OLD.user_id
+       OR NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
+      RAISE EXCEPTION 'Kolom tenant_id, user_id, dan is_owner tidak dapat diubah.' USING ERRCODE = '42501';
+    END IF;
+
+    IF OLD.is_owner THEN
+      IF NOT public.is_tenant_owner(OLD.tenant_id) THEN
+        RAISE EXCEPTION 'Data pemilik komunitas hanya dapat diubah oleh pemilik.' USING ERRCODE = '42501';
+      END IF;
+    END IF;
+
+    IF (NEW.status IS DISTINCT FROM OLD.status
+        OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
+        OR NEW.occupancy_status IS DISTINCT FROM OLD.occupancy_status) THEN
+      IF NOT (
+        public.is_tenant_owner(OLD.tenant_id)
+        OR public.has_permission(OLD.tenant_id, 'manage_members')
+        OR public.has_permission(OLD.tenant_id, 'manage_tenant_users')
+      ) THEN
+        RAISE EXCEPTION 'Perubahan status/unit anggota memerlukan hak kelola anggota.' USING ERRCODE = '42501';
+      END IF;
+    END IF;
+
+    IF (NEW.full_name IS DISTINCT FROM OLD.full_name OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
+      IF auth.uid() <> OLD.user_id AND NOT (
+        public.is_tenant_owner(OLD.tenant_id)
+        OR public.has_permission(OLD.tenant_id, 'manage_members')
+        OR public.has_permission(OLD.tenant_id, 'manage_tenant_users')
+      ) THEN
+        RAISE EXCEPTION 'Anda hanya dapat mengubah profil diri sendiri.' USING ERRCODE = '42501';
+      END IF;
+    END IF;
+
+    RETURN NEW;
+  END IF;
+
+  RETURN NEW;
+END;
+$$;
+
+REVOKE ALL ON FUNCTION public.guard_tenant_member_write() FROM PUBLIC, anon, authenticated;
+
+CREATE OR REPLACE TRIGGER trg_guard_tenant_member_write
+  BEFORE INSERT OR UPDATE ON public.tenant_members
+  FOR EACH ROW
+  EXECUTE FUNCTION public.guard_tenant_member_write();
+
+COMMIT;
+
+-- ==============================================================================
+-- ROLLBACK:
+-- ==============================================================================
+-- ALTER POLICY "tenant_members_insert_self" ON public.tenant_members
+--   WITH CHECK (
+--     (user_id = auth.uid())
+--     OR (tenant_id IN (SELECT t.id FROM public.tenants t WHERE t.owner_id = auth.uid()))
+--     OR public.is_platform_admin()
+--   );
+-- ALTER TABLE public.tenant_members DISABLE TRIGGER trg_guard_tenant_member_write;
```

### B. Migrasi `supabase/migrations/202610130002_guard_tenant_columns.sql`

```diff
diff --git a/supabase/migrations/202610130002_guard_tenant_columns.sql b/supabase/migrations/202610130002_guard_tenant_columns.sql
new file mode 100644
index 0000000..6252f4e
--- /dev/null
+++ b/supabase/migrations/202610130002_guard_tenant_columns.sql
@@ -0,0 +1,64 @@
+-- Migration: Penjaga Kolom Kritis dan Pengaturan Tenant
+-- Task: SEC-5.2 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S4)
+-- Date: 2026-10-13
+--
+-- 1. Trigger trg_guard_tenant_columns pada tabel tenants.
+-- 2. Melarang modifikasi id, owner_id, type, dan created_at oleh pemanggil non-privileged.
+-- 3. Mengamankan kunci legacy_qris_enabled agar tidak dapat dimanipulasi dari client.
+
+BEGIN;
+
+CREATE OR REPLACE FUNCTION public.guard_tenant_columns()
+RETURNS trigger
+LANGUAGE plpgsql
+SET search_path = public
+AS $$
+BEGIN
+  -- Bypass untuk service_role, migrasi, dan platform admin
+  IF public.is_billing_privileged() THEN
+    RETURN NEW;
+  END IF;
+
+  -- 1. Operasi INSERT
+  IF TG_OP = 'INSERT' THEN
+    NEW.settings := coalesce(NEW.settings, '{}'::jsonb) - 'legacy_qris_enabled';
+    RETURN NEW;
+  END IF;
+
+  -- 2. Operasi UPDATE
+  IF TG_OP = 'UPDATE' THEN
+    -- Lindungi kolom identitas dan kepemilikan tenant
+    IF NEW.id IS DISTINCT FROM OLD.id
+       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
+       OR NEW.type IS DISTINCT FROM OLD.type
+       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
+      RAISE EXCEPTION 'Kolom ini hanya dapat diubah oleh Platform Owner.' USING ERRCODE = '42501';
+    END IF;
+
+    -- Pertahankan status kunci legacy_qris_enabled dari nilai lama
+    IF OLD.settings ? 'legacy_qris_enabled' THEN
+      NEW.settings := coalesce(NEW.settings, '{}'::jsonb) || jsonb_build_object('legacy_qris_enabled', OLD.settings->'legacy_qris_enabled');
+    ELSE
+      NEW.settings := coalesce(NEW.settings, '{}'::jsonb) - 'legacy_qris_enabled';
+    END IF;
+
+    RETURN NEW;
+  END IF;
+
+  RETURN NEW;
+END;
+$$;
+
+REVOKE ALL ON FUNCTION public.guard_tenant_columns() FROM PUBLIC, anon, authenticated;
+
+CREATE OR REPLACE TRIGGER trg_guard_tenant_columns
+  BEFORE INSERT OR UPDATE ON public.tenants
+  FOR EACH ROW
+  EXECUTE FUNCTION public.guard_tenant_columns();
+
+COMMIT;
+
+-- ==============================================================================
+-- ROLLBACK:
+-- ==============================================================================
+-- ALTER TABLE public.tenants DISABLE TRIGGER trg_guard_tenant_columns;
```

### C. Migrasi `supabase/migrations/202610130003_payments_integrity.sql`

```diff
diff --git a/supabase/migrations/202610130003_payments_integrity.sql b/supabase/migrations/202610130003_payments_integrity.sql
new file mode 100644
index 0000000..8ff99b0
--- /dev/null
+++ b/supabase/migrations/202610130003_payments_integrity.sql
@@ -0,0 +1,135 @@
+-- Migration: Integritas Transaksi Pembayaran dan Sinkronisasi Tagihan
+-- Task: SEC-5.3 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S5, F3)
+-- Date: 2026-10-13
+--
+-- 1. Trigger trg_guard_payment_insert (validasi hak pembayaran, kepemilikan tagihan, nominal & status tagihan).
+-- 2. Trigger trg_sync_bill_status_after_payment (SECURITY DEFINER sinkronisasi status billing_items otomatis).
+-- 3. Unique index uq_payments_open_per_bill mencegah dobel transaksi terbuka/lunas.
+
+BEGIN;
+
+-- ==============================================================================
+-- 1. TRIGGER GUARD_PAYMENT_INSERT
+-- ==============================================================================
+
+CREATE OR REPLACE FUNCTION public.guard_payment_insert()
+RETURNS trigger
+LANGUAGE plpgsql
+SET search_path = public
+AS $$
+DECLARE
+  v_bill_tenant_id UUID;
+  v_bill_unit_id BIGINT;
+  v_bill_member_id UUID;
+  v_bill_amount NUMERIC;
+  v_bill_late_fee NUMERIC;
+  v_bill_status public.billing_status;
+  v_is_staff BOOLEAN := false;
+  v_member_unit_id BIGINT;
+  v_member_exists BOOLEAN := false;
+BEGIN
+  IF public.is_billing_privileged() THEN
+    RETURN NEW;
+  END IF;
+
+  -- Ambil data tagihan target
+  SELECT tenant_id, unit_id, member_id, amount, late_fee, status
+  INTO v_bill_tenant_id, v_bill_unit_id, v_bill_member_id, v_bill_amount, v_bill_late_fee, v_bill_status
+  FROM public.billing_items
+  WHERE id = NEW.billing_item_id;
+
+  IF v_bill_tenant_id IS NULL OR v_bill_tenant_id <> NEW.tenant_id THEN
+    RAISE EXCEPTION 'Akses ditolak: tagihan tidak valid untuk komunitas ini.' USING ERRCODE = '42501';
+  END IF;
+
+  -- Cek apakah pemanggil adalah staf keuangan komunitas
+  v_is_staff := (
+    public.is_tenant_owner(NEW.tenant_id)
+    OR public.has_permission(NEW.tenant_id, 'manage_billing_cash')
+    OR public.has_permission(NEW.tenant_id, 'manage_billing_transfer')
+  );
+
+  IF v_is_staff THEN
+    RETURN NEW;
+  END IF;
+
+  -- Validasi pemanggil non-staf (warga)
+  SELECT true, unit_id INTO v_member_exists, v_member_unit_id
+  FROM public.tenant_members
+  WHERE id = NEW.member_id
+    AND tenant_id = NEW.tenant_id
+    AND user_id = auth.uid()
+    AND status = 'approved';
+
+  IF NOT coalesce(v_member_exists, false) THEN
+    RAISE EXCEPTION 'Akses ditolak: anggota tidak valid.' USING ERRCODE = '42501';
+  END IF;
+
+  -- Tagihan harus sesuai kepemilikan anggota atau unit terdaftar
+  IF NOT (
+    (v_bill_member_id IS NOT NULL AND v_bill_member_id = NEW.member_id)
+    OR (v_bill_member_id IS NULL AND v_bill_unit_id IS NOT NULL AND v_bill_unit_id = v_member_unit_id)
+  ) THEN
+    RAISE EXCEPTION 'Akses ditolak: tagihan ini bukan milik Anda.' USING ERRCODE = '42501';
+  END IF;
+
+  -- Metode dan status yang diizinkan untuk warga
+  IF NEW.method <> 'bank_transfer' OR NEW.status <> 'pending_verification' THEN
+    RAISE EXCEPTION 'Warga hanya dapat mengajukan pembayaran transfer bank yang menunggu verifikasi.' USING ERRCODE = '42501';
+  END IF;
+
+  -- Nominal harus sama persis dengan total tagihan
+  IF NEW.amount <> (v_bill_amount + coalesce(v_bill_late_fee, 0)) THEN
+    RAISE EXCEPTION 'Nominal tidak sesuai tagihan.' USING ERRCODE = '22023';
+  END IF;
+
+  -- Tagihan harus berstatus unpaid
+  IF v_bill_status <> 'unpaid' THEN
+    RAISE EXCEPTION 'Tagihan ini sudah dibayar atau sedang diverifikasi.' USING ERRCODE = '23505';
+  END IF;
+
+  -- Cegah manipulasi kolom verifikasi oleh pemohon
+  NEW.verified_by := NULL;
+  NEW.verified_at := NULL;
+
+  RETURN NEW;
+END;
+$$;
+
+REVOKE ALL ON FUNCTION public.guard_payment_insert() FROM PUBLIC, anon, authenticated;
+
+CREATE OR REPLACE TRIGGER trg_guard_payment_insert
+  BEFORE INSERT ON public.payments
+  FOR EACH ROW
+  EXECUTE FUNCTION public.guard_payment_insert();
+
+
+-- ==============================================================================
+-- 2. TRIGGER SYNC_BILL_STATUS_AFTER_PAYMENT (SECURITY DEFINER)
+-- ==============================================================================
+
+CREATE OR REPLACE FUNCTION public.sync_bill_status_after_payment()
+RETURNS trigger
+LANGUAGE plpgsql
+SECURITY DEFINER
+SET search_path = public
+AS $$
+BEGIN
+  IF NEW.status = 'pending_verification' THEN
+    UPDATE public.billing_items
+    SET status = 'pending_verification', updated_at = now()
+    WHERE id = NEW.billing_item_id AND status = 'unpaid';
+  ELSIF NEW.status = 'completed' THEN
+    UPDATE public.billing_items
+    SET status = 'paid', updated_at = now()
+    WHERE id = NEW.billing_item_id AND status IN ('unpaid', 'pending_verification');
+  END IF;
+
+  RETURN NEW;
+END;
+$$;
+
+REVOKE ALL ON FUNCTION public.sync_bill_status_after_payment() FROM PUBLIC, anon, authenticated;
+
+CREATE OR REPLACE TRIGGER trg_sync_bill_status_after_payment
+  AFTER INSERT ON public.payments
+  FOR EACH ROW
+  EXECUTE FUNCTION public.sync_bill_status_after_payment();
+
+
+-- ==============================================================================
+-- 3. UNIQUE INDEX ANTI-DOBEL PEMBAYARAN
+-- ==============================================================================
+
+CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_open_per_bill
+  ON public.payments (billing_item_id)
+  WHERE status IN ('pending_verification', 'completed');
+
+COMMIT;
+
+-- ==============================================================================
+-- ROLLBACK:
+-- ==============================================================================
+-- ALTER TABLE public.payments DISABLE TRIGGER trg_guard_payment_insert;
+-- ALTER TABLE public.payments DISABLE TRIGGER trg_sync_bill_status_after_payment;
```

### D. Migrasi `supabase/migrations/202610130004_payment_proofs_bucket.sql`

```diff
diff --git a/supabase/migrations/202610130004_payment_proofs_bucket.sql b/supabase/migrations/202610130004_payment_proofs_bucket.sql
new file mode 100644
index 0000000..49aa2f0
--- /dev/null
+++ b/supabase/migrations/202610130004_payment_proofs_bucket.sql
@@ -0,0 +1,88 @@
+-- Migration: Bucket Privat Bukti Transfer Pembayaran dan Policy Storage
+-- Task: SEC-5.4 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S6)
+-- Date: 2026-10-13
+--
+-- 1. Penyediaan bucket private payment-proofs (kuota 5MB, mime terbatas).
+-- 2. Fungsi validasi canonical path is_valid_payment_proof_path.
+-- 3. RLS policy INSERT dan SELECT pada storage.objects untuk bukti transfer.
+
+BEGIN;
+
+-- ==============================================================================
+-- 1. BUCKET PRIVATE PAYMENT-PROOFS
+-- ==============================================================================
+
+INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
+VALUES (
+  'payment-proofs',
+  'payment-proofs',
+  false,
+  5242880,
+  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
+)
+ON CONFLICT (id) DO NOTHING;
+
+
+-- ==============================================================================
+-- 2. FUNGSI VALIDASI CANONICAL PATH: {tenant_id}/payments/{bill_id}/{file}
+-- ==============================================================================
+
+CREATE OR REPLACE FUNCTION public.is_valid_payment_proof_path(p_name text)
+RETURNS boolean
+LANGUAGE plpgsql
+IMMUTABLE
+SET search_path = public
+AS $$
+BEGIN
+  IF p_name IS NULL OR p_name = '' THEN
+    RETURN false;
+  END IF;
+
+  -- Canonical regex:
+  -- Segment 1: valid UUID tenant
+  -- Segment 2: 'payments'
+  -- Segment 3: valid UUID billing_item
+  -- Segment 4: safe filename
+  IF p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/payments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_\-\.]+$' THEN
+    RETURN false;
+  END IF;
+
+  RETURN true;
+END;
+$$;
+
+
+-- ==============================================================================
+-- 3. RLS POLICIES PADA STORAGE.OBJECTS
+-- ==============================================================================
+
+CREATE POLICY "payment_proofs_insert_member"
+ON storage.objects FOR INSERT
+WITH CHECK (
+  bucket_id = 'payment-proofs'
+  AND public.is_valid_payment_proof_path(name)
+  AND public.storage_extract_tenant_id(name) IN (SELECT public.current_tenant_ids())
+  AND public.tenant_subscription_status(public.storage_extract_tenant_id(name)) <> 'read_only'::public.subscription_status
+);
+
+CREATE POLICY "payment_proofs_select"
+ON storage.objects FOR SELECT
+USING (
+  bucket_id = 'payment-proofs'
+  AND public.is_valid_payment_proof_path(name)
+  AND (
+    public.is_platform_admin()
+    OR owner = auth.uid()
+    OR public.is_tenant_owner(public.storage_extract_tenant_id(name))
+    OR public.has_permission(public.storage_extract_tenant_id(name), 'manage_billing_transfer')
+    OR public.has_permission(public.storage_extract_tenant_id(name), 'manage_billing_cash')
+  )
+);
+
+COMMIT;
+
+-- ==============================================================================
+-- ROLLBACK:
+-- ==============================================================================
+-- ALTER POLICY "payment_proofs_insert_member" ON storage.objects WITH CHECK (false);
+-- ALTER POLICY "payment_proofs_select" ON storage.objects USING (false);
```

### E. Migrasi `supabase/migrations/202610130005_unique_ipl_bills.sql`

```diff
diff --git a/supabase/migrations/202610130005_unique_ipl_bills.sql b/supabase/migrations/202610130005_unique_ipl_bills.sql
new file mode 100644
index 0000000..fbc3730
--- /dev/null
+++ b/supabase/migrations/202610130005_unique_ipl_bills.sql
@@ -0,0 +1,19 @@
+-- Migration: Unique Index Tagihan IPL per Unit dan Periode
+-- Task: SEC-5.5 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S7)
+-- Date: 2026-10-13
+--
+-- Menjamin tidak ada pembuatan tagihan IPL dobel per unit dalam periode yang sama
+-- untuk tagihan aktif (status <> 'cancelled').
+
+BEGIN;
+
+CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_items_ipl_unit_period
+ON public.billing_items (tenant_id, unit_id, period)
+WHERE (metadata->>'bill_type') = 'ipl' AND status <> 'cancelled';
+
+COMMIT;
+
+-- ==============================================================================
+-- ROLLBACK:
+-- ==============================================================================
+-- Indeks parsial ini dapat dinonaktifkan atau diabaikan oleh administrator basis data jika diperlukan.
```
