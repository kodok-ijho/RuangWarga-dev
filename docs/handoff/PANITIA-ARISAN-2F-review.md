# PANITIA-ARISAN-2F Review (Claude, 2026-10-25)

Hasil: **diterima** tanpa perubahan.

## Verifikasi
- **Cek otomatis** (dijalankan Claude di HEAD branch `53c2345`, termasuk perubahan KOS-2):
  - `npm run lint` bersih;
  - `npm run build` sukses;
  - `VITE_DEMO_MODE=false npx vitest run`: **97 file, 1265/1265 lolos**, baik di `TZ=UTC` maupun `TZ=Asia/Jakarta`.
- **Cakupan perubahan** (`c7283f4..5aa27d1`): 14 file di `client/src/` dan laporan. Tidak ada migration, Edge Function, `.env`, atau secret.

## Yang dicek
- **2F.1 (LPJ):**
  - galat `fetchProgramTransactions` dan `duesError` memunculkan banner `print:hidden` dengan tombol "Coba lagi" (memanggil ulang `loadLpjData`);
  - tombol cetak `disabled`, dan `handlePrint` juga dijaga.
- **2F.2 (kocok):** `activeCandidates` = `has_won !== true` dan `member.status === 'approved'`. Status lunas per anggota: ada `paid` → lunas; bila tidak, tagihan non-`cancelled`. Aturan ini sama dengan `draw_arisan_winner` di `202610220004_arisan_transparent_draw.sql` (`tm.status = 'approved'`, `EXISTS … b.status = 'paid'`). `fetchArisanCandidates` memang memilih `member.status`.
- **2F.3 (tautan acara):** acara tidak ada → toast, form tidak terbuka, `new` dihapus dari URL. Daftar yang gagal dimuat menjadi `[]` dengan `programsLoaded = true`, sehingga kasus gagal muat ikut tertangani.
- **2F.4:** nomor HP hanya tampil untuk `canGenerateBilling || canRecordCash || canVerifyPayments`; durasi diambil dari `PANITIA_PRICING`; impor `formatDate` sudah dihapus.
