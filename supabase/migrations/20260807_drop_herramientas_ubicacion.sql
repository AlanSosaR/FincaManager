-- Eliminar columna ubicacion de herramientas (ya no se usa en la UI)
ALTER TABLE public.herramientas DROP COLUMN IF EXISTS ubicacion;
