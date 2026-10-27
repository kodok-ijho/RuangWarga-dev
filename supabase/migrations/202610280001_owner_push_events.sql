-- Migration: Owner Push Events for Kos Payments
-- Task: KOS-5F (Server)
-- Date: 2026-10-28

BEGIN;

-- ==============================================================================
-- 1. FUNGSI TRIGGER public.notify_payment_submitted_push()
-- Mengirim push notification ke pemilik dan staf kos saat bukti bayar diunggah / diajukan.
-- Hanya aktif bila:
--   a. status pembayaran adalah 'pending_verification'
--   b. event INSERT atau status berubah dari non-pending_verification ke pending_verification
--   c. tenant terkait bertipe 'kos'
-- Seluruh isi fungsi dibungkus EXCEPTION agar kegagalan notifikasi tidak pernah
-- menggagalkan penyimpanan transaksi / bukti bayar pembayaran.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_payment_submitted_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_type TEXT;
  v_url         TEXT;
  v_secret      TEXT;
BEGIN
  BEGIN
    -- Kondisi trigger: NEW.status = 'pending_verification'
    -- dan (TG_OP = 'INSERT' atau OLD.status IS DISTINCT FROM 'pending_verification')
    IF NEW.status = 'pending_verification'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending_verification') THEN

      -- Cek apakah tenant terkait bertipe 'kos'
      SELECT type INTO v_tenant_type
      FROM public.tenants
      WHERE id = NEW.tenant_id;

      IF v_tenant_type = 'kos' THEN
        -- Ambil URL dan Secret dari Vault
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

        -- Bila salah satu NULL atau kosong, lewati
        IF v_url IS NOT NULL AND trim(v_url) <> '' AND v_secret IS NOT NULL THEN
          PERFORM net.http_post(
            url := v_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-cron-secret', v_secret
            ),
            body := jsonb_build_object(
              'event', 'payment_submitted',
              'payment_id', NEW.id
            )
          );
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_payment_submitted_push gagal diproses: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. TRIGGER ON public.payments
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_notify_payment_submitted_push ON public.payments;
CREATE TRIGGER trg_notify_payment_submitted_push
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_payment_submitted_push();

-- ==============================================================================
-- 3. HAK AKSES / PERMISSIONS
-- Fungsi ini hanya dipicu oleh trigger internal database, tidak boleh dieksekusi klien langsung
-- ==============================================================================
REVOKE ALL ON FUNCTION public.notify_payment_submitted_push() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TRIGGER IF EXISTS trg_notify_payment_submitted_push ON public.payments;
-- DROP FUNCTION IF EXISTS public.notify_payment_submitted_push();
