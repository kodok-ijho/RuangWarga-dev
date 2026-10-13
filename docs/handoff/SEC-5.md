# SEC-5 — Integritas keanggotaan, tenant, dan pembayaran (temuan audit RT/RW)

Baca dulu: `docs/handoff/README.md`, AGENT.md, `AUDIT-RTRW.md` (S1–S7).
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit.

⚠️ Batch sensitif (migration, RLS, storage). Aturannya:
- Tulis file saja, **jangan** menjalankan apa pun ke Supabase. Claude yang menerapkan ke dev, menjalankan test SQL, dan mengecek advisor.
- Tempel diff migration lengkap di laporan (AGENT.md §8.3).
- 🚫 Jangan sentuh n8n, `api/n8n.js`, `dataService.js`, `legacy-backend/`, Edge Function.
- **Jangan menulis kata `DROP` atau `DELETE`** di migration maupun test (konektor Claude memblokirnya). Untuk menghapus kunci JSON pakai operator `-`; untuk policy pakai `ALTER POLICY`.

## Fakta skema dev (sudah dicek Claude — pakai persis)
- **`tenant_members`**:
  - kolom: `id, tenant_id, user_id, unit_id (bigint), full_name, phone, status ('pending'|'approved'|'rejected'), occupancy_status (text), created_at, updated_at, tenant_role_id, is_owner`;
  - unique `(tenant_id, user_id)`.
- **`tenant_roles`**: `id, tenant_id, name, is_owner_role, is_base_role, created_at`.
- **`billing_items`**:
  - kolom: `id, tenant_id, unit_id, member_id, period, amount, late_fee, due_date, status ('unpaid'|'pending_verification'|'paid'|'cancelled'), qris_ref, contract_start, contract_end, metadata, …`;
  - tagihan IPL ber-`metadata->>'bill_type' = 'ipl'`.
- **`payments`**: `id, tenant_id, billing_item_id, member_id, amount, method ('qris'|'bank_transfer'|'cash'), transaction_id, status ('pending'|'pending_verification'|'completed'|'rejected'), proof_url, verified_by, verified_at, paid_at, metadata, …`.
- **`tenants`**:
  - kolom: `id, name, type, owner_id, address, contact_phone, created_at, updated_at, settings`;
  - trigger BEFORE UPDATE yang sudah ada: `trg_sync_tenant_invite_code_before_update`, `trg_tenants_updated`.
- **Helper yang tersedia**:
  - `is_billing_privileged()` → true untuk `service_role`, `current_user IN ('postgres','supabase_admin')` (yaitu di dalam fungsi `SECURITY DEFINER`), atau platform admin. **Pakai ini sebagai pintu bypass** di semua trigger penjaga, supaya `handle_new_tenant`, RPC definer, dan n8n (service role) tetap jalan.
  - `is_tenant_owner(t)`, `has_permission(t, key)`, `current_tenant_ids()`, `tenant_subscription_status(t)`, `storage_extract_tenant_id(name)` (segmen pertama path = UUID tenant).
- **Storage**:
  - hanya ada bucket `expense-receipts`, dengan path `{tenant_uuid}/expenses/{tahun}/{file}` dan validator `is_valid_expense_receipt_path`;
  - `storage.objects` punya kolom `owner uuid` dan `owner_id text`.
- **Policy tenant_members saat ini** (salin persis ke blok ROLLBACK):
  - `tenant_members_insert_self` (INSERT) WITH CHECK: `((user_id = auth.uid()) OR (tenant_id IN ( SELECT t.id FROM tenants t WHERE (t.owner_id = auth.uid()))) OR is_platform_admin())`.

