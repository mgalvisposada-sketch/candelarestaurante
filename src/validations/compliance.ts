import { z } from "zod";

export const contractSchema = z.object({
  counterparty: z.string().min(1, "Contraparte obligatoria"),
  contract_type: z.string().min(1, "Tipo obligatorio"),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  auto_renewal: z.enum(["true", "false"]).optional(),
  notice_days: z.string().optional().nullable(),
  cost_amount: z.string().optional().nullable(),
  periodicity: z.string().optional().nullable(),
  responsible_name: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const taxObligationSchema = z.object({
  obligation_type: z.string().min(1, "Tipo obligatorio"),
  period: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  filed_date: z.string().optional().nullable(),
  paid_date: z.string().optional().nullable(),
  declared_amount: z.string().optional().nullable(),
  paid_amount: z.string().optional().nullable(),
  balance_amount: z.string().optional().nullable(),
  status: z.enum([
    "PENDIENTE",
    "PRESENTADA",
    "PAGADA",
    "VENCIDA",
    "EN_ACUERDO",
    "NO_APLICA",
  ]),
});

export const sstRecordSchema = z.object({
  has_sg_sst: z.string().optional().nullable(),
  responsible_name: z.string().optional().nullable(),
  provider_name: z.string().optional().nullable(),
  monthly_cost: z.string().optional().nullable(),
  annual_cost: z.string().optional().nullable(),
  arl: z.string().optional().nullable(),
  documentation_status: z.string().optional().nullable(),
  last_review_date: z.string().optional().nullable(),
  next_review_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
