import { z } from "zod";

export const budgetSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  scenario: z.enum(["ACTUAL", "MINIMO_VIABLE", "APROBADO"]),
  period_year: z.string().min(4, "Año obligatorio"),
  period_month: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const budgetLineSchema = z.object({
  budget_id: z.string().uuid(),
  category: z.string().min(1, "Categoría obligatoria"),
  budgeted_amount: z.string().min(1, "Monto obligatorio"),
  notes: z.string().optional().nullable(),
});
