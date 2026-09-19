-- Corregir constraint de estado en personal_asistencia para permitir 'trabajo' y 'descanso'
-- El frontend de Finca Manager usa 'trabajo' y 'descanso'.
-- Agregamos también variantes comunes para máxima compatibilidad.

ALTER TABLE personal_asistencia DROP CONSTRAINT IF EXISTS personal_asistencia_estado_check;

ALTER TABLE personal_asistencia ADD CONSTRAINT personal_asistencia_estado_check 
  CHECK (estado IN ('trabajo', 'descanso', 'Presente', 'Ausente', 'presente', 'ausente', 'Trabajo', 'Descanso'));
