# KOS-1F — Tampilan dashboard penyewa Kos

Dasar: uji user di ruangwarga-dev 2026-10-21, login sebagai penyewa "Toro" (Kos Melati Harmoni) yang sudah disetujui. Masuk langsung ke dashboard penyewa sudah benar (NAV-1). Yang perlu dirapikan ada di tampilan.

Status: ✅ **Disetujui user 2026-10-21**, termasuk KOS-1F.6a (trigger database). Selain 1F.6a, semuanya frontend.

## Temuan
1. **Banner trial tampil untuk penyewa.** `components/TrialCountdownBanner.jsx` menampilkan "Masa percobaan gratis Anda sedang berjalan … Pilih paket kapasitas unit" ke semua anggota. Hanya tombolnya yang dibatasi `isTenantAdmin`. Bagi penyewa, pesan ini membingungkan.
2. **"Kamar Kamar VIP".** Label unit diawali `template.unitLabel` padahal nama kamarnya sudah memuat kata "Kamar". Terjadi di:
   - `components/dashboard/ResidentBillingHero.jsx` ±40, ±95;
   - `components/residents/ResidentDetailDrawer.jsx` ±61;
   - `components/residents/ResidentCard.jsx` ±69.
3. **"Bayar Sewa · Rincian & QRIS".** Teks di `components/dashboard/CitizenDashboard.jsx` ±73 menyebut QRIS, padahal QRIS hanya ada untuk tenant dengan `isLegacyQrisEnabled`.
4. **Jabatan tampil "Warga/Anggota" dan "-".** Role dasar di database bernama "Warga/Anggota" untuk semua jenis tenant.
   - Dashboard (`pages/tenant/TenantDashboard.jsx` ±158-160) menampilkannya apa adanya.
   - Header (`components/tenant/TenantShell.jsx` ±183) memakai `roleLabel(role, …)` dengan `role` lama (n8n) yang kosong, sehingga tampil "-".
5. **Sapaan memakai nama akun Google** ("dyudhiantoro"), bukan nama yang diisi saat mendaftar ("Toro"). Sumbernya `TenantDashboard.jsx` ±83: `profile?.full_name`.
6. **"Hunian Kamar 0 / 3" walaupun Toro sudah menyewa Kamar VIP.** `services/tenant/finance.js` `fetchTenantDashboardData` menghitung unit terisi sebagai `status === 'active'` (mode Supabase ±774, mode demo ±689). Ini logika RT/RW. Kamar kos memakai `vacant`/`occupied`, jadi hasilnya selalu 0, bahkan setelah kontrak aktif.
7. **Persetujuan penyewa tidak mengubah status kamar.** Di dev, Kamar VIP (`id 52`) masih `vacant` walaupun ada 1 anggota `approved` dengan `unit_id = 52`. Kamar baru jadi `occupied` lewat aktivasi kontrak (`assignRoomContract`). Akibatnya:
   - form pendaftaran (`getJoinableUnits`) masih menawarkan kamar itu ke orang lain;
   - halaman Kamar menampilkannya "Kamar Kosong".
   Mengubah kamar dari halaman persetujuan juga tidak andal, karena pengurus yang punya `manage_members` belum tentu punya `manage_settings` (RLS `tenant_units`).

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit, push setelah setiap commit. Jangan push ke `main`.
- Path relatif ke `client/src/`. Jangan mengubah `supabase/` selain dua file baru KOS-1F.6a, juga `api/`, `legacy-backend/`, `dataService.js`, `apiClient.js`, `.env*`. Jangan menjalankan SQL ke Supabase.
- Test baru mengimpor kode asli. **Jalankan seluruh suite** (`npx vitest run`) sebelum menulis laporan. Laporan ditulis dari diff yang sebenarnya.

## KOS-1F.1 — Banner trial hanya untuk pengelola (temuan 1)
- `TrialCountdownBanner.jsx`:
  - status **trial** → tampil hanya bila `isTenantAdmin`; anggota lain `return null`;
  - status **read_only** / kedaluwarsa → tetap tampil untuk semua. Untuk anggota non-admin, teksnya: "Layanan sedang dalam mode baca-saja. Pembayaran baru untuk sementara belum bisa dicatat. Hubungi pengelola." Tanpa tombol.
