-- Migration: Pembersihan Policy Legacy Storage Supabase (payment-proofs & expense-receipts)
-- Task: STOR-2
-- Date: 2026-10-15
--
-- Konteks:
-- 1. Sejak task STOR-1, penyimpanan file bukti transfer (payment_proof) dan nota
--    pengeluaran (expense_receipt) telah dialihkan ke Cloudflare R2 secara privat
--    melalui Edge Function (storage-upload dan storage-sign-url).
-- 2. Bucket Supabase Storage lama ('payment-proofs' dan 'expense-receipts') sudah kosong
--    dan tidak lagi diakses oleh kode client maupun Edge Function.
-- 3. Migration ini bertugas menghapus 6 RLS policy lama pada storage.objects.
--
-- PENTING - HAL YANG SENGAJA TIDAK DILAKUKAN DI SINI:
-- - Penghapusan bucket: Bucket 'payment-proofs' dan 'expense-receipts' TIDAK dihapus
--   lewat SQL migration ini, melainkan akan dihapus langsung oleh user/admin
--   melalui Supabase Dashboard.
-- - Helper functions: Fungsi public.is_valid_payment_proof_path(text),
--   public.is_valid_expense_receipt_path(text), dan public.storage_extract_tenant_id(text)
--   JANGAN DIHAPUS karena masih aktif digunakan oleh fungsi otorisasi R2
--   public.can_read_tenant_file dan public.can_upload_tenant_file (Task STOR-1.1).

BEGIN;

-- ==============================================================================
-- 1. DROP POLICY STORAGE LAMA UNTUK PAYMENT-PROOFS
--    (Dibuat pada migration 202610130004_payment_proofs_bucket.sql)
-- ==============================================================================

DROP POLICY IF EXISTS "payment_proofs_insert_member" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_select" ON storage.objects;


-- ==============================================================================
-- 2. DROP POLICY STORAGE LAMA UNTUK EXPENSE-RECEIPTS
--    (Dibuat pada migration 202609220003_harden_expense_receipts_storage_rls.sql)
-- ==============================================================================

DROP POLICY IF EXISTS "expense_receipts_select_staff_only" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_insert_staff_only" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_update_staff_only" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_delete_staff_only" ON storage.objects;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- Untuk mengembalikan policy lama jika diperlukan, jalankan kembali definisi policy
-- dari migration asal berikut:
--
-- 1. Policy payment-proofs (2 policy):
--    Rujuk file: supabase/migrations/202610130004_payment_proofs_bucket.sql
--    - "payment_proofs_insert_member" ON storage.objects FOR INSERT
--    - "payment_proofs_select" ON storage.objects FOR SELECT
--
-- 2. Policy expense-receipts (4 policy):
--    Rujuk file: supabase/migrations/202609220003_harden_expense_receipts_storage_rls.sql
--    - "expense_receipts_select_staff_only" ON storage.objects FOR SELECT
--    - "expense_receipts_insert_staff_only" ON storage.objects FOR INSERT
--    - "expense_receipts_update_staff_only" ON storage.objects FOR UPDATE
--    - "expense_receipts_delete_staff_only" ON storage.objects FOR DELETE
