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

/** El local solo declara flujo; las cuentas destino las resuelve el servidor. */
export const cashDailyCloseDraftSchema = z.object({
  business_date: z.string().min(1, "La fecha es obligatoria"),
  cash_float: moneyString,
  cash_sales: moneyString,
  card_sales: moneyString,
  transfer_sales: moneyString,
  comments: z.string().optional().nullable(),
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
