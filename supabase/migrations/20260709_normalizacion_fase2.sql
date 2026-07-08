-- Normalización Fase 2–4: eliminar columnas redundantes/computadas
-- 2026-07-08

-- Fase 2: ganado — columnas calculadas que ahora se obtienen con COUNT
ALTER TABLE ganado DROP COLUMN IF EXISTS total_vacunas;
ALTER TABLE ganado DROP COLUMN IF EXISTS total_pesajes;

-- Fase 3: animal_pesajes — columnas derivadas que se calculan en frontend
ALTER TABLE animal_pesajes DROP COLUMN IF EXISTS cambio;
ALTER TABLE animal_pesajes DROP COLUMN IF EXISTS tendencia;
ALTER TABLE animal_pesajes DROP COLUMN IF EXISTS color;

-- Fase 4: potreros — columnas derivadas que ahora se obtienen con COUNT/query
ALTER TABLE potreros DROP COLUMN IF EXISTS animales_actuales;
ALTER TABLE potreros DROP COLUMN IF EXISTS dias_status;
