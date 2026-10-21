# PANITIA-1 Review (Claude, 2026-10-21)

Hasil: **diterima setelah perbaikan oleh Claude.** Ada 4 bug berat yang lolos dari test executor, dan semuanya sudah diperbaiki di commit review. Migration PANITIA-1.2 sudah terpasang di Supabase dev. Sisa temuan menengah dan ringan masuk `PANITIA-1F.md`.

## Verifikasi
- Kondisi commit executor:
  - `npm run lint` bersih, `npm run build` sukses;
  - `npx vitest run`: **2 test gagal** (84/86 file lulus), padahal laporan menyebut semuanya lulus.
- Sesudah perbaikan Claude: semua hijau (lihat "Verifikasi akhir").
- Kedua migration identik byte-per-byte dengan `docs/handoff/assets/PANITIA-1/`.
- Tidak ada file terlarang yang tersentuh, dan tidak ada perubahan dependency.
- Selain review langsung, halaman acara/dashboard dan halaman setup/pemasukan diperiksa oleh dua agen review terpisah. Temuan mereka diverifikasi Claude sebelum ditindaklanjuti.

## Bug yang diperbaiki Claude
1. **Acara tidak bisa dimuat atau dibuat di Supabase.**
   - `services/tenant/programs.js` (4 query) melakukan embed `tenant_members(id, name)`, padahal kolomnya `full_name`. PostgREST akan menolak query ini (kolom tidak ada).
   - Akibatnya daftar acara, dashboard, dan status langganan selalu kosong, dan "Buat Acara" gagal.
   - Test tidak menangkapnya karena berjalan di mode demo.
   - Diganti `full_name`. UI sudah punya fallback ke `full_name`.
2. **Status "Selesai" tidak pernah bisa dipakai.** Form dan pilihan status mengirim `completed`, padahal service dan CHECK database hanya menerima `done`. Diganti `done` (`Programs.jsx`, `ProgramDetail.jsx` 2 tempat).
3. **Simpan pengeluaran tetap gagal setelah 1.1.**
   - `Expenses.jsx` mengirim `recordedBy: profile?.id` (ID login), padahal `expenses.recorded_by` adalah FK ke `tenant_members.id`. Setiap insert akan ditolak FK.
   - Bug ini sudah ada sebelum PANITIA-1, tetapi tersembunyi karena tombol simpan selalu mati.
   - Diganti `activeMember?.id`.
4. **Wizard Kepanitiaan menghapus rekening tersimpan.** `PanitiaSetupWizard.jsx` mengisi field rekening hanya bila data dimuat sendiri. `SetupWizard` selalu mengirim `initialData`, sehingga field kosong dan rekening tertimpa `null` saat wizard dijalankan ulang. Sekarang diisi dari `pickBankAccountForForm(initialData?.settings)`, sama seperti wizard Kelas.
5. Pemasukan tidak mencatat pencatat dan penghapus (`recorded_by` / `deleted_by` selalu NULL). `TenantIncomes.jsx` sekarang mengirim `memberId: activeMember?.id`.
6. ID demo `prog-` / `budget-` / `inc-` dibuat dari `Date.now()` dan bisa kembar dalam milidetik yang sama. Akibatnya ringkasan demo salah hitung, dan inilah penyebab test `programs.test.js` gagal. Sekarang ditambah sufiks acak.
7. `Home.navigation.test.jsx` masih mencari teks lama "kos, arisan, atau kelas". Disesuaikan dengan teks baru "kepanitiaan".
8. `supabase/tests/tenant_programs_matrix.sql`: 3 insert pengeluaran tidak mengisi `expense_date` (NOT NULL), sehingga C5–C7 gagal karena alasan yang salah. Ditambah `CURRENT_DATE`.

## Penerapan migration ke dev
- **Langkah 1:** `ALTER TYPE public.tenant_type ADD VALUE 'panitia'`. Riwayat `20261021141204 tenant_type_panitia`.
- **Langkah 2:**
  - migration `tenant_programs`, plus test kasus P dan C1–C9 sebagai penjaga di sub-transaksi. Fixture memakai tenant jenis `panitia`, dan data uji selalu dibuang;
  - riwayat `20261021141307 tenant_programs`.
- **Hasil:**
  - enum `rt_rw, kos, arisan, kelas, panitia`;
  - kedua tabel ada, 4 kolom penaut, 8 policy;
  - `anon` tanpa akses;
  - 0 data uji, jumlah tenant tetap 2.
- **Belum dijalankan di dev:**
  - Kasus C10/C11 (hapus acara dan pos RAB). Konektor membatalkan perintah `DELETE`. Jalankan `supabase/tests/tenant_programs_matrix.sql` di SQL Editor bila ingin memastikan.
  - Uji embed REST: proxy sandbox menolak koneksi ke `supabase.co`.

## Catatan untuk executor
- **Laporan tidak cocok dengan diff:**
  - nama file migration dan test salah;
  - menyebut file `config/tenantRoleTemplates.js` dan role dasar `anggota_panitia` yang tidak ada;
  - menyebut field wizard yang tidak ada;
  - menyatakan semua test lulus, padahal 2 gagal.
  - Laporan wajib ditulis dari `git diff` dan output test yang sebenarnya.
- Mode demo tidak menguji query Supabase. Setiap `select` / embed harus dicocokkan dengan nama kolom di migration (`tenant_members.full_name`, bukan `name`). Nilai enum/status juga harus dicocokkan dengan CHECK di database.
- Test SQL: cek kolom NOT NULL di tabel yang di-insert (`expenses.expense_date`).
- ID demo jangan hanya `Date.now()`.

## Verifikasi akhir (setelah perbaikan Claude)
- `npm run lint`: bersih.
- `npm run build`: sukses.
- `npx vitest run` (`VITE_DEMO_MODE=false`): **86 file, 1132/1132 lolos**.

## Belum diuji (uji manual di ruangwarga-dev setelah digabung ke `main`)
- Buat tenant baru "Kepanitiaan & Acara", lalu jalankan wizard. Wizard tidak membuat unit, dan rekening tidak hilang bila dijalankan ulang.
- Gabung lewat link undangan: tidak ada pilihan unit.
- Buat acara, isi RAB, catat pemasukan dan pengeluaran dari tombol di detail acara, lalu cek Ringkasan dan ekspor CSV.
- RT/RW dan Kos: **simpan pengeluaran sekarang bisa** (sebelumnya selalu mati), dan menu Pemasukan muncul.
- Ubah status acara menjadi Selesai, lalu acara pindah ke tab Selesai.
