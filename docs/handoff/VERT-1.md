# VERT-1 — Perbaikan Kos, Arisan, Kelas (frontend saja)

Dasar: `AUDIT-VERTIKAL.md`. Batch ini memperbaiki temuan yang **tidak** butuh migration: A2 (sisi klien), A3, A4, A6, K2, K3, K5, C1, C2, W1.

Baca dulu: `docs/handoff/README.md`, `AGENT.md`, `AUDIT-VERTIKAL.md`.

- **Branch: `claude/ruangwarga-remote-2-disconnect-m4oku0`.** Sebelum mulai: `git fetch origin && git checkout claude/ruangwarga-remote-2-disconnect-m4oku0 && git pull --ff-only`. Jangan push ke `main`.
- Satu task = satu commit, **push setelah setiap commit** (supaya pekerjaan tidak hilang bila sesi terputus).
- Tanpa migration. Tanpa package baru.
- Semua path di bawah relatif ke `client/src/` kecuali disebut lain.

🚫 Larangan:
- Jangan mengubah `services/dataService.js`, `services/apiClient.js`, `api/`, `supabase/`, `legacy-backend/`, `.env*`.
- Jangan menghapus test lama. Tambahkan test baru yang **mengimpor kode aplikasi asli** (pola mock: `services/tenant/members.test.js`, `vi.spyOn(supabase, 'from')` / `vi.spyOn(supabase, 'rpc')` atau `vi.mock` modul). Test yang hanya menguji data tiruan lokal tidak dihitung.
- Dukung mode demo: cabang `IS_DEMO || String(tenantId).startsWith('demo-')` yang sudah ada tetap berjalan.

## Verifikasi per task
Jalankan dari `client/` bila perangkat mampu:
- `npx vitest run <file test yang diubah/ditambah>`, lalu
- `npm run lint` dan `npm run build`.

Bila `npm ci`, build, atau test tidak bisa jalan di perangkat ini (mis. HP), **jangan berhenti**. Tulis alasannya di laporan; Claude menjalankan seluruh verifikasi di cloud.

---

## VERT-1.1 — Arisan: Kocok tidak lagi mengirim ID login (A2)
Masalah: `arisan_rounds.drawn_by` FK ke `tenant_members.id`, tetapi klien mengirim `user?.id` (ID login). Kocok selalu gagal `23503`.
- `pages/arisan/ArisanDraw.jsx` ±204: `drawArisanWinner(tenantId, selectedRound.id, null)`.
- `pages/arisan/ArisanDraw.jsx` ±258 dan `pages/arisan/ArisanRounds.jsx` ±268: `startNewArisanCycle(tenantId, null, force)`.
- Tambahkan komentar satu baris di ketiga tempat: `// Operator dicatat server (VERT-2); user.id bukan tenant_members.id.`
- Hapus import/variabel `useAuth`/`user` yang jadi tidak terpakai (lint harus bersih).
- Test baru `services/tenant/arisan.test.js`:
  - `drawArisanWinner(tenantId, roundId)` memanggil `supabase.rpc('draw_arisan_winner', { p_tenant_id, p_round_id, p_operator_member_id: null })`;
  - `startNewArisanCycle(tenantId, null, true)` memanggil RPC dengan `p_operator_member_id: null, p_force: true`.
- Commit: `fix(arisan): VERT-1.1 kocok tidak mengirim ID login sebagai operator`

## VERT-1.2 — Arisan: "Tandai Lunas" mencatat pembayaran sungguhan (A3)
Masalah: `payArisanBillManual` (`services/tenant/arisan.js` ±292-336) meng-update tagihan langsung lalu insert `payments` dengan `method: 'manual_transfer'` dan `status: 'verified'`. Kedua nilai itu ditolak CHECK database, dan errornya ditelan. Tagihan jadi lunas tanpa catatan pembayaran.
- Cabang non-demo `payArisanBillManual(tenantId, billId)` diganti menjadi satu panggilan:
  `submitTenantPayment(tenantId, { billId, method: 'cash', isStaff: true, note: 'Setoran arisan dicatat pengurus' })` (dari `./payments`).
  - Fungsi itu sudah memakai nominal dari tagihan, membuat `payments` berstatus `completed`, lalu trigger database `sync_bill_status_after_payment` menandai tagihan `paid` dan trigger arisan memperbarui kesiapan putaran.
  - **Jangan** lagi meng-update `billing_items` dari klien.
  - Error dilempar ke pemanggil (jangan `console.warn` lalu lanjut).
  - Kembalikan `{ success: true, payment }`.
