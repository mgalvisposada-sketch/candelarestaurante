-- Clasifica cuentas: ventas (cierran caja) vs empresa (préstamos, inyecciones, etc.)

DO $$ BEGIN
  CREATE TYPE public.bank_account_fund_purpose AS ENUM ('VENTAS', 'EMPRESA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS fund_purpose public.bank_account_fund_purpose NOT NULL DEFAULT 'VENTAS';

COMMENT ON COLUMN public.bank_accounts.fund_purpose IS
  'VENTAS: participa en cierre de caja (efectivo/adquirencia/QR). EMPRESA: recursos de préstamos, inyecciones y demás ajenos a ventas.';

-- Base/flotante siempre es operativa operativa (operación del local).
UPDATE public.bank_accounts
SET fund_purpose = 'VENTAS'
WHERE is_cash_float = true
  AND deleted_at IS NULL;
