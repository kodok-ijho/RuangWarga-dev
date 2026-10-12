# STOR-1 — Penyimpanan file di Cloudflare R2

Baca `docs/handoff/README.md`, `AGENT.md`, `STOR-1-requirement.md`, dan `STOR-1-plan.md` dulu.
Branch `claude/eloquent-tesla-f0ddcr`. Satu task = satu commit.
🚫 Jangan ubah n8n, `api/`, `legacy-backend/`, `dataService.js`, `apiClient.js`, alur DOKU/QRIS, atau file `.env*`.
🚫 Jangan menjalankan migration, jangan deploy Edge Function, dan jangan menulis kredensial apa pun. Itu dikerjakan Claude dan user.

## STOR-1.1 — Fungsi izin di database
- Migration baru `supabase/migrations/<timestamp>_storage_r2_access.sql`:
  - `can_upload_tenant_file(p_kind text, p_tenant_id uuid) RETURNS boolean`
    - `payment_proof`: `p_tenant_id IN (SELECT current_tenant_ids())`, dan `tenant_subscription_status(p_tenant_id) <> 'read_only'`.
    - `expense_receipt`: `is_platform_admin()`, ATAU (`has_permission(p_tenant_id,'manage_expenses')` dan status bukan `read_only`).
    - Jenis lain → `false`.
  - `can_read_tenant_file(p_kind text, p_path text) RETURNS boolean`
    - `payment_proof`: `is_valid_payment_proof_path(p_path)` DAN (`is_platform_admin()` ATAU `is_tenant_owner(t)` ATAU `has_permission(t,'manage_billing_transfer')` ATAU `has_permission(t,'manage_billing_cash')`), dengan `t = storage_extract_tenant_id(p_path)`.
      - Akses "pengunggah sendiri" **tidak** dicek di sini; itu ditangani Edge Function lewat metadata R2.
    - `expense_receipt`: `is_platform_admin()` ATAU (`is_valid_expense_receipt_path(p_path)` DAN `has_permission(t,'manage_expenses')`).
  - Keduanya `LANGUAGE sql` atau `plpgsql`, `STABLE`, `SET search_path = public`.
  - `REVOKE ALL ... FROM public, anon`; `GRANT EXECUTE ... TO authenticated, service_role`.
- Test `supabase/tests/storage_r2_access_matrix.sql` mengikuti pola `supabase/tests/function_grants_matrix.sql`. Isinya:
  - grant (anon tidak bisa execute);
  - owner, bendahara, warga, tenant lain, platform admin × dua jenis file × upload/lihat;
  - tenant `read_only` tidak bisa upload;
  - path non-canonical ditolak.

## STOR-1.2 — `_shared/r2.ts` dan Edge Function `storage-upload`
- `supabase/functions/_shared/r2.ts`:
  - konfigurasi dari env `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`;
  - `aws4fetch` dari esm.sh dengan versi dipin;
  - `putObject(path, bytes, contentType, metadata)`, `headObject(path)`, `presignGet(path, expiresIn)`;
  - `detectMime(bytes)` memakai magic bytes untuk JPEG, PNG, WebP (RIFF....WEBP), dan PDF (`%PDF`);
  - regex path canonical, disalin dari `client/src/utils/storagePolicy.js`;
  - `sanitizeFileName`, setara dengan `sanitizeStorageFileName`.
