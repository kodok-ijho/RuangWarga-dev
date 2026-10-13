# SEC-3 — Rahasiakan kode undangan, catat perubahan rekening, kunci aktivasi pembayaran

Baca `docs/handoff/README.md`, AGENT.md, `PAY-2-review.md` (F12) dan `PAY-1F-review.md` dulu.
Branch: `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit. 🚫 n8n & `api/n8n.js` tetap tidak boleh disentuh.
Akun DOKU platform masih dalam pengajuan — batch ini **tidak** menyentuh Edge Function pembayaran.

**Wajib:** cocokkan setiap nama kolom/nilai enum dengan skema aktual (migration terakhir tiap tabel). Fakta yang sudah dicek Claude di dev:
- `tenants`: `id, name, type, owner_id, address, contact_phone, created_at, updated_at, settings (jsonb)`. Trigger insert `handle_new_tenant` otomatis membuat subscription trial, 2 role, dan member owner (`is_owner = true`).
- `tenant_members`: `id, tenant_id, user_id, unit_id, full_name, phone, status, occupancy_status, created_at, updated_at, tenant_role_id, is_owner` (tanpa `role`/`email`).
- `listing_type` enum: `room_vacancy, umkm`. `subscription_periods` **tidak** punya kolom `name`.
- Helper: `is_tenant_owner(uuid)`, `has_permission(uuid, text)` (key `manage_members`, `manage_settings`, ...), `is_platform_admin()`, `current_tenant_ids()`.
- `get_invite_details(p_code)` (anon) sekarang mencari `upper(settings->>'invite_code')`.
- Pemakai `settings.invite_code` di frontend: `components/dashboard/StaffDashboard.jsx` (±46, 376-381), `pages/tenant/TenantDashboardPlaceholder.jsx` (±158-170), dan 4 wizard onboarding (`SetupWizard.jsx` ±252, `KosSetupWizard.jsx` ±305, `ArisanSetupWizard.jsx` ±290, `KelasSetupWizard.jsx` ±314).

Catatan penerapan: konektor Supabase Claude memblokir SQL yang mengandung kata `DROP`/`DELETE`. Hindari keduanya bila ada cara setara (`CREATE OR REPLACE`, `ALTER POLICY`, operator jsonb `-`). Bila tidak bisa dihindari, taruh di file migration terpisah yang kecil.

---

## SEC-3.1 — Pindahkan `invite_code` ke tabel privat (F12)  ⚠️ sensitif (migration + RLS)
File baru `supabase/migrations/202610110001_tenant_invites.sql`:
1. Tabel `public.tenant_invites`: `tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE`, `code text NOT NULL`, `created_at`, `updated_at` (default `now()`).
   Unique index case-insensitive: `CREATE UNIQUE INDEX ... ON tenant_invites (upper(code))`.
2. `ENABLE ROW LEVEL SECURITY`. Policy SELECT, INSERT, UPDATE: `is_platform_admin() OR is_tenant_owner(tenant_id) OR has_permission(tenant_id,'manage_members')`. Tidak ada policy untuk anon.
3. Backfill: `INSERT ... SELECT id, settings->>'invite_code' FROM tenants WHERE coalesce(settings->>'invite_code','') <> '' ON CONFLICT DO NOTHING`.
4. Hapus kunci dari settings: `UPDATE tenants SET settings = settings - 'invite_code' WHERE settings ? 'invite_code'`.
5. Jaring pengaman: trigger `BEFORE INSERT OR UPDATE ON tenants` (fungsi `SECURITY DEFINER`, `SET search_path = public`) — bila `NEW.settings ? 'invite_code'`, upsert nilainya ke `tenant_invites` lalu `NEW.settings := NEW.settings - 'invite_code'`.
   Untuk INSERT, upsert dilakukan di trigger **AFTER INSERT** (baris tenant belum ada saat BEFORE) — pisahkan jadi dua trigger bila perlu. REVOKE fungsi trigger dari `PUBLIC, anon, authenticated`.
6. `CREATE OR REPLACE FUNCTION get_invite_details(p_code text)`: cari lewat `tenant_invites` (join `tenants`), isi kembalian **sama persis** dengan sekarang. Grant tetap `anon, authenticated`.
7. Blok `-- ROLLBACK:`.

## SEC-3.2 — Frontend kode undangan
- `services/tenantOperationalService.js`: `fetchTenantInviteCode(tenantId)` (select `code` dari `tenant_invites`, kembalikan `null` bila tidak ada baris / tidak berhak) dan `saveTenantInviteCode(tenantId, code)` (upsert). Mode demo: pakai data mock.
- `StaffDashboard.jsx` & `TenantDashboardPlaceholder.jsx`: ambil kode lewat `fetchTenantInviteCode`; jangan baca `settings.invite_code` lagi. Bila `null`, sembunyikan blok kode undangan.
- 4 wizard onboarding: setelah tenant dibuat, simpan kode lewat `saveTenantInviteCode`; berhenti menulis `invite_code` ke `settings`.
- Data mock: pindahkan `invite_code` ke struktur mock yang dipakai `fetchTenantInviteCode`.
- `grep -rn "settings?.invite_code\|settings.invite_code\|invite_code:" client/src --include=*.jsx --include=*.js | grep -v test` → hanya tersisa di data mock.

## SEC-3.3 — Riwayat perubahan rekening tenant
File baru `supabase/migrations/202610110002_tenant_settings_audit.sql`:
- Tabel `public.tenant_settings_audit`: `id uuid pk default gen_random_uuid()`, `tenant_id uuid not null references tenants(id) on delete cascade`, `changed_by uuid` (isi `auth.uid()`), `field text not null`, `old_value jsonb`, `new_value jsonb`, `changed_at timestamptz default now()`.
- RLS aktif; **hanya** policy SELECT untuk `is_platform_admin() OR is_tenant_owner(tenant_id)`. Tidak ada policy INSERT/UPDATE/DELETE untuk klien.
- Trigger `AFTER UPDATE ON tenants` (fungsi `SECURITY DEFINER`): bila `OLD.settings->'bank_account' IS DISTINCT FROM NEW.settings->'bank_account'`, insert baris `field = 'bank_account'`. REVOKE fungsi dari `PUBLIC, anon, authenticated`.
- Frontend `pages/Settings.jsx`, kartu "Rekening Penerima Pembayaran": untuk owner tenant tampilkan "Riwayat perubahan" (5 terakhir: waktu, nama pengubah bila bisa dicari dari `tenant_members` tenant itu, nilai lama → baru). Bukan owner: tidak ditampilkan. Ikuti gaya `.pv-*`.

## SEC-3.4 — Kunci baris saat aktivasi pembayaran (catatan PAY-1F)
File baru `supabase/migrations/202610110003_lock_payment_activation.sql`:
`CREATE OR REPLACE` `activate_tenant_subscription` dan `activate_listing_payment` — **salin isi persis** dari migration terakhir masing-masing
(`202610100003_align_subscription_payments.sql` dan `202610100002_listing_pay_first.sql`), satu-satunya perubahan: `SELECT * INTO v_payment FROM ... WHERE id = p_payment_id FOR UPDATE;`.
Pertahankan `REVOKE ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`.
⚠️ Fungsi langganan berisi `DELETE` — taruh fungsi itu di file migration sendiri (`202610110004_lock_subscription_activation.sql`) supaya bagian lain bisa diterapkan Claude.

## SEC-3.5 — Test
- SQL: file baru `supabase/tests/tenant_invites_matrix.sql` (gaya `billing_columns_matrix.sql`: satu blok `DO`, data uji dibuat lewat insert `auth.users` + `tenants`, akhir `ROLLBACK`):
  - owner bisa SELECT `tenant_invites` tenant-nya; warga biasa (member `approved` dengan role dasar "Warga/Anggota", bukan owner) **0 baris**; anon 0 baris;
  - `get_invite_details('<kode>')` sebagai anon → `found = true`;
  - update `tenants.settings` dengan `invite_code` → kunci hilang dari settings dan kode ada di `tenant_invites`;
  - ubah `settings.bank_account` → 1 baris di `tenant_settings_audit`; warga biasa 0 baris saat SELECT audit.
- Vitest: `fetchTenantInviteCode` / `saveTenantInviteCode` (mock Supabase), render dashboard tanpa kode → blok kode tidak tampil.

---

## Definition of Done
- `SEC-3-report.md` dengan hash commit yang benar (`git log --oneline`).
- vitest, build, lint hijau.
- Tidak ada perubahan di `api/n8n.js`, `dataService.js` jalur n8n, maupun `supabase/functions/*`.
- Claude menerapkan migration ke dev dan menjalankan test SQL setelah review.
