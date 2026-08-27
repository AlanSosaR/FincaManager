-- Add agroforestry and companion crop columns to lotes table
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS tiene_maderables BOOLEAN DEFAULT FALSE;
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS maderables_variedades TEXT;
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS tiene_musaceas BOOLEAN DEFAULT FALSE;
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS musaceas_tipo TEXT;
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS agroforestal_notas TEXT;
