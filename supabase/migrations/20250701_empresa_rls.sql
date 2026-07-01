-- ============================================================
-- RLS policies for business tables — empresa-level isolation
-- Each policy verifies the user is a member of the record's empresa
-- ============================================================

-- Helper: any authenticated user can read usuario_empresas for their own rows
-- (already exists from previous migration)

-- ============================================================
-- Template macro (applied per table below):
--   SELECT: user must be member of the record's empresa
--   INSERT: user must be member of the empresa being inserted
--   UPDATE: same as SELECT
--   DELETE: same as SELECT
-- ============================================================

-- Helper function used by policies
CREATE OR REPLACE FUNCTION public.is_empresa_member(empresa_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_empresas
    WHERE usuario_empresas.empresa_id = is_empresa_member.empresa_id
      AND usuario_empresas.usuario_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- MOTORES
-- ============================================================
DROP POLICY IF EXISTS motores_select_empresa ON motores;
CREATE POLICY motores_select_empresa ON motores
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motores_insert_empresa ON motores;
CREATE POLICY motores_insert_empresa ON motores
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motores_update_empresa ON motores;
CREATE POLICY motores_update_empresa ON motores
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motores_delete_empresa ON motores;
CREATE POLICY motores_delete_empresa ON motores
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- MOTOR_SESIONES
-- ============================================================
DROP POLICY IF EXISTS motor_sesiones_select_empresa ON motor_sesiones;
CREATE POLICY motor_sesiones_select_empresa ON motor_sesiones
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motor_sesiones_insert_empresa ON motor_sesiones;
CREATE POLICY motor_sesiones_insert_empresa ON motor_sesiones
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motor_sesiones_update_empresa ON motor_sesiones;
CREATE POLICY motor_sesiones_update_empresa ON motor_sesiones
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motor_sesiones_delete_empresa ON motor_sesiones;
CREATE POLICY motor_sesiones_delete_empresa ON motor_sesiones
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- MOTOR_MANTENIMIENTOS
-- ============================================================
DROP POLICY IF EXISTS motor_mantenimientos_select_empresa ON motor_mantenimientos;
CREATE POLICY motor_mantenimientos_select_empresa ON motor_mantenimientos
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motor_mantenimientos_insert_empresa ON motor_mantenimientos;
CREATE POLICY motor_mantenimientos_insert_empresa ON motor_mantenimientos
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motor_mantenimientos_update_empresa ON motor_mantenimientos;
CREATE POLICY motor_mantenimientos_update_empresa ON motor_mantenimientos
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS motor_mantenimientos_delete_empresa ON motor_mantenimientos;
CREATE POLICY motor_mantenimientos_delete_empresa ON motor_mantenimientos
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- POTREROS
-- ============================================================
DROP POLICY IF EXISTS potreros_select_empresa ON potreros;
CREATE POLICY potreros_select_empresa ON potreros
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS potreros_insert_empresa ON potreros;
CREATE POLICY potreros_insert_empresa ON potreros
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS potreros_update_empresa ON potreros;
CREATE POLICY potreros_update_empresa ON potreros
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS potreros_delete_empresa ON potreros;
CREATE POLICY potreros_delete_empresa ON potreros
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- GANADO
-- ============================================================
DROP POLICY IF EXISTS ganado_select_empresa ON ganado;
CREATE POLICY ganado_select_empresa ON ganado
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS ganado_insert_empresa ON ganado;
CREATE POLICY ganado_insert_empresa ON ganado
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS ganado_update_empresa ON ganado;
CREATE POLICY ganado_update_empresa ON ganado
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS ganado_delete_empresa ON ganado;
CREATE POLICY ganado_delete_empresa ON ganado
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- HERRAMIENTAS
-- ============================================================
DROP POLICY IF EXISTS herramientas_select_empresa ON herramientas;
CREATE POLICY herramientas_select_empresa ON herramientas
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS herramientas_insert_empresa ON herramientas;
CREATE POLICY herramientas_insert_empresa ON herramientas
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS herramientas_update_empresa ON herramientas;
CREATE POLICY herramientas_update_empresa ON herramientas
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS herramientas_delete_empresa ON herramientas;
CREATE POLICY herramientas_delete_empresa ON herramientas
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- POTRERO_EVENTOS
-- ============================================================
DROP POLICY IF EXISTS potrero_eventos_select_empresa ON potrero_eventos;
CREATE POLICY potrero_eventos_select_empresa ON potrero_eventos
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS potrero_eventos_insert_empresa ON potrero_eventos;
CREATE POLICY potrero_eventos_insert_empresa ON potrero_eventos
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS potrero_eventos_update_empresa ON potrero_eventos;
CREATE POLICY potrero_eventos_update_empresa ON potrero_eventos
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS potrero_eventos_delete_empresa ON potrero_eventos;
CREATE POLICY potrero_eventos_delete_empresa ON potrero_eventos
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- ANIMAL_PESAJES
-- ============================================================
DROP POLICY IF EXISTS animal_pesajes_select_empresa ON animal_pesajes;
CREATE POLICY animal_pesajes_select_empresa ON animal_pesajes
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_pesajes_insert_empresa ON animal_pesajes;
CREATE POLICY animal_pesajes_insert_empresa ON animal_pesajes
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_pesajes_update_empresa ON animal_pesajes;
CREATE POLICY animal_pesajes_update_empresa ON animal_pesajes
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_pesajes_delete_empresa ON animal_pesajes;
CREATE POLICY animal_pesajes_delete_empresa ON animal_pesajes
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- ANIMAL_VACUNAS
-- ============================================================
DROP POLICY IF EXISTS animal_vacunas_select_empresa ON animal_vacunas;
CREATE POLICY animal_vacunas_select_empresa ON animal_vacunas
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_vacunas_insert_empresa ON animal_vacunas;
CREATE POLICY animal_vacunas_insert_empresa ON animal_vacunas
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_vacunas_update_empresa ON animal_vacunas;
CREATE POLICY animal_vacunas_update_empresa ON animal_vacunas
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_vacunas_delete_empresa ON animal_vacunas;
CREATE POLICY animal_vacunas_delete_empresa ON animal_vacunas
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- ANIMAL_FUMIGACIONES
-- ============================================================
DROP POLICY IF EXISTS animal_fumigaciones_select_empresa ON animal_fumigaciones;
CREATE POLICY animal_fumigaciones_select_empresa ON animal_fumigaciones
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_fumigaciones_insert_empresa ON animal_fumigaciones;
CREATE POLICY animal_fumigaciones_insert_empresa ON animal_fumigaciones
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_fumigaciones_update_empresa ON animal_fumigaciones;
CREATE POLICY animal_fumigaciones_update_empresa ON animal_fumigaciones
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_fumigaciones_delete_empresa ON animal_fumigaciones;
CREATE POLICY animal_fumigaciones_delete_empresa ON animal_fumigaciones
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- ANIMAL_VENTAS
-- ============================================================
DROP POLICY IF EXISTS animal_ventas_select_empresa ON animal_ventas;
CREATE POLICY animal_ventas_select_empresa ON animal_ventas
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_ventas_insert_empresa ON animal_ventas;
CREATE POLICY animal_ventas_insert_empresa ON animal_ventas
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_ventas_update_empresa ON animal_ventas;
CREATE POLICY animal_ventas_update_empresa ON animal_ventas
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_ventas_delete_empresa ON animal_ventas;
CREATE POLICY animal_ventas_delete_empresa ON animal_ventas
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- HERRAMIENTA_MANTENIMIENTOS
-- ============================================================
DROP POLICY IF EXISTS herramienta_mantenimientos_select_empresa ON herramienta_mantenimientos;
CREATE POLICY herramienta_mantenimientos_select_empresa ON herramienta_mantenimientos
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS herramienta_mantenimientos_insert_empresa ON herramienta_mantenimientos;
CREATE POLICY herramienta_mantenimientos_insert_empresa ON herramienta_mantenimientos
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS herramienta_mantenimientos_update_empresa ON herramienta_mantenimientos;
CREATE POLICY herramienta_mantenimientos_update_empresa ON herramienta_mantenimientos
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS herramienta_mantenimientos_delete_empresa ON herramienta_mantenimientos;
CREATE POLICY herramienta_mantenimientos_delete_empresa ON herramienta_mantenimientos
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- LOTES
-- ============================================================
DROP POLICY IF EXISTS lotes_select_empresa ON lotes;
CREATE POLICY lotes_select_empresa ON lotes
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lotes_insert_empresa ON lotes;
CREATE POLICY lotes_insert_empresa ON lotes
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lotes_update_empresa ON lotes;
CREATE POLICY lotes_update_empresa ON lotes
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lotes_delete_empresa ON lotes;
CREATE POLICY lotes_delete_empresa ON lotes
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- LOTE_APLICACIONES
-- ============================================================
DROP POLICY IF EXISTS lote_aplicaciones_select_empresa ON lote_aplicaciones;
CREATE POLICY lote_aplicaciones_select_empresa ON lote_aplicaciones
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lote_aplicaciones_insert_empresa ON lote_aplicaciones;
CREATE POLICY lote_aplicaciones_insert_empresa ON lote_aplicaciones
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lote_aplicaciones_update_empresa ON lote_aplicaciones;
CREATE POLICY lote_aplicaciones_update_empresa ON lote_aplicaciones
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lote_aplicaciones_delete_empresa ON lote_aplicaciones;
CREATE POLICY lote_aplicaciones_delete_empresa ON lote_aplicaciones
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- LOTE_PERSONAL
-- ============================================================
DROP POLICY IF EXISTS lote_personal_select_empresa ON lote_personal;
CREATE POLICY lote_personal_select_empresa ON lote_personal
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lote_personal_insert_empresa ON lote_personal;
CREATE POLICY lote_personal_insert_empresa ON lote_personal
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS lote_personal_delete_empresa ON lote_personal;
CREATE POLICY lote_personal_delete_empresa ON lote_personal
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- PERSONAL
-- ============================================================
DROP POLICY IF EXISTS personal_select_empresa ON personal;
CREATE POLICY personal_select_empresa ON personal
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS personal_insert_empresa ON personal;
CREATE POLICY personal_insert_empresa ON personal
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS personal_update_empresa ON personal;
CREATE POLICY personal_update_empresa ON personal
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS personal_delete_empresa ON personal;
CREATE POLICY personal_delete_empresa ON personal
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- PERSONAL_ASISTENCIA
-- ============================================================
DROP POLICY IF EXISTS personal_asistencia_select_empresa ON personal_asistencia;
CREATE POLICY personal_asistencia_select_empresa ON personal_asistencia
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS personal_asistencia_insert_empresa ON personal_asistencia;
CREATE POLICY personal_asistencia_insert_empresa ON personal_asistencia
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS personal_asistencia_update_empresa ON personal_asistencia;
CREATE POLICY personal_asistencia_update_empresa ON personal_asistencia
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS personal_asistencia_delete_empresa ON personal_asistencia;
CREATE POLICY personal_asistencia_delete_empresa ON personal_asistencia
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- Drop old public policies (if any remain from schema.sql)
-- ============================================================
DROP POLICY IF EXISTS "Allow public read ganado" ON ganado;
DROP POLICY IF EXISTS "Allow public insert ganado" ON ganado;
DROP POLICY IF EXISTS "Allow public update ganado" ON ganado;
DROP POLICY IF EXISTS "Allow public delete ganado" ON ganado;
DROP POLICY IF EXISTS "Allow public read lotes" ON lotes;
DROP POLICY IF EXISTS "Allow public insert lotes" ON lotes;
DROP POLICY IF EXISTS "Allow public update lotes" ON lotes;
DROP POLICY IF EXISTS "Allow public delete lotes" ON lotes;
DROP POLICY IF EXISTS "Allow public read lote_aplicaciones" ON lote_aplicaciones;
DROP POLICY IF EXISTS "Allow public insert lote_aplicaciones" ON lote_aplicaciones;
DROP POLICY IF EXISTS "Allow public update lote_aplicaciones" ON lote_aplicaciones;
DROP POLICY IF EXISTS "Allow public delete lote_aplicaciones" ON lote_aplicaciones;
DROP POLICY IF EXISTS "Allow public read personal" ON personal;
DROP POLICY IF EXISTS "Allow public insert personal" ON personal;
DROP POLICY IF EXISTS "Allow public update personal" ON personal;
DROP POLICY IF EXISTS "Allow public delete personal" ON personal;
DROP POLICY IF EXISTS "Allow public read personal_asistencia" ON personal_asistencia;
DROP POLICY IF EXISTS "Allow public insert personal_asistencia" ON personal_asistencia;
DROP POLICY IF EXISTS "Allow public update personal_asistencia" ON personal_asistencia;
DROP POLICY IF EXISTS "Allow public delete personal_asistencia" ON personal_asistencia;
DROP POLICY IF EXISTS "Allow public read lote_personal" ON lote_personal;
DROP POLICY IF EXISTS "Allow public insert lote_personal" ON lote_personal;
DROP POLICY IF EXISTS "Allow public delete lote_personal" ON lote_personal;
