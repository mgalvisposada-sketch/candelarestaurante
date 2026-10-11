-- Vincular producción de preparación a la receta usada (trazabilidad)

ALTER TABLE public.kitchen_productions
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.kitchen_recipes (id);

CREATE INDEX IF NOT EXISTS kitchen_productions_recipe_idx
  ON public.kitchen_productions (recipe_id)
  WHERE recipe_id IS NOT NULL;
