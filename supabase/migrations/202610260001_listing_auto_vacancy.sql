-- Migration: Iklan otomatis saat kamar kosong dan penutupan saat terisi (Tahap 1: draf)
-- Task: LIST-AUTO-1.1 (Ref: docs/handoff/LIST-AUTO-1.md)
-- Date: 2026-10-26

BEGIN;

-- ==============================================================================
-- 1. ALTER TABLE public.public_listings
-- Menambahkan kolom facilities, auto_created, dan paused_remaining_seconds
-- ==============================================================================

ALTER TABLE public.public_listings
  ADD COLUMN IF NOT EXISTS facilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_remaining_seconds INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_public_listings_paused_remaining_seconds'
  ) THEN
    ALTER TABLE public.public_listings
      ADD CONSTRAINT chk_public_listings_paused_remaining_seconds
      CHECK (paused_remaining_seconds IS NULL OR paused_remaining_seconds > 0);
  END IF;
END $$;

-- Backfill facilities dari tenant_units.metadata->'facilities' untuk listing dengan unit_id
UPDATE public.public_listings l
SET facilities = u.metadata->'facilities'
FROM public.tenant_units u
WHERE l.unit_id = u.id
  AND u.metadata ? 'facilities'
  AND jsonb_typeof(u.metadata->'facilities') = 'array';


-- ==============================================================================
-- 2. TRIGGER FUNCTION: handle_kos_unit_vacancy_listing()
-- Menangani penutupan/penyimpanan sisa masa tayang saat kamar terisi,
-- serta pemulihan iklan atau pembuatan draf baru saat kamar kosong.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_kos_unit_vacancy_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant RECORD;
  v_paused_listing RECORD;
  v_has_existing_listing BOOLEAN;
  v_posted_by UUID;
  v_title TEXT;
  v_price NUMERIC;
  v_facilities JSONB;
  v_photos JSONB;
  v_category TEXT;
  v_contact_phone TEXT;
