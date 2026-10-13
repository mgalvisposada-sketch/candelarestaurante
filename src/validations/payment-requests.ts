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

const moneyOptional = z.preprocess((v) => {
  if (v === undefined || v === null) return "";
  return String(v);
}, z.string().refine((v) => {
  if (v.trim() === "") return true;
  const n = Number(v.replace(/,/g, "").trim());
  return !Number.isNaN(n) && n >= 0;
}, "Monto inválido"));

/** FormData suele mandar null cuando el campo no existe. */
const optionalAccountId = z.preprocess((v) => {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}, z.union([
  z.literal(""),
  z.string().uuid("Cuenta inválida"),
]));

export const payPaymentRequestSchema = z
  .object({
    payment_date: z.string().min(1, "Fecha obligatoria"),
    bank_account_id: optionalAccountId,
    amount: moneyOptional,
    /** Segunda pata opcional (ej. Base + caja/banco). */
    secondary_account_id: optionalAccountId,
    secondary_amount: moneyOptional,
    payment_reference: z.preprocess(
      (v) => (v === undefined || v === null ? "" : String(v)),
      z.string(),
    ),
    notes: z.preprocess(
      (v) => (v === undefined || v === null ? "" : String(v)),
      z.string(),
    ),
  })
  .superRefine((v, ctx) => {
    const primary = v.bank_account_id?.trim();
    if (!primary) {
      ctx.addIssue({
        code: "custom",
        message: "Seleccione la cuenta principal",
        path: ["bank_account_id"],
      });
    }
    const secondary = v.secondary_account_id?.trim();
    if (secondary && secondary === primary) {
      ctx.addIssue({
        code: "custom",
        message: "Las dos cuentas del pago deben ser distintas",
        path: ["secondary_account_id"],
      });
    }
  });

export const rejectPaymentRequestSchema = z.object({
  rejection_reason: z.string().min(2, "Indique el motivo del rechazo"),
});
