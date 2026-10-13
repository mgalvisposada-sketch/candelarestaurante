import { z } from "zod";

export const budgetSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  period_kind: z.enum(["YEAR", "SEMESTER", "QUARTER", "MONTH"]),
  period_year: z.string().min(4, "Año obligatorio"),
  period_month: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const budgetLineSchema = z.object({
  budget_id: z.string().uuid(),
  category: z.string().min(1, "Categoría obligatoria"),
  budgeted_amount: z.string().min(1, "Monto obligatorio"),
  line_kind: z.enum(["GASTO", "COSTO"]).optional().default("GASTO"),
  notes: z.string().optional().nullable(),
});

export const budgetLineAmountSchema = z.object({
  line_id: z.string().uuid(),
  budgeted_amount: z.string().min(1, "Monto obligatorio"),
});

export const budgetAssumptionsSchema = z.object({
  budget_id: z.string().uuid(),
  variable_cost_pct: z.string().min(1, "Costo variable obligatorio"),
  contribution_margin_pct: z.string().min(1, "Margen de contribución obligatorio"),
  desired_profit_amount: z.string().optional().nullable(),
});
