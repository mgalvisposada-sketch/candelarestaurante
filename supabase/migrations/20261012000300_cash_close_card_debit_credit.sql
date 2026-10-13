-- Adquirencia: separar débito vs crédito en cierre diario

ALTER TABLE public.cash_daily_closes
  ADD COLUMN IF NOT EXISTS card_debit_sales numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_credit_sales numeric(18, 2) NOT NULL DEFAULT 0;

-- Filas previas: el total de adquirencia queda como crédito (desconocido el split)
UPDATE public.cash_daily_closes
SET
  card_credit_sales = COALESCE(card_sales, 0),
  card_debit_sales = 0
WHERE card_debit_sales = 0
  AND card_credit_sales = 0
  AND COALESCE(card_sales, 0) > 0;

ALTER TABLE public.cash_daily_closes
  DROP CONSTRAINT IF EXISTS cash_daily_closes_amounts_nonneg;

ALTER TABLE public.cash_daily_closes
  ADD CONSTRAINT cash_daily_closes_amounts_nonneg CHECK (
    cash_float >= 0
    AND cash_sales >= 0
    AND card_sales >= 0
    AND card_debit_sales >= 0
    AND card_credit_sales >= 0
    AND transfer_sales >= 0
    AND (pos_cash_amount IS NULL OR pos_cash_amount >= 0)
    AND (pos_card_amount IS NULL OR pos_card_amount >= 0)
    AND (pos_transfer_amount IS NULL OR pos_transfer_amount >= 0)
    AND (bank_card_amount IS NULL OR bank_card_amount >= 0)
    AND (cash_credited IS NULL OR cash_credited >= 0)
    AND (card_credited IS NULL OR card_credited >= 0)
    AND (transfer_credited IS NULL OR transfer_credited >= 0)
  );

COMMENT ON COLUMN public.cash_daily_closes.card_debit_sales IS
  'Adquirencia con tarjeta débito (aterriza en banco).';
COMMENT ON COLUMN public.cash_daily_closes.card_credit_sales IS
  'Adquirencia con tarjeta crédito (aterriza en banco).';
COMMENT ON COLUMN public.cash_daily_closes.card_sales IS
  'Total adquirencia = débito + crédito (denormalizado).';
