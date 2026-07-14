-- empresa_config: WhatsApp configuration shared across empresa members
CREATE TABLE IF NOT EXISTS empresa_config (
  empresa_id UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  whatsapp_group_jid TEXT,
  whatsapp_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (whatsapp_status IN ('connected', 'disconnected')),
  whatsapp_connected_by UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  whatsapp_connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS empresa_config ENABLE ROW LEVEL SECURITY;

-- Members can read their empresa config
DROP POLICY IF EXISTS empresa_config_select_member ON empresa_config;
CREATE POLICY empresa_config_select_member ON empresa_config
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuario_empresas WHERE usuario_empresas.empresa_id = empresa_config.empresa_id AND usuario_empresas.usuario_id = auth.uid())
  );

-- Admins/propietarios can insert/update
DROP POLICY IF EXISTS empresa_config_insert_admin ON empresa_config;
CREATE POLICY empresa_config_insert_admin ON empresa_config
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuario_empresas WHERE usuario_empresas.empresa_id = empresa_config.empresa_id AND usuario_empresas.usuario_id = auth.uid() AND usuario_empresas.rol IN ('propietario', 'admin'))
  );

DROP POLICY IF EXISTS empresa_config_update_admin ON empresa_config;
CREATE POLICY empresa_config_update_admin ON empresa_config
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuario_empresas WHERE usuario_empresas.empresa_id = empresa_config.empresa_id AND usuario_empresas.usuario_id = auth.uid() AND usuario_empresas.rol IN ('propietario', 'admin'))
  );

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_empresa_config_empresa ON empresa_config(empresa_id);
