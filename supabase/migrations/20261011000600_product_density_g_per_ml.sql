-- Densidad por producto para convertir volumen (ML/L) ↔ gramos en recetas de cocina

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS density_g_per_ml numeric(12, 6);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_density_g_per_ml_pos;

ALTER TABLE public.products
  ADD CONSTRAINT products_density_g_per_ml_pos
  CHECK (density_g_per_ml IS NULL OR density_g_per_ml > 0);

COMMENT ON COLUMN public.products.density_g_per_ml IS
  'Densidad en g/ml. Solo aplica a productos en unidades de volumen (ML/L). Usada para que cocina recete en gramos.';
