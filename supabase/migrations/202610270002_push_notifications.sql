-- Migration: Push Notifications Infrastructure (Web Push, Langganan, Summaries, dan Cron)
-- Task: KOS-5.3a (Ref: docs/handoff/KOS-5.md § 5.3)
-- Date: 2026-10-27

BEGIN;

-- ==============================================================================
-- 1. EXTENSION pg_net
-- Diperlukan untuk pemanggilan Edge Function via net.http_post dari pg_cron
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


-- ==============================================================================
-- 2. TABEL public.push_subscriptions
-- Menyimpan endpoint dan kunci Web Push VAPID per perangkat pengguna
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Pengguna hanya boleh melihat (SELECT) langganan miliknya sendiri
DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
  FOR SELECT USING (
    auth.uid() = user_id
  );

-- Pengguna hanya boleh menghapus (DELETE) langganan miliknya sendiri
DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
  FOR DELETE USING (
    auth.uid() = user_id
  );

-- Hak akses push_subscriptions:
-- authenticated TIDAK boleh INSERT/UPDATE langsung (wajib lewat RPC save_push_subscription)
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE ON public.push_subscriptions FROM authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;


-- ==============================================================================
-- 3. RPC public.save_push_subscription
-- Menyimpan atau memperbarui langganan Web Push (upsert by endpoint)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint    TEXT,
  p_p256dh      TEXT,
  p_auth        TEXT,
  p_user_agent  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Pengguna wajib terautentikasi
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna belum login' USING ERRCODE = '42501';
  END IF;

  -- 2. Validasi endpoint: wajib diawali https:// dan panjang wajar (10 - 2048 karakter)
  IF p_endpoint IS NULL
     OR NOT (p_endpoint ~* '^https://')
     OR length(trim(p_endpoint)) < 10
     OR length(p_endpoint) > 2048 THEN
    RAISE EXCEPTION 'Endpoint push tidak valid (wajib diawali https:// dan memiliki panjang wajar)' USING ERRCODE = '22023';
  END IF;

  -- 3. Validasi kunci enkripsi VAPID p256dh dan auth
  IF p_p256dh IS NULL OR trim(p_p256dh) = '' OR length(p_p256dh) > 512 THEN
    RAISE EXCEPTION 'Kunci p256dh tidak valid' USING ERRCODE = '22023';
  END IF;

  IF p_auth IS NULL OR trim(p_auth) = '' OR length(p_auth) > 256 THEN
    RAISE EXCEPTION 'Kunci auth tidak valid' USING ERRCODE = '22023';
  END IF;

  -- 4. Upsert subscription berdasarkan endpoint unik
  -- Bila endpoint sudah ada (mis. ganti akun di browser sama), perbarui kepemilikan ke user_id aktif
  INSERT INTO public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    created_at
  ) VALUES (
    v_user_id,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    p_user_agent,
    now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent;

  RETURN jsonb_build_object(
    'success', true,
    'endpoint', trim(p_endpoint)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ==============================================================================
-- 4. RPC public.delete_push_subscription
-- Menghapus langganan Web Push milik auth.uid()
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.delete_push_subscription(
  p_endpoint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_deleted_count INT;
BEGIN
  -- 1. Pengguna wajib terautentikasi
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: pengguna belum login' USING ERRCODE = '42501';
  END IF;

  -- 2. Validasi endpoint
  IF p_endpoint IS NULL OR trim(p_endpoint) = '' THEN
    RETURN jsonb_build_object('success', false, 'deleted', 0);
  END IF;

  -- 3. Hapus hanya jika endpoint tersebut milik pengguna yang sedang login
  DELETE FROM public.push_subscriptions
  WHERE endpoint = trim(p_endpoint)
    AND user_id = v_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO authenticated, service_role;


-- ==============================================================================
-- 5. TABEL public.push_daily_summaries
-- Mencegah ringkasan pengingat harian dikirim lebih dari sekali per tenant per hari
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.push_daily_summaries (
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  summary_date  DATE NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_push_daily_summaries_date ON public.push_daily_summaries(summary_date);

-- RLS aktif tanpa policy untuk authenticated (hanya service_role yang berhak akses)
ALTER TABLE public.push_daily_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_daily_summaries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_daily_summaries TO service_role;


-- ==============================================================================
-- 6. JADWAL PG_CRON 'ruangwarga-rent-push'
-- Jadwal: '0 23 * * *' (23:00 UTC = 06:00 WIB)
-- Mengirim HTTP POST ke Edge Function send-rent-push via net.http_post
-- Mengambil URL dan Cron Secret dari vault.decrypted_secrets saat dieksekusi
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job'
  ) THEN
    -- Unschedule job lama bila sudah ada (idempoten)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ruangwarga-rent-push') THEN
      PERFORM cron.unschedule('ruangwarga-rent-push');
    END IF;

    -- Jadwalkan cron job baru
    PERFORM cron.schedule(
      'ruangwarga-rent-push',
      '0 23 * * *',
      $cron$
      DO $job$
      DECLARE
        v_url TEXT;
        v_secret TEXT;
      BEGIN
        -- Ambil konfigurasi URL dan secret dari vault tanpa menaruh rahasia di repo
        BEGIN
          SELECT decrypted_secret INTO v_url
          FROM vault.decrypted_secrets
          WHERE name = 'rent_push_function_url'
          LIMIT 1;

          SELECT decrypted_secret INTO v_secret
          FROM vault.decrypted_secrets
          WHERE name = 'rent_push_cron_secret'
          LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
          v_url := NULL;
          v_secret := NULL;
        END;

        -- Jika secret vault belum ada atau kosong, lewati job tanpa error parah
        IF v_url IS NOT NULL AND trim(v_url) <> '' THEN
          BEGIN
            PERFORM net.http_post(
              url := v_url,
              headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret', COALESCE(v_secret, '')
              ),
              body := '{}'::jsonb
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'rent-push net.http_post gagal dieksekusi: %', SQLERRM;
          END;
        END IF;
      END $job$;
      $cron$
    );
  END IF;
END $$;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables 
--     WHERE table_schema = 'cron' AND table_name = 'job'
--   ) THEN
--     IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ruangwarga-rent-push') THEN
--       PERFORM cron.unschedule('ruangwarga-rent-push');
--     END IF;
--   END IF;
-- END $$;
-- DROP TABLE IF EXISTS public.push_daily_summaries CASCADE;
-- DROP FUNCTION IF EXISTS public.delete_push_subscription(TEXT);
-- DROP FUNCTION IF EXISTS public.save_push_subscription(TEXT, TEXT, TEXT, TEXT);
-- DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