**Pola fungsi trigger penjaga** (seperti `guard_listing_billing_columns` di SEC-2):
- `LANGUAGE plpgsql`, **bukan** `SECURITY DEFINER` (kecuali disebut lain), `SET search_path = public`;
- baris pertama `IF public.is_billing_privileged() THEN RETURN NEW; END IF;`;
- error memakai `RAISE EXCEPTION '...' USING ERRCODE = '42501'`;
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;`.

---

## SEC-5.1 — Keanggotaan: join lewat RPC + penjaga kolom (S1, S2, S3)
File baru `supabase/migrations/202610130001_guard_tenant_members.sql`:

1. **RPC `public.request_join_tenant(p_code text, p_unit_id bigint, p_full_name text, p_phone text, p_occupancy_status text)` RETURNS jsonb**, `SECURITY DEFINER`, `SET search_path = public`.
   - `auth.uid()` null → error 42501.
   - Cari tenant lewat `tenant_invites` dengan `upper(code) = upper(trim(p_code))`. Tidak ketemu → error `'Kode undangan tidak valid.'` (ERRCODE `P0002`).
   - `p_unit_id` (boleh null) harus milik tenant itu (`tenant_units`), bila tidak → error.
   - `full_name` di-trim, panjang 2–100; `phone` di-trim (boleh null); `occupancy_status` default `'owner_occupied'`, panjang ≤ 40.
   - Ambil role dasar tenant (`is_base_role = true`).
   - Insert: `status = 'pending'`, `is_owner = false`, `tenant_role_id = role dasar`, `user_id = auth.uid()`; pakai `ON CONFLICT (tenant_id, user_id) DO NOTHING`.
   - Bila tidak ada baris yang ter-insert → error `'Anda sudah terdaftar atau pernah mengajukan pendaftaran di komunitas ini.'` (ERRCODE `23505`).
   - Kembalikan `jsonb_build_object('member_id', …, 'tenant_id', …, 'status', 'pending')`.
   - `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`.
2. `ALTER POLICY "tenant_members_insert_self" ON public.tenant_members WITH CHECK (`
   `public.is_platform_admin() OR (tenant_subscription_status(tenant_id) = ANY (ARRAY['trial','active']::subscription_status[]) AND (public.is_tenant_owner(tenant_id) OR public.has_permission(tenant_id, 'manage_members'))))`.
   Jalur "daftar sendiri" hilang dari policy; join hanya lewat RPC.
3. **Fungsi trigger `public.guard_tenant_member_write()`**, dipasang sebagai `BEFORE INSERT OR UPDATE ON public.tenant_members FOR EACH ROW`, nama trigger `trg_guard_tenant_member_write`. Setelah bypass `is_billing_privileged()`:
   - **Validasi role** — berlaku bila `NEW.tenant_role_id IS NOT NULL` dan (INSERT, atau nilainya berubah):
     - `SELECT tenant_id, is_owner_role, is_base_role FROM public.tenant_roles WHERE id = NEW.tenant_role_id` (invoker: pemanggil harus bisa melihat role itu);
     - tidak ketemu atau `tenant_id <> NEW.tenant_id` → 42501 `'Role tidak valid untuk komunitas ini.'` (menutup S3);
     - role `is_owner_role` → hanya `is_tenant_owner(NEW.tenant_id)` → selain itu 42501;
     - role `is_base_role` → boleh oleh `is_tenant_owner`, `manage_members`, atau `manage_tenant_users`;
     - role lain → hanya `is_tenant_owner` atau `manage_tenant_users`.
   - **INSERT**: `NEW.is_owner = true` → 42501.
   - **UPDATE**:
     - `tenant_id`, `user_id`, `is_owner` tidak boleh berubah → 42501;
     - baris dengan `OLD.is_owner = true` hanya boleh diubah oleh `is_tenant_owner(OLD.tenant_id)`;
     - perubahan `status`, `unit_id`, atau `occupancy_status` hanya oleh `is_tenant_owner`, `manage_members`, atau `manage_tenant_users`;
     - warga biasa hanya bisa mengubah `full_name` dan `phone` miliknya sendiri.
4. Blok `-- ROLLBACK:` (`ALTER POLICY` kembali ke ekspresi lama; nonaktifkan trigger dengan `ALTER TABLE ... DISABLE TRIGGER`).

**Frontend**:
- `services/tenant/members.js` `requestJoinTenant`: ganti insert langsung dengan `supabase.rpc('request_join_tenant', {...})`. Parameter fungsi menjadi `{ code, unitId, fullName, phone, occupancyStatus }`. Pertahankan pesan error 23505. Cabang demo tetap.
- `pages/public/JoinTenant.jsx` ±122: kirim kode undangan (`inputCode || paramInviteCode`), bukan `tenantId`/`userId`.
- Perbarui test terkait.

## SEC-5.2 — Penjaga kolom `tenants` (S4)
File baru `supabase/migrations/202610130002_guard_tenant_columns.sql`.

Fungsi trigger `public.guard_tenant_columns()`, `BEFORE INSERT OR UPDATE ON public.tenants`, nama trigger `trg_guard_tenant_columns`. Setelah bypass `is_billing_privileged()`:
- **INSERT**: `NEW.settings := coalesce(NEW.settings, '{}'::jsonb) - 'legacy_qris_enabled'`.
- **UPDATE**:
  - `id`, `owner_id`, `type`, atau `created_at` berubah → 42501 `'Kolom ini hanya dapat diubah oleh Platform Owner.'`;
  - kunci `legacy_qris_enabled` **dipertahankan diam-diam**:
    - bila `OLD.settings ? 'legacy_qris_enabled'` → `NEW.settings := coalesce(NEW.settings,'{}') || jsonb_build_object('legacy_qris_enabled', OLD.settings->'legacy_qris_enabled')`;
    - bila tidak → `NEW.settings := coalesce(NEW.settings,'{}') - 'legacy_qris_enabled'`.
- Blok ROLLBACK.

## SEC-5.3 — Integritas pembayaran (S5, F3)
File baru `supabase/migrations/202610130003_payments_integrity.sql`:

1. **Fungsi trigger `public.guard_payment_insert()`**, `BEFORE INSERT ON public.payments`, nama `trg_guard_payment_insert`. Setelah bypass:
   - Ambil tagihan: `SELECT tenant_id, unit_id, member_id, amount, late_fee, status FROM public.billing_items WHERE id = NEW.billing_item_id`. Tidak ketemu atau `tenant_id <> NEW.tenant_id` → 42501.
   - **Staff** = `is_tenant_owner(NEW.tenant_id) OR has_permission(..,'manage_billing_cash') OR has_permission(..,'manage_billing_transfer')` → `RETURN NEW`.
   - **Non-staff (warga)**:
     - `NEW.member_id` harus baris `tenant_members` dengan `tenant_id = NEW.tenant_id`, `user_id = auth.uid()`, `status = 'approved'`;
     - tagihan harus miliknya: `bill.member_id = NEW.member_id`, **atau** `bill.member_id IS NULL AND bill.unit_id = member.unit_id`;
     - `NEW.method = 'bank_transfer'` dan `NEW.status = 'pending_verification'`, selain itu 42501;
     - `NEW.amount = bill.amount + coalesce(bill.late_fee, 0)`, bila tidak → error `'Nominal tidak sesuai tagihan.'` (ERRCODE `22023`);
     - `bill.status = 'unpaid'`, bila tidak → error `'Tagihan ini sudah dibayar atau sedang diverifikasi.'` (ERRCODE `23505`);
     - paksa `NEW.verified_by := NULL; NEW.verified_at := NULL;`.
2. **Fungsi trigger `public.sync_bill_status_after_payment()`** — `SECURITY DEFINER` (warga tidak punya izin update tagihan), `AFTER INSERT ON public.payments`, nama `trg_sync_bill_status_after_payment`:
   - `status = 'pending_verification'` → `UPDATE billing_items SET status = 'pending_verification' WHERE id = NEW.billing_item_id AND status = 'unpaid'`;
   - `status = 'completed'` → `... SET status = 'paid' WHERE id = ... AND status IN ('unpaid','pending_verification')`;
   - `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
