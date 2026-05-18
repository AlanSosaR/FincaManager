-- Add coordenadas_json column to lotes table
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS coordenadas_json JSONB;