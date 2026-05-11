-- ==========================================
-- FINCA MANAGER - SUPABASE SCHEMA
-- ==========================================

-- 1. MOTORES
CREATE TABLE motores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  sn TEXT,
  horas INT DEFAULT 0,
  max_horas INT DEFAULT 100,
  icon TEXT,
  fecha_adquisicion DATE,
  notas TEXT,
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. POTREROS
CREATE TABLE potreros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  capacidad TEXT, -- e.g. "50 Cabezas"
  animales_actuales INT DEFAULT 0,
  status TEXT, -- 'óptimo', 'pastoreo', 'recuperación'
  dias_status INT DEFAULT 0,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. GANADO
CREATE TABLE ganado (
  id TEXT PRIMARY KEY, -- e.g. "#001"
  nombre TEXT,
  raza TEXT,
  peso_actual NUMERIC,
  total_vacunas INT DEFAULT 0,
  total_pesajes INT DEFAULT 0,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. HERRAMIENTAS
CREATE TABLE herramientas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  ubicacion TEXT,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- DATOS DE PRUEBA (MOCK DATA) Opcional
-- ==========================================
INSERT INTO motores (id, nombre, sn, horas, max_horas, icon)
VALUES 
  ('123e4567-e89b-12d3-a456-426614174000', 'Tractor JD 5090', '4421-XB-992', 80, 100, '🚜'),
  ('123e4567-e89b-12d3-a456-426614174001', 'Generador Honda', 'GEN-888-A', 45, 50, '⚡');

INSERT INTO potreros (nombre, capacidad, animales_actuales, status, dias_status, icon)
VALUES 
  ('Potrero Norte 1', '50 Cabezas', 45, 'óptimo', 12, '🌿'),
  ('Potrero Sur 2', '30 Cabezas', 30, 'pastoreo', 5, '🌱');

INSERT INTO ganado (id, raza, peso_actual, total_vacunas, total_pesajes, icon)
VALUES 
  ('#001', 'Angus', 450.5, 3, 5, '🐮'),
  ('#002', 'Brahman', 380.0, 2, 4, '🐂');

INSERT INTO herramientas (nombre, ubicacion, icon, color)
VALUES 
  ('Motosierra Stihl', 'Bodega Principal', '🪚', '#f44336'),
  ('Fumigadora', 'Caja Herramientas B', '🎒', '#ff9800');
