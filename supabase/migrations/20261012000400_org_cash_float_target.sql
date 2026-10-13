-- Base (flotante) del restaurante: la define Tesorería, no el cierre diario.
-- El local solo reporta ventas en efectivo; el cajón esperado = base + ventas.
-- Si hace falta recomponer la base, Tesorería hace un traspaso entre cuentas.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cash_float_target numeric(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_cash_float_target_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_cash_float_target_check
  CHECK (cash_float_target >= 0);

COMMENT ON COLUMN public.organizations.cash_float_target IS
  'Base/flotante oficial del local. La define Tesorería. Forma parte del efectivo operativo y puede usarse en eventualidades; se recompone con traspasos entre cuentas.';

-- Semilla: si ya hubo cierres con base, tomar la del más reciente avalado/en revisión.
UPDATE public.organizations o
SET cash_float_target = src.cash_float
FROM (
  SELECT DISTINCT ON (c.organization_id)
    c.organization_id,
    c.cash_float
  FROM public.cash_daily_closes c
  WHERE c.deleted_at IS NULL
    AND c.cash_float > 0
    AND c.status IN ('AVALADO', 'EN_REVISION', 'BORRADOR', 'RECHAZADO')
  ORDER BY c.organization_id, c.business_date DESC, c.created_at DESC
) src
WHERE o.id = src.organization_id
  AND o.cash_float_target = 0
  AND o.deleted_at IS NULL;
