-- Liquidación de propinas: mismos covered days en shift_dates + reglas por kind.

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_shift_dates_check;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_shift_period_check;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_kind_fields_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_kind_fields_check CHECK (
    (
      expense_kind = 'OPERATIVO'
      AND employee_id IS NULL
      AND period_year IS NULL
      AND period_month IS NULL
      AND period_half IS NULL
      AND shift_dates IS NULL
    )
    OR (
      expense_kind = 'LIQUIDACION_TURNO'
      AND employee_id IS NOT NULL
      AND period_year IS NOT NULL
      AND period_month BETWEEN 1 AND 12
      AND period_half IN (1, 2)
      AND shift_dates IS NOT NULL
      AND cardinality(shift_dates) > 0
    )
    OR (
      expense_kind = 'LIQUIDACION_PROPINA'
      AND employee_id IS NULL
      AND period_year IS NULL
      AND period_month IS NULL
      AND period_half IS NULL
      AND shift_dates IS NOT NULL
      AND cardinality(shift_dates) > 0
    )
  );

COMMENT ON COLUMN public.expenses.shift_dates IS
  'Días cubiertos: liquidación por turno (prestador) o liquidación de propina (org).';
