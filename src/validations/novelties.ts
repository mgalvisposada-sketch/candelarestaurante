import { z } from "zod";

export const NOVELTY_TYPES = [
  "LLEGADA_TARDE",
  "SALIDA_TEMPRANA",
  "PERMISO_REMUNERADO",
  "PERMISO_NO_REMUNERADO",
  "AUSENCIA",
  "HORA_EXTRA",
  "TURNO_LABORADO",
  "ANTICIPO",
  "DESCUENTO_AUTORIZADO",
  "BONO_OCASIONAL",
] as const;

export const noveltySchema = z.object({
  employee_id: z.string().uuid(),
  novelty_date: z.string().min(1, "Fecha obligatoria"),
  novelty_type: z.enum(NOVELTY_TYPES),
  minutes: z.string().optional().nullable(),
  amount: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  support_note: z.string().optional().nullable(),
});

export const jobPositionSchema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  code: z.string().optional().nullable(),
  arl_risk_level: z.enum(["I", "II", "III", "IV", "V"]),
  default_break_minutes: z.coerce.number().int().min(0).max(240).optional(),
  notes: z.string().optional().nullable(),
  is_active: z.enum(["true", "false"]).optional(),
});

export const payrollPeriodSchema = z.object({
  period_year: z.coerce.number().int().min(2020).max(2100),
  period_month: z.coerce.number().int().min(1).max(12),
  period_half: z.coerce.number().int().refine((n) => n === 1 || n === 2),
  notes: z.string().optional().nullable(),
});