- Cabang demo tetap seperti sekarang.
- `pages/arisan/ArisanRounds.jsx` `handleMarkPaid` (±234-256): teks toast sukses → `'Setoran dicatat tunai dan ditandai lunas.'`
- Test di `services/tenant/arisan.test.js`:
  - `vi.mock('./payments')`: `payArisanBillManual` memanggil `submitTenantPayment` dengan argumen di atas;
  - tidak ada pemanggilan `supabase.from('billing_items')` untuk update;
  - bila `submitTenantPayment` melempar error, `payArisanBillManual` ikut melempar.
- Commit: `fix(arisan): VERT-1.2 tandai lunas lewat submitTenantPayment (tunai, completed)`

## VERT-1.3 — Arisan: izin tenant dan guard rute (A4)
- File baru `utils/arisanAccess.js`:
  ```js
  export function getArisanAccess(hasPermission) // hasPermission: (key) => boolean
  // return { canManageRounds, canGenerateBills, canRecordPayment }
  //   canManageRounds  = hasPermission('run_special_action')   // buat putaran, kocok, mulai siklus baru
  //   canGenerateBills = hasPermission('generate_billing')     // terbitkan iuran
  //   canRecordPayment = hasPermission('manage_billing_cash')  // tandai lunas (tunai)
  ```
  Bila `hasPermission` bukan fungsi → semua `false`. `hasPermission` dari `useTenant()` sudah bernilai true untuk owner dan platform admin.
- `pages/arisan/ArisanRounds.jsx` dan `pages/arisan/ArisanDraw.jsx`: ganti **semua** gerbang `isTenantAdmin` / `isBendahara` dengan flag dari `getArisanAccess(hasPermission)` sesuai aksinya:
  - `ArisanRounds.jsx` ±261, ±324, ±368, ±490, ±610, ±624, ±636, ±784, ±835;
  - `ArisanDraw.jsx` ±68 (`canDraw` → `canManageRounds`), ±251, ±328, ±526, ±657, ±974.
  - Cek `isReadOnly` yang sudah ada tetap dipertahankan.
  - `isBendahara` tidak ada di `TenantContext`; hapus pemakaiannya.
- `App.jsx`: rute **di dalam** `/t/:tenantId` untuk `arisan/rounds` dan `arisan/draw` dibungkus `<TenantAccessGuard require="isMember">` seperti rute `events`. Rute legacy `/arisan/*` di luar `/t/` tidak diubah.
- Test `utils/arisanAccess.test.js`:
  - owner (semua true);
  - bendahara dengan `generate_billing` + `manage_billing_cash` (bisa terbitkan & catat, tidak bisa kocok);
  - peserta tanpa izin (semua false);
  - `hasPermission` undefined.
- Commit: `fix(arisan): VERT-1.3 tombol pengelola memakai izin tenant, guard rute arisan`

## VERT-1.4 — Wizard Kos/Arisan/Kelas aman dijalankan ulang (W1, C2)
Contoh yang benar sudah ada di `pages/onboarding/SetupWizard.jsx` ±291-316 (RTRW-2).
- Pindahkan fungsi `selectNewUnitLabels` dari `pages/onboarding/SetupWizard.jsx` ke file baru `utils/unitLabels.js` **tanpa mengubah isinya**. Di `SetupWizard.jsx`, impor dari file baru dan tambahkan re-export `export { selectNewUnitLabels } from '../../utils/unitLabels';` supaya `SetupWizard.test.jsx` tetap lulus tanpa diubah.
- Di `KosSetupWizard.jsx` (`handleSaveSetup` ±295-313), `ArisanSetupWizard.jsx` (`handleFinalizeSetup` ±281-297), dan `KelasSetupWizard.jsx` (`handleSaveAll` ±289-307):
  1. Ambil unit yang sudah ada (`fetchTenantUnits(tenantId)`), hitung `selectNewUnitLabels(existing, daftarDiWizard)`, lalu **hanya** sisipkan item wizard yang labelnya ada di hasil itu. Metadata per item (harga kamar, fasilitas, nomor slot, dst.) tetap dari item wizard. Bila hasilnya kosong, lewati `bulkCreateTenantUnits`.
  2. Kode undangan: `let code = await fetchTenantInviteCode(tenantId); if (!code) code = await saveInviteCodeWithRetry(tenantId, nama);`.
  3. Toast sukses menyebut jumlah unit baru dan yang dilewati, bila ada yang dilewati (contoh: SetupWizard RT/RW ±340-345).
