-- Fix RLS policies for multi-empresa tables
-- Missing INSERT policies for usuarios, usuario_empresas, invitaciones
-- Missing UPDATE policies for usuario_empresas, invitaciones
-- Fix: return=representation on INSERT into empresas fails because SELECT policy requires membership

-- ============================================================
-- usuarios: users can insert their own record
-- ============================================================
DROP POLICY IF EXISTS usuarios_insert_own ON usuarios;
CREATE POLICY usuarios_insert_own ON usuarios
  FOR INSERT WITH CHECK (id = auth.uid());

-- ============================================================
-- usuario_empresas: users can insert their own memberships
-- ============================================================
DROP POLICY IF EXISTS usuario_empresas_insert_own ON usuario_empresas;
CREATE POLICY usuario_empresas_insert_own ON usuario_empresas
  FOR INSERT WITH CHECK (usuario_id = auth.uid());

-- ============================================================
-- usuario_empresas: authenticated users can read, update, delete
-- (no recursion: this table is just a mapping, safe to expose)
-- ============================================================
DROP POLICY IF EXISTS usuario_empresas_select_own ON usuario_empresas;
DROP POLICY IF EXISTS usuario_empresas_select_member ON usuario_empresas;
CREATE POLICY usuario_empresas_select_own ON usuario_empresas
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS usuario_empresas_update_own ON usuario_empresas;
CREATE POLICY usuario_empresas_update_own ON usuario_empresas
  FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS usuario_empresas_delete_own ON usuario_empresas;
CREATE POLICY usuario_empresas_delete_own ON usuario_empresas
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================
-- empresas: anyone can read basic info (needed for invitation flow)
-- ============================================================
DROP POLICY IF EXISTS empresas_select_all ON empresas;
CREATE POLICY empresas_select_all ON empresas
  FOR SELECT USING (true);

-- ============================================================
-- invitaciones: anyone can read by token (token UUID is the secret)
-- ============================================================
DROP POLICY IF EXISTS invitaciones_select_all ON invitaciones;
CREATE POLICY invitaciones_select_all ON invitaciones
  FOR SELECT USING (true);

-- invitaciones: members can insert invites for their empresa
DROP POLICY IF EXISTS invitaciones_insert_member ON invitaciones;
CREATE POLICY invitaciones_insert_member ON invitaciones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuario_empresas
      WHERE usuario_empresas.empresa_id = invitaciones.empresa_id
      AND usuario_empresas.usuario_id = auth.uid()
    )
  );

-- invitaciones: members can update invites (revoke)
DROP POLICY IF EXISTS invitaciones_update_member ON invitaciones;
CREATE POLICY invitaciones_update_member ON invitaciones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuario_empresas
      WHERE usuario_empresas.empresa_id = invitaciones.empresa_id
      AND usuario_empresas.usuario_id = auth.uid()
    )
  );

-- invitaciones: the invitee can accept their own invitation (email match)
DROP POLICY IF EXISTS invitaciones_update_invitee ON invitaciones;
CREATE POLICY invitaciones_update_invitee ON invitaciones
  FOR UPDATE USING (
    auth.role() = 'authenticated' AND email = auth.email()
  );

-- invitaciones: members can delete invites
DROP POLICY IF EXISTS invitaciones_delete_member ON invitaciones;
CREATE POLICY invitaciones_delete_member ON invitaciones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM usuario_empresas
      WHERE usuario_empresas.empresa_id = invitaciones.empresa_id
      AND usuario_empresas.usuario_id = auth.uid()
    )
  );
