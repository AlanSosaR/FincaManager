-- Create personal table for personnel management
CREATE TABLE IF NOT EXISTS personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rol TEXT,
  iniciales TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE personal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read personal" ON personal FOR SELECT USING (true);
CREATE POLICY "Allow public insert personal" ON personal FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update personal" ON personal FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete personal" ON personal FOR DELETE USING (true);