3. Unique index anti-dobel: `CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_open_per_bill ON public.payments (billing_item_id) WHERE status IN ('pending_verification','completed');`.
4. Blok ROLLBACK.

**Frontend**: `services/tenant/payments.js` `submitTenantPayment`:
- hapus langkah 4 (update `billing_items` dari klien) beserta "rollback delete" — sekarang ditangani trigger;
- tangani error `23505` dan `22023` dengan pesan Indonesia yang jelas;
- `verifyTenantPayment` / `rejectTenantPayment` (staff) tidak berubah.

## SEC-5.4 — Bucket privat bukti transfer (S6)
File baru `supabase/migrations/202610130004_payment_proofs_bucket.sql`:
1. `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('payment-proofs','payment-proofs', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','application/pdf']) ON CONFLICT (id) DO NOTHING;`
2. Fungsi `public.is_valid_payment_proof_path(p_name text)`:
   - meniru `is_valid_expense_receipt_path`, `IMMUTABLE`;
   - pola `^{uuid}/payments/{uuid}/[A-Za-z0-9_\-\.]+$`, yaitu `{tenant_id}/payments/{billing_item_id}/{file}`.
3. Policy pada `storage.objects`:
   - `payment_proofs_insert_member` (INSERT): `bucket_id = 'payment-proofs' AND is_valid_payment_proof_path(name) AND storage_extract_tenant_id(name) IN (SELECT current_tenant_ids()) AND tenant_subscription_status(storage_extract_tenant_id(name)) <> 'read_only'`;
   - `payment_proofs_select` (SELECT): `bucket_id = 'payment-proofs' AND is_valid_payment_proof_path(name) AND (is_platform_admin() OR owner = auth.uid() OR is_tenant_owner(storage_extract_tenant_id(name)) OR has_permission(storage_extract_tenant_id(name),'manage_billing_transfer') OR has_permission(storage_extract_tenant_id(name),'manage_billing_cash'))`;
   - tidak ada policy UPDATE/hapus untuk klien.
4. Blok ROLLBACK (`ALTER POLICY ... USING (false)` sudah cukup).

**Frontend**:
- `submitTenantPayment`:
  - path upload `${tenantId}/payments/${billId}/${Date.now()}.${ext}`, `upsert: false`;
  - simpan **path** (bukan URL publik) di `proof_url` dan `metadata.proof_path`;
  - bila metode `bank_transfer` oleh warga dan upload gagal → lempar error `'Bukti transfer gagal diunggah. Coba lagi.'`, jangan membuat pembayaran tanpa bukti;
  - jangan pakai `getPublicUrl`.
