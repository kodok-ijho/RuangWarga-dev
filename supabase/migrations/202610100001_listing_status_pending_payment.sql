-- Migration: Tambah status pending_payment ke enum listing_status
-- Task: PAY-1.7 (Migrasi Pembayaran DOKU - F6)
-- Ref: docs/handoff/PAY-1.md
-- Catatan: ALTER TYPE ... ADD VALUE harus dijalankan di file/transaksi terpisah sebelum nilai enum baru dapat digunakan.

ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'pending_payment';

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- PostgreSQL tidak mendukung DROP VALUE dari enum secara langsung tanpa re-create type.
-- Nilai 'pending_payment' akan diabaikan bila default tabel dikembalikan ke 'active'.
