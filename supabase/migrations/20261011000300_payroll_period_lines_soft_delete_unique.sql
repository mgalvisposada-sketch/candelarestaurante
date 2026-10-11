-- Al recalcular, las líneas se marcan deleted_at y se insertan de nuevo.
-- El UNIQUE absoluto (period_id, employee_id) bloqueaba ese flujo.
-- Alineamos con payroll_periods: unicidad solo sobre filas activas.

ALTER TABLE public.payroll_period_lines
  DROP CONSTRAINT IF EXISTS payroll_period_lines_period_id_employee_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_period_lines_period_employee_uidx
  ON public.payroll_period_lines (period_id, employee_id)
  WHERE deleted_at IS NULL;
