-- ============================================================
-- Catálogo de Vacunas y Productos de Fumigación (con dosis por kg/ml)
-- 1) Tabla public.ganado_catalogo_productos
-- 2) RLS policies (aislamiento por empresa)
-- 3) Realtime
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ganado_catalogo_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'vacuna', -- 'vacuna' | 'fumigacion'
  nombre TEXT NOT NULL,
  kg_por_ml NUMERIC(10,3),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ganado_catalogo_empresa_tipo ON public.ganado_catalogo_productos(empresa_id, tipo);

ALTER TABLE public.ganado_catalogo_productos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS policies (aislamiento por empresa)
-- ============================================================
DROP POLICY IF EXISTS ganado_catalogo_select_empresa ON public.ganado_catalogo_productos;
CREATE POLICY ganado_catalogo_select_empresa ON public.ganado_catalogo_productos
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS ganado_catalogo_insert_empresa ON public.ganado_catalogo_productos;
CREATE POLICY ganado_catalogo_insert_empresa ON public.ganado_catalogo_productos
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS ganado_catalogo_update_empresa ON public.ganado_catalogo_productos;
CREATE POLICY ganado_catalogo_update_empresa ON public.ganado_catalogo_productos
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS ganado_catalogo_delete_empresa ON public.ganado_catalogo_productos;
CREATE POLICY ganado_catalogo_delete_empresa ON public.ganado_catalogo_productos
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- Realtime: publicar cambios en ganado_catalogo_productos
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.ganado_catalogo_productos;
ALTER TABLE public.ganado_catalogo_productos REPLICA IDENTITY FULL;
