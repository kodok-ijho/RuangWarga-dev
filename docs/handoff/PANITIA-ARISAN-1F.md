# PANITIA-ARISAN-1F — Perbaikan susulan PANITIA-2, PANITIA-3, PANITIA-HARGA, ARISAN-1

Status: ✅ **Disetujui user 2026-10-22**, selesai dan direview (`PANITIA-ARISAN-1F-review.md`). Seluruhnya frontend: tidak ada migration dan tidak ada perubahan Edge Function.

Dasar: `PANITIA-2-review.md`, `PANITIA-3-review.md`, `PANITIA-HARGA-review.md`, dan `ARISAN-1-review.md`. Bug berat sudah diperbaiki Claude. Batch ini berisi temuan menengah dan ringan.

## Aturan executor
- Sama dengan `PANITIA-2.md` § Aturan executor:
  - branch `claude/ruangwarga-remote-2-disconnect-m4oku0`;
  - satu task = satu commit, push setelah setiap commit, dan jangan push ke `main`;
  - jangan sentuh `.env*`, `legacy-backend/`, `supabase/migrations/`, maupun `supabase/functions/`.
- Baca § "Catatan untuk executor" di keempat dokumen review sebelum mulai.
- **Fixture test harus memakai bentuk data DB yang asli:**
  - nama kolom persis, misalnya `total_pool_amount`;
  - snapshot berupa objek `{ member_id, full_name, slot_label }`.
  Dua bug ARISAN-1 lolos karena fixture memakai nama karangan.
- Test yang memakai tanggal harus lulus di `TZ=UTC` **dan** `TZ=Asia/Jakarta`.
- Laporan `docs/handoff/PANITIA-ARISAN-1F-report.md` ditulis dari `git diff` dan output test yang sebenarnya.

---

## F.1 — Arisan: layar kocok sesuai server
`pages/arisan/ArisanDraw.jsx` (dan `ArisanMyContributions.jsx` untuk poin hadiah/slot):
- **Daftar "Ikut kocok" / "Tidak ikut":**
  - dibangun dari `candidates` (`fetchArisanCandidates`: peserta `has_won = false`), dicocokkan dengan tagihan putaran (`roundBills`) per `member_id`;
  - "Ikut" = kandidat yang tagihannya `paid`, dan "Tidak ikut" = kandidat lain;
  - pemenang putaran sebelumnya tidak masuk kedua daftar;
  - tombol Kocok aktif hanya bila daftar "Ikut" berisi minimal 1 orang;
  - label slot dari `cand.slot?.label`.
- **Hadiah:** semua pembacaan `pool_amount` diganti `total_pool_amount`. Ini berlaku untuk hero, kartu hasil, riwayat, teks bagikan, dan "Hasil kocok terakhir" di `ArisanMyContributions`.
- **Slot pemenang** untuk putaran yang sudah dikocok: `eligible_snapshot.find(p => p.member_id === r.winner_member_id)?.slot_label`. Putaran lama tanpa snapshot memakai "-". Hapus pembacaan `r.slot_label` dan `r.winner?.unit?.name`, karena keduanya tidak ada.
- **Waktu kocok** di kartu hasil dan modal perayaan: dari `drawn_at` respons RPC atau putaran, bukan `new Date()` klien.
- **Teks WA:** `utils/waReminder.js` `buildArisanDrawShareText` diubah judulnya menjadi "HASIL KOCOKAN ARISAN" (bukan "PENGUKURAN"). Perbarui test-nya.
- **Link "Riwayat Transparan"** di `ArisanMyContributions` membuka tab riwayat, misalnya `?tab=history`, yang dibaca `ArisanDraw` saat dimuat.
- **Test** (`ArisanDraw.test.js`):
  - pemenang lama yang sudah lunas tidak tampil di "Ikut kocok";
  - **klik Kocok → konfirmasi → mock `drawArisanWinner`**, lalu kartu hasil menampilkan `total_prize` dan waktu dari `drawn_at` RPC;
  - riwayat dengan `total_pool_amount: 300000` menampilkan "Rp300.000" dan slot dari snapshot.
- Commit: `fix(arisan): F.1 layar kocok sesuai aturan server`

## F.2 — Arisan: setoran dan pengingat
- **`services/tenant/arisan.js` `fetchMyArisanBills`:** setoran belum lunas diurutkan dari jatuh tempo **terdekat** (ascending). Setoran yang sudah lunas tetap di bawah.
- **`components/dashboard/CitizenDashboard.jsx`** (arisan):
  - kartu "Semua Setoran Lunas" tidak tampil saat memuat atau error. Saat error, tampilkan "Gagal memuat setoran" + "Coba lagi";
  - teksnya tidak menjanjikan ikut kocok. Contoh: "Semua setoran Anda sudah lunas."
- **`pages/arisan/ArisanRounds.jsx`:**
  - tombol "Ingatkan via WA" hanya tampil bila nomor HP ada;
  - "Salin pengingat semua" memakai `await navigator.clipboard.writeText` di `try/catch`, dengan toast gagal bila ditolak;
  - link verifikasi memakai `useTenantAccess().canVerifyPayments` (tunai **atau** transfer);
  - tagihan `cancelled` diberi badge "Dibatalkan" tanpa aksi, dan tidak dihitung sebagai "Belum bayar".
- **Test:**
  - urutan `fetchMyArisanBills` demo;
  - tombol WA tidak tampil tanpa nomor;
  - clipboard menolak → toast gagal.
- Commit: `fix(arisan): F.2 setoran dan pengingat arisan`

