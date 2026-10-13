-- Liquidación de prestadores POR_TURNO como gasto (no nómina quincenal).

CREATE TYPE public.expense_kind AS ENUM (
  'OPERATIVO',
  'LIQUIDACION_TURNO'
);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS expense_kind public.expense_kind NOT NULL DEFAULT 'OPERATIVO',
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees (id),
  ADD COLUMN IF NOT EXISTS period_year integer,
  ADD COLUMN IF NOT EXISTS period_month integer,
  ADD COLUMN IF NOT EXISTS period_half integer;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_shift_period_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_shift_period_check CHECK (
    (
      expense_kind = 'OPERATIVO'
      AND employee_id IS NULL
      AND period_year IS NULL
      AND period_month IS NULL
      AND period_half IS NULL
    )
    OR (
      expense_kind = 'LIQUIDACION_TURNO'
      AND employee_id IS NOT NULL
      AND period_year IS NOT NULL
      AND period_month BETWEEN 1 AND 12
      AND period_half IN (1, 2)
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS expenses_shift_liquidation_uidx
  ON public.expenses (
    organization_id,
    employee_id,
    period_year,
    period_month,
    period_half
  )
  WHERE expense_kind = 'LIQUIDACION_TURNO'
    AND deleted_at IS NULL
    AND status <> 'ANULADO';
