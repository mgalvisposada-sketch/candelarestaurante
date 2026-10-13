import { z } from "zod";

const moneyString = z
  .string()
  .min(1, "Monto obligatorio")
  .refine((v) => {
    const n = Number(String(v).replace(/,/g, "").trim());
    return !Number.isNaN(n) && n >= 0;
  }, "Monto inválido");

const optionalMoneyString = z
  .string()
  .optional()
  .nullable()
  .refine((v) => {
    if (v === undefined || v === null || String(v).trim() === "") return true;
    const n = Number(String(v).replace(/,/g, "").trim());
    return !Number.isNaN(n) && n >= 0;
  }, "Monto inválido");

const optionalUuid = z
  .string()
  .optional()
  .nullable()
  .refine((v) => {
    if (v === undefined || v === null || String(v).trim() === "") return true;
    return z.string().uuid().safeParse(v).success;
  }, "Cuenta inválida");

/**
 * El local declara flujo de caja.
 * - cash_sales: ventas en efectivo del día (se acreditan a Caja ventas al avalar)
 * - cash_float: restante de base/flotante contado (debe cuadrar con la cuenta Base)
 * Débito/crédito/transferencia = plata que aterriza en banco(s).
 */
export const cashDailyCloseDraftSchema = z.object({
  business_date: z.string().min(1, "La fecha es obligatoria"),
  cash_float: moneyString,
  cash_sales: moneyString,
  card_debit_sales: moneyString,
  card_credit_sales: moneyString,
  transfer_sales: moneyString,
  card_account_id: optionalUuid,
  transfer_account_id: optionalUuid,
  comments: z.string().optional().nullable(),
});

export const cashFloatTargetSchema = z.object({
  cash_float_target: moneyString,
});

export const treasuryTransferSchema = z.object({
  from_account_id: z.string().uuid("Cuenta origen inválida"),
  to_account_id: z.string().uuid("Cuenta destino inválida"),
  amount: moneyString,
  transfer_date: z.string().min(1, "La fecha es obligatoria"),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine((v) => v.from_account_id !== v.to_account_id, {
  message: "Origen y destino deben ser cuentas distintas",
  path: ["to_account_id"],
});

export const cashDailyCloseApproveSchema = z.object({
  pos_cash_amount: optionalMoneyString,
  pos_card_amount: optionalMoneyString,
  pos_transfer_amount: optionalMoneyString,
  bank_card_amount: optionalMoneyString,
  cash_credited: optionalMoneyString,
  card_credited: optionalMoneyString,
  transfer_credited: optionalMoneyString,
  comments: z.string().optional().nullable(),
});

export const cashDailyCloseRejectSchema = z.object({
  rejection_reason: z.string().min(3, "Indique el motivo del rechazo"),
});
