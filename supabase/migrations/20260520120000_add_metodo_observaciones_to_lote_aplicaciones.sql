-- Add missing columns to lote_aplicaciones for nueva_actividad form
ALTER TABLE lote_aplicaciones ADD COLUMN IF NOT EXISTS metodo TEXT;
ALTER TABLE lote_aplicaciones ADD COLUMN IF NOT EXISTS observaciones TEXT;
