-- Base/flotante como cuenta de tesorería (saldo vivo).
-- El target vive en organizations.cash_float_target.
-- El saldo actual = disponible de la cuenta marcada is_cash_float.
-- Ventas en efectivo siguen yendo a otra cuenta CAJA (no flotante).

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS is_cash_float boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bank_accounts.is_cash_float IS
  'Cuenta Base/flotante del local. Se usa para cambio y gastos autorizados; se recarga con traspasos hasta el target.';

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_one_cash_float_per_org_uidx
  ON public.bank_accounts (organization_id)
  WHERE deleted_at IS NULL AND is_cash_float = true;

COMMENT ON COLUMN public.organizations.cash_float_target IS
  'Meta de base/flotante del local. El saldo actual está en la cuenta bank_accounts.is_cash_float.';

COMMENT ON COLUMN public.cash_daily_closes.cash_float IS
  'Restante de base reportado por el local al cierre; debe contrastar con el disponible de la cuenta Base.';
