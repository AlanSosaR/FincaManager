-- Allow team members to read each other's name/email for the Equipo screen
CREATE POLICY usuarios_select_member ON usuarios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuario_empresas
      WHERE usuario_empresas.usuario_id = usuarios.id
        AND public.is_empresa_member(usuario_empresas.empresa_id)
    )
  );
