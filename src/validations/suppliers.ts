import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  tax_id: z.string().optional().nullable(),
  contact_name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable().or(z.literal("")),
  category: z.string().optional().nullable(),
  bank_account_info: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  is_active: z.enum(["true", "false"]).optional(),
});

export const apDocumentSchema = z.object({
  supplier_id: z.string().uuid("Proveedor inválido"),
  document_type: z.string().min(1, "Tipo obligatorio"),
  document_number: z.string().optional().nullable(),
  issue_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  concept: z.string().optional().nullable(),
  original_amount: z.string().min(1, "Valor obligatorio"),
  paid_amount: z.string().optional().nullable(),
  priority: z.enum(["CRITICA", "ALTA", "NORMAL", "NEGOCIABLE", "POR_VALIDAR"]),
  verification_status: z.enum(["CONFIRMADO", "DECLARADO", "PENDIENTE"]),
  observation: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

export const apPaymentSchema = z.object({
  payment_date: z.string().min(1, "Fecha obligatoria"),
  amount: z.string().min(1, "Monto obligatorio"),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
