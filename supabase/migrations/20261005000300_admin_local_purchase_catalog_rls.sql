-- Admin del local puede crear/editar catálogo de compras (categorías y productos)

CREATE POLICY product_categories_insert_purchase_managers
  ON public.product_categories FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY product_categories_update_purchase_managers
  ON public.product_categories FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY products_insert_purchase_managers
  ON public.products FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
