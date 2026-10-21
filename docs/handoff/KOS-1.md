# KOS-1 — Alur penyewa dan data kamar Kos

Status: ✅ **Disetujui user 2026-10-21**, termasuk KOS-1.4a (RPC baca-saja baru di database).

Dasar: uji user di ruangwarga-dev 2026-10-21 (tenant "Kos Melati Harmoni"), `AUDIT-VERTIKAL.md` K6, dan catatan `VERT-1-review.md` (`createTenantUnit` selalu `active`).

## Requirement (dari temuan user)
1. Form pendaftaran penyewa Kos menampilkan pilihan "Status Tinggal" ala RT/RW (Pemilik/Penyewa/Unit Kosong). Penyewa kos tidak perlu memilih itu.
2. Pemilik kos ingin harga dan fasilitas berbeda per kamar. Sekarang:
   - di wizard, harga berbeda hanya untuk kamar yang ditambah manual, dan fasilitasnya sama untuk semua kamar;
   - setelah setup, harga dan fasilitas tidak bisa diubah sama sekali.
   (Form kontrak sudah mengisi harga otomatis dari `metadata.default_rent_price` kamar, dan auto-tagih juga memakainya.)
3. Filter "Semua Kontrak Sewa" di Daftar Penyewa berisi pilihan RT/RW ("Tetap / Owner - Dihuni", dst.).
4. Setelah mendaftar, penyewa melihat "Belum Ada Tenant Terdaftar" dengan ajakan membuat tenant, seolah-olah calon pemilik.
   - Penyebabnya: keanggotaan berstatus `pending` tidak terbaca oleh pemiliknya sendiri (RLS `tenant_members` dan `tenants` hanya untuk anggota `approved`/owner).
   - Jadi aplikasi tidak tahu ada permohonan yang menunggu.
5. Di Daftar Penyewa, pendaftar baru tampil "Non-aktif" sekaligus "Penyewa Aktif", dan pengelola tidak bisa mengaktifkannya dari situ.
   - Badge Aktif/Non-aktif membaca `is_active`, kolom yang tidak ada di `tenant_members`, sehingga semua anggota tenant tampil "Non-aktif". Filter Aktif/Tidak Aktif juga ikut salah.
   - "Penyewa Aktif" adalah label status tinggal yang dipilih pendaftar.
   - Persetujuan hanya ada di `/t/:id/approval`, yang dibuka dari kartu peringatan di dashboard. Halaman Daftar Penyewa tidak menautkannya.

## Rencana
- Semua perubahan mengikuti jenis tenant (`tenants.type`) lewat `config/tenantTemplates.js`. RT/RW tidak berubah perilakunya.
- No. 4 butuh satu RPC baca-saja `get_my_join_requests()` (`SECURITY DEFINER`, hanya baris milik `auth.uid()`). Tidak ada perubahan tabel atau policy.
- Urutan: 1.1 → 1.2 → 1.5 → 1.3 (frontend) → 1.4a (migration, diterapkan Claude ke dev setelah dry-run) → 1.4b (frontend memakai RPC).

## Aturan executor
- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** `git pull --ff-only` dulu. Satu task = satu commit, push setelah setiap commit. Jangan push ke `main`.
- Ikuti `docs/handoff/README.md` dan `AGENT.md`. Path relatif ke `client/src/` kecuali disebut lain.
- 🚫 Jangan mengubah `services/dataService.js`, `services/apiClient.js`, `api/`, `legacy-backend/`, `.env*`, atau migration lama. Jangan menjalankan SQL ke Supabase.
- Dukung mode demo. Test baru mengimpor kode asli (pola `services/tenant/members.test.js`).
- Verifikasi per task bila perangkat mampu: test file terkait, `npm run lint`, `npm run build`. Bila tidak bisa, catat di laporan. Ringkasan akhir wajib menyebut semua yang gagal atau tidak dijalankan.

---

## KOS-1.1 — Form pendaftaran sesuai jenis tenant (temuan 1)
- File baru `utils/joinForm.js`:
  - `shouldAskOccupancy(tenantType)`: `true` hanya untuk `rt_rw`.
  - `getJoinableUnits(units, tenantType)`: buang `inactive`; untuk `kos` dan `kelas` buang juga `occupied`. Urutan tetap.
