-- Agregar columna notas a potreros (consistente con motores)
ALTER TABLE public.potreros ADD COLUMN IF NOT EXISTS notas text;
