-- Enable Realtime for all business tables via supabase_realtime publication
-- Each table is added individually in a DO block to handle idempotency

DO $$
DECLARE
  tables text[] := ARRAY[
    'motores', 'motor_sesiones', 'motor_mantenimientos',
    'potreros', 'ganado', 'herramientas', 'potrero_eventos',
    'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones', 'animal_ventas',
    'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
    'lote_personal', 'personal', 'personal_asistencia'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN OTHERS THEN
      -- Table may already be in publication; skip
    END;
  END LOOP;
END;
$$;

-- Enable REPLICA IDENTITY FULL for tables that need old record on UPDATE/DELETE
-- This ensures empresa_id is available in the WAL for filtering
ALTER TABLE motores REPLICA IDENTITY FULL;
ALTER TABLE motor_sesiones REPLICA IDENTITY FULL;
ALTER TABLE motor_mantenimientos REPLICA IDENTITY FULL;
ALTER TABLE potreros REPLICA IDENTITY FULL;
ALTER TABLE ganado REPLICA IDENTITY FULL;
ALTER TABLE herramientas REPLICA IDENTITY FULL;
ALTER TABLE potrero_eventos REPLICA IDENTITY FULL;
ALTER TABLE animal_pesajes REPLICA IDENTITY FULL;
ALTER TABLE animal_vacunas REPLICA IDENTITY FULL;
ALTER TABLE animal_fumigaciones REPLICA IDENTITY FULL;
ALTER TABLE animal_ventas REPLICA IDENTITY FULL;
ALTER TABLE herramienta_mantenimientos REPLICA IDENTITY FULL;
ALTER TABLE lotes REPLICA IDENTITY FULL;
ALTER TABLE lote_aplicaciones REPLICA IDENTITY FULL;
ALTER TABLE lote_personal REPLICA IDENTITY FULL;
ALTER TABLE personal REPLICA IDENTITY FULL;
ALTER TABLE personal_asistencia REPLICA IDENTITY FULL;
