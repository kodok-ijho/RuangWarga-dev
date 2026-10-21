-- Migration: Arisan Operator from auth.uid()
-- Task: VERT-2.3 (A2)
-- Date: 2026-10-21
-- Ref: docs/handoff/VERT-2.md § VERT-2.3
--
-- Memperbarui fungsi draw_arisan_winner dan start_new_arisan_cycle agar mengambil
-- identitas operator dari tenant_members berdasarkan auth.uid(), bukan mempercayai parameter klien.
-- Parameter p_operator_member_id diabaikan untuk backward compatibility.

BEGIN;

-- 1. draw_arisan_winner(uuid, uuid, uuid)
CREATE OR REPLACE FUNCTION public.draw_arisan_winner(
  p_tenant_id uuid,
  p_round_id uuid,
  p_operator_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_unpaid_count integer := 0;
  v_total_bills integer := 0;
  v_candidate record;
  v_total_remaining_candidates integer := 0;
  v_operator uuid := (SELECT id FROM public.tenant_members WHERE tenant_id = p_tenant_id AND user_id = auth.uid() LIMIT 1);
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'run_special_action')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 1. Validasi subscription status
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Layanan dalam status read-only. Perpanjang langganan untuk melakukan pengocokan.';
  END IF;

  -- 2. Kunci dan validasi putaran arisan
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

  -- 3. Validasi Pelunasan Iuran Peserta
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status != 'paid')
  INTO v_total_bills, v_unpaid_count
  FROM public.billing_items
  WHERE tenant_id = p_tenant_id
    AND (
      (metadata->>'round_id') = p_round_id::text
      OR period = v_round.period
    );

  IF v_total_bills = 0 THEN
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: Tagihan iuran untuk putaran ini belum diterbitkan.';
  END IF;

  IF v_unpaid_count > 0 THEN
    RAISE EXCEPTION 'Pengocokan belum dapat dilakukan: Masih terdapat % peserta yang belum melunasi iuran pada putaran ini.', v_unpaid_count;
  END IF;

  -- 4. Pilih kandidat pemenang yang belum pernah menang (has_won = false)
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
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semua peserta arisan telah memenangkan undian pada siklus ini. Silakan lakukan aksi "Mulai Siklus Baru".';
  END IF;

  -- 5. Catat pemenang pada putaran arisan (drawn_by menggunakan v_operator dari auth.uid())
  UPDATE public.arisan_rounds
  SET status = 'drawn',
      winner_member_id = v_candidate.member_id,
      drawn_at = now(),
      drawn_by = v_operator,
      updated_at = now()
  WHERE id = p_round_id;

  -- 6. Tandai peserta telah menang pada tabel arisan_participants
  UPDATE public.arisan_participants
  SET has_won = true,
      won_at_round_id = p_round_id,
      won_at = now(),
      updated_at = now()
  WHERE id = v_candidate.participant_id;

  -- Hitung sisa kandidat yang belum menang
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
    'total_prize', v_round.total_pool_amount,
    'remaining_candidates', v_total_remaining_candidates,
    'is_cycle_completed', (v_total_remaining_candidates = 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.draw_arisan_winner(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draw_arisan_winner(UUID, UUID, UUID) TO authenticated, service_role;


-- 2. start_new_arisan_cycle(uuid, uuid, boolean)
CREATE OR REPLACE FUNCTION public.start_new_arisan_cycle(
  p_tenant_id uuid,
  p_operator_member_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant record;
  v_remaining_candidates integer := 0;
  v_total_participants integer := 0;
  v_new_cycle integer := 1;
  v_operator uuid := (SELECT id FROM public.tenant_members WHERE tenant_id = p_tenant_id AND user_id = auth.uid() LIMIT 1);
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'run_special_action')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 1. Validasi status subscription gate
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Layanan dalam status read-only. Perpanjang langganan untuk memulai siklus baru.';
  END IF;

  -- 2. Validasi keberadaan tenant dan tipe tenant
  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant dengan ID % tidak ditemukan.', p_tenant_id;
  END IF;

  IF v_tenant.type != 'arisan' THEN
    RAISE EXCEPTION 'Aksi Mulai Siklus Baru hanya valid untuk tenant dengan tipe arisan.';
  END IF;

  -- 3. Cek jumlah peserta yang belum menang
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE has_won = false)
  INTO v_total_participants, v_remaining_candidates
  FROM public.arisan_participants
  WHERE tenant_id = p_tenant_id;

  IF v_total_participants = 0 THEN
    RAISE EXCEPTION 'Belum ada data peserta arisan yang terdaftar pada tenant ini.';
  END IF;

  IF NOT p_force AND v_remaining_candidates > 0 THEN
    RAISE EXCEPTION 'Siklus putaran belum selesai. Masih terdapat % peserta yang belum memenangkan undian.', v_remaining_candidates;
  END IF;

  -- 4. Reset seluruh status kemenangan peserta di tabel arisan_participants
  UPDATE public.arisan_participants
  SET 
    has_won = false,
    won_at_round_id = NULL,
    won_at = NULL,
    updated_at = now()
  WHERE tenant_id = p_tenant_id;

  -- 5. Naikkan siklus pada settings tenant (current_cycle + 1)
  v_new_cycle := COALESCE((v_tenant.settings->>'current_cycle')::integer, 1) + 1;

  UPDATE public.tenants
  SET 
    settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{current_cycle}',
      to_jsonb(v_new_cycle)
    ) || jsonb_build_object(
      'last_cycle_reset_at', now(),
      'last_cycle_reset_by', v_operator
    ),
    updated_at = now()
  WHERE id = p_tenant_id;

  -- 6. Kembalikan info siklus baru
  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'new_cycle', v_new_cycle,
    'total_participants_reset', v_total_participants,
    'reset_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_new_arisan_cycle(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_new_arisan_cycle(UUID, UUID, BOOLEAN) TO authenticated, service_role;

COMMIT;

-- ROLLBACK:
-- Untuk rollback, rujuk definisi sebelumnya di supabase/migrations/202610080001_harden_definer_function_grants.sql (baris 237-460).
