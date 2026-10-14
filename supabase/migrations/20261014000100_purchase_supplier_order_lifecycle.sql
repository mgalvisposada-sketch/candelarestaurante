-- Ciclo de vida de la orden de compra por proveedor (OC).
-- La solicitud queda como contenedor; el flujo operativo vive en purchase_supplier_orders.
-- Idempotente: puede reaplicarse si falló a mitad.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'purchase_supplier_order_status'
  ) THEN
    CREATE TYPE public.purchase_supplier_order_status AS ENUM (
      'POR_PEDIR',
      'PEDIDA',
      'FACTURADA',
      'PAGADA',
      'RECIBIDA_PARCIAL',
      'RECIBIDA',
      'CERRADA',
      'ANULADA'
    );
  END IF;
END $$;

ALTER TABLE public.purchase_supplier_orders
  ADD COLUMN IF NOT EXISTS status public.purchase_supplier_order_status
    NOT NULL DEFAULT 'POR_PEDIR',
  ADD COLUMN IF NOT EXISTS ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_request_id uuid
    REFERENCES public.payment_requests (id),
  ADD COLUMN IF NOT EXISTS ap_document_id uuid
    REFERENCES public.accounts_payable_documents (id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz
    NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles (id);

CREATE INDEX IF NOT EXISTS purchase_supplier_orders_org_status_idx
  ON public.purchase_supplier_orders (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS purchase_supplier_orders_payment_idx
  ON public.purchase_supplier_orders (payment_request_id)
  WHERE payment_request_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.purchase_supplier_orders.status IS
  'Estado operativo de la OC por proveedor (pedido → factura → pago → recepción).';

DROP TRIGGER IF EXISTS purchase_supplier_orders_set_updated_at
  ON public.purchase_supplier_orders;
CREATE TRIGGER purchase_supplier_orders_set_updated_at
  BEFORE UPDATE ON public.purchase_supplier_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Crear OC faltantes para pares request+supplier ya autorizados.
DO $$
DECLARE
  r record;
  v_seq bigint;
  v_number text;
BEGIN
  FOR r IN
    SELECT DISTINCT
      pri.organization_id,
      pri.purchase_request_id,
      COALESCE(pri.approved_supplier_id, pri.suggested_supplier_id) AS supplier_id
    FROM public.purchase_request_items pri
    JOIN public.purchase_requests pr
      ON pr.id = pri.purchase_request_id
     AND pr.deleted_at IS NULL
    WHERE pri.deleted_at IS NULL
      AND COALESCE(pri.approved_supplier_id, pri.suggested_supplier_id) IS NOT NULL
      AND pri.status <> 'PENDIENTE'
      AND pr.status NOT IN ('BORRADOR', 'ENVIADA', 'RECHAZADA', 'ANULADA')
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_supplier_orders existing
        WHERE existing.purchase_request_id = pri.purchase_request_id
          AND existing.supplier_id = COALESCE(pri.approved_supplier_id, pri.suggested_supplier_id)
          AND existing.deleted_at IS NULL
      )
  LOOP
    SELECT order_seq, order_number
      INTO v_seq, v_number
    FROM public.allocate_purchase_order_number(r.organization_id);

    INSERT INTO public.purchase_supplier_orders (
      organization_id,
      purchase_request_id,
      supplier_id,
      order_seq,
      order_number,
      status
    ) VALUES (
      r.organization_id,
      r.purchase_request_id,
      r.supplier_id,
      v_seq,
      v_number,
      'POR_PEDIR'
    )
    ON CONFLICT (purchase_request_id, supplier_id) DO NOTHING;
  END LOOP;
END $$;

-- Backfill de estado OC a partir de ítems + pagos.
WITH base_items AS (
  SELECT
    pri.purchase_request_id,
    COALESCE(pri.approved_supplier_id, pri.suggested_supplier_id) AS supplier_id,
    pri.status,
    pri.quantity_requested,
    pri.quantity_approved,
    pri.quantity_received,
    pri.invoice_payment_request_id,
    pri.invoice_ap_document_id,
    pri.updated_at
  FROM public.purchase_request_items pri
  WHERE pri.deleted_at IS NULL
    AND COALESCE(pri.approved_supplier_id, pri.suggested_supplier_id) IS NOT NULL
),
latest_links AS (
  SELECT DISTINCT ON (purchase_request_id, supplier_id)
    purchase_request_id,
    supplier_id,
    invoice_payment_request_id AS latest_payment_request_id,
    invoice_ap_document_id AS latest_ap_document_id
  FROM base_items
  WHERE invoice_payment_request_id IS NOT NULL
     OR invoice_ap_document_id IS NOT NULL
  ORDER BY
    purchase_request_id,
    supplier_id,
    updated_at DESC NULLS LAST
),
item_stats AS (
  SELECT
    b.purchase_request_id,
    b.supplier_id,
    bool_or(
      b.status IN ('PEDIDO', 'RECIBIDO_PARCIAL', 'RECIBIDO')
      OR COALESCE(b.quantity_received, 0) > 0
      OR b.invoice_payment_request_id IS NOT NULL
    ) AS was_ordered,
    bool_or(b.invoice_payment_request_id IS NOT NULL) AS has_invoice,
    bool_and(
      CASE
        WHEN b.status = 'CANCELADO' AND COALESCE(b.quantity_received, 0) <= 0
          THEN true
        WHEN b.invoice_payment_request_id IS NOT NULL THEN true
        WHEN b.status = 'CANCELADO' THEN true
        ELSE false
      END
    ) AS all_invoiced_or_cancelled,
    bool_or(COALESCE(b.quantity_received, 0) > 0) AS any_received,
    bool_and(
      b.status IN ('RECIBIDO', 'CANCELADO')
      OR (
        COALESCE(b.quantity_received, 0)
        >= COALESCE(b.quantity_approved, b.quantity_requested, 0)
        AND COALESCE(b.quantity_approved, b.quantity_requested, 0) > 0
      )
    ) AS all_closed,
    ll.latest_payment_request_id,
    ll.latest_ap_document_id
  FROM base_items b
  LEFT JOIN latest_links ll
    ON ll.purchase_request_id = b.purchase_request_id
   AND ll.supplier_id = b.supplier_id
  GROUP BY
    b.purchase_request_id,
    b.supplier_id,
    ll.latest_payment_request_id,
    ll.latest_ap_document_id
),
pay_stats AS (
  SELECT
    s.purchase_request_id,
    s.supplier_id,
    s.was_ordered,
    s.has_invoice,
    s.all_invoiced_or_cancelled,
    s.any_received,
    s.all_closed,
    s.latest_payment_request_id,
    s.latest_ap_document_id,
    COALESCE(
      (
        SELECT bool_and(pr.status = 'PAGADA')
        FROM public.purchase_request_items pri
        JOIN public.payment_requests pr
          ON pr.id = pri.invoice_payment_request_id
        WHERE pri.purchase_request_id = s.purchase_request_id
          AND COALESCE(pri.approved_supplier_id, pri.suggested_supplier_id) = s.supplier_id
          AND pri.deleted_at IS NULL
          AND pri.invoice_payment_request_id IS NOT NULL
      ),
      false
    ) AS all_paid,
    COALESCE(
      (
        SELECT bool_or(pr.status = 'PAGADA')
        FROM public.purchase_request_items pri
        JOIN public.payment_requests pr
          ON pr.id = pri.invoice_payment_request_id
        WHERE pri.purchase_request_id = s.purchase_request_id
          AND COALESCE(pri.approved_supplier_id, pri.suggested_supplier_id) = s.supplier_id
          AND pri.deleted_at IS NULL
          AND pri.invoice_payment_request_id IS NOT NULL
      ),
      false
    ) AS any_paid
  FROM item_stats s
),
derived AS (
  SELECT
    pso.id,
    CASE
      WHEN ps.all_closed AND ps.has_invoice AND ps.all_invoiced_or_cancelled AND ps.all_paid
        THEN 'CERRADA'::public.purchase_supplier_order_status
      WHEN ps.all_closed AND ps.has_invoice AND ps.all_invoiced_or_cancelled
        THEN 'RECIBIDA'::public.purchase_supplier_order_status
      WHEN ps.all_closed AND NOT ps.has_invoice
        THEN 'RECIBIDA'::public.purchase_supplier_order_status
      WHEN ps.any_received AND NOT ps.all_closed
        THEN 'RECIBIDA_PARCIAL'::public.purchase_supplier_order_status
      WHEN ps.has_invoice AND ps.all_paid
        THEN 'PAGADA'::public.purchase_supplier_order_status
      WHEN ps.has_invoice
        THEN 'FACTURADA'::public.purchase_supplier_order_status
      WHEN ps.was_ordered
        THEN 'PEDIDA'::public.purchase_supplier_order_status
      ELSE 'POR_PEDIR'::public.purchase_supplier_order_status
    END AS next_status,
    ps.latest_payment_request_id,
    ps.latest_ap_document_id,
    ps.any_received,
    ps.all_closed,
    ps.has_invoice,
    ps.any_paid,
    ps.was_ordered
  FROM public.purchase_supplier_orders pso
  JOIN pay_stats ps
    ON ps.purchase_request_id = pso.purchase_request_id
   AND ps.supplier_id = pso.supplier_id
  WHERE pso.deleted_at IS NULL
)
UPDATE public.purchase_supplier_orders pso
SET
  status = d.next_status,
  payment_request_id = COALESCE(pso.payment_request_id, d.latest_payment_request_id),
  ap_document_id = COALESCE(pso.ap_document_id, d.latest_ap_document_id),
  ordered_at = CASE
    WHEN d.was_ordered OR d.has_invoice
      THEN COALESCE(pso.ordered_at, timezone('utc', now()))
    ELSE pso.ordered_at
  END,
  invoiced_at = CASE
    WHEN d.has_invoice THEN COALESCE(pso.invoiced_at, timezone('utc', now()))
    ELSE pso.invoiced_at
  END,
  paid_at = CASE
    WHEN d.any_paid THEN COALESCE(pso.paid_at, timezone('utc', now()))
    ELSE pso.paid_at
  END,
  received_at = CASE
    WHEN d.all_closed THEN COALESCE(pso.received_at, timezone('utc', now()))
    WHEN d.any_received THEN pso.received_at
    ELSE pso.received_at
  END,
  closed_at = CASE
    WHEN d.next_status = 'CERRADA'
      THEN COALESCE(pso.closed_at, timezone('utc', now()))
    ELSE pso.closed_at
  END,
  updated_at = timezone('utc', now())
FROM derived d
WHERE pso.id = d.id;
