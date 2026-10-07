-- Factura por proveedor: cada ítem puede enlazar su propia solicitud de pago.
-- Así una compra multi-proveedor acepta facturas independientes.

ALTER TABLE public.purchase_request_items
  ADD COLUMN IF NOT EXISTS invoice_payment_request_id uuid
    REFERENCES public.payment_requests (id),
  ADD COLUMN IF NOT EXISTS invoice_ap_document_id uuid
    REFERENCES public.accounts_payable_documents (id);

CREATE INDEX IF NOT EXISTS purchase_request_items_invoice_pay_idx
  ON public.purchase_request_items (organization_id, invoice_payment_request_id)
  WHERE invoice_payment_request_id IS NOT NULL AND deleted_at IS NULL;
