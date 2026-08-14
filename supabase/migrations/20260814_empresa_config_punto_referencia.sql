-- Punto de referencia de la finca usado por todos los mapas
ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS punto_ref_nombre text,
  ADD COLUMN IF NOT EXISTS punto_ref_lat double precision,
  ADD COLUMN IF NOT EXISTS punto_ref_lng double precision;