- `KelasSetupWizard.jsx` ±327: tambahkan `onboarding_completed: true` di `settingsPayload`. Biarkan `is_setup_completed: true` tetap ada.
- Impor fungsi service dari modul yang sama dengan yang dipakai `SetupWizard.jsx`.
- Test `utils/unitLabels.test.js` (cukup memastikan fungsi yang dipindah tetap bekerja). Untuk satu wizard (Kos), tambahkan test yang me-mock service: bila `fetchTenantUnits` mengembalikan `Kamar 101` dan wizard berisi `Kamar 101` + `Kamar 102`, maka `bulkCreateTenantUnits` hanya menerima `Kamar 102`, dan bila `fetchTenantInviteCode` mengembalikan kode, `saveInviteCodeWithRetry` tidak dipanggil. Bila render wizard terlalu berat, ekstrak logika simpan menjadi fungsi murni dan test fungsi itu.
- Commit: `fix(onboarding): VERT-1.4 wizard kos/arisan/kelas tidak menggandakan unit dan kode undangan`

## VERT-1.5 — Kelas: SPP hanya untuk slot bersiswa, periode WIB (C1, K5)
- `services/tenant/billing.js` `calculateBillingPreview`, cabang `if (isKelas)` (±110): bila `unitMemberMap.get(u.id)` kosong, masukkan ke `skipped` dengan `reason: 'no_student'` dan jangan buat tagihan.
- `pages/PaymentMatrix.jsx` ±301, ±322, ±700: ganti `new Date().toISOString().slice(0, 7)` dengan `getCurrentPeriodJakarta()` dari `utils/waReminder.js`.
- Test (tambahkan di `services/tenantOperationalService.test.js`, yang sudah menguji `calculateBillingPreview`):
  - tenant kelas dengan 3 slot, hanya 1 yang punya anggota → 1 tagihan, 2 `skipped` `no_student`;
  - tenant kos dan rt_rw tidak berubah perilakunya.
- Commit: `fix(kelas): VERT-1.5 SPP hanya untuk slot bersiswa, periode tagihan memakai WIB`

## VERT-1.6 — Kos: kontrak kamar dan status kamar (K2, K3)
**Kontrak (`services/tenant/billing.js` `assignRoomContract` ±427-500)**
- Select dan update `tenant_units` difilter `.eq('tenant_id', tenantId)` juga.
- Periksa `error` dari select dan update. Bila gagal, lempar error **sebelum** membuat tagihan (`createTenantBillingItem`).
- Update memakai `.select()`: bila 0 baris (RLS menolak diam-diam), lempar `'Gagal mengaktifkan kontrak: Anda tidak punya izin mengubah kamar.'`

**Status kamar (`pages/tenant/TenantUnits.jsx`)**
- Status yang dikenal: `active`, `inactive`, `vacant` (kosong), `occupied` (terisi).
- Tampilan: `vacant` → label `template.emptyUnitLabel`, `occupied` → `template.occupiedUnitLabel`. Hanya `inactive` yang dianggap nonaktif (±466, ±579).
- Filter (±405-409): "Aktif" = semua yang bukan `inactive`.
- Tombol aktif/nonaktif (`handleToggleStatus` ±206):
  - menonaktifkan → `inactive`;
  - mengaktifkan → `vacant` untuk tenant `kos` dan `kelas`, `active` untuk tipe lain;
  - **jangan pernah** mengubah `occupied`. Kamar terisi tidak bisa dinonaktifkan dari sini; tampilkan pesan "Checkout penyewa dulu".
- `services/tenant/members.js` `setTenantUnitStatus` (±721): izinkan juga `vacant`. Jangan izinkan `occupied` (hanya lewat kontrak).
- Test:
  - `assignRoomContract` melempar dan **tidak** memanggil insert `billing_items` bila update unit mengembalikan error atau 0 baris;
  - `setTenantUnitStatus` menerima `vacant` dan menolak `occupied`;
  - fungsi murni penentu status berikutnya (ekstrak dari `handleToggleStatus`, mis. `getNextUnitStatus(unit, tenantType)`) untuk kombinasi kos/rt_rw × active/inactive/vacant/occupied.
- Commit: `fix(kos): VERT-1.6 kontrak kamar gagal dengan jelas, status kamar kos/kelas tidak rusak`

---

## Definition of Done
- `docs/handoff/VERT-1-report.md` (format di README) berisi hash commit tiap task.
- `grep -rn "user?.id" client/src/pages/arisan/` → tidak ada hasil.
- `grep -n "manual_transfer\|'verified'" client/src/services/tenant/arisan.js` → tidak ada hasil.
- Test baru mengimpor kode aplikasi asli.
- `npx vitest run`, `npm run lint`, `npm run build` hijau (atau ditandai "tidak bisa dijalankan di perangkat ini" di laporan).
- Tidak ada perubahan di `supabase/`, `api/`, `dataService.js`, `apiClient.js`, `legacy-backend/`.
