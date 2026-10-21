-- Migration: Drop Overload checkout_kos_room integer
-- Task: VERT-2.1 (K1)
-- Date: 2026-10-21
-- Ref: docs/handoff/VERT-2.md § VERT-2.1
--
-- Menghapus overload checkout_kos_room dengan parameter p_unit_id bertipe integer
-- agar PostgREST RPC tidak ambigu (PGRST204) dan hanya menyisakan versi bigint.
-- Versi bigint tidak diubah, namun hak aksesnya ditegaskan kembali.

BEGIN;

-- 1. Hapus overload integer jika ada
DROP FUNCTION IF EXISTS public.checkout_kos_room(uuid, integer, date, text, boolean);

-- 2. Tegaskan kembali privilege untuk overload bigint
REVOKE ALL ON FUNCTION public.checkout_kos_room(uuid, bigint, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_kos_room(uuid, bigint, date, text, boolean) TO authenticated, service_role;

COMMIT;

-- ROLLBACK:
-- Untuk rollback, overload integer dapat dibuat kembali merujuk ke supabase/migrations/202610080001_harden_definer_function_grants.sql (baris 789-902).
