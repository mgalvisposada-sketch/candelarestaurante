-- Materia prima sin inventario (ej. agua de grifo) + seed por organización

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tracks_inventory boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.tracks_inventory IS
  'Si false: entra en recetas/costeo pero no exige ni mueve stock (ej. agua de grifo).';

CREATE OR REPLACE FUNCTION public.ensure_tap_water_product(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_category_id uuid;
  v_product_id uuid;
BEGIN
  -- Unidad ML
  INSERT INTO public.product_units (organization_id, code, name, is_active)
  VALUES (p_org_id, 'ML', 'Mililitro', true)
  ON CONFLICT (organization_id, code) DO UPDATE
    SET is_active = true,
        deleted_at = NULL,
        updated_at = timezone('utc', now())
  RETURNING id INTO v_unit_id;

  IF v_unit_id IS NULL THEN
    SELECT id INTO v_unit_id
    FROM public.product_units
    WHERE organization_id = p_org_id
      AND code = 'ML'
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Categoría utilitaria
  INSERT INTO public.product_categories (organization_id, code, name)
  VALUES (p_org_id, 'BASE-COCINA', 'Base cocina')
  ON CONFLICT (organization_id, code) DO UPDATE
    SET deleted_at = NULL,
        updated_at = timezone('utc', now())
  RETURNING id INTO v_category_id;

  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id
    FROM public.product_categories
    WHERE organization_id = p_org_id
      AND code = 'BASE-COCINA'
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  SELECT id INTO v_product_id
  FROM public.products
  WHERE organization_id = p_org_id
    AND sku = 'AGUA-GRIFO'
  ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_product_id IS NOT NULL THEN
    UPDATE public.products
    SET
      name = 'Agua de grifo',
      unit = 'ML',
      unit_id = v_unit_id,
      category_id = COALESCE(category_id, v_category_id),
      item_kind = 'MATERIA_PRIMA',
      unit_cost = 0.010,
      density_g_per_ml = 1.01,
      tracks_inventory = false,
      current_stock = 0,
      min_stock = 0,
      is_active = true,
      deleted_at = NULL,
      notes = COALESCE(
        notes,
        'Agua de grifo: sin inventario. Costo simbólico $0.010/ml. Densidad 1.01 g/ml para recetas en gramos.'
      ),
      updated_at = timezone('utc', now())
    WHERE id = v_product_id;
    RETURN v_product_id;
  END IF;

  INSERT INTO public.products (
    organization_id,
    category_id,
    unit_id,
    sku,
    name,
    unit,
    item_kind,
    unit_cost,
    density_g_per_ml,
    tracks_inventory,
    current_stock,
    min_stock,
    is_active,
    notes
  )
  VALUES (
    p_org_id,
    v_category_id,
    v_unit_id,
    'AGUA-GRIFO',
    'Agua de grifo',
    'ML',
    'MATERIA_PRIMA',
    0.010,
    1.01,
    false,
    0,
    0,
    true,
    'Agua de grifo: sin inventario. Costo simbólico $0.010/ml. Densidad 1.01 g/ml para recetas en gramos.'
  )
  RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_tap_water_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_tap_water_product(uuid) TO authenticated;

-- Seed orgs existentes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.organizations WHERE deleted_at IS NULL
  LOOP
    PERFORM public.ensure_tap_water_product(r.id);
  END LOOP;
END;
$$;

-- Nuevas organizaciones
CREATE OR REPLACE FUNCTION public.create_organization_with_admin(
  p_legal_name text,
  p_trade_name text DEFAULT NULL,
  p_nit text DEFAULT NULL,
  p_dv char DEFAULT NULL,
  p_administrative_cutoff_date date DEFAULT NULL
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organizations;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  INSERT INTO public.organizations (
    legal_name,
    trade_name,
    nit,
    dv,
    administrative_cutoff_date,
    currency,
    timezone,
    created_by,
    updated_by
  )
  VALUES (
    p_legal_name,
    p_trade_name,
    p_nit,
    p_dv,
    p_administrative_cutoff_date,
    'COP',
    'America/Bogota',
    v_uid,
    v_uid
  )
  RETURNING * INTO v_org;

  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    created_by,
    updated_by
  )
  VALUES (
    v_org.id,
    v_uid,
    'SUPER_ADMIN',
    v_uid,
    v_uid
  );

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity,
    entity_id,
    new_values
  )
  VALUES (
    v_org.id,
    v_uid,
    'CREATE',
    'organizations',
    v_org.id,
    to_jsonb(v_org)
  );

  PERFORM public.ensure_tap_water_product(v_org.id);

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_admin(text, text, text, char, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_admin(text, text, text, char, date) TO authenticated;
