-- Ventas por transferencia / QR en cierre diario de caja

ALTER TABLE public.cash_daily_closes
  ADD COLUMN IF NOT EXISTS transfer_sales numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_account_id uuid REFERENCES public.bank_accounts (id),
  ADD COLUMN IF NOT EXISTS pos_transfer_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS transfer_credited numeric(18, 2);

ALTER TABLE public.cash_daily_closes
  DROP CONSTRAINT IF EXISTS cash_daily_closes_amounts_nonneg;

ALTER TABLE public.cash_daily_closes
  ADD CONSTRAINT cash_daily_closes_amounts_nonneg CHECK (
    cash_float >= 0
    AND cash_sales >= 0
    AND card_sales >= 0
    AND transfer_sales >= 0
    AND (pos_cash_amount IS NULL OR pos_cash_amount >= 0)
    AND (pos_card_amount IS NULL OR pos_card_amount >= 0)
    AND (pos_transfer_amount IS NULL OR pos_transfer_amount >= 0)
    AND (bank_card_amount IS NULL OR bank_card_amount >= 0)
    AND (cash_credited IS NULL OR cash_credited >= 0)
    AND (card_credited IS NULL OR card_credited >= 0)
    AND (transfer_credited IS NULL OR transfer_credited >= 0)
  );

COMMENT ON COLUMN public.cash_daily_closes.transfer_sales IS
  'Ventas del día por transferencia bancaria / QR (Nequi, Bre-B, etc.).';
COMMENT ON COLUMN public.cash_daily_closes.transfer_account_id IS
  'Cuenta destino donde caen las transferencias / QR.';
