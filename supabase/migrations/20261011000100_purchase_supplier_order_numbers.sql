-- Consecutivo org-wide de órdenes de compra por proveedor (OC-0001…).

CREATE TABLE public.purchase_order_sequences (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id),
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.purchase_supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  purchase_request_id uuid NOT NULL REFERENCES public.purchase_requests (id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id),
  order_seq bigint NOT NULL,
  order_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by uuid REFERENCES public.profiles (id),
  deleted_at timestamptz,
  CONSTRAINT purchase_supplier_orders_org_number_key
    UNIQUE (organization_id, order_number),
  CONSTRAINT purchase_supplier_orders_request_supplier_key
    UNIQUE (purchase_request_id, supplier_id)
);

CREATE INDEX purchase_supplier_orders_request_idx
  ON public.purchase_supplier_orders (purchase_request_id)
  WHERE deleted_at IS NULL;

CREATE INDEX purchase_supplier_orders_org_seq_idx
  ON public.purchase_supplier_orders (organization_id, order_seq DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.purchase_supplier_orders IS
  'Orden de pedido por proveedor dentro de una solicitud; consecutivo OC-NNNN por organización.';
COMMENT ON COLUMN public.purchase_supplier_orders.order_number IS
  'Número visible de la orden, ej. OC-0001.';

CREATE OR REPLACE FUNCTION public.allocate_purchase_order_number(p_org_id uuid)
RETURNS TABLE (order_seq bigint, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id requerido';
  END IF;

  INSERT INTO public.purchase_order_sequences (organization_id, last_value)
  VALUES (p_org_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET last_value = public.purchase_order_sequences.last_value + 1,
        updated_at = timezone('utc', now())
  RETURNING public.purchase_order_sequences.last_value INTO v_seq;

  order_seq := v_seq;
  order_number := 'OC-' || lpad(v_seq::text, GREATEST(4, length(v_seq::text)), '0');
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.allocate_purchase_order_number(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.allocate_purchase_order_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_purchase_order_number(uuid) TO authenticated, anon;

ALTER TABLE public.purchase_order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_order_sequences_select_member
  ON public.purchase_order_sequences FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY purchase_order_sequences_insert_managers
  ON public.purchase_order_sequences FOR INSERT
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY purchase_order_sequences_update_managers
  ON public.purchase_order_sequences FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));

CREATE POLICY purchase_supplier_orders_select_member
  ON public.purchase_supplier_orders FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY purchase_supplier_orders_insert_managers
  ON public.purchase_supplier_orders FOR INSERT
  WITH CHECK (
    public.can_manage_purchase_requests(organization_id)
    OR public.can_approve_purchases(organization_id)
  );

CREATE POLICY purchase_supplier_orders_update_managers
  ON public.purchase_supplier_orders FOR UPDATE
  USING (public.can_manage_purchase_requests(organization_id))
  WITH CHECK (public.can_manage_purchase_requests(organization_id));
