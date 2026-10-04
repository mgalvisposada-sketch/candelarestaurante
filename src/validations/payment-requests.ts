import { z } from "zod";

export const paymentRequestSourceSchema = z.enum([
  "SOLICITUD_INTERNA",
  "FACTURA_PROVEEDOR",
  "GASTO",
]);

export const paymentRequestPrioritySchema = z.enum([
  "CRITICA",
  "ALTA",
  "NORMAL",
  "BAJA",
]);

export const createInternalPaymentRequestSchema = z.object({
  concept: z.string().min(2, "Concepto obligatorio"),
  amount: z.string().min(1, "Monto obligatorio"),
  requested_at: z.string().min(1, "Fecha obligatoria"),
  due_date: z.string().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable().or(z.literal("")),
  priority: paymentRequestPrioritySchema.default("NORMAL"),
  notes: z.string().optional().nullable(),
  create_expense: z.enum(["true", "false"]).optional(),
});

export const createInvoicePaymentRequestSchema = z.object({
  supplier_id: z.string().uuid("Proveedor inválido"),
  concept: z.string().min(2, "Concepto obligatorio"),
  amount: z.string().min(1, "Monto obligatorio"),
  requested_at: z.string().min(1, "Fecha obligatoria"),
  due_date: z.string().optional().nullable(),
  issue_date: z.string().optional().nullable(),
  document_type: z.string().min(1, "Tipo obligatorio"),
  document_number: z.string().optional().nullable(),
  priority: paymentRequestPrioritySchema.default("NORMAL"),
  notes: z.string().optional().nullable(),
});

export const payPaymentRequestSchema = z.object({
  payment_date: z.string().min(1, "Fecha obligatoria"),
  bank_account_id: z.string().uuid("Cuenta inválida"),
  amount: z.string().optional().nullable(),
  payment_reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const rejectPaymentRequestSchema = z.object({
  rejection_reason: z.string().min(2, "Indique el motivo del rechazo"),
});
