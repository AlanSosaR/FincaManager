-- ==========================================
-- Fase 1: Normalización — eliminar peso_actual de ganado
-- ==========================================

-- 1. Backfill: crear pesaje inicial para animales sin historial
INSERT INTO animal_pesajes (id, animal_id, fecha, peso, estado, empresa_id)
SELECT gen_random_uuid(), id, created_at::date, peso_actual::text, 'Aplicada', empresa_id
FROM ganado
WHERE peso_actual IS NOT NULL
  AND peso_actual > 0
  AND id NOT IN (SELECT animal_id FROM animal_pesajes);

-- 2. Eliminar columna redundante
ALTER TABLE ganado DROP COLUMN IF EXISTS peso_actual;
