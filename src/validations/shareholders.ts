import { z } from "zod";

export const shareholderSchema = z.object({
  full_name: z.string().min(2, "El nombre es obligatorio"),
  id_type: z.enum(["CC", "CE", "NIT", "PASAPORTE", "OTRO"]),
  id_number: z.string().min(1, "La identificación es obligatoria"),
  participation_pct: z.string().min(1, "La participación es obligatoria"),
  entry_date: z.string().optional().nullable(),
  registered_capital: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["ACTIVO", "INACTIVO"]),
  verification_status: z.enum(["CONFIRMADO", "DECLARADO", "PENDIENTE"]),
  comments: z.string().optional().nullable(),
});

export const shareholderAccountSchema = z.object({
  opening_balance: z.string().min(1, "El saldo inicial es obligatorio"),
  notes: z.string().optional().nullable(),
});

export const shareholderTransactionSchema = z.object({
  transaction_date: z.string().min(1, "La fecha es obligatoria"),
  description: z.string().optional().nullable(),
  side: z.enum(["debit", "credit"]),
  amount: z.string().min(1, "El monto es obligatorio"),
  nature: z.enum(["CAPITAL", "PRESTAMO", "ANTICIPO", "OTRO"]),
  reference: z.string().optional().nullable(),
});

export type ShareholderInput = z.infer<typeof shareholderSchema>;
