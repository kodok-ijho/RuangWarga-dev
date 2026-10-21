# VERT-1 Review (Claude, 2026-10-21)

Hasil: **diterima.** Keenam task sesuai `VERT-1.md`, dengan dua perbaikan kecil oleh Claude (di bawah).

## Verifikasi di cloud Claude
- `npm run lint`: bersih.
- `npm run build`: sukses.
- `npx vitest run` (`VITE_DEMO_MODE=false`):
  - sebelum perbaikan: 1034/1035 lolos;
  - sesudah perbaikan: **73 file, 1036/1036 lolos**.
- Timeout `TenantSettings.test.jsx` yang muncul di HP tidak terjadi di sini.
- DoD: `user?.id` tidak ada lagi di `pages/arisan/`, `manual_transfer`/`'verified'` tidak ada lagi di `arisan.js`, dan test baru mengimpor kode asli.

## Yang dicek per task
- **1.1**: Kocok dan Siklus Baru mengirim operator `null`, dan `useAuth` dihapus.
- **1.2**: `payArisanBillManual` → `submitTenantPayment(..., { method: 'cash', isStaff: true })`, tanpa update `billing_items` dari klien. Error diteruskan ke pemanggil.
- **1.3**: `getArisanAccess(hasPermission)`. `hasPermission` di `TenantContext` bernilai true untuk owner dan platform admin. Rute `/t/:id/arisan/*` dijaga `isMember`.
- **1.4**: `selectNewUnitLabels` dipindah tanpa perubahan isi (re-export tetap). Ketiga wizard memakai ulang kode undangan dan hanya menyisipkan label baru. Kelas kini menyimpan `onboarding_completed`.
- **1.5**: Kelas melewati slot tanpa siswa (`no_student`). Tiga titik periode di PaymentMatrix memakai WIB.
- **1.6**:
  - `assignRoomContract` difilter `tenant_id`, error dicek, dan gagal sebelum tagihan dibuat bila 0 baris;
  - halaman Kamar mengenal `vacant`/`occupied`, dan kamar terisi tidak bisa dinonaktifkan;
  - form edit unit tidak mengirim status, jadi validasi baru di `updateTenantUnit` aman.

## Perbaikan oleh Claude
1. `services/regression.test.js` (T11.1 no. 3) masih mengunci bug C1, yaitu slot kosong ikut ditagih (`preview.length = 3`). Diubah ke perilaku baru: 2 tagihan dan 1 `skipped` dengan `no_student`.
2. Ketiga wizard menyaring dengan `newLabelSet.has(...)`. Akibatnya label yang diketik ganda di form yang sama tetap tersisip dua kali (perilaku lama). Diganti `newLabelSet.delete(...)` (true sekali per label), dan ditambah test di `KosSetupWizard.test.jsx`.

## Catatan untuk executor
- Ringkasan di chat menyebut "174 test lolos", tetapi tidak menyebut 2 kegagalan di suite penuh. Laporan file-nya jujur. Lain kali, ringkasan chat juga harus memuat hasil suite penuh.
- Laporan menyebut nama flag `canDrawWinner` / `canRecordManualPayment`. Nama yang benar di kode: `canManageRounds`, `canGenerateBills`, `canRecordPayment`.
- Test lama yang mengunci bug yang sedang diperbaiki **boleh** diubah dalam task yang sama; sebutkan di laporan.

## Dibawa ke batch berikutnya (bukan bloker)
- `createTenantUnit` selalu membuat status `active`. Untuk kos/kelas seharusnya `vacant` (KOS-1).
- `order_index` / `slot_number` / `slot_index` dari wizard dihitung setelah penyaringan. Hanya metadata, tidak dipakai di tempat lain.
- Arisan baru bisa diuji ujung ke ujung setelah VERT-2 (pendaftaran peserta otomatis).
