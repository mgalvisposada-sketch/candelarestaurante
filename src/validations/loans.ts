import { z } from "zod";

export const loanSchema = z.object({
  lender_shareholder_id: z.string().uuid().optional().nullable().or(z.literal("")),
  lender_name: z.string().min(2, "Prestamista obligatorio"),
  contract_date: z.string().optional().nullable(),
  approved_principal: z.string().min(1, "Capital aprobado obligatorio"),
  interest_rate: z.string().optional().nullable(),
  rate_type: z.enum(["MENSUAL", "EFECTIVA_ANUAL", "MANUAL", ""]).optional().nullable(),
  term_months: z.string().optional().nullable(),
  grace_period_months: z.string().optional().nullable(),
  first_installment_date: z.string().optional().nullable(),
  amortization_method: z.enum([
    "SIN_INTERES",
    "CUOTA_FIJA",
    "CAPITAL_FIJO",
    "BULLET",
    "MANUAL",
  ]),
  status: z.enum(["BORRADOR", "ACTIVO", "CERRADO", "ANULADO"]),
  notes: z.string().optional().nullable(),
  verification_status: z.enum(["CONFIRMADO", "DECLARADO", "PENDIENTE"]),
  comments: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

export const loanDisbursementSchema = z.object({
  loan_id: z.string().uuid(),
  disbursement_date: z.string().min(1, "Fecha obligatoria"),
  amount: z.string().min(1, "Monto obligatorio"),
  bank_account_id: z.string().uuid().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
});

export const loanPaymentSchema = z.object({
  loan_id: z.string().uuid(),
  payment_date: z.string().min(1, "Fecha obligatoria"),
  principal_amount: z.string().optional().nullable(),
  interest_amount: z.string().optional().nullable(),
  bank_account_id: z.string().uuid().optional().nullable().or(z.literal("")),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const fundingAllocationSchema = z.object({
  loan_disbursement_id: z.string().uuid(),
  category: z.string().min(1, "Categoría obligatoria"),
  concept: z.string().optional().nullable(),
  approved_amount: z.string().min(1, "Monto aprobado obligatorio"),
  committed_amount: z.string().optional().nullable(),
  paid_amount: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
