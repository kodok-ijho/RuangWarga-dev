# PAY-2 — Rekening tenant: isi & tampilkan ke warga

**Batch berikutnya setelah SEC-2.** Baca `docs/handoff/README.md` dan AGENT.md dulu.
Branch: `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit.

## Latar belakang
Keputusan user: uang warga (iuran/sewa/kontribusi) masuk ke **rekening tenant sendiri**,
bukan ke platform. Metodenya `bank_transfer` / `cash` + unggah bukti + verifikasi admin tenant.

Masalahnya aplikasi belum bisa menyimpan maupun menampilkan rekening itu, jadi warga tenant
baru tidak tahu harus transfer ke mana:
- `settings.bank_account` (`bank_name` / `account_number` / `account_holder`) hanya muncul di
  **data mock** `services/tenantOperationalService.js` (sekitar baris 54-60 dan 80-84). Di mode
  nyata tidak ada UI yang menulisnya.
- `components/payment/PaymentFlowModal.jsx:226` hanya menulis
  "Transfer ke rekening pengelola/bendahara" tanpa nomor rekening.
- `pages/NonIplIncomes.jsx:505-508` menampilkan rekening kas Palm Village **hardcode**.

Kabar baiknya: tidak perlu migration. `tenants.settings` sudah JSONB dan
`updateTenantProfileAndSettings(tenantId, { name, address, contact_phone, settings })`
(`services/tenantOperationalService.js:109`) sudah bisa menyimpannya.

---

## PAY-2.1 — Layer service: baca/tulis rekening tenant
`client/src/services/tenantOperationalService.js`
- Tambah helper yang membaca `settings.bank_account` dengan bentuk yang konsisten dan aman:
  kembalikan `null` bila belum diisi, jangan pernah `undefined` atau objek setengah isi.
- Tambah fungsi simpan yang memakai `updateTenantProfileAndSettings` yang sudah ada
  (**jangan** tulis query update baru) dan melakukan validasi:
  - `bank_name`: wajib, 2–50 karakter.
  - `account_number`: wajib, hanya angka (boleh spasi/strip saat input, tapi **disimpan** tanpa pemisah), 6–20 digit.
  - `account_holder`: wajib, 2–100 karakter.
  - Semua di-`trim`. Field kosong → tolak dengan pesan jelas dalam Bahasa Indonesia.
- Jangan ubah data mock yang sudah ada; bentuknya sudah benar dan jadi acuan.

Acceptance: fungsi bisa dipanggil dari UI dan dari test tanpa menyentuh Supabase sungguhan di mode demo.

## PAY-2.2 — Form rekening di halaman Pengaturan
`client/src/pages/Settings.jsx`
- Tambah satu kartu baru **"Rekening Penerima Pembayaran"**, ikuti pola kartu yang sudah ada
  di file ini (mis. kartu "Penerima Tagihan IPL" sekitar baris 515): `pv-card p-5 border border-slate-200 bg-white shadow-xs`,
  judul `h3` dengan kelas yang sama, dan teks bantu `text-[11px] text-slate-400`.
- Tiga input: nama bank, nomor rekening, nama pemilik rekening.
- Gunakan variabel `canEdit` yang sudah dipakai kartu lain supaya tombol/input ter-disable
  untuk yang tidak punya izin. Izin yang relevan: `manage_settings`.
- Simpan lewat fungsi PAY-2.1; tampilkan hasil sukses/gagal lewat mekanisme toast yang sudah dipakai halaman ini.
- Tampilkan peringatan jelas bila belum diisi, misal: "Belum diisi — warga tidak akan melihat
  tujuan transfer dan tidak bisa membayar lewat transfer bank."
- Ikuti konvensi visual AGENT.md §8.4 (`.pv-*`, forest/gold).

## PAY-2.3 — Tampilkan ke warga, hapus hardcode
1. `client/src/components/payment/PaymentFlowModal.jsx` (sekitar baris 215-230, blok `method === 'bank_transfer'`):
   ganti kalimat statis dengan rekening tenant aktif — nama bank, nomor rekening, nama pemilik.
   Sediakan tombol salin nomor rekening (teks bantu jangan bergantung pada ikon saja).
   Bila rekening belum diisi: **jangan tampilkan form unggah bukti**; tampilkan pesan bahwa pengelola
   belum mencantumkan rekening dan sarankan menghubungi pengurus. Metode `cash` tetap jalan.
2. `client/src/pages/NonIplIncomes.jsx:505-508`: hapus rekening Palm Village hardcode, ambil dari rekening tenant aktif.
3. Cari pemakaian lain: `grep -rniE "rekening|account_number" client/src --include=*.jsx | grep -v "\.test\."` —
   pastikan tidak ada nomor rekening hardcode yang tersisa.

## PAY-2.4 — Verifikasi RLS: siapa yang boleh melihat `settings`
**Jangan ubah RLS di batch ini**, cukup periksa dan laporkan:
- Jalankan `grep -rn "tenants" supabase/migrations/202609130007_comprehensive_rls_policies.sql` dan
  policy `tenants` lainnya; catat di report **siapa saja yang bisa SELECT `tenants.settings`**.
- `settings` juga memuat `invite_code`. Kalau seluruh anggota tenant (termasuk warga biasa) bisa
  membaca `settings`, berarti `invite_code` ikut terbaca. Catat temuan ini di
  `docs/handoff/questions.md` — Claude yang akan memutuskan apakah perlu memisahkan kolom publik
  dan privat di batch terpisah. Jangan perbaiki sendiri.

## PAY-2.5 — Test
- Unit test validasi PAY-2.1: nomor rekening dengan huruf → ditolak; spasi/strip → tersimpan bersih; field kosong → ditolak.
- Test render: `PaymentFlowModal` dengan rekening terisi → nomor rekening tampil; tanpa rekening →
  form unggah bukti tidak dirender dan pesan peringatan tampil.
- Ikuti pola test yang sudah ada di `client/src/components/payment/payment.test.jsx`.

## PAY-2.6 — Perbaikan kecil dari review SEC-2 (F8)
`client/src/pages/account/SubscriptionStatus.jsx`: tanggal "Masa Aktif Berakhir" sekarang memakai
`subData.trial_ends_at || subData.current_period_end`. Untuk tenant yang dulu trial lalu berlangganan,
yang tampil jadi tanggal akhir trial yang sudah lewat. Ganti jadi:
`status === 'trial' ? trial_ends_at : current_period_end` (tampilkan "-" bila kosong).
Tambah test kecil untuk kedua kasus.

---

## Definition of Done
- `PAY-2-report.md` dengan hash commit tiap task.
- `npx vitest run`, `npm run build`, `npm run lint` hijau.
- Tidak ada nomor rekening hardcode di `client/src` (selain data mock/demo).
- Temuan RLS `settings` tercatat di `questions.md`.