## F.3 — Kepanitiaan: iuran acara
- **`services/tenant/programs.js` `fetchProgramTransactions`:**
  - kegagalan `fetchProgramDues` ditangkap (`console.error` + `[]`), sehingga pemasukan dan pengeluaran acara tetap tampil;
  - tampilkan peringatan kecil "Data iuran gagal dimuat" di tab Iuran bila itu terjadi.
- **`services/tenant/programDues.js`:**
  - `createProgramDues`: error kode `23505` → pesan "Sebagian anggota sudah punya iuran aktif untuk acara ini. Muat ulang lalu coba lagi.";
  - ubah nominal dan batalkan iuran memakai `.eq('status', 'unpaid')` saat update, lalu `.select('id')`. Bila 0 baris, lempar "Iuran sudah dibayar atau diajukan; muat ulang halaman.";
  - mode demo `submitMemberTransfer` untuk iuran acara: iuran di store demo menjadi `pending_verification`.
- **`pages/tenant/ProgramDetail.jsx`:**
  - "Ingatkan via WA" hanya untuk `canGenerateBilling || canRecordCash || canVerifyPayments`;
  - "Anggota Ditagih" memakai `summary.dues?.count ?? 0`;
  - tanggal jatuh tempo bawaan memakai `getLocalDateString()` dari `utils/date.js`, bukan tanggal UTC.
- **`components/payments/MemberBillPayModal.jsx`:** nominal yang ditampilkan = `amount + late_fee` (sama dengan yang dikirim).
- **Test:**
  - dues gagal → pemasukan tetap tampil;
  - WA tersembunyi untuk anggota biasa;
  - modal menampilkan nominal + denda.
- Commit: `fix(panitia): F.3 iuran acara lebih tahan galat`

## F.4 — Kepanitiaan: dokumen dan LPJ
- **Tanggal WIB:**
  - tambah `formatDateWIB(value, opts)` di `utils/date.js` (`Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ... })`);
  - nilai tanggal saja (`YYYY-MM-DD`) dibaca sebagai tanggal kalender, tanpa pergeseran zona;
  - dipakai di tab Dokumen (`ProgramDetail`) dan seluruh `ProgramLpj.jsx`.
- **Tombol "Buka" dokumen** (`ProgramDetail`):
  - buka tab kosong secara sinkron (`const w = window.open('', '_blank')`) **sebelum** `await getProgramDocumentUrl`, lalu `w.location.href = url` dan `w.opener = null`;
  - bila gagal, tutup `w` dan tampilkan toast;
  - bila `window.open` mengembalikan null, pakai `window.location.assign(url)`.
- **`ProgramLpj.jsx`:**
  - kota bawaan `''`, bukan "Jakarta";
  - kolom "Penerima" diganti "Kategori" (`exp.category`), karena `recipient` tidak ada di data.
- **`services/tenant/programDocuments.js`:**
  - nama file di atas 200 karakter ditolak **sebelum** unggah ("Nama file terlalu panjang (maks. 200 karakter)");
  - `deleteProgramDocument` memakai `.select('id')` dan melempar error bila 0 baris terhapus.
- **`accept` di form unggah:** hanya `.pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp`.
- **Test:**
  - `formatDateWIB('2026-02-01T18:30:00Z')` → 2 Feb 2026 di TZ UTC maupun WIB;
  - nama 201 karakter ditolak tanpa memanggil `uploadTenantFile`;
  - hapus 0 baris → error;
  - LPJ menampilkan kategori.
- Commit: `fix(panitia): F.4 dokumen dan LPJ (WIB, buka di iOS, validasi)`

## F.5 — Kepanitiaan: masa aktif acara
- **`services/tenant/programs.js`:**
  - `getProgramAccessState`: `tenantType !== 'panitia'` (termasuk null/undefined) → `unlimited`;
  - `formatProgramAccessLabel` memakai `formatDateWIB` dari F.4.
- **`pages/tenant/TenantIncomes.jsx` dan `pages/Expenses.jsx`:**
  - penanganan `?program=<id>&new=1` menunggu daftar acara selesai dimuat (flag `programsLoaded`);
  - acara tidak writable → toast penjelasan dan form tidak dibuka;
  - `Expenses` memuat daftar acara tanpa menunggu `fetchExpenses`.
- **`pages/Expenses.jsx`:** gagal hapus menampilkan `err.message` dari server, sama seperti TenantIncomes.
- **`pages/account/SubscriptionStatus.jsx`** (panitia):
  - gagal memuat acara → "Gagal memuat acara." + "Coba lagi", bukan "Belum ada acara";
  - riwayat pembayaran kosong tanpa kata "trial".
- **Mode demo:**
  - `context/TenantContext.jsx`: tenant demo `panitia` baru langsung `status: 'active'`;
  - `programs.js`: jatah gratis demo hanya sekali per tenant (dicatat di store, tidak kembali setelah acara dihapus).
- **Harga:** tampilan "Rp25.000" memakai `formatRupiah(PANITIA_PRICING.pricePerProgram)` dari `config/panitiaPricing.js`.
- **Test:**
  - deep link ke acara `expired` (daftar acara dimuat async) → toast dan modal tidak terbuka;
  - label masa aktif WIB untuk `2026-02-01T18:30:00Z` = "2 Feb 2026";
  - `tenantType` null → `unlimited`.
- Commit: `fix(panitia): F.5 masa aktif acara (deep link, WIB, demo)`

## Definition of Done
- `docs/handoff/PANITIA-ARISAN-1F-report.md`: hash commit, nama file persis, dan ringkasan vitest apa adanya.
- Hijau semua:
  - `npx vitest run` (seluruh suite, di `TZ=UTC` dan `TZ=Asia/Jakarta`);
  - `npm run lint`;
  - `npm run build`.
- Claude: review, lalu lapor.
