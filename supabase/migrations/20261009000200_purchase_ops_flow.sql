-- Flujo compras: urgencia/efectivo, alias factura proveedor, RLS Tesorería/Contador.

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'CREDITO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_requests_payment_mode_check'
  ) THEN
    ALTER TABLE public.purchase_requests
      ADD CONSTRAINT purchase_requests_payment_mode_check
      CHECK (payment_mode IN ('CREDITO', 'EFECTIVO_INMEDIATO'));
  END IF;
END $$;

ALTER TABLE public.purchase_request_items
  ADD COLUMN IF NOT EXISTS supplier_invoice_label text;

COMMENT ON COLUMN public.purchase_requests.is_urgent IS
  'Solicitud urgente (ej. se agotó y hay que reponer ya).';
COMMENT ON COLUMN public.purchase_requests.payment_mode IS
  'CREDITO = factura a plazo; EFECTIVO_INMEDIATO = compra en efectivo tras autorización.';
COMMENT ON COLUMN public.purchase_request_items.supplier_invoice_label IS
  'Cómo aparece el rubro en la factura del proveedor (ayuda a casar con nuestro producto).';

-- Tesorería escribe finanzas (facturar CxP / cola). Contador no entra aquí.
CREATE OR REPLACE FUNCTION public.can_write_org(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION', 'TESORERIA']::public.app_role[]
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_purchase_requests(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION', 'ADMIN_LOCAL', 'TESORERIA']::public.app_role[]
  );
$$;

-- Contador / Tesorería: ejecutar pagos sin ser GESTION.
CREATE OR REPLACE FUNCTION public.can_pay_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    p_org_id,
    ARRAY['SUPER_ADMIN', 'GESTION', 'TESORERIA', 'CONTADOR']::public.app_role[]
  );
$$;

ALTER FUNCTION public.can_pay_org(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_pay_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_pay_org(uuid) TO authenticated, anon;

DROP POLICY IF EXISTS payment_requests_insert_writers ON public.payment_requests;
CREATE POLICY payment_requests_insert_writers
  ON public.payment_requests FOR INSERT
  WITH CHECK (
    public.can_write_org(organization_id)
    OR public.can_pay_org(organization_id)
  );

DROP POLICY IF EXISTS payment_requests_update_writers ON public.payment_requests;
CREATE POLICY payment_requests_update_writers
  ON public.payment_requests FOR UPDATE
  USING (
    public.can_write_org(organization_id)
    OR public.can_pay_org(organization_id)
  )
  WITH CHECK (
    public.can_write_org(organization_id)
    OR public.can_pay_org(organization_id)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'accounts_payable_payments'
      AND policyname = 'accounts_payable_payments_insert_payers'
  ) THEN
    EXECUTE $p$
      CREATE POLICY accounts_payable_payments_insert_payers
        ON public.accounts_payable_payments FOR INSERT
        WITH CHECK (public.can_pay_org(organization_id))
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bank_transactions'
      AND policyname = 'bank_transactions_insert_payers'
  ) THEN
    EXECUTE $p$
      CREATE POLICY bank_transactions_insert_payers
        ON public.bank_transactions FOR INSERT
        WITH CHECK (public.can_pay_org(organization_id))
    $p$;
  END IF;
END $$;
