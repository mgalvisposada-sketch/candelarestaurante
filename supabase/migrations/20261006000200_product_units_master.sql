-- Maestro de unidades de medida para productos de inventario

CREATE TABLE public.product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  UNIQUE (organization_id, code)
);

CREATE TRIGGER product_units_set_updated_at
  BEFORE UPDATE ON public.product_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migrar unidades libres existentes
INSERT INTO public.product_units (organization_id, code, name)
SELECT DISTINCT
  p.organization_id,
  upper(trim(p.unit)),
  upper(trim(p.unit))
FROM public.products p
WHERE p.deleted_at IS NULL
  AND p.unit IS NOT NULL
  AND trim(p.unit) <> ''
ON CONFLICT (organization_id, code) DO NOTHING;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.product_units (id);

UPDATE public.products p
SET unit_id = u.id
FROM public.product_units u
WHERE p.unit_id IS NULL
  AND p.organization_id = u.organization_id
  AND upper(trim(p.unit)) = u.code
  AND u.deleted_at IS NULL;

-- Orgs con productos sin unidad: crear UND y asignar
INSERT INTO public.product_units (organization_id, code, name)
SELECT DISTINCT p.organization_id, 'UND', 'Unidad'
FROM public.products p
WHERE p.unit_id IS NULL
  AND p.deleted_at IS NULL
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.products p
SET unit_id = u.id,
    unit = 'UND'
FROM public.product_units u
WHERE p.unit_id IS NULL
  AND p.deleted_at IS NULL
  AND u.organization_id = p.organization_id
  AND u.code = 'UND'
  AND u.deleted_at IS NULL;

ALTER TABLE public.products
  ALTER COLUMN unit_id SET NOT NULL;

CREATE INDEX products_org_unit_idx
  ON public.products (organization_id, unit_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_units_select_member
  ON public.product_units FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY product_units_insert_writers
  ON public.product_units FOR INSERT
  WITH CHECK (public.can_write_org(organization_id));

CREATE POLICY product_units_update_writers
  ON public.product_units FOR UPDATE
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));

CREATE POLICY product_units_insert_purchase_managers
  ON public.product_units FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY product_units_update_purchase_managers
  ON public.product_units FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
