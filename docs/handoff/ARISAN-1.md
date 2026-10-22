# ARISAN-1 — Kocokan transparan, setoran per putaran, bayar sendiri, jabatan Arisan

Status: ✅ **Disetujui user 2026-10-22** (urutan kerja: PANITIA-2 → PANITIA-3 → PANITIA-HARGA → ARISAN-1). Termasuk migration ARISAN-1.1.

Dasar:
- `VERTIKAL-requirement.md` §4 Arisan P1;
- `AUDIT-VERTIKAL.md` A5–A7 dan W2;
- keputusan user 2026-10-22: keempat fitur dipilih.

## Kondisi sekarang (hasil penelusuran Claude)
- `draw_arisan_winner`:
  - **menolak seluruh kocokan** bila ada satu saja tagihan putaran yang belum lunas;
  - peserta yang belum bayar tidak dikeluarkan dari undian;
  - daftar peserta yang berhak tidak disimpan;
  - tagihan dicocokkan lewat `round_id` **atau** label periode (A7).
- Pemegang `run_special_action` bisa meng-`UPDATE arisan_rounds` langsung (status, pemenang) di luar RPC. Akibatnya putaran bisa direset dan dikocok ulang diam-diam.
- `ArisanDraw.jsx`: animasi acak di klien hanya kosmetik; pemenang ditentukan server. Belum ada tombol bagikan ke WA, dan operator yang mengocok tidak ditampilkan.
- `ArisanRounds.jsx` modal "Rincian Iuran": hanya Lunas / Belum Bayar, tanpa tombol WA.
- Peserta tidak punya halaman setoran sendiri; `PaymentMatrix` tidak memuat tagihan arisan. Padahal backend sudah mendukung pembayaran transfer oleh peserta (`bill.member_id` = peserta).
- `ArisanDraw.test.js` dan `ArisanRounds.test.js` hanya menguji logika tiruan (A6).
- `ROLE_TEMPLATES` belum punya `arisan`.

## Aturan executor
- Sama dengan `PANITIA-2.md` § Aturan executor.
- Pakai ulang `components/payments/MemberBillPayModal.jsx` dan `submitMemberTransfer` dari PANITIA-2. Jangan membuat salinan.

---

## ARISAN-1.1 — Migration kocokan transparan
- Salin **persis** dengan `cp`: `docs/handoff/assets/ARISAN-1/arisan_transparent_draw.sql` → `supabase/migrations/202610220004_arisan_transparent_draw.sql`. Claude sudah dry-run (lulus).
- Isinya:
  - kolom `arisan_rounds.eligible_snapshot` / `excluded_snapshot`;
  - trigger yang membuat hasil kocok final;
  - `draw_arisan_winner` baru: hanya peserta yang setorannya lunas ikut kocok, dan hadiah = total setoran lunas;
  - `check_arisan_round_readiness` mencocokkan lewat `round_id` saja.
- Test `supabase/tests/arisan_transparent_draw_matrix.sql` (tenant `arisan`, 3 slot + 3 anggota `approved` yang otomatis jadi peserta lewat trigger VERT-2):
  - Saat menandai tagihan lunas sebagai postgres, set `request.jwt.claims` = `{"role":"service_role"}`, karena trigger kesiapan arisan memerlukannya.
  - **A1.** Owner menyisipkan putaran berstatus `drawn` dengan pemenang, dan ditolak `insufficient_privilege`.
  - **A2.**
    - Owner membuat putaran, lalu `generate_arisan_round_bills` (3 tagihan); 2 peserta ditandai lunas;
    - `draw_arisan_winner` mengembalikan `eligible_count = 2` dan `excluded_count = 1`, dengan pemenang salah satu yang lunas;
    - `eligible_snapshot` berisi 2 peserta, `excluded_snapshot` berisi peserta yang belum lunas, dan `total_pool_amount` = jumlah tagihan lunas.
  - **A3.** Owner mengubah `status` atau `winner_member_id` putaran yang sudah dikocok, dan ditolak. Mengubah `notes` berhasil.
  - **A4.** Kocok ulang putaran yang sama ditolak.
  - **A5.** Putaran baru tanpa setoran lunas ditolak dengan pesan "belum ada peserta yang setorannya lunas".
  - **A6.** Putaran lain dengan label periode sama: `check_arisan_round_readiness` menghitung 0 tagihan.
