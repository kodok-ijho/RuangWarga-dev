# Audit Vertikal Kos, Arisan, Kelas (Claude, 2026-10-21)

Cakupan: semua yang dialami tenant **Kos**, **Arisan**, dan **Kelas** baru di workspace `/t/:tenantId`, mode produksi (`IS_DEMO = false`), sesudah RTRW-3.

Metode:
- Pembacaan kode `client/src` (wizard, PaymentMatrix, halaman Arisan, service `tenant/*`) dan definisi fungsi/RLS di Supabase dev (`pg_proc`, `pg_policies`, `pg_constraint`, `pg_trigger`).
- Uji nyata di Supabase dev dengan blok `DO` yang selalu di-rollback (`RAISE EXCEPTION` di akhir). Data dev: 1 tenant `rt_rw`, belum ada tenant Kos/Arisan/Kelas.

Status: **ketiga vertikal belum siap dipakai.** Arisan tidak bisa berjalan sama sekali (peserta tidak pernah terdaftar dan Kocok selalu gagal). Kos dan Kelas bisa dipakai sebagian, tetapi ada tagihan salah dan data kamar yang rusak.

Yang sudah benar: RLS tabel `arisan_*` terisolasi per tenant, semua RPC `SECURITY DEFINER` mengecek izin, `auto_generate_kos_billing` (dipakai juga oleh BILL-AUTO-1) benar, dan settings wizard sudah di-merge (bukan ditimpa) sejak RTRW-2.

---

## A. Arisan

| ID | Tingkat | Temuan | Bukti |
|---|---|---|---|
| A1 | **BLOKER** | **Peserta arisan tidak pernah terdaftar.** `arisan_participants` hanya diisi oleh `enrollArisanParticipants` (`services/tenant/arisan.js` ±161), dan fungsi itu tidak dipanggil di halaman mana pun. Tidak ada trigger/RPC lain yang mengisinya. Akibatnya "Terbitkan Iuran" membuat 0 tagihan, lalu Kocok selalu ditolak ("Tagihan iuran untuk putaran ini belum diterbitkan"). | `grep` klien; `pg_proc.prosrc ILIKE '%arisan_participants%'` hanya `draw_arisan_winner`, `start_new_arisan_cycle`, `generate_arisan_round_bills` (semuanya membaca, tidak menambah peserta) |
| A2 | **BLOKER** | **Kocok selalu gagal.** `ArisanDraw.jsx` ±204 mengirim `user?.id` (ID login Supabase) sebagai `p_operator_member_id`. RPC menyimpannya ke `arisan_rounds.drawn_by`, yang FK ke `tenant_members.id`. Hal serupa di "Mulai Siklus Baru" (`ArisanDraw.jsx` ±258, `ArisanRounds.jsx` ±268): tidak gagal karena disimpan ke `settings` tanpa FK, tetapi ID yang tercatat salah. Parameter ini juga bisa dipalsukan dari klien. | Rollback: operator = ID login → `23503 arisan_rounds_drawn_by_fkey`; operator = ID anggota → `OK` |
| A3 | TINGGI | **"Tandai Lunas" tidak mencatat pembayaran.** `payArisanBillManual` (`arisan.js` ±292-336) meng-update `billing_items.status = 'paid'` langsung, lalu insert `payments` dengan `method: 'manual_transfer'` dan `status: 'verified'`. Keduanya melanggar CHECK (`payments_method_check`: qris/bank_transfer/cash; `payments_status_check`: pending/pending_verification/completed/rejected), jadi insert selalu gagal dan errornya ditelan `console.warn`. Tagihan lunas tanpa catatan pembayaran, sehingga kas dan laporan tidak memuat setoran arisan. | `pg_constraint` |
| A4 | SEDANG | Tombol pengelola (buat putaran, terbitkan iuran, tandai lunas, kocok, siklus baru) memakai `isTenantAdmin` (owner atau role bernama `admin`), bukan izin. Bendahara yang punya `generate_billing` / `manage_billing_cash` tidak bisa memakainya. Rute `/t/:id/arisan/rounds` dan `/arisan/draw` tidak memakai `TenantAccessGuard`. | `ArisanRounds.jsx` ±261, ±324, ±368, ±490, ±610, ±624, ±784, ±835; `App.jsx` rute arisan |
| A5 | SEDANG | Peserta tidak punya jalur membayar setoran sendiri (transfer + bukti). Menu "Tagihan" diganti "Putaran Arisan". | `TenantShell.jsx` ±88-92 |
| A6 | RENDAH | `ArisanDraw.test.js` dan `ArisanRounds.test.js` hanya menguji data tiruan lokal tanpa mengimpor kode aplikasi. Karena itu A1–A3 lolos. | isi file test |
| A7 | RENDAH | Kesiapan kocok dan `draw_arisan_winner` menghitung tagihan `round_id = X OR period = label putaran`. Tagihan lain dengan label periode sama ikut terhitung. | definisi fungsi |

## B. Kos

