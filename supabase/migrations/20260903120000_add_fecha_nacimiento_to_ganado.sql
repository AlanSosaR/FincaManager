-- ============================================================
-- Añadir columna fecha_nacimiento a ganado
-- Permite registrar la edad real independientemente de la fecha de ingreso
-- ============================================================

ALTER TABLE public.ganado ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