- Commit: `feat(arisan): ARISAN-1.1 migration kocokan transparan`

## ARISAN-1.2 — Service dan teks WA
- `services/tenant/arisan.js`:
  - `fetchArisanRounds` ikut mengembalikan `eligible_snapshot`, `excluded_snapshot`, dan nama operator (`operator:drawn_by(full_name)` sudah di-join; pastikan kolomnya `full_name`);
  - `fetchArisanRoundBills` mencocokkan **hanya** `metadata->>round_id`, dengan fallback periode dibuang. Bawa juga `member:tenant_members(id, full_name, phone)` dan status pembayaran terakhir;
  - `fetchMyArisanBills(tenantId, memberId)`: tagihan `metadata->>type = 'arisan_contribution'` milik anggota, beserta nomor/label putaran. Urutan: belum lunas dulu;
  - murni `getRoundContributionSummary(bills)` → `{ total, paid, pending, unpaid, paidAmount }`.
- `utils/waReminder.js`:
  - `buildArisanReminderMessage({ memberName, roundLabel, amount, dueDate, bankAccount, tenantName, appUrl })`;
  - `buildArisanDrawShareText({ tenantName, roundLabel, drawnAt, operatorName, winnerName, slotLabel, totalPrize, eligible, excluded, appUrl })`:
    - waktu dalam WIB;
    - daftar nama yang ikut kocok;
    - "Belum lunas (tidak ikut kocok): …";
    - kalimat "Hasil kocok tercatat permanen di RuangWarga dan tidak bisa diulang."
- Test:
  - `getRoundContributionSummary`;
  - kedua builder teks, termasuk tanpa peserta dikecualikan;
  - `fetchArisanRoundBills` tidak lagi memakai periode;
  - `fetchMyArisanBills` demo.
- Commit: `feat(arisan): ARISAN-1.2 service setoran dan teks WA arisan`

## ARISAN-1.3 — Status setoran dan pengingat WA (pengelola)
- `pages/arisan/ArisanRounds.jsx`, modal "Rincian Iuran":
  - **Ringkasan:** lunas, menunggu verifikasi, belum bayar, dan total terkumpul (`getRoundContributionSummary`).
  - **Badge status per peserta:** Lunas / Menunggu verifikasi / Belum bayar.
  - **Aksi untuk yang belum bayar:**
    - "Ingatkan via WA": `buildArisanReminderMessage` + `buildWaLink` dengan `member.phone`;
    - "Tandai Lunas" yang sudah ada.
  - **Menunggu verifikasi:** tautan ke halaman verifikasi pembayaran (`canVerifyPayments`).
  - **Tombol "Salin pengingat semua yang belum bayar":** satu teks berisi daftar nama dan nominal, disalin ke clipboard.
  - **Keterangan:** "Peserta yang belum lunas tidak ikut kocok putaran ini."
- Test komponen yang **mengimpor halaman asli** (ganti isi `ArisanRounds.test.js` yang hanya logika tiruan):
  - status tiga peserta;
  - tombol WA hanya untuk yang belum bayar;
  - tombol salin memanggil clipboard.
- Commit: `feat(arisan): ARISAN-1.3 status setoran dan pengingat WA per putaran`

