# SEC-3 Report — Rahasiakan Kode Undangan, Catat Perubahan Rekening, Kunci Aktivasi Pembayaran

| Task | Commit | Status | Catatan |
|---|---|---|---|
| SEC-3.1 | b4cd33f | done | `202610110001_tenant_invites.sql`: Tabel privat `tenant_invites` dengan unique index case-insensitive `upper(code)`, RLS hanya untuk platform admin, tenant owner, atau permission `manage_members` (tidak ada akses anon). Data lama di-backfill dari `tenants.settings`, kunci `invite_code` dihapus via operator jsonb `-`. Trigger pengaman BEFORE UPDATE dan AFTER INSERT pada `tenants` mencegah penulisan `invite_code` kembali ke kolom `settings`. RPC publik `get_invite_details(p_code)` diperbarui mencari ke `tenant_invites` dengan format return identik. |
| SEC-3.2 | d5b8939 | done | Frontend kode undangan: `client/src/services/tenantOperationalService.js` menambahkan `fetchTenantInviteCode(tenantId)` dan `saveTenantInviteCode(tenantId, code)` dengan dukungan mode demo & produksi. `StaffDashboard.jsx` dan `TenantDashboardPlaceholder.jsx` mengambil kode via `fetchTenantInviteCode` dan menyembunyikan blok bila `null`. 4 onboarding wizards (`SetupWizard`, `KosSetupWizard`, `ArisanSetupWizard`, `KelasSetupWizard`) menyimpan kode via `saveTenantInviteCode` tanpa menyentuh `settingsPayload`. Mock data kode dipisahkan ke `mockTenantInviteCodes`. |
| SEC-3.3 | 6fb42d3 | done | `202610110002_tenant_settings_audit.sql`: Tabel `tenant_settings_audit` dengan RLS SELECT hanya untuk platform admin dan tenant owner. Trigger SECURITY DEFINER `AFTER UPDATE ON tenants` mencatat perubahan bila `OLD.settings->'bank_account' IS DISTINCT FROM NEW.settings->'bank_account'`. Frontend `Settings.jsx` menampilkan kartu riwayat perubahan rekening (5 terakhir dengan nama pengubah dari `tenant_members`, format tanggal lokal, dan nilai lama → baru) khusus untuk pemilik tenant. |
| SEC-3.4 | 3c39456 | done | Kunci baris dengan `FOR UPDATE`: `202610110003_lock_payment_activation.sql` memperbarui `activate_listing_payment` dengan `SELECT * INTO v_payment FROM public.listing_payments WHERE id = p_payment_id FOR UPDATE;`. File `202610110004_lock_subscription_activation.sql` memperbarui `activate_tenant_subscription` dengan `SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;` (dipisahkan secara mandiri karena berisi statement DELETE pada tabel blok langganan). |
| SEC-3.5 | 9128e82 | done | Pengujian: `supabase/tests/tenant_invites_matrix.sql` (skenario T1..T8: hak akses SELECT owner vs warga biasa vs anon, RPC get_invite_details untuk anon, trigger jaring pengaman settings, dan isolasi audit log). Unit test Vitest di `client/src/services/tenantOperationalService.test.js` (7 test cases untuk `fetchTenantInviteCode`, `saveTenantInviteCode`, `fetchTenantSettingsAudit`) dan di `client/src/components/dashboard/dashboard.test.jsx` (pengujian blok kode undangan disembunyikan saat `null`). |

## Output Verifikasi
- **vitest:** 36 test files lulus, **634 tests passed** (0 failed).
- **build:** OK (`npm run build` di `client/` berhasil membuat bundle produksi `dist/` dalam 31.03s, Service Worker & PWA manifest generated).
- **lint:** OK (`npm run lint` di `client/` exit code 0).
- **Audit grep invite_code:**
  - `grep -rn "settings?.invite_code\|settings.invite_code\|invite_code:" client/src --include=*.jsx --include=*.js | grep -v test`
  → Hanya tersisa di objek mock data internal fallback, bersih dari form, payload, dan tampilan dashboard operasional.
- **Batasan Sistem Terjaga:**
  - Tidak ada perubahan di `api/n8n.js` atau rute n8n di `dataService.js`.
  - Tidak ada perubahan di `supabase/functions/*`.
  - Tidak menjalankan migrasi langsung ke Supabase production/dev.

## Panduan Migrasi untuk Orchestrator (Claude)
Migrasi baru yang siap diterapkan berurutan ke Supabase dev:
1. `supabase/migrations/202610110001_tenant_invites.sql`
2. `supabase/migrations/202610110002_tenant_settings_audit.sql`
3. `supabase/migrations/202610110003_lock_payment_activation.sql`
4. `supabase/migrations/202610110004_lock_subscription_activation.sql` (diterapkan terpisah via koneksi tanpa blokir DELETE)
5. Eksekusi file pengujian `supabase/tests/tenant_invites_matrix.sql` untuk memverifikasi kelulusan skenario T1–T8.
