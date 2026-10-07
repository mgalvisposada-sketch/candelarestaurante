import { z } from "zod";

export const expenseCategorySchema = z.object({
  code: z.string().min(1, "Código obligatorio"),
  name: z.string().min(1, "Nombre obligatorio"),
});

export const expenseSchema = z.object({
  expense_date: z.string().min(1, "Fecha obligatoria"),
  supplier_id: z.string().uuid().optional().nullable().or(z.literal("")),
  category_id: z.string().uuid().optional().nullable().or(z.literal("")),
  concept: z.string().min(1, "Concepto obligatorio"),
  amount: z.string().min(1, "Monto obligatorio"),
  tax_amount: z.string().optional().nullable(),
  nature: z.enum(["FIJO", "VARIABLE", "UNICO"]),
  criticality: z.enum(["ESENCIAL", "REDUCIBLE", "DISCRECIONAL"]),
  status: z.enum(["BORRADOR", "APROBADO", "PAGADO", "ANULADO"]).optional(),
  cost_center: z.string().optional().nullable(),
  period: z.string().optional().nullable(),
  payment_method: z.string().optional().nullable(),
  bank_account_id: z.string().uuid().optional().nullable().or(z.literal("")),
  shared_service: z.enum(["true", "false"]).optional(),
  allocation_percentage: z.string().optional().nullable(),
  allocated_amount: z.string().optional().nullable(),
  allocation_reason: z.string().optional().nullable(),
  document_type: z.string().optional().nullable(),
  document_number: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  priority: z.enum(["CRITICA", "ALTA", "NORMAL", "BAJA"]).optional(),
  notes: z.string().optional().nullable(),
});
