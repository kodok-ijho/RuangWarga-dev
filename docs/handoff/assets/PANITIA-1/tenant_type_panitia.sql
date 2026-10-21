-- Migration: PANITIA-1.2a Jenis tenant 'panitia' (Kepanitiaan & Acara)
-- Ref: docs/handoff/PANITIA-1.md § PANITIA-1.2
-- Date: 2026-10-21
--
-- Menggantikan Kelas di pilihan pendaftaran tenant (keputusan user 2026-10-21).
-- Nilai 'kelas' tetap ada di enum supaya data lama tetap valid.
-- ALTER TYPE ... ADD VALUE sengaja berdiri sendiri: nilai enum baru belum bisa
-- dipakai di transaksi yang sama dengan penambahannya.

ALTER TYPE public.tenant_type ADD VALUE IF NOT EXISTS 'panitia';