- Test: trial + admin → tampil; trial + non-admin → kosong; read_only + non-admin → tampil dengan teks anggota tanpa tombol.
- Commit: `fix(tenant): KOS-1F.1 banner trial hanya untuk pengelola`

## KOS-1F.2 — Nama unit tidak dobel (temuan 2)
- `services/dataHelpers.js`: `formatUnitName(unitLabel, label)`.
  - Bila `label` (di-trim, tidak peka huruf besar) sudah diawali `unitLabel`, kembalikan `label` saja; selain itu `${unitLabel} ${label}`.
  - Bila `label` kosong, kembalikan `''`.
- Pakai di keempat tempat temuan 2.
- Test: ("Kamar", "Kamar VIP") → "Kamar VIP"; ("Kamar", "101") → "Kamar 101"; ("Rumah", "Blok A/12") → "Rumah Blok A/12"; ("Kamar", "kamar 3") → "kamar 3".
- Commit: `fix(ui): KOS-1F.2 nama unit tidak mengulang label`

## KOS-1F.3 — Teks "Rincian & QRIS" (temuan 3)
- `CitizenDashboard.jsx` ±73: tampilkan "Rincian & QRIS" hanya bila `isLegacyQrisEnabled(activeTenant)`; selain itu "Rincian & cara bayar".
- Test render sederhana untuk kedua kondisi.
- Commit: `fix(dashboard): KOS-1F.3 teks bayar tidak menyebut QRIS bila tidak aktif`

## KOS-1F.4 — Nama jabatan dan sapaan (temuan 4 dan 5)
- `context/TenantContext.jsx`:
  - query keanggotaan (±185-200) juga mengambil `id`, `full_name`, `unit_id`;
  - sediakan `activeMember` (`{ id, full_name, unit_id, is_base_role }`) dan `isBaseRole` untuk tenant aktif. `is_base_role` diambil dari `tenant_roles` yang sudah di-select.
  - Owner tanpa baris anggota: `activeMember = null`.
- `services/dataHelpers.js`: `displayRoleName({ isOwner, isBaseRole, roleName, template })`:
  - owner → `template.adminLabel`;
  - role dasar → `template.memberLabel`;
  - selain itu `roleName`, atau "Anggota" bila kosong.
- Pakai di `TenantDashboard.jsx` (±158-160) dan `TenantShell.jsx` (±183, menggantikan `roleLabel(role, …)`). Kos: pemilik → "Pemilik Kos", penyewa → "Penyewa".
- Sapaan `TenantDashboard.jsx` ±83: nama depan dari `activeMember?.full_name`, lalu `profile?.full_name`, lalu email.
- Test: `displayRoleName` (owner, role dasar kos/rt_rw, role kustom "Bendahara"), dan sapaan memakai `activeMember.full_name`.
- Commit: `fix(tenant): KOS-1F.4 jabatan dan sapaan mengikuti data anggota`

## KOS-1F.5 — Hitungan hunian per jenis tenant (temuan 6)
- `services/tenant/finance.js` `fetchTenantDashboardData` (mode demo dan Supabase): fungsi murni baru `countOccupiedUnits(units, members, tenantType)`:
  - `rt_rw`: seperti sekarang (`status === 'active'`, atau `is_occupied` di demo);
  - `kos` / `kelas` / `arisan`: unit terisi bila `status === 'occupied'` **atau** ada anggota `approved` dengan `unit_id` = unit. Unit `inactive` tidak dihitung, baik sebagai terisi maupun kosong.
  - `vacant` = jumlah unit bukan `inactive` dikurangi yang terisi.
- Jenis tenant diambil dari data tenant yang sudah tersedia di fungsi itu. Bila belum ada, tambahkan parameter `tenantType` dari pemanggil (`TenantDashboard` / `StaffDashboard`).
- Test `countOccupiedUnits`: kos 3 kamar dengan 1 anggota approved di kamar `vacant` → terisi 1, kosong 2; kamar `occupied` tanpa anggota → terisi; kamar `inactive` diabaikan; rt_rw tidak berubah.
- Commit: `fix(dashboard): KOS-1F.5 hitungan hunian kamar mengikuti jenis tenant`

