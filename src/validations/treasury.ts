import { z } from "zod";

export const bankAccountSchema = z.object({
  bank_name: z.string().min(2, "El nombre es obligatorio"),
  account_kind: z.enum(["BANCO", "CAJA", "PASARELA", "OTRO"]),
  account_type: z.string().optional().nullable(),
  masked_number: z.string().optional().nullable(),
  holder_name: z.string().optional().nullable(),
  is_active: z.enum(["true", "false"]).optional(),
  notes: z.string().optional().nullable(),
});

export const bankBalanceSnapshotSchema = z.object({
  cutoff_date: z.string().min(1, "La fecha de corte es obligatoria"),
  opening_balance: z.string().min(1, "El saldo es obligatorio"),
  verification_status: z.enum(["CONFIRMADO", "DECLARADO", "PENDIENTE"]),
  comments: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});
