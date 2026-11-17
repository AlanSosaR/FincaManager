-- =============================================================================
-- Recordatorios de parto próximo en Ganado:
--   - Al entrar al mes 9 (16 a 30 días antes del parto): 1 aviso inicial
--   - A partir de mitad del mes 9 (<= 15 días antes): cada 2 días (48 horas)
--   - Se detiene automáticamente cuando estado != 'Preñada' o se registra fecha_parto
-- =============================================================================

CREATE OR REPLACE FUNCTION public.send_ganado_parto_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_dias integer;
  v_title text;
  v_body text;
  v_cuando text;
BEGIN
  FOR r IN
    SELECT
      p.id,
      p.animal_id,
      p.empresa_id,
      p.fecha_probable_parto,
      COALESCE(g.nombre, 'Vaca preñada') AS animal_nombre
    FROM public."animal_preñez" p
    LEFT JOIN public.ganado g ON g.id = p.animal_id
    WHERE p.empresa_id IS NOT NULL
      AND p.estado = 'Preñada'
      AND p.fecha_probable_parto IS NOT NULL
      AND p.fecha_parto IS NULL
  LOOP
    v_dias := (r.fecha_probable_parto - CURRENT_DATE);

    -- Mitad del mes 9 en adelante (<= 15 días): recordar cada 2 días (48h)
    IF v_dias <= 15 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.empresa_id = r.empresa_id
          AND n.type = 'ganado_parto'
          AND n.ref_id = r.animal_id::text
          AND n.created_at > now() - interval '48 hours'
      ) THEN
        v_cuando := CASE
          WHEN v_dias < 0 THEN format('fecha probable pasó hace %s día(s)', abs(v_dias))
          WHEN v_dias = 0 THEN '¡HOY!'
          WHEN v_dias = 1 THEN 'mañana'
          ELSE format('en %s días', v_dias)
        END;
        v_title := CASE WHEN v_dias <= 2 THEN '🐄 ¡Parto inminente!' ELSE '🐄 Parto próximo · Revisar vaca' END;
        v_body := format('%s está en la recta final (%s · %s). Mantener vigilancia.', r.animal_nombre, v_cuando, r.fecha_probable_parto);

        INSERT INTO public.notifications (empresa_id, type, title, body, url, ref_id)
        VALUES (
          r.empresa_id,
          'ganado_parto',
          v_title,
          v_body,
          format('/#detalle_animal/%s', r.animal_id),
          r.animal_id::text
        );
      END IF;

    -- Entrada al mes 9 (16 a 30 días antes): aviso inicial de mes 9
    ELSIF v_dias BETWEEN 16 AND 30 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.empresa_id = r.empresa_id
          AND n.type = 'ganado_parto'
          AND n.ref_id = r.animal_id::text
          AND n.created_at > now() - interval '15 days'
      ) THEN
        INSERT INTO public.notifications (empresa_id, type, title, body, url, ref_id)
        VALUES (
          r.empresa_id,
          'ganado_parto',
          '🐄 Vaca en mes 9 de gestación',
          format('%s entró al mes 9 (faltan %s días · %s). Ir preparando cuidados de parto.', r.animal_nombre, v_dias, r.fecha_probable_parto),
          format('/#detalle_animal/%s', r.animal_id),
          r.animal_id::text
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Trigger para limpiar alertas cuando se registra el parto o cambia estado != 'Preñada'
CREATE OR REPLACE FUNCTION public.clear_ganado_parto_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.empresa_id IS NOT NULL AND (NEW.estado <> 'Preñada' OR NEW.fecha_parto IS NOT NULL) THEN
    UPDATE public.notifications
    SET read = true
    WHERE empresa_id = NEW.empresa_id
      AND type = 'ganado_parto'
      AND ref_id = NEW.animal_id::text
      AND read = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_ganado_parto_notifications ON public."animal_preñez";
CREATE TRIGGER trg_clear_ganado_parto_notifications
  AFTER UPDATE OF estado, fecha_parto ON public."animal_preñez"
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_ganado_parto_notifications();

-- Programar cron cada 6 horas (la función controla el aviso inicial de mes 9 y cada 2 días desde mitad de mes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ganado-parto-reminder-cron') THEN
    PERFORM cron.unschedule('ganado-parto-reminder-cron');
  END IF;
  PERFORM cron.schedule(
    'ganado-parto-reminder-cron',
    '0 */6 * * *',
    'SELECT public.send_ganado_parto_reminders();'
  );
END $$;
