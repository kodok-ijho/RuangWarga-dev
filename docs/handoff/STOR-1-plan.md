# STOR-1 — Plan: Penyimpanan file di Cloudflare R2

Rujukan: `STOR-1-requirement.md`. Status: **draft, menunggu persetujuan user**.

## Arsitektur
```
UPLOAD : Browser ──(file + JWT)──▶ Edge Function storage-upload
                                    ├─ verifikasi JWT (auth.getUser)
                                    ├─ RPC can_upload_tenant_file (token pengguna)
                                    ├─ cek ≤5 MB + magic bytes
                                    ├─ susun path canonical di server
                                    └─ PUT ke R2 (metadata uploaded-by = user.id) ─▶ { path }
LIHAT  : Browser ──({kind, path} + JWT)──▶ Edge Function storage-sign-url
                                    ├─ verifikasi JWT + validasi path canonical
                                    ├─ RPC can_read_tenant_file (staf/owner/admin)
                                    ├─ khusus bukti bayar: bila bukan staf → HEAD objek, izinkan bila uploaded-by = user.id
                                    └─ presigned GET (default 300 s, maks. 600 s) ─▶ { url, expiresIn }
DB     : payments.proof_url / metadata.proof_path dan expenses.receipt_* hanya berisi path
```

### Keputusan desain
1. **Upload lewat Edge Function (proxy), bukan presigned PUT langsung dari browser.**
   - Presigned PUT di R2 tidak bisa memaksa batas ukuran, dan R2 tidak mendukung presigned POST policy. Dengan proxy, server bisa memaksa batas 5 MB dan memeriksa magic bytes sebelum file disimpan.
   - Upload adalah trafik masuk, jadi tidak memakan kuota egress Supabase.
2. **Melihat file memakai presigned GET langsung ke R2.** Egress R2 gratis, dan Edge Function hanya mengembalikan URL berukuran kecil.
3. **Aturan izin ditulis di database (RPC), bukan disalin ke TypeScript.** Fungsi baru memakai ulang helper yang sudah teruji: `is_valid_payment_proof_path`, `is_valid_expense_receipt_path`, `storage_extract_tenant_id`, `current_tenant_ids`, `tenant_subscription_status`, `has_permission`, `is_tenant_owner`, dan `is_platform_admin`. RPC dipanggil dengan token pengguna, mengikuti pola `create-subscription-payment`.
4. **Aturan "pengunggah sendiri boleh melihat"** memakai metadata objek R2 `uploaded-by`. Nilainya diisi server saat upload, jadi tidak bisa dipalsukan browser. Ini setara dengan `owner = auth.uid()` di policy Storage saat ini.
5. **Satu bucket** (`ruangwarga-dev`). Jenis file dibedakan dari path (`/payments/` atau `/expenses/`). Path canonical tidak berubah, sehingga regex dan validasi yang ada tetap berlaku.
6. **Signature `createReceiptSignedUrl` dipertahankan**, supaya tiga halaman pemanggil (`PaymentVerification`, `PaymentMatrix`, `Expenses`) tidak perlu diubah.
7. **Signing S3 v4 memakai `aws4fetch`** (ringan dan kompatibel dengan Deno). Versinya dipin melalui esm.sh.

## Perubahan per area
| Area | File | Perubahan |
|---|---|---|
| DB (migration baru) | `supabase/migrations/2026101x_storage_r2_access.sql` | `can_upload_tenant_file(p_kind text, p_tenant_id uuid)` dan `can_read_tenant_file(p_kind text, p_path text)`. Keduanya `STABLE`, `SET search_path = public`, `GRANT EXECUTE` hanya ke `authenticated`, dan di-`REVOKE` dari `anon`/`public`. |
| DB (test) | `supabase/tests/storage_r2_access_matrix.sql` | Matriks izin mengikuti pola `function_grants_matrix.sql` |
| Edge | `supabase/functions/_shared/r2.ts` | Klien R2 (aws4fetch), `putObject`, `headObject`, `presignGet`, validasi magic bytes, regex path |
| Edge | `supabase/functions/storage-upload/index.ts` | Lihat arsitektur. Input `multipart/form-data`: `kind`, `tenantId`, `billingItemId` atau `expenseDate`, `file`. |
| Edge | `supabase/functions/storage-sign-url/index.ts` | Lihat arsitektur. Input JSON: `kind`, `path`, `expiresIn` opsional. |
| Frontend | `client/src/services/fileStorageService.js` (baru) | `uploadTenantFile(...)` dan `getTenantFileUrl(...)` memakai `supabase.functions.invoke`. Mode demo tetap memakai jalur mock. |
| Frontend | `client/src/services/tenant/payments.js` (±461) | Upload bukti memakai `uploadTenantFile`. Pesan error tetap sama. |
| Frontend | `client/src/services/tenant/finance.js` (±108, ±202) | Upload nota memakai `uploadTenantFile` |
| Frontend | `client/src/utils/storagePolicy.js` | `createReceiptSignedUrl` memanggil `getTenantFileUrl`. Validasi path canonical tetap dilakukan di sisi klien. |
| Test | `storagePolicy.test.js`, `payment.test.jsx`, `Expenses.test.jsx`, dan test baru | Mock `functions.invoke` sebagai pengganti `storage.from` |

## Urutan kerja
1. **User** menyelesaikan prasyarat R2 dan secrets (lihat requirement).
2. agy: STOR-1.1 (migration + test SQL), lalu Claude review.
3. **User mengonfirmasi**, lalu Claude menerapkan migration ke Supabase dev dan mengecek advisor.
4. agy: STOR-1.2 (`_shared/r2.ts` + `storage-upload`), lalu Claude review.
5. agy: STOR-1.3 (`storage-sign-url`), lalu Claude review.
6. Claude men-deploy kedua Edge Function ke dev lewat connector Supabase.
7. agy: STOR-1.4 (frontend + test), lalu Claude review.
8. Claude menjalankan QA end-to-end di dev sesuai kriteria diterima, lalu menulis `STOR-1-report.md` dan review.

## Risiko dan mitigasi
| Risiko | Mitigasi |
|---|---|
| Token R2 bocor | Izin token dibatasi ke 1 bucket. Token hanya ada di secrets Edge Function. Rotasi bisa dilakukan di dashboard Cloudflare. |
| Aturan izin salah sehingga data bocor antar-tenant | Aturan ada di RPC yang memakai helper teruji, diuji matriks SQL, dan diuji manual oleh Claude di dev (warga lain dan tenant lain harus 403). |
| Cold start Edge Function membuat upload terasa lambat | Gambar sudah dikompres di klien (`imageCompressor`). Tampilkan indikator loading. |
| Region Supabase di Seoul, R2 di APAC | Latensinya dapat diterima. Pemindahan region Supabase dibahas terpisah. |
| Kuota Edge Function Free (500 ribu invokasi per bulan) | Jauh di atas kebutuhan saat ini. |

## Yang butuh konfirmasi user (aturan proyek)
- Migration baru (fungsi izin) yang diterapkan ke Supabase dev.
- Perubahan alur upload bukti bayar (menyentuh pembayaran).
- Deploy 2 Edge Function baru ke Supabase dev.
- Tidak ada perubahan pada n8n, `api/`, DOKU, atau webhook.
