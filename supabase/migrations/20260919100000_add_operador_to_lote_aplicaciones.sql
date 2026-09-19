-- Add operador column to lote_aplicaciones
-- This column stores a comma-separated list of operator names for each activity.
-- It was present in earlier schema versions but missing from the current DB.
ALTER TABLE lote_aplicaciones ADD COLUMN IF NOT EXISTS operador TEXT;
