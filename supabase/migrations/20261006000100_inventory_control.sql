-- Control de inventario: costo unitario, movimientos e inventario físico

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_cost numeric(18, 6) NOT NULL DEFAULT 0;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_unit_cost_nonneg;
ALTER TABLE public.products
  ADD CONSTRAINT products_unit_cost_nonneg CHECK (unit_cost >= 0);

-- Stock mínimo obligatorio (existentes null → 0, luego NOT NULL)
UPDATE public.products
SET min_stock = 0
WHERE min_stock IS NULL;

ALTER TABLE public.products
  ALTER COLUMN min_stock SET DEFAULT 0;

ALTER TABLE public.products
  ALTER COLUMN min_stock SET NOT NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_min_stock_nonneg;
ALTER TABLE public.products
  ADD CONSTRAINT products_min_stock_nonneg CHECK (min_stock >= 0);

CREATE TYPE public.inventory_movement_type AS ENUM (
  'APERTURA',
  'COMPRA',
  'AJUSTE_FISICO',
  'AJUSTE_MANUAL',
  'CONSUMO'
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  product_id uuid NOT NULL REFERENCES public.products (id),
  movement_type public.inventory_movement_type NOT NULL,
  quantity numeric(18, 3) NOT NULL,
  unit_cost numeric(18, 6),
  stock_before numeric(18, 3) NOT NULL,
  stock_after numeric(18, 3) NOT NULL,
  unit_cost_before numeric(18, 6),
  unit_cost_after numeric(18, 6),
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT inventory_movements_qty_nonzero CHECK (quantity <> 0)
);

CREATE INDEX inventory_movements_org_product_idx
  ON public.inventory_movements (organization_id, product_id, created_at DESC);

CREATE TYPE public.physical_inventory_status AS ENUM (
  'BORRADOR',
  'ENVIADO',
  'AJUSTADO',
  'RECHAZADO'
);

CREATE TABLE public.physical_inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  title text NOT NULL,
  status public.physical_inventory_status NOT NULL DEFAULT 'BORRADOR',
  counted_at date NOT NULL,
  location_label text,
  notes text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  counted_by uuid REFERENCES public.profiles (id),
  reviewed_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE INDEX physical_inventory_counts_org_status_idx
  ON public.physical_inventory_counts (organization_id, status, counted_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER physical_inventory_counts_set_updated_at
  BEFORE UPDATE ON public.physical_inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.physical_inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  count_id uuid NOT NULL REFERENCES public.physical_inventory_counts (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id),
  system_qty numeric(18, 3) NOT NULL,
  counted_qty numeric(18, 3) NOT NULL,
  difference_qty numeric(18, 3) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (count_id, product_id),
  CONSTRAINT physical_count_items_qty_nonneg CHECK (system_qty >= 0 AND counted_qty >= 0)
);

CREATE INDEX physical_inventory_count_items_count_idx
  ON public.physical_inventory_count_items (count_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER physical_inventory_count_items_set_updated_at
  BEFORE UPDATE ON public.physical_inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_inventory_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_movements_select_member
  ON public.inventory_movements FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY inventory_movements_insert_managers
  ON public.inventory_movements FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY physical_inventory_counts_select_member
  ON public.physical_inventory_counts FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY physical_inventory_counts_insert_managers
  ON public.physical_inventory_counts FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY physical_inventory_counts_update_managers
  ON public.physical_inventory_counts FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY physical_inventory_count_items_select_member
  ON public.physical_inventory_count_items FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY physical_inventory_count_items_insert_managers
  ON public.physical_inventory_count_items FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY physical_inventory_count_items_update_managers
  ON public.physical_inventory_count_items FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
