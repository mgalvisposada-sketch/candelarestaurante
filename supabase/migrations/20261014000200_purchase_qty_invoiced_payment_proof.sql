-- Cantidad facturada por ítem (ancla recepción prepago) + comprobante de pago.

ALTER TABLE public.purchase_request_items
  ADD COLUMN IF NOT EXISTS quantity_invoiced numeric(18, 3);

ALTER TABLE public.purchase_request_items
  DROP CONSTRAINT IF EXISTS pri_qty_invoiced_nonneg;
ALTER TABLE public.purchase_request_items
  ADD CONSTRAINT pri_qty_invoiced_nonneg
  CHECK (quantity_invoiced IS NULL OR quantity_invoiced >= 0);

COMMENT ON COLUMN public.purchase_request_items.quantity_invoiced IS
  'Cantidad facturada al proveedor. En prepago, la recepción se cierra contra esto (no contra lo pedido).';

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS payment_proof_document_id uuid
    REFERENCES public.documents (id);

COMMENT ON COLUMN public.payment_requests.payment_proof_document_id IS
  'Comprobante de pago (documento en storage) para notificar al proveedor.';

CREATE INDEX IF NOT EXISTS payment_requests_proof_idx
  ON public.payment_requests (payment_proof_document_id)
  WHERE payment_proof_document_id IS NOT NULL AND deleted_at IS NULL;

-- Backfill: ítems ya facturados → qty facturada ≈ max(pedido, recibido).
UPDATE public.purchase_request_items pri
SET quantity_invoiced = GREATEST(
  COALESCE(pri.quantity_approved, pri.quantity_requested, 0),
  COALESCE(pri.quantity_received, 0)
)
WHERE pri.deleted_at IS NULL
  AND pri.invoice_payment_request_id IS NOT NULL
  AND pri.quantity_invoiced IS NULL
  AND GREATEST(
    COALESCE(pri.quantity_approved, pri.quantity_requested, 0),
    COALESCE(pri.quantity_received, 0)
  ) > 0;
