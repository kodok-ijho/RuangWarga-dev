# PANITIA-ARISAN-2F — Perapian kecil setelah PANITIA-ARISAN-1F

Status: ✅ **Disetujui user 2026-10-23.** Seluruhnya frontend: tidak ada migration dan tidak ada perubahan Edge Function.

Dasar: `PANITIA-ARISAN-1F-review.md` § Catatan ringan.

Keputusan user: nomor HP anggota di tab Iuran hanya tampil untuk pengurus. Ini usulan Claude yang diterima.

## Aturan executor
- Sama dengan `PANITIA-ARISAN-1F.md` § Aturan executor. Branch `claude/ruangwarga-remote-2-disconnect-m4oku0`, push setelah setiap commit, dan jangan push ke `main`.
- Satu task = **satu** commit. Bila task yang sudah di-commit perlu diperbaiki, pakai pesan `fix(...): 2F.x susulan — <apa yang diubah>` dan jelaskan di laporan.
- Test dengan tanggal harus lulus di `TZ=UTC` dan `TZ=Asia/Jakarta`.

---

## 2F.1 — LPJ tidak boleh tercetak dengan data tidak lengkap
`pages/tenant/ProgramLpj.jsx`:
- Bila `fetchProgramTransactions` gagal seluruhnya, atau mengembalikan `duesError: true`, tampilkan banner merah `print:hidden`. Teksnya: "Data transaksi/iuran gagal dimuat. Angka di LPJ ini belum lengkap. Muat ulang sebelum mencetak." Banner diberi tombol "Coba lagi" yang memuat ulang data.
- Selama keadaan itu, tombol "Cetak LPJ (A4)" **nonaktif**.
- Jangan lagi menelan galat menjadi data kosong tanpa tanda.
- Test:
  - `duesError: true` → banner tampil dan tombol cetak nonaktif;
  - transaksi gagal total → banner tampil;
  - data normal → tombol cetak aktif.
- Commit: `fix(panitia): 2F.1 LPJ tidak dicetak saat data belum lengkap`

## 2F.2 — Daftar kocok Arisan sama persis dengan server
`pages/arisan/ArisanDraw.jsx`:
- **Status anggota:** kandidat yang `member.status` bukan `approved` tidak masuk "Ikut kocok" maupun "Tidak ikut", dan tidak dihitung di statistik. `fetchArisanCandidates` sudah memuat `member.status`. Data demo di `services/tenant/arisan.js` diberi `status: 'approved'`.
- **Tagihan ganda:** status per anggota tidak lagi diambil dari tagihan terakhir di daftar.
  - Bila anggota punya tagihan `paid` di putaran itu → lunas.
  - Bila tidak, pakai tagihan yang bukan `cancelled`.
  - Tagihan `cancelled` saja → belum lunas.
- Test:
  - kandidat berstatus `left`/`pending` tidak tampil di kedua daftar;
  - anggota dengan tagihan `cancelled` lalu `paid` (urutan apa pun) tampil di "Ikut kocok".
- Commit: `fix(arisan): 2F.2 daftar kocok sama dengan aturan server`

## 2F.3 — Tautan langsung ke acara yang tidak ditemukan
`pages/tenant/TenantIncomes.jsx` dan `pages/Expenses.jsx`:
- Saat menangani `?program=<id>&new=1` (setelah daftar acara termuat): bila acara tidak ada di daftar, atau daftar gagal dimuat, tampilkan toast "Acara tidak ditemukan atau tidak bisa dipilih." Form **tidak** dibuka, acara tidak dipilih otomatis, dan `new` dihapus dari URL.
- `Expenses.test.jsx`: ganti test F.5 yang hanya mencari teks kode sumber dengan test render sungguhan (daftar acara dimuat async), sama seperti di `TenantIncomes.test.jsx`, untuk:
  - acara `expired` → toast dan modal tidak terbuka;
  - acara tidak ada → toast dan modal tidak terbuka;
  - acara aktif → modal terbuka dengan acara terpilih.
- Test yang sama untuk kasus "acara tidak ada" di `TenantIncomes.test.jsx`.
- Commit: `fix(panitia): 2F.3 tautan transaksi ke acara yang tidak ada`

## 2F.4 — Nomor HP anggota hanya untuk pengurus, dan perapian
- `pages/tenant/ProgramDetail.jsx` (tab Iuran, ±baris 1744): nomor HP anggota hanya ditampilkan untuk `canGenerateBilling || canRecordCash || canVerifyPayments`, gerbang yang sama dengan link WA. Test: anggota biasa tidak melihat nomor HP, dan bendahara melihatnya.
- `services/tenant/programs.js`: hapus impor `formatDate` yang tidak dipakai.
- `pages/account/ChoosePlan.jsx` (±161, ±181) dan `pages/account/SubscriptionStatus.jsx` (±397): "1 bulan" dan "12 bulan" diambil dari `PANITIA_PRICING.freeTrialMonths` dan `PANITIA_PRICING.periodMonths`. Komentar di ±46 tidak perlu diubah.
- Commit: `fix(panitia): 2F.4 nomor HP hanya untuk pengurus dan perapian`

## Definition of Done
- `docs/handoff/PANITIA-ARISAN-2F-report.md` ditulis dari `git diff` dan output asli:
  - hash commit dan nama file persis;
  - ringkasan vitest kedua zona waktu, disalin apa adanya.
- Hijau semua:
  - `TZ=UTC npx vitest run` dan `TZ=Asia/Jakarta npx vitest run` (seluruh suite);
  - `npm run lint`;
  - `npm run build`.