- `pages/public/JoinTenant.jsx`:
  - template diambil dari `TENANT_TEMPLATES[tenantInfo.tenant_type]` (fallback `rt_rw`);
  - label pilihan unit `Pilih ${template.unitLabel}` (Kos: "Pilih Kamar");
  - daftar unit memakai `getJoinableUnits`. Bila kosong: "Belum ada {unitLabel} yang tersedia. Hubungi pengelola.";
  - pilihan "Status Tinggal" (±405-416) hanya tampil bila `shouldAskOccupancy`. Selain RT/RW, kirim `occupancyStatus: 'tenant'`;
  - pemulihan draf (sessionStorage) tetap berjalan.
- Test `utils/joinForm.test.js` untuk kedua fungsi (rt_rw, kos, kelas, arisan).
- Commit: `fix(join): KOS-1.1 form pendaftaran mengikuti jenis tenant`

## KOS-1.2 — Pilihan status di Daftar Penyewa sesuai jenis tenant (temuan 3)
- `services/dataHelpers.js`: fungsi baru `getOccupancyOptions(tenantType)` → `[{ value, label }]`. Labelnya diambil dari peta yang sudah ada di `occupancyStatusLabel`:
  - `kos`: `tenant` (Penyewa Aktif), `booking`, `checkout`, `owner_occupied` (Pemilik / Pengelola);
  - `kelas`: `tenant` (Siswa Terdaftar), `booking`, `checkout`, `owner_occupied`;
  - `arisan`: `tenant` (Peserta Aktif), `booking`, `checkout`, `owner_occupied`;
  - `rt_rw` / lainnya: empat entri `OCCUPANCY_STATUS` seperti sekarang.
- `pages/Residents.jsx`: filter (±660-667) dan form ubah (±1254-1270) memakai `getOccupancyOptions(activeTenant?.type)`. Pemetaan impor CSV (±460-470) tidak diubah.
- Test `getOccupancyOptions` untuk keempat jenis.
- Commit: `fix(residents): KOS-1.2 pilihan status penghuni mengikuti jenis tenant`

## KOS-1.5 — Status keanggotaan dan persetujuan di Daftar Penyewa (temuan 5)
- Pada mode tenant (`activeTenantId` ada), `pages/Residents.jsx` memakai `status` dari `fetchTenantMembers` (`approved` / `pending` / `rejected`), bukan `is_active`:
  - badge (±900-905) dan baris "Status" di detail (±1099): `approved` → "Aktif", `pending` → "Menunggu persetujuan" (amber), `rejected` → "Ditolak";
  - filter Aktif/Tidak Aktif dan pengurutan (±259-260, ±283-284) memakai status yang sama, dengan opsi filter tambahan "Menunggu persetujuan";
  - untuk anggota `pending`, label status tinggal (mis. "Penyewa Aktif") tidak ditampilkan. Ganti dengan "Calon {template.memberLabel}".
  - Fungsi murni `getMemberStatusBadge(member)` di `services/dataHelpers.js` supaya bisa dites.
- Mode legacy (tanpa tenant) tetap memakai `is_active` seperti sekarang.
- Bila ada anggota `pending` dan pengguna punya `canManageMembers`, tampilkan banner di atas tabel: "{n} pendaftar menunggu persetujuan" dengan tombol "Tinjau" ke `/t/:tenantId/approval`.
- Detail anggota `pending`: tombol "Tinjau & Setujui" ke `/t/:tenantId/approval`, menggantikan "Atur Jabatan". "Keluarkan" tetap ada.
- Test: `getMemberStatusBadge` untuk ketiga status, dan render Residents mode tenant dengan 1 anggota pending yang menampilkan banner, badge "Menunggu persetujuan", dan tautan approval.
- Commit: `fix(residents): KOS-1.5 status keanggotaan dan jalan pintas persetujuan`

## KOS-1.3 — Harga dan fasilitas per kamar (temuan 2)
- Pindahkan `COMMON_FACILITIES` dari `pages/onboarding/KosSetupWizard.jsx` ke file baru `config/kosFacilities.js` (`export const KOS_FACILITIES`) **tanpa mengubah isinya**. Wizard mengimpor dari sana.
- `services/tenant/members.js`:
  - `createTenantUnit(tenantId, { label, occupant, status, rentPrice, facilities })`: `status` boleh `active` atau `vacant` (default tetap `active`), `rentPrice` → `metadata.default_rent_price`, `facilities` → `metadata.facilities`.
  - `updateTenantUnit(tenantId, unitId, { label, status, occupant, rentPrice, facilities })`: bila `rentPrice` / `facilities` dikirim, gabungkan ke metadata yang ada (metadata lain, termasuk kontrak, tidak boleh hilang). Validasi: harga angka ≥ 0, fasilitas array string yang di-trim, tanpa entri kosong, tanpa duplikat.
