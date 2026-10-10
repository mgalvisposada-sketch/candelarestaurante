-- Condición comercial del proveedor de insumos:
-- PREPAGO = factura y pago antes de despachar/recibir (mayoría)
-- CREDITO = recibir primero, luego facturar/pagar
--
-- Nota futura: notas crédito / faltantes ya pagados (no implementado aún).

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS purchase_payment_terms text NOT NULL DEFAULT 'PREPAGO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'suppliers_purchase_payment_terms_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_purchase_payment_terms_check
      CHECK (purchase_payment_terms IN ('CREDITO', 'PREPAGO'));
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.purchase_payment_terms IS
  'PREPAGO: pagar antes de despacho. CREDITO: recibir y luego pagar.';

-- Mayoría prepago; si alguien marcó la solicitud como crédito no cambia el maestro.
UPDATE public.suppliers
SET purchase_payment_terms = 'PREPAGO'
WHERE purchase_payment_terms IS NULL
   OR purchase_payment_terms NOT IN ('CREDITO', 'PREPAGO');
