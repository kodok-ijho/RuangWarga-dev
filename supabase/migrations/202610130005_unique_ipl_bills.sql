-- Migration: Unique Index Tagihan IPL per Unit dan Periode
-- Task: SEC-5.5 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S7)
-- Date: 2026-10-13
--
-- Menjamin tidak ada pembuatan tagihan IPL dobel per unit dalam periode yang sama
-- untuk tagihan aktif (status <> 'cancelled').

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_items_ipl_unit_period
ON public.billing_items (tenant_id, unit_id, period)
WHERE (metadata->>'bill_type') = 'ipl' AND status <> 'cancelled';

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- Indeks parsial ini dapat dinonaktifkan atau diabaikan oleh administrator basis data jika diperlukan.
