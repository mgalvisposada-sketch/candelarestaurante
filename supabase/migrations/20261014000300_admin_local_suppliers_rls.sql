-- Admin del local puede crear/editar proveedores de insumos (alta rápida en solicitudes).
-- Misma helper que catálogo de compras: can_manage_purchase_requests (incluye ADMIN_LOCAL).
-- can_write_org sigue sin incluir ADMIN_LOCAL (finanzas / maestros amplios).

CREATE POLICY suppliers_insert_purchase_managers
  ON public.suppliers FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY suppliers_update_purchase_managers
  ON public.suppliers FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY supplier_product_categories_insert_purchase_managers
  ON public.supplier_product_categories FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY supplier_product_categories_update_purchase_managers
  ON public.supplier_product_categories FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

-- Cabecera CxP mínima al dar de alta un proveedor (sin documentos ni pagos).
CREATE POLICY accounts_payable_insert_purchase_managers
  ON public.accounts_payable FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
