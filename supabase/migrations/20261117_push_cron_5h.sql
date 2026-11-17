-- =============================================================================
-- Recordatorio automático cada 5 horas para Motores con cambio de aceite pendiente
-- Se detiene automáticamente al registrar el cambio de aceite (horas = 0)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Función que envía recordatorio cada 5 horas mientras el motor siga vencido
CREATE OR REPLACE FUNCTION public.send_overdue_motor_oil_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_limit numeric;
  v_has_mant boolean;
BEGIN
  FOR r IN
    SELECT m.id, m.empresa_id, m.nombre, m.horas, m.max_horas
    FROM public.motores m
    WHERE m.empresa_id IS NOT NULL
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.motor_mantenimientos mm WHERE mm.motor_id = r.id
    ) INTO v_has_mant;

    v_limit := CASE WHEN v_has_mant THEN COALESCE(r.max_horas, 100) ELSE 80 END;

    IF COALESCE(r.horas, 0) >= v_limit THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.empresa_id = r.empresa_id
          AND n.type = 'motor_aceite'
          AND n.ref_id = r.id::text
          AND n.created_at > now() - interval '5 hours'
      ) THEN
        INSERT INTO public.notifications (empresa_id, type, title, body, url, ref_id)
        VALUES (
          r.empresa_id,
          'motor_aceite',
          '🛢️ Cambio de aceite requerido',
          format('%s alcanzó %s h (límite %s h). Toca Ver para registrar el cambio.', COALESCE(r.nombre, 'Equipo'), r.horas, v_limit),
          format('/#detalle_motor/%s', r.id),
          r.id::text
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 2. Actualizar trigger en motores para usar límite 80h sin mantenimiento previo y limpiar al resetear horas
CREATE OR REPLACE FUNCTION public.notify_motor_oil_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_mant boolean := false;
  v_limit numeric;
  v_already boolean := false;
BEGIN
  IF NEW.empresa_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si se registró cambio de aceite (horas vuelven a 0), marcar alertas como leídas
  IF COALESCE(NEW.horas, 0) = 0 AND COALESCE(OLD.horas, 0) > 0 THEN
    UPDATE public.notifications
    SET read = true
    WHERE empresa_id = NEW.empresa_id
      AND type = 'motor_aceite'
      AND ref_id = NEW.id::text
      AND read = false;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.motor_mantenimientos mm WHERE mm.motor_id = NEW.id
  ) INTO v_has_mant;

  v_limit := CASE WHEN v_has_mant THEN COALESCE(NEW.max_horas, 100) ELSE 80 END;

  IF COALESCE(NEW.horas, 0) >= v_limit AND COALESCE(OLD.horas, 0) < v_limit THEN
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE empresa_id = NEW.empresa_id
        AND type = 'motor_aceite'
        AND ref_id = NEW.id::text
        AND created_at > now() - interval '5 hours'
    ) INTO v_already;

    IF NOT v_already THEN
      INSERT INTO public.notifications (empresa_id, type, title, body, url, ref_id)
      VALUES (
        NEW.empresa_id,
        'motor_aceite',
        '🛢️ Cambio de aceite requerido',
        format('%s alcanzó %s h (límite %s h). Toca Ver para registrar el cambio.', COALESCE(NEW.nombre, 'Equipo'), NEW.horas, v_limit),
        format('/#detalle_motor/%s', NEW.id),
        NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Programar cron cada 30 min (la función garantiza el intervalo exacto de 5 horas por motor)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'motor-oil-reminder-5h') THEN
    PERFORM cron.unschedule('motor-oil-reminder-5h');
  END IF;
  PERFORM cron.schedule(
    'motor-oil-reminder-5h',
    '*/30 * * * *',
    'SELECT public.send_overdue_motor_oil_reminders();'
  );
END $$;
