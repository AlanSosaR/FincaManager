-- ============================================================
-- Reproducción ganadera — preñez, parto y crías
-- 1) Vínculo cría -> madre + estado reproductivo en ganado
-- 2) Historial de ciclos reproductivos en animal_preñez
-- 3) RLS policies + Realtime
-- ============================================================

-- Vínculo de la cría con su madre
ALTER TABLE public.ganado ADD COLUMN IF NOT EXISTS madre_id UUID REFERENCES public.ganado(id) ON DELETE SET NULL;

-- Estado reproductivo actual de la hembra: Vacía | Preñada | Lactando
ALTER TABLE public.ganado ADD COLUMN IF NOT EXISTS reproductivo TEXT DEFAULT 'Vacía';

-- Historial de ciclos reproductivos
CREATE TABLE IF NOT EXISTS public.animal_preñez (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID NOT NULL REFERENCES public.ganado(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  fecha_monta DATE NOT NULL,
  fecha_probable_parto DATE,
  fecha_parto DATE,
  num_crias INTEGER DEFAULT 1,
  estado TEXT DEFAULT 'Preñada', -- Preñada | Parida | Abortada
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS policies (aislamiento por empresa)
-- ============================================================
DROP POLICY IF EXISTS animal_preñez_select_empresa ON public.animal_preñez;
CREATE POLICY animal_preñez_select_empresa ON public.animal_preñez
  FOR SELECT USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_preñez_insert_empresa ON public.animal_preñez;
CREATE POLICY animal_preñez_insert_empresa ON public.animal_preñez
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_preñez_update_empresa ON public.animal_preñez;
CREATE POLICY animal_preñez_update_empresa ON public.animal_preñez
  FOR UPDATE USING (public.is_empresa_member(empresa_id));
DROP POLICY IF EXISTS animal_preñez_delete_empresa ON public.animal_preñez;
CREATE POLICY animal_preñez_delete_empresa ON public.animal_preñez
  FOR DELETE USING (public.is_empresa_member(empresa_id));

-- ============================================================
-- Realtime: publicar cambios en animal_preñez
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.animal_preñez;
ALTER TABLE public.animal_preñez REPLICA IDENTITY FULL;
