# RTRW-3: Pengumuman dan Acara multi-tenant

Status: **RTRW-3.1 disetujui user 2026-10-20** (menyentuh schema, RLS, dan Edge Function storage). RTRW-3.2 (Acara) direncanakan setelah 3.1 selesai.
Latar belakang: AUDIT-RTRW F7 (Acara masih memakai n8n Palm Village) dan F8 (Pengumuman hanya membaca localStorage dan tidak punya tabel).

## Keputusan user (2026-10-20)
- Izin baru **"Kelola Pengumuman & Acara"** (`manage_announcements`), otomatis diberikan ke jabatan Ketua dan Sekretaris di template jabatan, dan bisa diatur per jabatan lewat Atur Jabatan.
- Pemegang **"Kelola Pengaturan"** (`manage_settings`) dan owner juga boleh menulis.
- Pengumuman boleh memuat **gambar** (misalnya poster), disimpan di **Cloudflare R2** seperti bukti bayar (STOR-1).

## RTRW-3.1 Pengumuman

### Requirement
1. Tabel `tenant_announcements` dengan kolom:
   - `id`, `tenant_id` (cascade)
   - `title` (1–150 karakter), `body` (maksimal 5000 karakter)
   - `image_path` (boleh kosong), `is_pinned`
   - `published_at`, `created_by` (default `auth.uid()`)
   - `created_at`, `updated_at`
2. **Baca:** anggota tenant berstatus approved, owner, dan platform admin.
   **Tulis/ubah/hapus:** owner, pemegang `manage_announcements` atau `manage_settings`, dan platform admin. Penulisan ditolak bila langganan tenant `read_only`.
3. Izin `manage_announcements` masuk ke katalog `permissions`. Role tenant yang sudah ada **tidak** diisi otomatis, karena owner dan pemegang Kelola Pengaturan sudah bisa menulis. Pengurus lain bisa ditambahkan lewat Atur Jabatan.
4. Gambar memakai jenis file baru `announcement_image` di R2:
   - Jenis file: hanya gambar (JPEG/PNG/WebP), maksimal 5 MB.
   - Siapa boleh unggah: sama dengan aturan tulis.
   - Siapa boleh lihat: anggota approved tenant itu.
   - Path kanonis mengikuti pola file STOR-1 yang sudah ada.
5. Halaman Pengumuman di `/t/:tenantId` (menu dimunculkan kembali untuk tenant):
   - urutan: disematkan dulu, lalu terbaru;
   - formulir buat/ubah dengan unggah gambar;
   - hapus dengan konfirmasi di halaman;
   - tombol **"Bagikan ke WA"** (`wa.me/?text=`, gratis) berisi judul, ringkasan isi, dan link aplikasi.
6. Dashboard tenant menampilkan 3 pengumuman terbaru.
7. Mendukung mode demo (data contoh) dan mode Supabase. Rute lama Palm Village di luar `/t/` tidak diubah.

### Task
| Task | Isi |
|---|---|
| RTRW-3.1a ✅ (`e2702f1`, terpasang di dev 2026-10-20) | Migration: izin `manage_announcements`, helper `can_manage_announcements(tenant_id)`, tabel `tenant_announcements` + RLS + index, cabang `announcement_image` di `can_upload_tenant_file` / `can_read_tenant_file` beserta validator path. Test SQL matriks (anggota baca, warga tidak bisa tulis, pemegang izin bisa tulis, tenant lain terisolasi, read_only ditolak, path gambar). Dry-run lalu terapkan di dev lewat SQL Editor. |
| RTRW-3.1b ✅ (`5c553c3`, deploy CLI: storage-upload v4, storage-sign-url v3) | Edge Function `storage-upload` dan `storage-sign-url` + `_shared/fileRules.ts` menerima jenis `announcement_image`. **Perlu deploy ulang** kedua fungsi; cara deploy disepakati dulu karena konfirmasi konektor Supabase tidak tampil di session Remote Control. |
| RTRW-3.1c ✅ (`72d9085`, `e53483b`) | Frontend: service `client/src/services/tenant/announcements.js`, halaman Pengumuman tenant, widget dashboard, izin di `rbac.js` (katalog + template Ketua/Sekretaris), `canManageAnnouncements` di akses tenant, data demo, dan test. |

## RTRW-3.2 Acara

Status: **disetujui user 2026-10-20** (menyentuh schema dan RLS).
Tabel lama `public.events` / `public.rsvp` (single-tenant Palm Village) dan rute `/events` di luar `/t/` tidak disentuh.

### Requirement
1. Tabel `tenant_events` dengan kolom:
   - `id`, `tenant_id` (cascade)
   - `title` (1–150 karakter), `description` (maksimal 5000 karakter), `location` (maksimal 200 karakter, boleh kosong)
   - `starts_at` (wajib), `ends_at` (boleh kosong, tidak boleh sebelum `starts_at`)
   - `image_path` (boleh kosong)
   - `created_by`, `created_at`, `updated_at`
2. RLS sama dengan Pengumuman: baca oleh anggota approved, owner, dan platform admin; tulis oleh `can_manage_announcements(tenant_id)` dan ditolak bila `read_only`.
3. Gambar **memakai ulang** jenis file `announcement_image` dan path `{tenant}/announcements/{uuid}.{ext}`, sehingga tidak perlu mengubah fungsi storage dan tidak perlu deploy Edge Function. Validator path yang sama dipakai di check constraint.
4. Halaman Acara di `/t/:tenantId/events` (menu dimunculkan untuk semua anggota):
   - tab **Mendatang** (urut terdekat) dan **Selesai** (urut terbaru);
   - kartu berisi tanggal, jam (WIB), lokasi, deskripsi, dan gambar;
   - tombol **Bagikan ke WA** dan **Tambah ke Google Calendar** (link `calendar.google.com/calendar/render?action=TEMPLATE…`, gratis);
   - buat/ubah/hapus untuk pemegang izin.
5. Dashboard tenant menampilkan 3 acara mendatang.
6. Mode demo dan mode Supabase. RSVP/kehadiran dan keuangan acara **belum** (tugas terpisah).

### Task
| Task | Isi |
|---|---|
| RTRW-3.2a ✅ (`fbc3ccd`, terpasang di dev 2026-10-20 lewat Supabase CLI) | Migration `tenant_events` + RLS + index `(tenant_id, starts_at)` + test SQL matriks. Dry-run lalu terapkan di dev lewat SQL Editor. |
| RTRW-3.2b ✅ (`1739323`) | Service `client/src/services/tenant/events.js` (CRUD, whitelist field, gambar lewat `uploadAnnouncementImage`), data demo, dan test. |
| RTRW-3.2c ✅ | Halaman Acara tenant, rute, menu, kartu dashboard, dan test. |