- Tampilan bukti di PaymentVerification dan detail PaymentMatrix:
  - bila `proof_url` bukan URL `http(s)` → `supabase.storage.from('payment-proofs').createSignedUrl(path, 300)`;
  - generalisasikan `createReceiptSignedUrl` di `utils/storagePolicy.js` (tambah parameter bucket, default `expense-receipts`) dan test-nya;
  - URL lama `http(s)` ditampilkan apa adanya.

## SEC-5.5 — Tagihan IPL tidak dobel (S7)
File baru `supabase/migrations/202610130005_unique_ipl_bills.sql`:
- `CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_items_ipl_unit_period ON public.billing_items (tenant_id, unit_id, period) WHERE (metadata->>'bill_type') = 'ipl' AND status <> 'cancelled';`

**Frontend** `services/tenant/billing.js` `generateTenantBillingItems`:
- bila query tagihan yang sudah ada (±221) error → **lempar** error, jangan lanjut;
- bila insert gagal `23505` → error `'Tagihan IPL periode ini sudah dibuat.'`.
- Test untuk keduanya.

## SEC-5.6 — Test SQL `supabase/tests/membership_payment_matrix.sql`
Gaya `builtin_roles_matrix.sql` (satu blok `DO`, akhir `RAISE EXCEPTION 'SEC-5 PASSED'`, tanpa kata DELETE/DROP). Pakai `ROW_COUNT` dan `RETURNED_SQLSTATE`.

Setup:
- tenant `rt_rw` milik `owner` (trigger membuat role & member owner);
- role kustom "Bendahara" (`manage_billing_cash`, `manage_billing_transfer`), "Sekretaris" (`manage_settings`), "Pengurus" (`manage_members`);
- member `approved`: `bendahara`, `sekre`, `pengurus`, dan `warga` (role dasar, `unit_id` = unit A1);
- `tenant_invites` berkode `'RW-TEST-SEC5'`;
- 1 tagihan IPL unpaid untuk warga (`amount` 150000, `late_fee` 0, `metadata {"bill_type":"ipl"}`).

| ID | Sebagai | Aksi | Harapan |
|---|---|---|---|
| T1 | `outsider` | insert langsung `tenant_members` (`status='approved'`) | 42501 |
| T2 | `outsider` | `request_join_tenant('rw-test-sec5', NULL, 'Calon Warga', NULL, NULL)` | 1 baris pending dengan role dasar; panggilan ke-2 → 23505; kode salah → P0002 |
| T3 | `warga` | `UPDATE` miliknya: `tenant_role_id` = Admin; `is_owner = true`; `status`; role "Bendahara" | semuanya 42501; `UPDATE full_name` miliknya → 1 baris |
| T4 | `warga` | buat tenant sendiri, lalu pasang role Admin tenant itu di tenant uji (S3) | 42501 |
| T5 | `pengurus` (manage_members) | setujui calon dari T2 (`status='approved'`, role dasar) | 1 baris; pasang role "Bendahara" → 42501 |
| T6 | `owner` | pasang role "Bendahara" ke warga lalu kembalikan ke dasar | berhasil; pasang role Admin oleh owner → berhasil |
| T7 | `sekre` (manage_settings) | ubah `owner_id` / `type` | 42501; ubah `settings` dengan `legacy_qris_enabled: true` + `logo_url` → `logo_url` tersimpan, flag **tidak** ada |
| T8 | `warga` | insert `payments` dengan status `completed` / method `cash` / amount 1 | 42501 / 42501 / 22023 |
| T9 | `warga` | insert `payments` `bank_transfer`, `pending_verification`, amount 150000 | berhasil; tagihan menjadi `pending_verification`; insert ke-2 → 23505 |
| T10 | `bendahara` | insert `cash`, `completed` untuk tagihan lain milik unit lain | berhasil; tagihan menjadi `paid` |
| T11 | `warga` | insert `storage.objects` (`bucket_id='payment-proofs'`, path tenant uji) | berhasil; path tenant lain → 42501; `SELECT` objek milik user lain → 0 baris |
| T12 | `owner` | insert 2 tagihan IPL `(tenant, unit, period)` sama | yang ke-2 → 23505 |
| T13 | user baru | buat tenant baru | member owner `is_owner = true` tetap terbentuk (jalur definer tidak terganggu) |

---

## Definition of Done
- `SEC-5-report.md` dengan hash commit benar dan diff semua migration.
- `npx vitest run`, `npm run build`, dan `npm run lint` hijau.
- Tidak ada `DROP`/`DELETE` di file migration maupun test: `grep -niwE "drop|delete" supabase/migrations/20261013* supabase/tests/membership_payment_matrix.sql` → kosong.
- Tidak ada perubahan di n8n, `api/`, `dataService.js`, `legacy-backend/`, `supabase/functions/`.
