-- Migration: ARISAN-1.1 Kocokan transparan dan setoran per putaran
-- Ref: docs/handoff/ARISAN-1.md § ARISAN-1.1
-- Date: 2026-10-22
--
-- 1. arisan_rounds.eligible_snapshot / excluded_snapshot: daftar peserta yang ikut kocok
--    (setoran lunas) dan yang tidak ikut (belum lunas), disimpan permanen saat kocok.
-- 2. Hasil kocok final: trigger menolak perubahan status/pemenang/snapshot dari klien.
--    Hanya RPC resmi (SECURITY DEFINER milik postgres → is_billing_privileged) yang bisa mengisi.
-- 3. draw_arisan_winner: peserta yang setorannya belum lunas TIDAK ikut kocok (tidak lagi
--    memblokir seluruh kocokan). Hadiah = total setoran lunas putaran itu.
-- 4. Tagihan putaran dicocokkan lewat metadata round_id saja (bukan label periode) — audit A7.

BEGIN;

-- ==============================================================================
-- 1. KOLOM SNAPSHOT
-- ==============================================================================
ALTER TABLE public.arisan_rounds
  ADD COLUMN IF NOT EXISTS eligible_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS excluded_snapshot JSONB NULL;

-- ==============================================================================
-- 2. HASIL KOCOK FINAL
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.guard_arisan_round_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'drawn'
       OR NEW.winner_member_id IS NOT NULL
       OR NEW.drawn_at IS NOT NULL
       OR NEW.drawn_by IS NOT NULL
       OR NEW.eligible_snapshot IS NOT NULL
       OR NEW.excluded_snapshot IS NOT NULL THEN
      RAISE EXCEPTION 'Hasil kocok hanya bisa diisi lewat kocok resmi.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'drawn' THEN
    IF ROW(NEW.status, NEW.winner_member_id, NEW.drawn_at, NEW.drawn_by, NEW.total_pool_amount,
           NEW.eligible_snapshot, NEW.excluded_snapshot, NEW.round_number, NEW.period)
       IS DISTINCT FROM
       ROW(OLD.status, OLD.winner_member_id, OLD.drawn_at, OLD.drawn_by, OLD.total_pool_amount,
           OLD.eligible_snapshot, OLD.excluded_snapshot, OLD.round_number, OLD.period) THEN
      RAISE EXCEPTION 'Putaran yang sudah dikocok bersifat final dan tidak bisa diubah.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'drawn'
     OR NEW.winner_member_id IS DISTINCT FROM OLD.winner_member_id
     OR NEW.drawn_at IS DISTINCT FROM OLD.drawn_at
     OR NEW.drawn_by IS DISTINCT FROM OLD.drawn_by
     OR NEW.eligible_snapshot IS DISTINCT FROM OLD.eligible_snapshot
     OR NEW.excluded_snapshot IS DISTINCT FROM OLD.excluded_snapshot THEN
    RAISE EXCEPTION 'Hasil kocok hanya bisa diisi lewat kocok resmi.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_arisan_round_result ON public.arisan_rounds;
CREATE TRIGGER trg_guard_arisan_round_result
  BEFORE INSERT OR UPDATE ON public.arisan_rounds
  FOR EACH ROW EXECUTE FUNCTION public.guard_arisan_round_result();

