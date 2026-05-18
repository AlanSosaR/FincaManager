-- ==========================================
-- FINCA MANAGER - SUPABASE SCHEMA
-- ==========================================

-- 1. MOTORES
CREATE TABLE motores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  sn TEXT,
  horas NUMERIC DEFAULT 0,
  max_horas NUMERIC DEFAULT 100,
  icon TEXT,
  fecha_adquisicion DATE,
  notas TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. SESIONES DE MOTOR (Historial)
CREATE TABLE motor_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motor_id UUID REFERENCES motores(id) ON DELETE CASCADE,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  operador TEXT,
  duracion_mins INT,
  total_horas NUMERIC,
  hora_inicio TEXT,
  hora_fin TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. MANTENIMIENTOS DE MOTOR
CREATE TABLE motor_mantenimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motor_id UUID REFERENCES motores(id) ON DELETE CASCADE,
  titulo TEXT,
  descripcion TEXT,
  fecha TIMESTAMP WITH TIME ZONE,
  icon TEXT,
  color TEXT,
  total_horas NUMERIC,
  historial_sesiones JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. POTREROS
CREATE TABLE potreros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  capacidad TEXT,
  animales_actuales INT DEFAULT 0,
  status TEXT,
  dias_status INT DEFAULT 0,
  area NUMERIC,
  pasto TEXT,
  ultimo_riego TIMESTAMP WITH TIME ZONE,
  ubicacion TEXT,
  ciclo_recuperacion INT DEFAULT 30,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. GANADO
CREATE TABLE ganado (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  nombre TEXT,
  raza TEXT,
  peso_actual NUMERIC,
  peso_unidad TEXT DEFAULT 'kg',
  total_vacunas INT DEFAULT 0,
  total_pesajes INT DEFAULT 0,
  potrero_id UUID REFERENCES potreros(id),
  sexo TEXT,
  fecha_adquisicion DATE,
  image_url TEXT,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. HERRAMIENTAS
CREATE TABLE herramientas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  ubicacion TEXT,
  categoria TEXT,
  estado TEXT DEFAULT 'Disponible',
  image_url TEXT,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. EVENTOS DE POTRERO
CREATE TABLE potrero_eventos (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  potrero_id UUID REFERENCES potreros(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  evento TEXT,
  descripcion TEXT,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. PESAJES DE ANIMAL
CREATE TABLE animal_pesajes (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  animal_id UUID REFERENCES ganado(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  evento TEXT,
  peso TEXT,
  cambio TEXT,
  tendencia TEXT,
  color TEXT,
  estado TEXT DEFAULT 'Aplicada',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. VACUNAS DE ANIMAL
CREATE TABLE animal_vacunas (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  animal_id UUID REFERENCES ganado(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  nombre TEXT,
  icon TEXT,
  color TEXT,
  estado TEXT DEFAULT 'Aplicada',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. MANTENIMIENTOS DE HERRAMIENTA
CREATE TABLE herramienta_mantenimientos (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  herramienta_id UUID REFERENCES herramientas(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  evento TEXT,
  descripcion TEXT,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. FUMIGACIONES DE ANIMAL
CREATE TABLE animal_fumigaciones (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  animal_id UUID REFERENCES ganado(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  producto TEXT,
  dosis TEXT,
  observaciones TEXT,
  estado TEXT DEFAULT 'Aplicada',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. LOTES DE CAFETAL
CREATE TABLE lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  variedad TEXT,
  num_plantas INT,
  area_ha NUMERIC,
  tipo_suelo TEXT,
  salud_porcentaje NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'Activo',
  notas TEXT,
  image_url TEXT,
  coordenadas_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. APLICACIONES DE LOTE (fertilizantes, fungicidas, etc.)
CREATE TABLE lote_aplicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID REFERENCES lotes(id) ON DELETE CASCADE,
  tipo TEXT,
  producto TEXT,
  dosis TEXT,
  operador TEXT,
  fecha DATE DEFAULT CURRENT_DATE,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- RLS POLICIES (Allow public access for dev)
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE motores ENABLE ROW LEVEL SECURITY;
ALTER TABLE motor_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE motor_mantenimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE potreros ENABLE ROW LEVEL SECURITY;
ALTER TABLE ganado ENABLE ROW LEVEL SECURITY;
ALTER TABLE herramientas ENABLE ROW LEVEL SECURITY;
ALTER TABLE potrero_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE animal_pesajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE animal_vacunas ENABLE ROW LEVEL SECURITY;
ALTER TABLE herramienta_mantenimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE animal_fumigaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lote_aplicaciones ENABLE ROW LEVEL SECURITY;

-- Generic Policies for all tables (Select, Insert, Update, Delete)
-- Note: Replace [TABLE] with actual table name if needed for granularity

-- Example for 'ganado'
CREATE POLICY "Allow public read ganado" ON ganado FOR SELECT USING (true);
CREATE POLICY "Allow public insert ganado" ON ganado FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update ganado" ON ganado FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete ganado" ON ganado FOR DELETE USING (true);

-- Lotes Policies
CREATE POLICY "Allow public read lotes" ON lotes FOR SELECT USING (true);
CREATE POLICY "Allow public insert lotes" ON lotes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update lotes" ON lotes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete lotes" ON lotes FOR DELETE USING (true);

-- Lote Aplicaciones Policies
CREATE POLICY "Allow public read lote_aplicaciones" ON lote_aplicaciones FOR SELECT USING (true);
CREATE POLICY "Allow public insert lote_aplicaciones" ON lote_aplicaciones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update lote_aplicaciones" ON lote_aplicaciones FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete lote_aplicaciones" ON lote_aplicaciones FOR DELETE USING (true);

-- (And so on for all other tables... omitted for brevity here but should be in full schema)
-- To keep schema.sql clean, you can use a loop in SQL to apply these if running manually.

