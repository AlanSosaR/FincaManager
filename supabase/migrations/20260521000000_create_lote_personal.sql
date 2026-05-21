-- Create lote_personal junction table to assign personnel to specific lots
CREATE TABLE IF NOT EXISTS lote_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID REFERENCES lotes(id) ON DELETE CASCADE,
  personal_id UUID REFERENCES personal(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(lote_id, personal_id)
);

ALTER TABLE lote_personal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read lote_personal" ON lote_personal FOR SELECT USING (true);
CREATE POLICY "Allow public insert lote_personal" ON lote_personal FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete lote_personal" ON lote_personal FOR DELETE USING (true);
