-- Add coordenadas_json column to potreros table
ALTER TABLE potreros ADD COLUMN IF NOT EXISTS coordenadas_json JSONB;