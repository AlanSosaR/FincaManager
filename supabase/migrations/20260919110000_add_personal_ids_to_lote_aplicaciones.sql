-- Add personal_ids column to lote_aplicaciones
-- Stores a JSON array of personal.id values for robust operator matching
-- Used by detalle_personal.js to show cafetal activities in the worker calendar
ALTER TABLE lote_aplicaciones ADD COLUMN IF NOT EXISTS personal_ids TEXT;
