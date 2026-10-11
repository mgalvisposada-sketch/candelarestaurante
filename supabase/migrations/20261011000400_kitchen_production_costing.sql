-- Cocina: tipado de ítems, producciones (insumos/preparaciones), merma, aprovechamiento y recetas (BOM)

CREATE TYPE public.kitchen_item_kind AS ENUM (
  'MATERIA_PRIMA',
  'INSUMO_PREPARACION',
  'PREPARACION',
  'PRODUCTO_CARTA'
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_kind public.kitchen_item_kind NOT NULL DEFAULT 'MATERIA_PRIMA';

CREATE INDEX IF NOT EXISTS products_org_item_kind_idx
  ON public.products (organization_id, item_kind)
  WHERE deleted_at IS NULL;

CREATE TYPE public.kitchen_production_type AS ENUM (
  'INSUMO_PREPARACION',
  'PREPARACION',
  'PRODUCTO_CARTA'
);

CREATE TYPE public.kitchen_production_status AS ENUM (
  'BORRADOR',
  'COMPLETADA',
  'ANULADA'
);

CREATE TYPE public.kitchen_output_role AS ENUM (
  'PRINCIPAL',
  'APROVECHAMIENTO'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'inventory_movement_type'
      AND e.enumlabel = 'PRODUCCION_ENTRADA'
  ) THEN
    ALTER TYPE public.inventory_movement_type ADD VALUE 'PRODUCCION_ENTRADA';
  END IF;
END $$;

CREATE TABLE public.kitchen_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  production_type public.kitchen_production_type NOT NULL,
  status public.kitchen_production_status NOT NULL DEFAULT 'BORRADOR',
  title text NOT NULL,
  produced_at date NOT NULL DEFAULT (timezone('America/Bogota', now()))::date,
  output_product_id uuid NOT NULL REFERENCES public.products (id),
  output_qty numeric(18, 3) NOT NULL DEFAULT 0,
  merma_qty numeric(18, 3) NOT NULL DEFAULT 0,
  input_total_qty numeric(18, 3) NOT NULL DEFAULT 0,
  input_total_cost numeric(18, 6) NOT NULL DEFAULT 0,
  aprovechamiento_total_cost numeric(18, 6) NOT NULL DEFAULT 0,
  output_total_cost numeric(18, 6) NOT NULL DEFAULT 0,
  output_unit_cost numeric(18, 6) NOT NULL DEFAULT 0,
  yield_pct numeric(18, 6),
  merma_pct numeric(18, 6),
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT kitchen_productions_qtys_nonneg CHECK (
    output_qty >= 0
    AND merma_qty >= 0
    AND input_total_qty >= 0
    AND input_total_cost >= 0
    AND aprovechamiento_total_cost >= 0
    AND output_total_cost >= 0
    AND output_unit_cost >= 0
  )
);

CREATE INDEX kitchen_productions_org_status_idx
  ON public.kitchen_productions (organization_id, status, produced_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER kitchen_productions_set_updated_at
  BEFORE UPDATE ON public.kitchen_productions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.kitchen_production_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  production_id uuid NOT NULL REFERENCES public.kitchen_productions (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id),
  quantity numeric(18, 3) NOT NULL,
  unit_cost numeric(18, 6) NOT NULL,
  line_cost numeric(18, 6) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT kitchen_production_inputs_qty_pos CHECK (quantity > 0),
  CONSTRAINT kitchen_production_inputs_costs_nonneg CHECK (
    unit_cost >= 0 AND line_cost >= 0
  )
);

CREATE INDEX kitchen_production_inputs_production_idx
  ON public.kitchen_production_inputs (production_id);

CREATE TABLE public.kitchen_production_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  production_id uuid NOT NULL REFERENCES public.kitchen_productions (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id),
  output_role public.kitchen_output_role NOT NULL,
  quantity numeric(18, 3) NOT NULL,
  allocated_cost numeric(18, 6) NOT NULL DEFAULT 0,
  unit_cost numeric(18, 6) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT kitchen_production_outputs_qty_pos CHECK (quantity > 0),
  CONSTRAINT kitchen_production_outputs_costs_nonneg CHECK (
    allocated_cost >= 0 AND unit_cost >= 0
  )
);

CREATE INDEX kitchen_production_outputs_production_idx
  ON public.kitchen_production_outputs (production_id);

CREATE UNIQUE INDEX kitchen_production_outputs_one_principal_idx
  ON public.kitchen_production_outputs (production_id)
  WHERE output_role = 'PRINCIPAL';

-- Recetas (BOM) para preparaciones y productos de carta
CREATE TABLE public.kitchen_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  product_id uuid NOT NULL REFERENCES public.products (id),
  name text NOT NULL,
  yield_qty numeric(18, 3) NOT NULL DEFAULT 1,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT kitchen_recipes_yield_pos CHECK (yield_qty > 0)
);

CREATE UNIQUE INDEX kitchen_recipes_org_product_active_uidx
  ON public.kitchen_recipes (organization_id, product_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE TRIGGER kitchen_recipes_set_updated_at
  BEFORE UPDATE ON public.kitchen_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.kitchen_recipe_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  recipe_id uuid NOT NULL REFERENCES public.kitchen_recipes (id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products (id),
  quantity numeric(18, 3) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT kitchen_recipe_lines_qty_pos CHECK (quantity > 0)
);

CREATE INDEX kitchen_recipe_lines_recipe_idx
  ON public.kitchen_recipe_lines (recipe_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER kitchen_recipe_lines_set_updated_at
  BEFORE UPDATE ON public.kitchen_recipe_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: cocina operativa (ADMIN_LOCAL + GESTION)
ALTER TABLE public.kitchen_productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_production_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_production_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_recipe_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY kitchen_productions_select_member
  ON public.kitchen_productions FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY kitchen_productions_insert_managers
  ON public.kitchen_productions FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY kitchen_productions_update_managers
  ON public.kitchen_productions FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY kitchen_production_inputs_select_member
  ON public.kitchen_production_inputs FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY kitchen_production_inputs_insert_managers
  ON public.kitchen_production_inputs FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY kitchen_production_inputs_update_managers
  ON public.kitchen_production_inputs FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY kitchen_production_inputs_delete_managers
  ON public.kitchen_production_inputs FOR DELETE
  USING (public.can_manage_purchase_requests(organization_id));

CREATE POLICY kitchen_production_outputs_select_member
  ON public.kitchen_production_outputs FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY kitchen_production_outputs_insert_managers
  ON public.kitchen_production_outputs FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY kitchen_production_outputs_update_managers
  ON public.kitchen_production_outputs FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY kitchen_production_outputs_delete_managers
  ON public.kitchen_production_outputs FOR DELETE
  USING (public.can_manage_purchase_requests(organization_id));

CREATE POLICY kitchen_recipes_select_member
  ON public.kitchen_recipes FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY kitchen_recipes_insert_managers
  ON public.kitchen_recipes FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY kitchen_recipes_update_managers
  ON public.kitchen_recipes FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY kitchen_recipe_lines_select_member
  ON public.kitchen_recipe_lines FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY kitchen_recipe_lines_insert_managers
  ON public.kitchen_recipe_lines FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY kitchen_recipe_lines_update_managers
  ON public.kitchen_recipe_lines FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