- `pages/tenant/TenantUnits.jsx`, khusus tenant `kos`:
  - form tambah/ubah kamar punya isian "Harga sewa per bulan (Rp)" dan centang fasilitas dari `KOS_FACILITIES`;
  - tabel dan kartu menampilkan harga (`formatRupiah`) dan jumlah fasilitas;
  - kamar baru dibuat dengan status `vacant` (kos dan kelas).
- `pages/onboarding/KosSetupWizard.jsx` langkah daftar kamar: setiap baris punya isian harga sendiri (default = harga standar). Fasilitas tetap mengikuti pilihan umum di wizard, dengan catatan "Fasilitas per kamar bisa diubah di halaman Kamar".
- Test:
  - `createTenantUnit` dan `updateTenantUnit` menyimpan harga/fasilitas di metadata tanpa menghapus `contract_start` / `tenant_member_id`;
  - validasi harga negatif dan fasilitas kosong;
  - `KosSetupWizard.test.jsx`: harga per baris terbawa ke `default_rent_price`.
- Commit: `feat(kos): KOS-1.3 harga dan fasilitas per kamar`

## KOS-1.4a — RPC `get_my_join_requests()` (temuan 4, migration)
- Migration `supabase/migrations/202610210004_my_join_requests.sql`:
  ```sql
  CREATE OR REPLACE FUNCTION public.get_my_join_requests()
  RETURNS TABLE (member_id uuid, tenant_id uuid, tenant_name text, tenant_type text,
                 unit_label text, status text, requested_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT tm.id, t.id, t.name, t.type::text, tu.label, tm.status, tm.created_at
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    LEFT JOIN public.tenant_units tu ON tu.id = tm.unit_id
    WHERE tm.user_id = auth.uid() AND tm.status IN ('pending', 'rejected')
    ORDER BY tm.created_at DESC;
  $$;
  REVOKE ALL ON FUNCTION public.get_my_join_requests() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_my_join_requests() TO authenticated, service_role;
  ```
- Test `supabase/tests/my_join_requests_matrix.sql` (pola `tenant_events_matrix.sql`: insert `auth.users`, konteks JWT, `BEGIN ... ROLLBACK`):
  1. user A pending di tenant X → 1 baris berisi nama tenant X dan label unit;
  2. user A approved di tenant Y → tidak muncul;
  3. user B tidak melihat permohonan A;
  4. `anon` tidak punya hak EXECUTE.
- Commit: `feat(join): KOS-1.4a RPC get_my_join_requests`

## KOS-1.4b — Tampilkan permohonan yang menunggu (temuan 4, frontend)
- Service `fetchMyJoinRequests()` di `services/tenant/members.js`: memanggil RPC, dan di mode demo mengembalikan `[]`. Error dicatat, lalu dikembalikan `[]` agar halaman tidak rusak sebelum RPC terpasang.
- `context/TenantContext.jsx`: muat `joinRequests` bersama data tenant (hanya saat login) dan sediakan di context.
- `pages/Home.jsx` (±559) dan `pages/account/MyTenants.jsx` (±84). Bila `joinRequests` tidak kosong, tampilkan kartu "Permohonan Bergabung" di atas daftar/empty state:
  - nama tenant, `unitLabel` + label unit, tanggal diajukan;
  - status `pending`: "Menunggu persetujuan pengelola". Status `rejected`: "Ditolak, hubungi pengelola";
  - bila user belum punya tenant sama sekali, judul empty state menjadi "Pendaftaran Anda sedang diperiksa", dan tombol "Daftarkan Tenant" menjadi tautan sekunder "Ingin mengelola komunitas sendiri? Daftarkan tenant".
- `pages/public/JoinTenant.jsx` layar sukses: tombol "Kembali ke Halaman Utama" → "Lihat Status Pendaftaran" (ke `/`).
- Test komponen: Home/MyTenants dengan `joinRequests` berisi 1 pending dan tanpa tenant menampilkan nama tenant dan teks menunggu, dan tidak menampilkan tombol utama "Daftarkan Tenant Pertama".
- Commit: `feat(join): KOS-1.4b tampilkan permohonan bergabung yang menunggu`

---

## Definition of Done
- `docs/handoff/KOS-1-report.md` berisi hash commit tiap task.
- `npx vitest run`, `npm run lint`, `npm run build` hijau (atau dicatat tidak bisa dijalankan).
- Claude: review → dry-run 1.4a → user menerapkan di dev → test SQL → push ke `main` atas izin user.
