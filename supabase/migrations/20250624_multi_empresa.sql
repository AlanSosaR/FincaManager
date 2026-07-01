-- Create extension for UUID generation if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Create new tables for multi-empresa system
-- ============================================================

-- empresas
CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL DEFAULT 'Mi Finca',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- usuarios: sync profile from auth.users
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- usuario_empresas: membership + role
CREATE TABLE IF NOT EXISTS usuario_empresas (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  rol TEXT NOT NULL DEFAULT 'visor' CHECK (rol IN ('propietario', 'admin', 'visor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, empresa_id)
);

-- invitaciones: pending invites
CREATE TABLE IF NOT EXISTS invitaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'visor' CHECK (rol IN ('admin', 'visor')),
  token TEXT NOT NULL UNIQUE DEFAULT uuid_generate_v4()::text,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'expirada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Add empresa_id column to all existing business tables
-- ============================================================
ALTER TABLE IF EXISTS motores ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS motor_sesiones ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS motor_mantenimientos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS potreros ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS ganado ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS herramientas ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS potrero_eventos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS animal_pesajes ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS animal_vacunas ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS animal_fumigaciones ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS animal_ventas ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS herramienta_mantenimientos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS lotes ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS lote_aplicaciones ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS lote_personal ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS personal ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS personal_asistencia ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;

-- ============================================================
-- 3. Enable Row Level Security on new tables
-- ============================================================
ALTER TABLE IF EXISTS empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS usuario_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS usuarios ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Create basic RLS policies
-- ============================================================

-- usuarios: users can read/update their own record
DROP POLICY IF EXISTS usuarios_select_own ON usuarios;
CREATE POLICY usuarios_select_own ON usuarios
  FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS usuarios_update_own ON usuarios;
CREATE POLICY usuarios_update_own ON usuarios
  FOR UPDATE USING (id = auth.uid());

-- empresas: members can read the empresa
DROP POLICY IF EXISTS empresas_select_member ON empresas;
CREATE POLICY empresas_select_member ON empresas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuario_empresas WHERE usuario_empresas.empresa_id = empresas.id AND usuario_empresas.usuario_id = auth.uid())
  );
DROP POLICY IF EXISTS empresas_insert_own ON empresas;
CREATE POLICY empresas_insert_own ON empresas
  FOR INSERT WITH CHECK (true);

-- usuario_empresas: users can read their own memberships
DROP POLICY IF EXISTS usuario_empresas_select_own ON usuario_empresas;
CREATE POLICY usuario_empresas_select_own ON usuario_empresas
  FOR SELECT USING (usuario_id = auth.uid());

-- invitaciones: members can read invites for their empresas
DROP POLICY IF EXISTS invitaciones_select_member ON invitaciones;
CREATE POLICY invitaciones_select_member ON invitaciones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuario_empresas WHERE usuario_empresas.empresa_id = invitaciones.empresa_id AND usuario_empresas.usuario_id = auth.uid())
  );

-- ============================================================
-- 5. Create indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_usuario_empresas_usuario ON usuario_empresas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_empresas_empresa ON usuario_empresas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_empresa ON invitaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_token ON invitaciones(token);
CREATE INDEX IF NOT EXISTS idx_invitaciones_email ON invitaciones(email);
