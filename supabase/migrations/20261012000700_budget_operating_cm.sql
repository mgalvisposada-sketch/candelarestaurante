-- Presupuesto operativo: supuestos de margen de contribución y tipado de rubros.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS variable_cost_pct numeric(5, 2) NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS contribution_margin_pct numeric(5, 2) NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS desired_profit_amount numeric(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_variable_cost_pct_check,
  DROP CONSTRAINT IF EXISTS budgets_contribution_margin_pct_check;

ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_variable_cost_pct_check
    CHECK (variable_cost_pct >= 0 AND variable_cost_pct < 100),
  ADD CONSTRAINT budgets_contribution_margin_pct_check
    CHECK (contribution_margin_pct > 0 AND contribution_margin_pct <= 100);

ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'GASTO';

ALTER TABLE public.budget_lines
  DROP CONSTRAINT IF EXISTS budget_lines_line_kind_check;

ALTER TABLE public.budget_lines
  ADD CONSTRAINT budget_lines_line_kind_check
    CHECK (line_kind IN ('GASTO', 'COSTO'));

COMMENT ON COLUMN public.budgets.variable_cost_pct IS
  'Costo variable estimado (% sobre ventas) para aproximar meta.';
COMMENT ON COLUMN public.budgets.contribution_margin_pct IS
  'Margen de contribución (%) usado para meta_ventas = (gastos + utilidad) / (CM/100).';
COMMENT ON COLUMN public.budgets.desired_profit_amount IS
  'Utilidad deseada del período (COP) incluida en la meta de ventas.';
COMMENT ON COLUMN public.budget_lines.line_kind IS
  'GASTO = opex fijo; COSTO = costo de operación a monto fijo (aparte del % variable).';