-- ==============================================================================
-- 3. KOCOK: HANYA PESERTA YANG SETORANNYA LUNAS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.draw_arisan_winner(p_tenant_id uuid, p_round_id uuid, p_operator_member_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_total_bills integer := 0;
  v_candidate record;
  v_total_remaining_candidates integer := 0;
  v_eligible jsonb := '[]'::jsonb;
  v_excluded jsonb := '[]'::jsonb;
  v_eligible_count integer := 0;
  v_pool numeric := 0;
  -- p_operator_member_id diabaikan; operator selalu dari auth.uid() (VERT-2F)
  v_operator uuid := (SELECT id FROM public.tenant_members WHERE tenant_id = p_tenant_id AND user_id = auth.uid() LIMIT 1);
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'run_special_action')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Layanan dalam status read-only. Perpanjang langganan untuk melakukan pengocokan.';
  END IF;

  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Putaran arisan dengan ID % tidak ditemukan pada tenant ini.', p_round_id;
  END IF;

  IF v_round.status = 'drawn' THEN
    RAISE EXCEPTION 'Putaran ini sudah pernah dikocok dan pemenang telah ditetapkan.';
  END IF;

  IF v_round.status = 'cancelled' THEN
    RAISE EXCEPTION 'Putaran ini berstatus dibatalkan dan tidak dapat dikocok.';
  END IF;

  SELECT COUNT(*) INTO v_total_bills
  FROM public.billing_items
  WHERE tenant_id = p_tenant_id
    AND (metadata->>'round_id') = p_round_id::text
    AND status <> 'cancelled';

  IF v_total_bills = 0 THEN
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: Tagihan iuran untuk putaran ini belum diterbitkan.';
  END IF;

  -- Peserta siklus ini yang belum pernah menang: lunas → ikut, belum lunas → tidak ikut
  WITH base AS (
    SELECT
      ap.member_id,
      tm.full_name,
      tu.label AS slot_label,
      EXISTS (
        SELECT 1 FROM public.billing_items b
        WHERE b.tenant_id = p_tenant_id
          AND (b.metadata->>'round_id') = p_round_id::text
          AND b.member_id = ap.member_id
          AND b.status = 'paid'
      ) AS is_paid
    FROM public.arisan_participants ap
    JOIN public.tenant_members tm ON tm.id = ap.member_id
    LEFT JOIN public.tenant_units tu ON tu.id = ap.unit_slot_id
    WHERE ap.tenant_id = p_tenant_id
      AND ap.has_won = false
      AND tm.status = 'approved'
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('member_id', member_id, 'full_name', full_name, 'slot_label', slot_label)
             ORDER BY full_name) FILTER (WHERE is_paid), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('member_id', member_id, 'full_name', full_name, 'slot_label', slot_label)
             ORDER BY full_name) FILTER (WHERE NOT is_paid), '[]'::jsonb),
    COUNT(*) FILTER (WHERE is_paid)
  INTO v_eligible, v_excluded, v_eligible_count
  FROM base;

  IF v_eligible_count = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.arisan_participants WHERE tenant_id = p_tenant_id AND has_won = false) THEN
      RAISE EXCEPTION 'Semua peserta arisan telah memenangkan undian pada siklus ini. Silakan lakukan aksi "Mulai Siklus Baru".';
    END IF;
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: belum ada peserta yang setorannya lunas pada putaran ini.';
  END IF;

  SELECT
    ap.id AS participant_id,
    ap.member_id,
    tm.full_name AS member_name,
    tm.phone AS member_phone,
    tu.label AS slot_label
  INTO v_candidate
  FROM public.arisan_participants ap
  JOIN public.tenant_members tm ON tm.id = ap.member_id
  LEFT JOIN public.tenant_units tu ON tu.id = ap.unit_slot_id
  WHERE ap.tenant_id = p_tenant_id
    AND ap.has_won = false
    AND tm.status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.billing_items b
      WHERE b.tenant_id = p_tenant_id
        AND (b.metadata->>'round_id') = p_round_id::text
        AND b.member_id = ap.member_id
        AND b.status = 'paid'
    )
  ORDER BY random()
  LIMIT 1;

  SELECT COALESCE(SUM(amount), 0) INTO v_pool
  FROM public.billing_items
  WHERE tenant_id = p_tenant_id
    AND (metadata->>'round_id') = p_round_id::text
    AND status = 'paid';

  UPDATE public.arisan_rounds
  SET status = 'drawn',
      winner_member_id = v_candidate.member_id,
      drawn_at = now(),
      drawn_by = v_operator,
      total_pool_amount = v_pool,
      eligible_snapshot = v_eligible,
      excluded_snapshot = v_excluded,
      updated_at = now()
  WHERE id = p_round_id;

  UPDATE public.arisan_participants
  SET has_won = true,
      won_at_round_id = p_round_id,
      won_at = now(),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND member_id = v_candidate.member_id;

  SELECT COUNT(*) INTO v_total_remaining_candidates
  FROM public.arisan_participants
  WHERE tenant_id = p_tenant_id AND has_won = false;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'round_number', v_round.round_number,
    'period', v_round.period,
    'winner_member_id', v_candidate.member_id,
    'winner_name', v_candidate.member_name,
    'winner_phone', v_candidate.member_phone,
    'slot_label', v_candidate.slot_label,
    'drawn_at', now(),
    'total_prize', v_pool,
    'eligible_count', v_eligible_count,
    'excluded_count', jsonb_array_length(v_excluded),
    'eligible', v_eligible,
    'excluded', v_excluded,
    'remaining_candidates', v_total_remaining_candidates,
    'is_cycle_completed', (v_total_remaining_candidates = 0)
  );
END;
$$;

-- ==============================================================================
-- 4. KESIAPAN PUTARAN: COCOKKAN LEWAT round_id SAJA (A7)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_arisan_round_readiness(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_total_bills integer := 0;
  v_paid_bills integer := 0;
  v_is_ready boolean := false;
BEGIN
  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Putaran tidak ditemukan');
  END IF;

  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR v_round.tenant_id IN (SELECT public.current_tenant_ids())
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  IF v_round.status IN ('drawn', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', true,
      'round_id', p_round_id,
      'status', v_round.status,
      'message', 'Putaran sudah berstatus ' || v_round.status
    );
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid')
  INTO v_total_bills, v_paid_bills
  FROM public.billing_items
  WHERE tenant_id = v_round.tenant_id
    AND (metadata->>'round_id') = p_round_id::text
    AND status <> 'cancelled';

  IF v_total_bills > 0 AND v_paid_bills = v_total_bills THEN
    v_is_ready := true;
    UPDATE public.arisan_rounds
    SET status = 'ready_to_draw',
        updated_at = now()
    WHERE id = p_round_id;
  ELSIF v_round.status = 'ready_to_draw' AND v_paid_bills < v_total_bills THEN
    UPDATE public.arisan_rounds
    SET status = 'collecting',
        updated_at = now()
    WHERE id = p_round_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'status', CASE WHEN v_is_ready THEN 'ready_to_draw' ELSE 'collecting' END,
    'total_bills', v_total_bills,
    'paid_bills', v_paid_bills,
    'is_ready_to_draw', v_is_ready
  );
END;
$$;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- Kembalikan draw_arisan_winner ke 202610210003_arisan_operator_from_auth.sql dan
-- check_arisan_round_readiness ke 202610080001_harden_definer_function_grants.sql.
-- DROP TRIGGER IF EXISTS trg_guard_arisan_round_result ON public.arisan_rounds;
-- DROP FUNCTION IF EXISTS public.guard_arisan_round_result();
-- ALTER TABLE public.arisan_rounds DROP COLUMN IF EXISTS excluded_snapshot, DROP COLUMN IF EXISTS eligible_snapshot;
