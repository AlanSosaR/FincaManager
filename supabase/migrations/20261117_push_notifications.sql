-- =============================================================================
-- Notificaciones Push (FCM HTTP v1 + Supabase Trigger + Edge Function)
-- Casos cubiertos:
--   1) Motores: Cambio de aceite requerido al alcanzar horas máximas
--   2) Ganado: Parto próximo de ternero (<= 7 días)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Tabla de tokens FCM por usuario y plataforma
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_tokens_select_own" ON public.push_tokens;
CREATE POLICY "push_tokens_select_own" ON public.push_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_tokens_insert_own" ON public.push_tokens;
CREATE POLICY "push_tokens_insert_own" ON public.push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_tokens_update_own" ON public.push_tokens;
CREATE POLICY "push_tokens_update_own" ON public.push_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_tokens_delete_own" ON public.push_tokens;
CREATE POLICY "push_tokens_delete_own" ON public.push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Tabla de notificaciones
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'motor_aceite' | 'ganado_parto'
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/#dashboard',
  ref_id text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_empresa_created
  ON public.notifications (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_ref_type
  ON public.notifications (empresa_id, type, ref_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_member" ON public.notifications;
CREATE POLICY "notifications_select_member" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id
    OR (empresa_id IS NOT NULL AND public.is_empresa_member(empresa_id))
  );

DROP POLICY IF EXISTS "notifications_insert_member" ON public.notifications;
CREATE POLICY "notifications_insert_member" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR (empresa_id IS NOT NULL AND public.is_empresa_member(empresa_id))
  );

DROP POLICY IF EXISTS "notifications_update_member" ON public.notifications;
CREATE POLICY "notifications_update_member" ON public.notifications
  FOR UPDATE USING (
    auth.uid() = user_id
    OR (empresa_id IS NOT NULL AND public.is_empresa_member(empresa_id))
  );

-- 3. Trigger que invoca la Edge Function send-push-notification vía pg_net
CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://bguzluqyxbgtsgjcncvm.supabase.co/functions/v1/send-push-notification';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- No bloquear inserciones si pg_net falla
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_push_on_notification_insert ON public.notifications;
CREATE TRIGGER trg_notify_push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_notification_insert();

-- 4. Trigger automático en Motores cuando las horas alcanzan el límite de cambio de aceite
CREATE OR REPLACE FUNCTION public.notify_motor_oil_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit numeric := COALESCE(NEW.max_horas, 80);
  v_prev_limit numeric := COALESCE(OLD.max_horas, 80);
  v_already boolean := false;
BEGIN
  IF NEW.empresa_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.horas, 0) >= v_limit AND COALESCE(OLD.horas, 0) < v_prev_limit THEN
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE empresa_id = NEW.empresa_id
        AND type = 'motor_aceite'
        AND ref_id = NEW.id::text
        AND created_at >= date_trunc('day', now())
    ) INTO v_already;

    IF NOT v_already THEN
      INSERT INTO public.notifications (empresa_id, type, title, body, url, ref_id)
      VALUES (
        NEW.empresa_id,
        'motor_aceite',
        '🛢️ Cambio de aceite requerido',
        format('%s alcanzó %s h (límite %s h). Toca realizar cambio de aceite.', COALESCE(NEW.nombre, 'Equipo'), NEW.horas, v_limit),
        format('/#detalle_motor/%s', NEW.id),
        NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_motor_oil_change ON public.motores;
CREATE TRIGGER trg_notify_motor_oil_change
  AFTER UPDATE OF horas, max_horas ON public.motores
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_motor_oil_change();