## KOS-1F.6a — Kamar otomatis terisi saat penyewa disetujui (temuan 7, migration)
Aturan: di tenant `kos`, anggota yang menjadi `approved` dengan `unit_id` membuat kamar itu `occupied` dan `metadata.tenant_member_id` = anggota tersebut, **hanya bila** kamar sedang `vacant` atau `active`. Kamar yang sudah `occupied` (milik penyewa lain) atau `inactive` tidak diubah. Checkout tetap lewat `checkout_kos_room` (sudah mengosongkan kamar dan `unit_id` anggota).
- Migration `supabase/migrations/202610210005_kos_room_occupancy_on_approval.sql`:
  ```sql
  CREATE OR REPLACE FUNCTION public.sync_kos_room_occupancy()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NEW.status = 'approved' AND NEW.unit_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.unit_id IS DISTINCT FROM NEW.unit_id)
       AND EXISTS (SELECT 1 FROM public.tenants WHERE id = NEW.tenant_id AND type = 'kos') THEN
      UPDATE public.tenant_units
      SET status = 'occupied',
          metadata = metadata || jsonb_build_object('tenant_member_id', NEW.id),
          updated_at = now()
      WHERE id = NEW.unit_id AND tenant_id = NEW.tenant_id AND status IN ('vacant', 'active');
    END IF;
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS trg_sync_kos_room_occupancy ON public.tenant_members;
  CREATE TRIGGER trg_sync_kos_room_occupancy
  AFTER INSERT OR UPDATE OF status, unit_id ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_kos_room_occupancy();
  REVOKE ALL ON FUNCTION public.sync_kos_room_occupancy() FROM PUBLIC, anon, authenticated;

  -- Backfill: anggota kos approved yang kamarnya masih vacant/active
  UPDATE public.tenant_units u
  SET status = 'occupied',
      metadata = u.metadata || jsonb_build_object('tenant_member_id', m.id),
      updated_at = now()
  FROM public.tenant_members m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE t.type = 'kos' AND m.status = 'approved' AND m.unit_id = u.id
    AND u.tenant_id = m.tenant_id AND u.status IN ('vacant', 'active');
  ```
- SQL di atas sudah diuji Claude di dev dalam transaksi rollback (2026-10-21): backfill membuat Kamar VIP `occupied`, dan kasus 1–5 di bawah lulus. Salin persis.
- Test `supabase/tests/kos_room_occupancy_matrix.sql`.
  - **Pola fixture wajib:** insert `auth.users` dulu; ambil ID kamar lewat `RETURNING id` (bigint); owner anggota dibuat otomatis oleh trigger tenant, jadi jangan di-insert manual.
  - Kasus:
    1. anggota pending dengan Kamar A disetujui → Kamar A `occupied`, `tenant_member_id` = anggota;
    2. anggota kedua disetujui di Kamar A yang sudah `occupied` → `tenant_member_id` tetap anggota pertama;
    3. kamar `inactive` tidak berubah;
    4. tenant `rt_rw` → unit tetap `active`;
    5. `checkout_kos_room` sebagai `service_role` → kamar `vacant`, lalu persetujuan ulang anggota lain → `occupied` lagi.
- Commit: `feat(kos): KOS-1F.6a kamar terisi otomatis saat penyewa disetujui`

## KOS-1F.6b — Langkah lanjut setelah menyetujui penyewa Kos (temuan 7, frontend)
- `pages/tenant/TenantMemberApproval.jsx`: setelah menyetujui anggota tenant `kos` yang memilih kamar, tampilkan pesan sukses: "{nama} disetujui. {Kamar} kini tercatat terisi. Atur kontrak sewa agar tagihan bulanan terbit." Sertakan tombol "Atur Kontrak" ke `/t/:tenantId/payment-matrix`.
- `pages/tenant/TenantUnits.jsx` (khusus kos): kamar `occupied` tanpa `metadata.contract_start` diberi badge kecil "Belum ada kontrak".
- Test: badge muncul untuk kamar `occupied` tanpa kontrak dan tidak muncul bila `contract_start` ada.
- Commit: `feat(kos): KOS-1F.6b arahkan pengelola ke kontrak setelah persetujuan`

## Definition of Done
- `docs/handoff/KOS-1F-report.md` berisi hash commit dan hasil **seluruh** suite.
- `npx vitest run`, `npm run lint`, `npm run build` hijau (atau dicatat tidak bisa dijalankan).
