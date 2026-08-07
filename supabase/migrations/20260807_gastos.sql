-- ============================================================
-- Módulo Gastos — registro transversal de gastos de la finca
-- 1) Tabla public.gastos con vínculos opcionales
-- 2) RLS policies (aislamiento por empresa)
-- 3) Realtime
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria TEXT NOT NULL, -- Veterinaria | Insumos Agrícolas | Foliares/Abonos | Maquinaria | Personal | Otro
  descripcion TEXT,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  lote_id UUID REFERENCES public.lotes(id) ON DELETE SET NULL,
  animal_id UUID REFERENCES public.ganado(id) ON DELETE SET NULL,
  herramienta_id UUID REFERENCES public.herramientas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_empresa_fecha ON public.gastos(empresa_id, fecha);

-- ============================================================
-- RLS policies (aislamiento por empresa)
-- ============================================================
DROP POLICY IF EXISTS gastos_select_empresa ON public.gastos;
CREATE POLICY gastos_select_empresa ON public.gastos
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS gastos_insert_empresa ON public.gastos;
CREATE POLICY gastos_insert_empresa ON public.gastos
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS gastos_update_empresa ON public.gastos;
CREATE POLICY gastos_update_empresa ON public.gastos
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS gastos_delete_empresa ON public.gastos;
CREATE POLICY gastos_delete_empresa ON public.gastos
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- Realtime: publicar cambios en gastos
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos;
ALTER TABLE public.gastos REPLICA IDENTITY FULL;