BEGIN
  -- Hanya proses jika status unit benar-benar berubah
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Ambil data tenant
  SELECT type, name, owner_id, settings
  INTO v_tenant
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  -- Hanya berlaku untuk tenant tipe 'kos'
  IF v_tenant.type <> 'kos' THEN
    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------------------
  -- KASUS 1: Kamar menjadi terisi (vacant -> occupied)
  -- Selalu berlaku tanpa melihat sakelar pengaturan (Aturan 1)
  -- ----------------------------------------------------------------------------
  IF NEW.status = 'occupied' AND OLD.status <> 'occupied' THEN
    -- 1.1 Iklan kamar yang active -> rented_or_sold, simpan sisa masa tayang
    UPDATE public.public_listings
    SET status = 'rented_or_sold',
        paused_remaining_seconds = CASE
          WHEN expires_at > now() THEN GREATEST(1, ROUND(EXTRACT(EPOCH FROM (expires_at - now())))::INTEGER)
          ELSE NULL
        END,
        updated_at = now()
    WHERE unit_id = NEW.id
      AND status = 'active';

    -- 1.2 Draf pending_payment otomatis yang belum dibayar -> dihapus
    DELETE FROM public.public_listings
    WHERE unit_id = NEW.id
      AND status = 'pending_payment'
      AND auto_created = true
      AND NOT EXISTS (
        SELECT 1 FROM public.listing_payments lp
        WHERE lp.listing_id = public_listings.id
          AND lp.status = 'paid'
      );

    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------------------
  -- KASUS 2: Kamar menjadi kosong (occupied -> vacant)
  -- Berlaku jika sakelar menyala dan kamar tidak dikecualikan (Aturan 2 & Requirement 3)
  -- ----------------------------------------------------------------------------
  IF OLD.status = 'occupied' AND NEW.status = 'vacant' THEN
    IF (v_tenant.settings->>'auto_listing_on_vacant') = 'true'
       AND COALESCE(NEW.metadata->>'auto_listing_disabled', 'false') <> 'true' THEN

      -- 2.1 Cek apakah kamar punya iklan yang ditutup karena terisi dan memiliki sisa masa tayang
      SELECT id, paused_remaining_seconds INTO v_paused_listing
      FROM public.public_listings
      WHERE unit_id = NEW.id
        AND status = 'rented_or_sold'
        AND paused_remaining_seconds IS NOT NULL
        AND paused_remaining_seconds > 0
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1;

      IF v_paused_listing.id IS NOT NULL THEN
        -- Tayangkan kembali iklan dengan sisa masa tayang tersebut secara gratis
        UPDATE public.public_listings
        SET status = 'active',
            expires_at = now() + (v_paused_listing.paused_remaining_seconds || ' seconds')::interval,
            paused_remaining_seconds = NULL,
            updated_at = now()
        WHERE id = v_paused_listing.id;
      ELSE
        -- 2.2 Selain itu, jika kamar belum punya iklan active atau pending_payment -> buat draf
        SELECT EXISTS (
          SELECT 1 FROM public.public_listings
          WHERE unit_id = NEW.id
            AND status IN ('active', 'pending_payment')
        ) INTO v_has_existing_listing;

        IF NOT v_has_existing_listing THEN
          -- Bungkus proses pembuatan draf di blok aman (kegagalan tidak boleh membatalkan checkout)
          BEGIN
            v_contact_phone := btrim(COALESCE(v_tenant.settings->>'listing_contact_phone', ''));
            IF v_contact_phone <> '' THEN
              -- Cari member owner sebagai posted_by
              SELECT id INTO v_posted_by
              FROM public.tenant_members
              WHERE tenant_id = NEW.tenant_id
                AND (
                  (v_tenant.owner_id IS NOT NULL AND user_id = v_tenant.owner_id)
                  OR is_owner = true
                )
              ORDER BY is_owner DESC, created_at ASC
              LIMIT 1;

              IF v_posted_by IS NULL THEN
                SELECT id INTO v_posted_by
                FROM public.tenant_members
                WHERE tenant_id = NEW.tenant_id
                ORDER BY is_owner DESC, created_at ASC
                LIMIT 1;
              END IF;

              IF v_posted_by IS NOT NULL THEN
                v_title := NEW.label || ' – ' || COALESCE(v_tenant.name, '');

                v_price := COALESCE(
                  CASE WHEN (NEW.metadata->>'rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (NEW.metadata->>'rent_price')::numeric END,
                  CASE WHEN (NEW.metadata->>'default_rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (NEW.metadata->>'default_rent_price')::numeric END,
                  CASE WHEN (v_tenant.settings->>'default_rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_tenant.settings->>'default_rent_price')::numeric END,
                  NULL
                );

                IF NEW.metadata ? 'facilities' AND jsonb_typeof(NEW.metadata->'facilities') = 'array' THEN
                  v_facilities := NEW.metadata->'facilities';
                ELSE
                  v_facilities := '[]'::jsonb;
                END IF;

                -- Salin foto dari iklan terakhir kamar itu jika pernah ada
                SELECT photos INTO v_photos
                FROM public.public_listings
                WHERE unit_id = NEW.id
                  AND photos IS NOT NULL
                  AND jsonb_typeof(photos) = 'array'
                  AND jsonb_array_length(photos) > 0
                ORDER BY created_at DESC
                LIMIT 1;

                IF v_photos IS NULL OR jsonb_typeof(v_photos) <> 'array' THEN
                  v_photos := '[]'::jsonb;
                END IF;

                v_category := NULLIF(btrim(COALESCE(v_tenant.settings->>'listing_default_category', '')), '');

                INSERT INTO public.public_listings (
                  tenant_id,
                  unit_id,
                  posted_by,
                  type,
                  title,
                  category,
                  price,
                  photos,
                  contact_phone,
                  facilities,
                  status,
                  auto_created,
                  expires_at,
                  paused_remaining_seconds
                ) VALUES (
                  NEW.tenant_id,
                  NEW.id,
                  v_posted_by,
                  'room_vacancy',
                  v_title,
                  v_category,
                  v_price,
                  v_photos,
                  v_contact_phone,
                  v_facilities,
                  'pending_payment',
                  true,
                  NULL,
                  NULL
                );
              END IF;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            -- Tangkap dan lewati: gagal membuat draf tidak boleh membatalkan checkout / status update
            NULL;
          END;
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Cabut akses eksekusi langsung dari klien; trigger berjalan sebagai SECURITY DEFINER
REVOKE ALL ON FUNCTION public.handle_kos_unit_vacancy_listing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_kos_unit_vacancy_listing() TO service_role;

DROP TRIGGER IF EXISTS trg_handle_kos_unit_vacancy_listing ON public.tenant_units;
CREATE TRIGGER trg_handle_kos_unit_vacancy_listing
  AFTER UPDATE OF status ON public.tenant_units
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_kos_unit_vacancy_listing();


-- ==============================================================================
-- 3. RPC: resume_listing_remaining(p_listing_id UUID)
-- Menayangkan kembali iklan yang ditutup karena terisi dengan sisa masa tayang
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.resume_listing_remaining(
  p_listing_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing RECORD;
  v_unit RECORD;
  v_new_expires TIMESTAMPTZ;
BEGIN
  -- 1. Ambil data listing
  SELECT * INTO v_listing
  FROM public.public_listings
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing tidak ditemukan';
  END IF;

  -- 2. Guard otorisasi (owner atau memiliki izin post_listing pada tenant iklan)
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR public.is_tenant_owner(v_listing.tenant_id)
    OR public.has_permission(v_listing.tenant_id, 'post_listing')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 3. Validasi status listing dan sisa masa tayang tersimpan
  IF v_listing.status <> 'rented_or_sold'
     OR v_listing.paused_remaining_seconds IS NULL
     OR v_listing.paused_remaining_seconds <= 0 THEN
    RAISE EXCEPTION 'Listing tidak memiliki sisa masa tayang yang tersimpan atau status bukan rented_or_sold';
  END IF;

  -- 4. Validasi kamar terkait (bila ada): kamar tidak boleh occupied
  IF v_listing.unit_id IS NOT NULL THEN
    SELECT status INTO v_unit
    FROM public.tenant_units
    WHERE id = v_listing.unit_id;

    IF FOUND AND v_unit.status = 'occupied' THEN
      RAISE EXCEPTION 'Kamar terkait sedang terisi (occupied), tidak dapat menayangkan kembali iklan';
    END IF;
  END IF;

  -- 5. Hitung expires_at baru dan aktifkan kembali iklan
  v_new_expires := now() + (v_listing.paused_remaining_seconds || ' seconds')::interval;

  UPDATE public.public_listings
  SET status = 'active',
      expires_at = v_new_expires,
      paused_remaining_seconds = NULL,
      updated_at = now()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object(
    'success', true,
    'listing_id', p_listing_id,
    'status', 'active',
    'expires_at', v_new_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resume_listing_remaining(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_listing_remaining(UUID) TO authenticated, service_role;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP FUNCTION IF EXISTS public.resume_listing_remaining(UUID);
-- DROP TRIGGER IF EXISTS trg_handle_kos_unit_vacancy_listing ON public.tenant_units;
-- DROP FUNCTION IF EXISTS public.handle_kos_unit_vacancy_listing();
-- ALTER TABLE public.public_listings DROP CONSTRAINT IF EXISTS chk_public_listings_paused_remaining_seconds;
-- ALTER TABLE public.public_listings DROP COLUMN IF EXISTS paused_remaining_seconds;
-- ALTER TABLE public.public_listings DROP COLUMN IF EXISTS auto_created;
-- ALTER TABLE public.public_listings DROP COLUMN IF EXISTS facilities;
