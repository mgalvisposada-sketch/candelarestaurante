import { z } from "zod";

export const bankAccountFundPurposeSchema = z.enum(["VENTAS", "EMPRESA"]);

export const bankAccountSchema = z.object({
  bank_name: z.string().min(2, "El nombre es obligatorio"),
  account_kind: z.enum(["BANCO", "CAJA", "PASARELA", "OTRO"]),
  fund_purpose: bankAccountFundPurposeSchema.default("VENTAS"),
  account_type: z.string().optional().nullable(),
  masked_number: z.string().optional().nullable(),
  holder_name: z.string().optional().nullable(),
  is_active: z.enum(["true", "false"]).optional(),
  notes: z.string().optional().nullable(),
});

export const bankBalanceSnapshotSchema = z.object({
  cutoff_date: z.string().min(1, "La fecha del saldo inicial es obligatoria"),
  opening_balance: z.string().min(1, "El saldo es obligatorio"),
  verification_status: z.enum(["CONFIRMADO", "DECLARADO", "PENDIENTE"]),
  comments: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

/** Corrige la cuenta de un movimiento ya registrado (p. ej. pago con origen equivocado). */
export const reassignBankTransactionAccountSchema = z.object({
  bank_account_id: z.string().uuid("Elija la cuenta correcta"),
});

/** Confirma ingreso de adquirencia al banco (total o parcial). */
export const confirmAcquiringBankSettlementSchema = z.object({
  amount: z.string().min(1, "El monto es obligatorio"),
  transaction_date: z.string().min(1, "La fecha del extracto es obligatoria"),
});
