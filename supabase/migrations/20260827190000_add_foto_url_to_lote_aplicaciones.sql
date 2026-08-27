-- Add foto_url to lote_aplicaciones for plant progress tracking
ALTER TABLE lote_aplicaciones ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE lote_aplicaciones ADD COLUMN IF NOT EXISTS image_url TEXT;
