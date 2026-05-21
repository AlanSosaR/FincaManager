-- Add pago_diario to personal and create asistencia table
ALTER TABLE personal ADD COLUMN IF NOT EXISTS pago_diario NUMERIC;

CREATE TABLE IF NOT EXISTS personal_asistencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personal_id UUID REFERENCES personal(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'trabajo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(personal_id, fecha)
);

ALTER TABLE personal_asistencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read personal_asistencia" ON personal_asistencia FOR SELECT USING (true);
CREATE POLICY "Allow public insert personal_asistencia" ON personal_asistencia FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update personal_asistencia" ON personal_asistencia FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete personal_asistencia" ON personal_asistencia FOR DELETE USING (true);
