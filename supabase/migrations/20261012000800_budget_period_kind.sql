-- Presupuesto operativo: período anual / semestral / trimestral / mensual.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS period_kind text NOT NULL DEFAULT 'YEAR';

ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_period_kind_check;

ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_period_kind_check
    CHECK (period_kind IN ('YEAR', 'SEMESTER', 'QUARTER', 'MONTH'));

-- Filas existentes: con mes → MONTH; sin mes → YEAR.
UPDATE public.budgets
SET period_kind = CASE
  WHEN period_month IS NOT NULL THEN 'MONTH'
  ELSE 'YEAR'
END;

COMMENT ON COLUMN public.budgets.period_kind IS
  'YEAR | SEMESTER | QUARTER | MONTH. period_month guarda el índice (mes 1-12, trimestre 1-4, semestre 1-2; null si YEAR).';