- `supabase/functions/storage-upload/index.ts` (pola auth dan CORS sama dengan `create-subscription-payment`):
  1. `OPTIONS` → CORS. Selain `POST` → 405.
  2. Verifikasi JWT dengan `userClient.auth.getUser()`. Gagal → 401.
  3. Baca `multipart/form-data`: `kind`, `tenantId`, lalu `billingItemId` (untuk bukti bayar) atau `expenseDate` (untuk nota), dan `file`. Field kurang atau tidak valid (UUID, tanggal) → 400.
  4. Panggil `userClient.rpc('can_upload_tenant_file', …)`. Hasil false → 403.
  5. Ukuran > 5 MB → 413. `detectMime` di luar daftar izin → 415.
  6. Susun path di server:
     - bukti bayar: `{tenantId}/payments/{billingItemId}/{Date.now()}_{nama_aman}`;
     - nota: `{tenantId}/expenses/{tahun dari expenseDate}/{uuid}_{nama_aman}`;
     - pastikan path lolos regex canonical.
  7. `putObject` dengan `Content-Type` hasil deteksi dan metadata `uploaded-by = user.id`. Lalu kirim `200 { path }`.
  8. Error tidak membocorkan detail kredensial. Tulis log ringkas tanpa isi file.

## STOR-1.3 — Edge Function `storage-sign-url`
- `supabase/functions/storage-sign-url/index.ts`:
  1. CORS, `POST` saja, dan verifikasi JWT (401).
  2. Body JSON `{ kind, path, expiresIn? }`. `expiresIn` default 300, dijepit ke rentang 60–600. Path harus lolos regex canonical untuk `kind` tersebut (400).
  3. Panggil `userClient.rpc('can_read_tenant_file', { p_kind, p_path })`.
  4. Bila false dan `kind === 'payment_proof'`, jalankan `headObject(path)` dan izinkan bila metadata `uploaded-by === user.id`. Selain itu → 403. Objek tidak ada → 404.
  5. Kirim `200 { url: presignGet(path, expiresIn), expiresIn }`.

## STOR-1.4 — Frontend memakai R2
- File baru `client/src/services/fileStorageService.js`:
  - `uploadTenantFile({ kind, tenantId, billingItemId, expenseDate, file })` → `supabase.functions.invoke('storage-upload', { body: FormData })` → mengembalikan `path`;
  - `getTenantFileUrl({ kind, path, expiresIn })` → `supabase.functions.invoke('storage-sign-url', …)` → mengembalikan `url`;
  - mode demo (`IS_DEMO`) tidak memanggil Edge Function. Pertahankan perilaku demo yang ada.
- `client/src/services/tenant/payments.js` (±461): ganti `supabase.storage.from('payment-proofs').upload` dengan `uploadTenantFile({ kind: 'payment_proof', … })`. Pertahankan semua cabang error, termasuk pesan "Bukti transfer gagal diunggah. Coba lagi." untuk warga dengan metode transfer.
- `client/src/services/tenant/finance.js` (±108 dan ±202): ganti upload `expense-receipts` dengan `uploadTenantFile({ kind: 'expense_receipt', … })`.
- `client/src/utils/storagePolicy.js` `createReceiptSignedUrl(supabaseClient, path, expiresIn, bucket)`:
  - **signature tetap**; `bucket` dipetakan `'payment-proofs'` → `payment_proof`, selain itu → `expense_receipt`;
  - validasi path canonical tetap dilakukan;
  - panggil `getTenantFileUrl`; `expiresIn` di atas 600 dijepit menjadi 600.
- Perbarui test yang memakai mock `storage.from` (`storagePolicy.test.js`, `components/payment/payment.test.jsx`, `pages/Expenses.test.jsx`) agar memakai mock `functions.invoke`. Tambahkan test `fileStorageService` untuk: argumen invoke, mode demo, dan error dari Edge Function.
- Verifikasi: `cd client && VITE_DEMO_MODE=false npx vitest run && npm run build && npm run lint`.

## Definition of Done
- 4 commit (STOR-1.1 sampai 1.4) dan laporan `STOR-1-report.md` (diisi Claude setelah QA di dev).
- Tidak ada `supabase.storage.from('payment-proofs'|'expense-receipts')` tersisa di `client/src` selain di test lama yang memang dihapus atau diubah.
- Tidak ada kredensial di repo. `git grep -nE "R2_SECRET|R2_ACCESS_KEY_ID"` hanya menemukan pembacaan `Deno.env.get`.
