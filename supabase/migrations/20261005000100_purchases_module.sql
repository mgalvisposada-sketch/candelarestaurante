-- Módulo Compras: inventario, proveedores por categoría, solicitudes y recepción

-- Lead time en proveedor (días hábiles estimados de entrega)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days integer;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_lead_time_days_nonneg;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_lead_time_days_nonneg
  CHECK (lead_time_days IS NULL OR lead_time_days >= 0);

CREATE TYPE public.purchase_request_status AS ENUM (
  'BORRADOR',
  'ENVIADA',
  'APROBADA',
  'PEDIDA',
  'RECIBIDA_PARCIAL',
  'RECIBIDA',
  'FACTURA_ACEPTADA',
  'RECHAZADA',
  'ANULADA'
);

CREATE TYPE public.purchase_item_status AS ENUM (
  'PENDIENTE',
  'APROBADO',
  'PEDIDO',
  'RECIBIDO_PARCIAL',
  'RECIBIDO',
  'CANCELADO'
);

-- Categorías de producto / inventario
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (organization_id, code)
);

CREATE TRIGGER product_categories_set_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Productos (maestro de inventario de compras)
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  category_id uuid NOT NULL REFERENCES public.product_categories (id),
  sku text,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'UND',
  min_stock numeric(18, 3),
  current_stock numeric(18, 3) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT products_stock_nonneg CHECK (current_stock >= 0),
  CONSTRAINT products_min_stock_nonneg CHECK (min_stock IS NULL OR min_stock >= 0)
);

CREATE INDEX products_org_category_idx
  ON public.products (organization_id, category_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Qué categorías comercializa cada proveedor
CREATE TABLE public.supplier_product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id),
  category_id uuid NOT NULL REFERENCES public.product_categories (id),
  lead_time_days integer,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (organization_id, supplier_id, category_id),
  CONSTRAINT spc_lead_time_nonneg CHECK (lead_time_days IS NULL OR lead_time_days >= 0)
);

CREATE INDEX supplier_product_categories_category_idx
  ON public.supplier_product_categories (organization_id, category_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE TRIGGER supplier_product_categories_set_updated_at
  BEFORE UPDATE ON public.supplier_product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Solicitud de compra (cabecera)
CREATE TABLE public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  request_number text,
  status public.purchase_request_status NOT NULL DEFAULT 'BORRADOR',
  title text NOT NULL,
  notes text,
  location_label text,
  requested_at date NOT NULL,
  needed_by date,
  submitted_at timestamptz,
  approved_at timestamptz,
  ordered_at timestamptz,
  received_at timestamptz,
  invoice_accepted_at timestamptz,
  rejection_reason text,
  requested_by uuid REFERENCES public.profiles (id),
  approved_by uuid REFERENCES public.profiles (id),
  payment_request_id uuid REFERENCES public.payment_requests (id),
  ap_document_id uuid REFERENCES public.accounts_payable_documents (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz
);

CREATE INDEX purchase_requests_org_status_idx
  ON public.purchase_requests (organization_id, status, requested_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER purchase_requests_set_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ítems de la solicitud
CREATE TABLE public.purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  purchase_request_id uuid NOT NULL REFERENCES public.purchase_requests (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id),
  category_id uuid NOT NULL REFERENCES public.product_categories (id),
  quantity_requested numeric(18, 3) NOT NULL,
  quantity_approved numeric(18, 3),
  quantity_received numeric(18, 3) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'UND',
  suggested_supplier_id uuid REFERENCES public.suppliers (id),
  approved_supplier_id uuid REFERENCES public.suppliers (id),
  unit_cost_estimate numeric(18, 2),
  expected_delivery_date date,
  status public.purchase_item_status NOT NULL DEFAULT 'PENDIENTE',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT pri_qty_requested_positive CHECK (quantity_requested > 0),
  CONSTRAINT pri_qty_approved_nonneg CHECK (quantity_approved IS NULL OR quantity_approved >= 0),
  CONSTRAINT pri_qty_received_nonneg CHECK (quantity_received >= 0)
);

CREATE INDEX purchase_request_items_request_idx
  ON public.purchase_request_items (purchase_request_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE TRIGGER purchase_request_items_set_updated_at
  BEFORE UPDATE ON public.purchase_request_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS helpers: admin local puede operar solicitudes de compra
CREATE OR REPLACE FUNCTION public.can_manage_purchase_requests(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION', 'ADMIN_LOCAL']::public.app_role[]
  );
$$;

CREATE OR REPLACE FUNCTION public.can_approve_purchases(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION']::public.app_role[]
  );
$$;

ALTER FUNCTION public.can_manage_purchase_requests(uuid) OWNER TO postgres;
ALTER FUNCTION public.can_approve_purchases(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_purchase_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_approve_purchases(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_purchase_requests(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_purchases(uuid) TO authenticated, anon;

-- RLS
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'product_categories',
    'products',
    'supplier_product_categories',
    'purchase_requests',
    'purchase_request_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(organization_id))',
      t || '_select_member',
      t
    );
  END LOOP;
END $$;

-- Maestros: escritura GESTION/SUPER_ADMIN
CREATE POLICY product_categories_insert_writers
  ON public.product_categories FOR INSERT
  WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY product_categories_update_writers
  ON public.product_categories FOR UPDATE
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));

CREATE POLICY products_insert_writers
  ON public.products FOR INSERT
  WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY products_update_writers
  ON public.products FOR UPDATE
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));
-- Admin local actualiza stock al recibir mercancía
CREATE POLICY products_update_purchase_managers
  ON public.products FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY supplier_product_categories_insert_writers
  ON public.supplier_product_categories FOR INSERT
  WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY supplier_product_categories_update_writers
  ON public.supplier_product_categories FOR UPDATE
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));

-- Solicitudes: ADMIN_LOCAL puede crear/editar; aprobación vía app + can_write_org también
CREATE POLICY purchase_requests_insert_managers
  ON public.purchase_requests FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY purchase_requests_update_managers
  ON public.purchase_requests FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY purchase_request_items_insert_managers
  ON public.purchase_request_items FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
CREATE POLICY purchase_request_items_update_managers
  ON public.purchase_request_items FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