## ARISAN-1.4 — Kocokan transparan di layar
- `pages/arisan/ArisanDraw.jsx`:
  - **Sebelum kocok:** dua daftar, "Ikut kocok (setoran lunas)" dan "Tidak ikut (belum lunas)". Tombol Kocok aktif bila minimal 1 peserta lunas.
  - **Konfirmasi:** "Hasil kocok final dan tidak bisa diulang. Lanjutkan?"
  - **Animasi** boleh tetap, dengan keterangan kecil "Pemenang ditentukan acak oleh server". Hasil yang ditampilkan **selalu** dari respons RPC.
  - **Kartu hasil:** pemenang, slot, hadiah, waktu (WIB), operator, jumlah peserta ikut / tidak ikut, serta tombol **"Bagikan ke WhatsApp"** (`buildWaLink(null, buildArisanDrawShareText(...))`) dan "Salin teks".
  - **Tab "Riwayat Transparan":** tiap putaran yang sudah dikocok menampilkan waktu, operator, pemenang, hadiah, dan daftar `eligible_snapshot` / `excluded_snapshot` (bisa dibuka-tutup), plus tombol Bagikan. Putaran lama tanpa snapshot: "Daftar peserta tidak tercatat (dikocok sebelum fitur ini)".
- Test komponen yang mengimpor halaman asli (ganti isi `ArisanDraw.test.js`):
  - daftar ikut / tidak ikut;
  - kartu hasil memakai data RPC tiruan;
  - tombol bagikan membentuk link `wa.me`;
  - riwayat menampilkan snapshot.
- Commit: `feat(arisan): ARISAN-1.4 kocokan transparan dan bagikan hasil`

## ARISAN-1.5 — Setoran Saya (peserta)
- Halaman baru `pages/arisan/ArisanMyContributions.jsx`, rute `arisan/my` (`TenantAccessGuard require="isMember"`):
  - daftar setoran anggota (`fetchMyArisanBills`): putaran, nominal, jatuh tempo, status;
  - tombol "Bayar" (status `unpaid`) membuka `MemberBillPayModal` (PANITIA-2);
  - status `pending_verification` → "Menunggu verifikasi". Status `paid` → "Lunas";
  - bagian "Hasil kocok terakhir" (putaran terakhir yang dikocok) dengan tautan ke Riwayat Transparan.
- `components/tenant/TenantShell.jsx` (tenant `arisan`): link "Setoran Saya" ke `/arisan/my` untuk semua anggota (desktop dan drawer).
- `components/dashboard/CitizenDashboard.jsx` (tenant `arisan`): kartu "Setoran Arisan" (setoran belum lunas terdekat + tombol Bayar), menggantikan tautan ke `payment-matrix` yang tidak memuat tagihan arisan.
- Test:
  - halaman menampilkan setoran dan membuka modal bayar;
  - link "Setoran Saya" tampil untuk tenant arisan dan tidak untuk RT/RW.
- Commit: `feat(arisan): ARISAN-1.5 setoran saya dan bayar sendiri`

## ARISAN-1.6 — Template jabatan Arisan
- `services/tenant/rbac.js` `ROLE_TEMPLATES.arisan`:
  - **Ketua Arisan**: `run_special_action`, `generate_billing`, `manage_billing_cash`, `manage_billing_transfer`, `manage_members`, `manage_announcements`, `view_reports`, `manage_settings`;
  - **Bendahara Arisan**: `generate_billing`, `manage_billing_cash`, `manage_billing_transfer`, `view_reports`, `manage_expenses`.
- `pages/roles/ManageRoles.jsx`: label template untuk `arisan` adalah "Arisan". Teks RT/RW dan Kepanitiaan tidak berubah.
- Test:
  - izin template arisan ada di `PLATFORM_PERMISSIONS`;
  - ManageRoles tenant arisan menampilkan "Gunakan Template Jabatan Arisan".
- Commit: `feat(arisan): ARISAN-1.6 template jabatan arisan`

## Definition of Done
- `docs/handoff/ARISAN-1-report.md` (hash commit, nama file persis, ringkasan vitest apa adanya).
- `npx vitest run` (seluruh suite), `npm run lint`, dan `npm run build` hijau.
- Claude: review, lalu menerapkan migration 1.1 ke dev, lalu lapor.
