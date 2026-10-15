-- Adquirencia: liquidación diferida al banco (T+1/T+2, por abono).
-- PENDIENTE_BANCO no suma al saldo; INGRESADO sí. NULL = N/A (siempre suma).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bank_settlement_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.bank_settlement_status AS ENUM (
      'PENDIENTE_BANCO',
      'INGRESADO'
    );
  END IF;
END $$;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS settlement_status public.bank_settlement_status,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid
    REFERENCES public.bank_transactions (id);

CREATE INDEX IF NOT EXISTS bank_transactions_pending_settlement_idx
  ON public.bank_transactions (organization_id, bank_account_id, transaction_date)
  WHERE settlement_status = 'PENDIENTE_BANCO'
    AND deleted_at IS NULL;

-- Adquirencias ya acreditadas al avalar: vuelven a pendiente (no suman saldo).
UPDATE public.bank_transactions
SET settlement_status = 'PENDIENTE_BANCO'
WHERE category = 'INGRESO_ADQUIRENCIA'
  AND deleted_at IS NULL
  AND settlement_status IS NULL;