| ID | Tingkat | Temuan | Bukti |
|---|---|---|---|
| K1 | TINGGI | `checkout_kos_room` punya **dua overload** (`p_unit_id bigint` dan `p_unit_id integer`) dengan nama argumen yang sama. PostgREST tidak bisa memilih (`PGRST203`), sehingga tombol **Checkout Kamar** kemungkinan besar selalu error. Uji lewat REST belum bisa dari sandbox Claude; minta dicoba di ruangwarga-dev. `tenant_units.id` bertipe bigint, jadi overload `integer` aman dihapus. | `pg_proc`: 2 baris `checkout_kos_room` |
| K2 | SEDANG | `assignRoomContract` (`services/tenant/billing.js` ±427-500) tidak mengecek error update `tenant_units` dan tidak memfilter `tenant_id`. Bila update gagal (mis. pengurus punya `generate_billing` tetapi tidak `manage_settings`), tagihan awal tetap terbit, tetapi kamar tidak menjadi `occupied`, sehingga auto-tagih bulan berikutnya melewatinya. | kode |
| K3 | SEDANG | Halaman Kamar (`pages/tenant/TenantUnits.jsx` ±206, ±405-409, ±466, ±579) hanya mengenal `active`/`inactive`. Kamar `vacant`/`occupied` tampil "Nonaktif", dan tombol aktifkan mengubahnya menjadi `active`. Status terisi hilang dan auto-tagih (`status = 'occupied'`) melewatinya. Slot Kelas (`vacant`) terkena hal yang sama. | kode |
| K4 | SEDANG | Wizard Kos dijalankan ulang → kamar ganda dan kode undangan baru (link lama mati). Lihat W1. | `KosSetupWizard.jsx` ±295-313 |
| K5 | RENDAH | Periode auto-tagih dan "Ingatkan" memakai UTC (`PaymentMatrix.jsx` ±301, ±322, ±700). Antara pukul 00.00 dan 07.00 WIB tanggal 1, periode masih bulan lalu. `getCurrentPeriodJakarta` sudah ada di `utils/waReminder.js`. | kode |
| K6 | RENDAH | Form Join (`pages/public/JoinTenant.jsx` ±405-416) menampilkan pilihan "Status Tinggal" RT/RW (Pemilik/Penyewa) untuk semua jenis tenant. Daftar unit juga memuat kamar yang terisi atau nonaktif (`get_invite_details` tidak memfilter status). | kode + fungsi |

## C. Kelas

| ID | Tingkat | Temuan | Bukti |
|---|---|---|---|
| C1 | TINGGI | **Auto-Generate SPP menagih slot kosong.** Cabang kelas di `calculateBillingPreview` (`billing.js` ±35, ±110) menagih semua slot yang tidak `inactive`, termasuk slot `vacant` tanpa siswa. Hasilnya tagihan "Slot Siswa" tanpa anggota. | kode |
| C2 | SEDANG | Wizard Kelas menyimpan `is_setup_completed`, bukan `onboarding_completed`, sehingga banner "lengkapi setup" di dashboard admin (`TenantDashboard.jsx` ±248) tidak pernah hilang. | `KelasSetupWizard.jsx` ±327 |
| C3 | SEDANG | Wizard Kelas dijalankan ulang → slot ganda dan kode undangan baru (W1). | `KelasSetupWizard.jsx` ±290-306 |
| C4 | — | Fitur inti kelas (presensi, wali murid, paket pertemuan) belum ada. Sesuai roadmap, bukan bug. | — |

## D. Lintas vertikal

| ID | Tingkat | Temuan |
|---|---|---|
| W1 | SEDANG | Wizard Kos, Arisan, dan Kelas belum punya perlindungan jalan-ulang yang sudah ada di wizard RT/RW (RTRW-2): dedupe label unit (`selectNewUnitLabels`) dan pakai ulang kode undangan (`fetchTenantInviteCode`). |
| W2 | — | Template jabatan (`ROLE_TEMPLATES` di `services/tenant/rbac.js`) baru ada untuk `rt_rw`. Termasuk fitur lintas vertikal P1 di `VERTIKAL-requirement.md`. |
| W3 | — | Tagihan otomatis harian (BILL-AUTO-1, `generate_auto_bills_for_tenant`) sengaja melewati arisan dan kelas (cabang `ELSE`). Dicatat, bukan bug. |

---

## Rencana batch

1. **VERT-1**: perbaikan frontend tanpa migration (A2 sisi klien, A3, A4, A6, K2, K3, K5, C1, C2, W1). Tidak menyentuh schema, jadi bisa langsung dikerjakan.
2. **VERT-2**: migration, **perlu persetujuan user**:
   - K1: hapus overload `checkout_kos_room(..., integer, ...)`;
   - A1: peserta arisan otomatis terdaftar saat anggota disetujui dan punya slot, plus backfill;
   - A2: operator kocok/siklus baru diambil dari `auth.uid()` di server, bukan dari parameter klien.
3. Sesudah itu baru fitur per vertikal sesuai `VERTIKAL-requirement.md`: **KOS-1**, lalu **KELAS-1**, lalu **ARISAN-1**. Template jabatan per vertikal (W2) masuk ke batch vertikal masing-masing. A5, A7, dan K6 juga masuk di sana.
