# STOR-1 Report: penyimpanan file di Cloudflare R2

Executor: Antigravity (agy). Orchestrator, review, deploy, dan QA: Claude (sesi lokal). Uji end-to-end oleh user di production `ruangwarga-dev.vercel.app` pada 2026-10-14.

| Task | Commit | Status | Catatan |
|---|---|---|---|
| STOR-1.1 | fd0261a | done | `can_upload_tenant_file` dan `can_read_tenant_file`. Dry-run test matriks lulus, lalu diterapkan ke Supabase dev (migration `storage_r2_access`). |
| STOR-1.2 | 0a3b968 | done | `_shared/fileRules.ts` (magic bytes, 5 MB, path canonical), `_shared/r2.ts` (aws4fetch 1.0.20), dan Edge Function `storage-upload`. |
| STOR-1.3 | 6fdcd69 | done | Edge Function `storage-sign-url`. Pengguna tidak berhak selalu mendapat 403 (keberadaan file tidak bocor). |
| STOR-1.4 | 3a569c5 | done | `fileStorageService.js`. Upload bukti dan nota lewat Edge Function, dan `createReceiptSignedUrl` memakai `storage-sign-url`. |
| STOR-1F | efb24f9 | done | Edge Function: `auth.getUser(token)` eksplisit (lihat temuan 1). |
| STOR-1F.2 | 00eb5b0 | done | Tombol "Buka" di riwayat warga memakai presigned URL (lihat temuan 2). |

## Infrastruktur
- R2 bucket `ruangwarga-dev` (APAC), privat. Public Development URL dan custom domain nonaktif.
- CORS: hanya GET dan HEAD dari `http://localhost:5173` dan `https://ruangwarga-dev.vercel.app`. Diuji dengan preflight: origin asing, `http://` ke Vercel, dan `PUT` ditolak 403. Akses anonim dan listing ditolak.
- Secrets `R2_*` di Supabase Edge Function secrets, diisi user.
- Edge Function yang ter-deploy: `storage-upload` v3 dan `storage-sign-url` v2, dengan `verify_jwt` aktif. Isi kodenya identik dengan repo (komentar dibuang).
- Security advisor: tidak ada temuan baru dari fungsi STOR-1.

## Output verifikasi
- vitest: 57 files / 829 tests passed (pada `8e84e15`), dijalankan dengan `VITE_DEMO_MODE=false`.
- build: ok. lint: ok.

## Uji end-to-end (production, data dev)
| Langkah | Hasil |
|---|---|
| Warga upload bukti transfer (JPG 54 KB) | `storage-upload` 200. Path `{tenant}/payments/{bill}/{ts}_{nama}.jpg`, `proof_stored=true`, tagihan `pending_verification` (trigger SEC-5). |
| Pengurus melihat bukti | `storage-sign-url` 200 (cabang RPC staf) |
| Warga melihat buktinya sendiri | `storage-sign-url` 200 (cabang metadata `uploaded-by`) |
| Pengurus memverifikasi | Pembayaran `completed`, tagihan `paid` |
| Upload di atas 5 MB atau tipe palsu | Belum diuji manual. Tercakup unit test (`storageFileRules`, `fileStorageService`). |
| Nota pengeluaran (`expense_receipt`) | Belum diuji end-to-end. Tercakup unit test. |

## Temuan saat uji dan perbaikannya
1. **401 di semua upload.** supabase-js 2.39.0 di Edge Function tidak memakai header Authorization global saat `auth.getUser()` dipanggil tanpa argumen (`AuthSessionMissingError`; direproduksi dengan versi yang sama). Perbaikan: token diteruskan eksplisit (STOR-1F).
2. **404 saat warga klik "Buka".** `PaymentHistoryList` memasang path R2 mentah ke `href`. Perbaikan: presigned URL (STOR-1F.2).
3. Di luar STOR-1, ditemukan saat uji coba pertama di mode non-demo:
   - Vercel `VITE_DEMO_MODE=true` sudah diubah user menjadi `false`.
   - Provider Google di Supabase Auth belum aktif; sudah diaktifkan user.
   - Pendaftaran warga tidak kembali ke `/join` setelah login: JOIN-1F (`24a85d9`).
   - Tombol Setujui/Tolak anggota tidak bereaksi karena `guardAction` tidak ada: GATE-1F (`3b9cc2b`).
   - Banner trial tampil dua kali: UI-1F (`8e84e15`).
   - Fitur baru atas permintaan user: NAV-1 (`da66d22`), warga biasa langsung ke dashboard tenant-nya.

## Perubahan sensitif
- Migration `storage_r2_access` sudah diterapkan ke Supabase dev atas persetujuan user.
- 2 Edge Function baru di-deploy ke dev atas persetujuan user.
- Alur upload bukti bayar berubah ke R2. Nominal, status, dan trigger pembayaran tidak berubah.

## Sisa pekerjaan dan catatan
- **4 Edge Function lain punya bug `getUser()` yang sama**: `create-subscription-payment`, `create-listing-payment`, `check-listing-expirations`, `auto-generate-kos-bills`. Belum ter-deploy, jadi belum berdampak. Perbaikannya menyentuh pembayaran DOKU, sehingga perlu persetujuan user sebelum dikerjakan atau di-deploy.
- **Audit verifikasi:** `payments.verified_by` (uuid) tidak pernah diisi. Nama pemverifikasi hanya ada di `metadata.verified_by_name` yang dikirim browser. Usulan: isi `verified_by = auth.uid()` di database (trigger). Menyentuh pembayaran dan schema, jadi perlu persetujuan.
- Bucket Supabase lama `payment-proofs` dan `expense-receipts` (kosong) bisa dihapus di batch terpisah.
- Uji manual penolakan file dan uji nota pengeluaran ke R2.
