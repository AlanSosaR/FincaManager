-- ============================================================
-- Módulo Cultivos — cultivos genéricos de la finca
-- (Café se gestiona en su sección propia: Lotes / Plan IFCAFE)
-- 1) Tabla public.cultivos
-- 2) RLS policies (aislamiento por empresa)
-- 3) Realtime
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cultivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- Maíz | Fríjol | Cacao | Yuca | Plátano | Otro
  lote_id UUID REFERENCES public.lotes(id) ON DELETE SET NULL,
  fecha_siembra DATE,
  area_ha NUMERIC(10,2) DEFAULT 0,
  estado_cosecha TEXT DEFAULT 'En crecimiento', -- En crecimiento | En floración | Madurando | Cosechado
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cultivos_empresa_estado ON public.cultivos(empresa_id, estado_cosecha);

-- ============================================================
-- RLS policies (aislamiento por empresa)
-- ============================================================
DROP POLICY IF EXISTS cultivos_select_empresa ON public.cultivos;
CREATE POLICY cultivos_select_empresa ON public.cultivos
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS cultivos_insert_empresa ON public.cultivos;
CREATE POLICY cultivos_insert_empresa ON public.cultivos
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS cultivos_update_empresa ON public.cultivos;
CREATE POLICY cultivos_update_empresa ON public.cultivos
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS cultivos_delete_empresa ON public.cultivos;
CREATE POLICY cultivos_delete_empresa ON public.cultivos
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- Realtime: publicar cambios en cultivos
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.cultivos;
ALTER TABLE public.cultivos REPLICA IDENTITY FULL;
