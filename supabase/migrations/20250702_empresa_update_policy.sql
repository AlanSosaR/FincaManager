-- ============================================================
-- Add UPDATE policy for empresas table (was missing)
-- Members of an empresa can update its name and other fields
-- ============================================================

DROP POLICY IF EXISTS empresas_update_member ON empresas;
CREATE POLICY empresas_update_member ON empresas
  FOR UPDATE USING (public.is_empresa_member(id));
